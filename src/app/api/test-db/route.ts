import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'Supabase Error' }, { status: 500 });
  const { data } = await supabase.from('bot_queue').select('*').order('created_at', { ascending: false }).limit(10);
  return NextResponse.json(data);
}
