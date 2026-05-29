import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function formatRupiah(num: number): string {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== (process.env.WEBHOOK_SECRET || 'super-secret-key-123')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const { command, args } = await req.json();
    const cmd = (command || '').toLowerCase().trim();

    if (cmd === 'bantuan' || cmd === 'help') {
      return NextResponse.json({
        text:
          `*SimpleSplit Bot — Perintah Grup*\n\n` +
          `!hutang @nama — hutang aktif seseorang\n` +
          `!ringkasan — semua hutang aktif\n` +
          `!history @nama — history bulan ini\n` +
          `!lunas @nama Rp[X] — tandai lunas (perlu konfirmasi)\n` +
          `!bantuan — tampilkan daftar ini`,
      });
    }

    if (cmd === 'ringkasan') {
      const { data: debts } = await supabase
        .from('debts')
        .select('amount, status, debtor:debtor_id(name), creditor:creditor_id(name)')
        .eq('status', 'unpaid');

      const list = debts || [];
      const total = list.reduce((s, d) => s + Number(d.amount), 0);
      return NextResponse.json({
        text: `📊 *Ringkasan Hutang Aktif*\n${list.length} hutang aktif\nTotal: *${formatRupiah(total)}*`,
      });
    }

    if (cmd === 'hutang') {
      const nameQuery = (args?.[0] || '').replace('@', '').toLowerCase();
      if (!nameQuery) {
        return NextResponse.json({ text: '⚠️ Format: !hutang @nama' });
      }

      const { data: friends } = await supabase.from('friends').select('id, name');
      const friend = friends?.find(f => f.name.toLowerCase().includes(nameQuery));

      if (!friend) {
        return NextResponse.json({ text: `❌ Teman "${nameQuery}" tidak ditemukan.` });
      }

      const { data: debts } = await supabase
        .from('debts')
        .select('amount, notes, bill:bill_id(title, bill_date), creditor:creditor_id(name)')
        .eq('debtor_id', friend.id)
        .eq('status', 'unpaid');

      if (!debts?.length) {
        return NextResponse.json({ text: `✅ *${friend.name}* tidak punya hutang aktif.` });
      }

      let text = `💰 *Hutang ${friend.name}*\n`;
      debts.forEach(d => {
        const bill = d.bill as { title?: string; bill_date?: string } | null;
        text += `• ${formatRupiah(Number(d.amount))} ke ${(d.creditor as { name?: string })?.name} (${bill?.title || 'Bill'})\n`;
      });
      return NextResponse.json({ text });
    }

    if (cmd === 'history') {
      const nameQuery = (args?.[0] || '').replace('@', '').toLowerCase();
      const { data: friends } = await supabase.from('friends').select('id, name');
      const friend = friends?.find(f => f.name.toLowerCase().includes(nameQuery));

      if (!friend) {
        return NextResponse.json({ text: `❌ Teman tidak ditemukan.` });
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: debts } = await supabase
        .from('debts')
        .select('status, amount')
        .or(`debtor_id.eq.${friend.id},creditor_id.eq.${friend.id}`)
        .gte('created_at', startOfMonth.toISOString());

      const paid = debts?.filter(d => d.status === 'paid').length || 0;
      const pending = debts?.filter(d => d.status === 'unpaid').length || 0;

      return NextResponse.json({
        text: `📜 *History ${friend.name}* (bulan ini)\n${debts?.length || 0} transaksi — ${paid} lunas, ${pending} pending`,
      });
    }

    if (cmd === 'lunas') {
      return NextResponse.json({
        text: '⏳ Fitur !lunas via grup memerlukan konfirmasi penerima di web app. Buka simplesplit untuk approve.',
      });
    }

    return NextResponse.json({ text: '❓ Perintah tidak dikenal. Ketik !bantuan' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
