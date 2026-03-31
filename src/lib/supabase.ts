import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

/**
 * Get the Supabase client (lazy initialization).
 * This avoids initialization during build/SSR when env vars aren't set.
 */
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  
  if (!url || !key || url.includes('your_supabase')) {
    // Fallback for build time — will fail at runtime but won't crash SSR build
    console.warn('SimpleSplit: Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
    _supabase = createClient('https://placeholder.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder');
    return _supabase;
  }
  
  _supabase = createClient(url, key);
  return _supabase;
}

// Export as a getter proxy so it's always lazy
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
