import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const { sender_number, payer_name, scanData } = await req.json();

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Supabase Error' }, { status: 500 });

    const { data: friends } = await supabase.from('friends').select('*');
    let sender;

    if (payer_name) {
      const nameQuery = payer_name.replace('@', '').toLowerCase();
      sender = friends?.find(f => f.name.toLowerCase().includes(nameQuery));
      if (!sender) {
        return NextResponse.json({ error: `Gagal mencari teman dengan nama "${payer_name}". Pastikan namanya benar!` }, { status: 404 });
      }
    } else {
      let num = sender_number.split('@')[0];
      let last8 = num.length > 8 ? num.slice(-8) : num;
      sender = friends?.find(f => f.whatsapp_number && f.whatsapp_number.replace(/[^0-9]/g, '').endsWith(last8));

      if (!sender) {
        return NextResponse.json({ error: `Gagal mencari teman dengan nomor WA berakhiran "${last8}". Pastikan nomor WA kamu tersimpan di web.` }, { status: 404 });
      }
    }

    const subtotal = scanData.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const grandTotal = subtotal + Number(scanData.tax || 0) + Number(scanData.serviceCharge || 0) + Number(scanData.rounding || 0);

    const { data: bill, error: billErr } = await supabase.from('bills').insert({
      title: scanData.title || 'Makan-makan (WA Scan)',
      paid_by: sender.id,
      subtotal,
      tax_amount: scanData.tax || 0,
      service_charge_amount: scanData.serviceCharge || 0,
      total_amount: grandTotal,
      status: 'draft',
      category: 'makanan'
    }).select('*, paid_by_friend:paid_by(*)').single();

    if (billErr || !bill) throw new Error('Gagal bikin bill: ' + (billErr?.message || 'Unknown Error'));

    const itemsToInsert = scanData.items.map((item: any) => ({
      bill_id: bill.id,
      item_name: item.name,
      item_price: item.price,
      quantity: item.quantity
    }));

    const { data: items, error: itemsErr } = await supabase.from('bill_items').insert(itemsToInsert).select('*');
    if (itemsErr || !items) throw new Error('Gagal bikin items: ' + (itemsErr?.message || 'Unknown Error'));

    // Minta bot bikin polling
    let payload: any = { type: 'create_poll', bill, items };
    try {
      const { data: groupSettings } = await supabase.from('wa_group_settings').select('group_jid').eq('is_active', true).maybeSingle();
      if (groupSettings?.group_jid) payload.groupJid = groupSettings.group_jid;
    } catch (e) {}

    const { error: qErr } = await supabase.from('bot_queue').insert({ payload });
    if (qErr) console.error('[scan-submit] Gagal queue bot message:', qErr);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
