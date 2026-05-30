import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== (process.env.WEBHOOK_SECRET || 'super-secret-key-123')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { billId, votes } = await req.json();
    // votes = [ { bill_item_id: 'x', assignee_names: ['Ahmad', 'Budi'] } ]

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Supabase Error' }, { status: 500 });

    const { data: bill } = await supabase.from('bills').select('*, paid_by(id, name, whatsapp_number)').eq('id', billId).single();
    const { data: billItems } = await supabase.from('bill_items').select('*').eq('bill_id', billId);
    const { data: friends } = await supabase.from('friends').select('*');

    if (!bill || !billItems) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    // Tentukan pembagian per item
    const assignmentsToInsert: any[] = [];
    const userTotals: Record<string, number> = {};
    const userItems: Record<string, string[]> = {};

    for (const vote of votes) {
      const item = billItems.find(i => i.id === vote.bill_item_id);
      if (!item) continue;

      // Cari friend_id dari nama atau nomor WA
      const assignedFriends = (vote.assignee_names as string[])
        .map(voter => {
          // format voter yang dikirim bot sekarang adalah JID, misal "60142544502993@lid" atau "6281214019594@c.us"
          // atau nama jika gagal resolve
          const num = voter.split('@')[0];
          const last8 = num.length > 8 ? num.slice(-8) : num;
          const found = friends?.find(f => {
            if (f.wa_lid === voter) return true;
            if (f.whatsapp_number && f.whatsapp_number.replace(/[^0-9]/g, '').endsWith(last8)) return true;
            return f.name.toLowerCase() === voter.toLowerCase();
          });
          console.log(`[poll-submit] mapping ${voter} -> last8: ${last8} -> found: ${found?.name || 'NONE'}`);
          return found?.id;
        })
        .filter(Boolean) as string[];

      if (assignedFriends.length === 0) continue;

      const totalItemPrice = Number(item.item_price) * Number(item.quantity);
      const pricePerPerson = Math.round(totalItemPrice / assignedFriends.length);

      for (const fid of assignedFriends) {
        assignmentsToInsert.push({
          bill_item_id: item.id,
          friend_id: fid,
          share_amount: pricePerPerson,
          assigned_qty: 1
        });

        userTotals[fid] = (userTotals[fid] || 0) + pricePerPerson;
        if (!userItems[fid]) userItems[fid] = [];
        userItems[fid].push(`${item.item_name}`);
      }
    }

    if (assignmentsToInsert.length === 0) {
      const allVoters = votes.flatMap((v: any) => v.assignee_names).join(', ');
      return NextResponse.json({ error: `Tidak ada satupun vote yang cocok dengan kontak di database! Voter yang terdeteksi: ${allVoters}. Pastikan nomor ini terdaftar di menu Teman.` }, { status: 400 });
    }

    if (assignmentsToInsert.length > 0) {
      await supabase.from('item_assignments').delete().in('bill_item_id', billItems.map(i => i.id));
      await supabase.from('item_assignments').insert(assignmentsToInsert);
    }

    // Hitung pajak & service (dibagi RATA ke semua orang yang ikutan)
    const activeFriendIds = Object.keys(userTotals);
    const taxServiceRounding = Number(bill.tax_amount || 0) + Number(bill.service_charge_amount || 0);
    const splitTax = activeFriendIds.length > 0 ? Math.round(taxServiceRounding / activeFriendIds.length) : 0;

    const debtsToInsert = [];
    for (const fid of activeFriendIds) {
      if (fid === bill.paid_by.id) continue; // Payer tidak ngutang ke diri sendiri

      const amount = userTotals[fid] + splitTax;
      debtsToInsert.push({
        bill_id: billId,
        debtor_id: fid,
        creditor_id: bill.paid_by.id,
        amount: amount,
        status: 'unpaid',
        notes: userItems[fid].join(', ') + (splitTax > 0 ? ` (+Pajak ${splitTax})` : '')
      });
    }

    if (debtsToInsert.length > 0) {
      await supabase.from('debts').delete().eq('bill_id', billId);
      await supabase.from('debts').insert(debtsToInsert);
    }

    await supabase.from('bills').update({ status: 'assigned' }).eq('id', billId);

    // Ambil ulang data debt untuk notif
    const { data: insertedDebts } = await supabase
      .from('debts')
      .select('*, debtor:debtor_id(id,name,whatsapp_number), creditor:creditor_id(id,name,whatsapp_number)')
      .eq('bill_id', billId);

    // Minta bot kirim notifikasi tagihan ke grup
    let payload: any = { type: 'notify_debts', debts: insertedDebts, bill };
    try {
      const { data: groupSettings } = await supabase.from('wa_group_settings').select('group_jid').eq('is_active', true).maybeSingle();
      if (groupSettings?.group_jid) payload.groupJid = groupSettings.group_jid;
    } catch (e) {}

    const { error: qErr } = await supabase.from('bot_queue').insert({ payload });
    if (qErr) console.error('[poll-submit] Gagal queue bot message:', qErr);
    return NextResponse.json({ success: true, debtsCount: debtsToInsert.length });
  } catch (err: any) {
    console.error('Poll submit error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
