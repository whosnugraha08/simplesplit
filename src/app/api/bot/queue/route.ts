import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  try {
    const adminClient = getSupabaseAdmin();
    if (!adminClient) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
    }

    // Get up to 10 oldest queue items
    const { data: queueItems, error } = await adminClient
      .from('bot_queue')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw error;

    return NextResponse.json({ success: true, items: queueItems || [] });
  } catch (error: any) {
    console.error('Queue GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ids } = await req.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: true }); // Nothing to delete
    }

    const adminClient = getSupabaseAdmin();
    if (!adminClient) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
    }

    // Delete processed items
    const { error } = await adminClient
      .from('bot_queue')
      .delete()
      .in('id', ids);

    if (error) throw error;

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error: any) {
    console.error('Queue POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
