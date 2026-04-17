import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This endpoint keeps the Supabase project alive by making a simple query.
// Called automatically by Vercel Cron every day.
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Simple query to keep the database active
    const { data, error } = await supabase
      .from('friends')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Keep-alive query failed:', error.message);
      return NextResponse.json(
        { status: 'error', message: error.message, timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    console.log('Keep-alive ping successful at', new Date().toISOString());
    return NextResponse.json({
      status: 'ok',
      message: 'Supabase is alive!',
      rows: data?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Keep-alive error:', err);
    return NextResponse.json(
      { status: 'error', message: err?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
