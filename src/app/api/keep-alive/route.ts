import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Keep-alive endpoint for Supabase free-tier projects.
 * 
 * Supabase pauses projects with no activity for 7+ days.
 * This endpoint performs BOTH read AND write operations to ensure
 * the project registers as "active".
 * 
 * Triggered by:
 * 1. GitHub Actions cron (every 6 hours) — primary, fully automatic
 * 2. Client-side ping when users open the app — secondary
 * 3. Manual GET request — fallback
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  const results: Record<string, any> = {};

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { status: 'error', message: 'Missing Supabase credentials' },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key);

    // --- Activity 1: Read from a real table ---
    const { data: readData, error: readError } = await supabase
      .from('friends')
      .select('id')
      .limit(1);

    results.read = readError
      ? { status: 'error', message: readError.message }
      : { status: 'ok', rows: readData?.length || 0 };

    // --- Activity 2: Write + Delete (keep_alive_pings table) ---
    // This creates real write activity which is stronger signal
    try {
      const pingId = `ping_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      const { error: insertError } = await supabase
        .from('keep_alive_pings')
        .insert({ id: pingId, pinged_at: new Date().toISOString() });

      if (insertError) {
        // Table might not exist — that's OK, the read activity is still enough
        results.write = { status: 'skipped', message: insertError.message };
      } else {
        results.write = { status: 'ok', id: pingId };

        // Clean up old pings (keep only last 10)
        const { data: oldPings } = await supabase
          .from('keep_alive_pings')
          .select('id, pinged_at')
          .order('pinged_at', { ascending: true });

        if (oldPings && oldPings.length > 10) {
          const toDelete = oldPings.slice(0, oldPings.length - 10).map(p => p.id);
          await supabase
            .from('keep_alive_pings')
            .delete()
            .in('id', toDelete);
          results.cleanup = { deleted: toDelete.length };
        }
      }
    } catch (writeErr: any) {
      results.write = { status: 'skipped', message: writeErr?.message };
    }

    // --- Activity 3: Auth health check (touches auth service) ---
    try {
      const { data: session } = await supabase.auth.getSession();
      results.auth = { status: 'ok', hasSession: !!session?.session };
    } catch {
      results.auth = { status: 'skipped' };
    }

    // --- Activity 4: Storage health check (touches storage service) ---
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      results.storage = { status: 'ok', buckets: buckets?.length || 0 };
    } catch {
      results.storage = { status: 'skipped' };
    }

    const elapsed = Date.now() - startTime;

    console.log(`[keep-alive] ✅ Ping successful at ${new Date().toISOString()} (${elapsed}ms)`);

    return NextResponse.json({
      status: 'ok',
      message: '🟢 Supabase is alive and active!',
      timestamp: new Date().toISOString(),
      elapsed_ms: elapsed,
      activities: results,
    });
  } catch (err: any) {
    console.error('[keep-alive] ❌ Error:', err);
    return NextResponse.json(
      {
        status: 'error',
        message: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
        elapsed_ms: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
