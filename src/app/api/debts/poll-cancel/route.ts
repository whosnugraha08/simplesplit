import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== (process.env.WEBHOOK_SECRET || 'super-secret-key-123')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { billId } = await req.json();

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Supabase Error' }, { status: 500 });

    const { data: bill } = await supabase.from('bills').select('status').eq('id', billId).single();
    if (!bill) return NextResponse.json({ error: 'Bill tidak ditemukan' }, { status: 404 });

    if (bill.status === 'assigned') {
      return NextResponse.json({ error: 'Bill sudah dibagikan, tidak bisa dibatalkan dari bot.' }, { status: 400 });
    }

    // Delete bill items and bill
    await supabase.from('bill_items').delete().eq('bill_id', billId);
    await supabase.from('bills').delete().eq('id', billId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
