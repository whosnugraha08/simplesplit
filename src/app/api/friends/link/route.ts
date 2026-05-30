import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== (process.env.WEBHOOK_SECRET || 'super-secret-key-123')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jid, name } = await req.json();
    if (!jid || !name) return NextResponse.json({ error: 'Missing jid or name' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Supabase Error' }, { status: 500 });

    const nameQuery = name.toLowerCase();
    
    // Cari user yang paling cocok namanya
    const { data: friends } = await supabase.from('friends').select('*');
    const matched = friends?.find(f => f.name.toLowerCase().includes(nameQuery) || nameQuery.includes(f.name.toLowerCase()));

    if (!matched) {
      return NextResponse.json({ success: false, error: `Nama "${name}" tidak ditemukan di database SimpleSplit.` });
    }

    // Update whatsapp_number dengan jid
    const { error } = await supabase.from('friends').update({ whatsapp_number: jid }).eq('id', matched.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, matchedName: matched.name });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
