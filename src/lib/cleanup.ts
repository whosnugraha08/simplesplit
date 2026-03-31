import { supabase } from './supabase';

/**
 * Auto-cleanup: delete settled bills older than RETENTION_DAYS.
 * Called once on app load from the homepage.
 * Only deletes bills where status = 'settled' (all debts paid).
 */
const RETENTION_DAYS = 30;

let hasRunCleanup = false;

export async function runAutoCleanup(): Promise<{ deleted: number }> {
  // Only run once per session
  if (hasRunCleanup) return { deleted: 0 };
  hasRunCleanup = true;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    // Find old settled bills
    const { data: oldBills } = await supabase
      .from('bills')
      .select('id')
      .eq('status', 'settled')
      .lt('updated_at', cutoffISO);

    if (!oldBills || oldBills.length === 0) {
      return { deleted: 0 };
    }

    const billIds = oldBills.map(b => b.id);

    // Delete in order: assignments -> items -> debts -> bills
    // (CASCADE handles this, but being explicit)
    await supabase.from('bills').delete().in('id', billIds);

    console.log(`[SimpleSplit] Auto-cleanup: deleted ${billIds.length} old settled bill(s)`);
    return { deleted: billIds.length };
  } catch (err) {
    console.error('[SimpleSplit] Auto-cleanup error:', err);
    return { deleted: 0 };
  }
}
