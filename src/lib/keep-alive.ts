/**
 * Client-side Supabase keep-alive utility.
 * 
 * Pings the /api/keep-alive endpoint when the user opens the app,
 * providing an additional layer of protection against Supabase pause.
 * 
 * Throttled to max once every 4 hours per browser to avoid excess requests.
 */

const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const STORAGE_KEY = 'simplesplit_last_keepalive';

export function scheduleKeepAlive(): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const lastPing = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);

  if (now - lastPing < KEEP_ALIVE_INTERVAL_MS) {
    // Already pinged recently, skip
    return;
  }

  // Ping after a short delay so it doesn't block initial page load
  setTimeout(async () => {
    try {
      const res = await fetch('/api/keep-alive', {
        method: 'GET',
        cache: 'no-store',
      });

      if (res.ok) {
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
        console.log('[keep-alive] 🟢 Client-side ping successful');
      } else {
        console.warn('[keep-alive] ⚠️ Ping returned:', res.status);
      }
    } catch (err) {
      // Silent fail — this is a best-effort background ping
      console.warn('[keep-alive] ⚠️ Client ping failed:', err);
    }
  }, 3000); // 3 second delay after page load
}
