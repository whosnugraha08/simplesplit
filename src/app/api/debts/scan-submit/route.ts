import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const { sender_number, scanData } = await req.json();

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Supabase Error' }, { status: 500 });

    // Match sender to friend
    let num = sender_number.split('@')[0];
    let last8 = num.length > 8 ? num.slice(-8) : num;
    const { data: friends } = await supabase.from('friends').select('*');
    const sender = friends?.find(f => f.whatsapp_number && f.whatsapp_number.replace(/[^0-9]/g, '').endsWith(last8));

    if (!sender) {
      return NextResponse.json({ error: 'Gagal mencari data kamu di database teman. Pastikan nomor WA tersimpan.' }, { status: 404 });
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
      status: 'polling',
      category: 'makanan'
    }).select('*, paid_by_friend:paid_by(*)').single();

    if (billErr || !bill) throw new Error('Gagal bikin bill');

    const itemsToInsert = scanData.items.map((item: any) => ({
      bill_id: bill.id,
      item_name: item.name,
      item_price: item.price,
      quantity: item.quantity
    }));

    const { data: items } = await supabase.from('bill_items').insert(itemsToInsert).select('*');

    // Minta bot bikin polling
    await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/webhook-wa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'create_poll', bill, items })
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
