import { supabase } from './supabase';

/**
 * Netting Hutang Otomatis
 * 
 * Saat 2 orang saling berhutang (A hutang ke B, dan B hutang ke A),
 * sistem otomatis menghitung selisih dan meng-offset hutang-hutang yang saling berlawanan.
 * 
 * Contoh:
 * - A hutang Rp50.000 ke B (dari Bill "Makan Siang")
 * - B hutang Rp80.000 ke A (dari Bill "Kopi")
 * - → Setelah netting: hutang A ke B lunas (di-offset), hutang B ke A berkurang jadi Rp30.000
 * 
 * Yang terjadi di database:
 * - Hutang A→B Rp50.000: di-mark 'paid', notes ditambah penjelasan netting
 * - Hutang B→A Rp80.000: amount dikurangi jadi Rp30.000, notes ditambah penjelasan netting
 * - Hutang B→A yang offset (Rp50.000): dibuat record baru status 'paid' sebagai catatan
 */

interface UnpaidDebt {
  id: string;
  debtor_id: string;
  creditor_id: string;
  amount: number;
  notes: string | null;
  bill_id: string;
  bill?: { title: string } | null;
  debtor?: { name: string } | null;
  creditor?: { name: string } | null;
}

interface NettingResult {
  processed: boolean;
  pairs: NettingPair[];
}

export interface NettingPair {
  personA: { id: string; name: string };
  personB: { id: string; name: string };
  // What A owes B (gross)
  aOwesB: { total: number; debts: { id: string; amount: number; billTitle: string }[] };
  // What B owes A (gross)
  bOwesA: { total: number; debts: { id: string; amount: number; billTitle: string }[] };
  // Net result
  netDirection: 'a_pays_b' | 'b_pays_a' | 'settled';
  netAmount: number;
  offsetAmount: number; // how much was offset
}

/**
 * Calculate netting summary for display purposes (no DB changes).
 * Shows what CAN be netted for a given user.
 */
export async function calculateNettingSummary(friendId: string): Promise<NettingPair[]> {
  // Load ALL unpaid debts involving this user (as debtor OR creditor)
  const { data: allDebts } = await supabase
    .from('debts')
    .select('*, debtor:debtor_id(id,name), creditor:creditor_id(id,name), bill:bill_id(id,title)')
    .eq('status', 'unpaid')
    .or(`debtor_id.eq.${friendId},creditor_id.eq.${friendId}`);
  
  if (!allDebts || allDebts.length === 0) return [];

  // Group debts by pair (A↔B)
  const pairMap = new Map<string, { aOwesB: UnpaidDebt[]; bOwesA: UnpaidDebt[] }>();
  
  for (const debt of allDebts as any[]) {
    const otherId = debt.debtor_id === friendId ? debt.creditor_id : debt.debtor_id;
    // Always use sorted key so A↔B and B↔A map to same pair
    const pairKey = [friendId, otherId].sort().join('|');
    
    if (!pairMap.has(pairKey)) {
      pairMap.set(pairKey, { aOwesB: [], bOwesA: [] });
    }
    
    const pair = pairMap.get(pairKey)!;
    const [sortedA] = [friendId, otherId].sort();
    
    if (debt.debtor_id === sortedA) {
      pair.aOwesB.push(debt);
    } else {
      pair.bOwesA.push(debt);
    }
  }

  // Only process pairs where BOTH directions have debts (nettable)
  const nettingPairs: NettingPair[] = [];
  
  for (const [pairKey, pair] of pairMap) {
    if (pair.aOwesB.length === 0 || pair.bOwesA.length === 0) continue;
    
    const [idA, idB] = pairKey.split('|');
    const totalAtoB = pair.aOwesB.reduce((sum, d) => sum + Number(d.amount), 0);
    const totalBtoA = pair.bOwesA.reduce((sum, d) => sum + Number(d.amount), 0);
    
    const nameA = pair.aOwesB[0]?.debtor?.name || pair.bOwesA[0]?.creditor?.name || '?';
    const nameB = pair.aOwesB[0]?.creditor?.name || pair.bOwesA[0]?.debtor?.name || '?';
    
    const offsetAmount = Math.min(totalAtoB, totalBtoA);
    const netAmount = Math.abs(totalAtoB - totalBtoA);
    
    let netDirection: 'a_pays_b' | 'b_pays_a' | 'settled';
    if (totalAtoB > totalBtoA) netDirection = 'a_pays_b';
    else if (totalBtoA > totalAtoB) netDirection = 'b_pays_a';
    else netDirection = 'settled';

    nettingPairs.push({
      personA: { id: idA, name: nameA },
      personB: { id: idB, name: nameB },
      aOwesB: {
        total: totalAtoB,
        debts: pair.aOwesB.map(d => ({
          id: d.id,
          amount: Number(d.amount),
          billTitle: (d.bill as any)?.title || 'Bill',
        })),
      },
      bOwesA: {
        total: totalBtoA,
        debts: pair.bOwesA.map(d => ({
          id: d.id,
          amount: Number(d.amount),
          billTitle: (d.bill as any)?.title || 'Bill',
        })),
      },
      netDirection,
      netAmount,
      offsetAmount,
    });
  }

  return nettingPairs;
}

/**
 * Process netting for a specific pair — marks offset debts as paid 
 * and adjusts the remaining debt amount.
 * 
 * Returns a description of what was done.
 */
export async function processNetting(pair: NettingPair): Promise<string> {
  const { personA, personB, aOwesB, bOwesA, netDirection, netAmount, offsetAmount } = pair;
  
  if (offsetAmount <= 0) return 'Tidak ada yang bisa di-offset.';

  const now = new Date().toISOString();
  const nettingNote = `\n\n🔄 NETTING OTOMATIS (${new Date().toLocaleDateString('id-ID')}):\nHutang ini sudah di-offset karena ada hutang berlawanan antara ${personA.name} dan ${personB.name}. Total yang di-offset: Rp ${offsetAmount.toLocaleString('id-ID')}.`;

  // Determine which side has the smaller total (that side gets fully offset)
  // and which side has remainder
  const smallerSide = aOwesB.total <= bOwesA.total ? 'aOwesB' : 'bOwesA';
  const largerSide = smallerSide === 'aOwesB' ? 'bOwesA' : 'aOwesB';
  
  const smallerDebts = smallerSide === 'aOwesB' ? aOwesB.debts : bOwesA.debts;
  const largerDebts = largerSide === 'aOwesB' ? aOwesB.debts : bOwesA.debts;

  // Names of bills for context
  const largerBillNames = largerDebts.map(d => d.billTitle).join(', ');
  const smallerBillNames = smallerDebts.map(d => d.billTitle).join(', ');

  // Mark ALL debts on the smaller side as paid (fully offset)
  for (const debt of smallerDebts) {
    const { data: existingDebt } = await supabase
      .from('debts')
      .select('notes')
      .eq('id', debt.id)
      .single();
    
    const existingNotes = existingDebt?.notes || '';
    await supabase.from('debts').update({
      status: 'paid',
      paid_at: now,
      notes: existingNotes + `\n\n🔄 LUNAS via NETTING OTOMATIS — Di-offset dengan tagihan sebaliknya (${largerBillNames}). Tidak perlu transfer.`,
    }).eq('id', debt.id);
  }

  // On the larger side, we need to offset $offsetAmount worth of debts
  let remainingToOffset = offsetAmount;
  
  // Sort larger debts by amount ascending so we fully offset smaller ones first
  const sortedLarger = [...largerDebts].sort((a, b) => a.amount - b.amount);
  
  for (const debt of sortedLarger) {
    if (remainingToOffset <= 0) break;
    
    const { data: existingDebt } = await supabase
      .from('debts')
      .select('notes')
      .eq('id', debt.id)
      .single();
    
    const existingNotes = existingDebt?.notes || '';
    
    if (debt.amount <= remainingToOffset) {
      // Fully offset this debt
      await supabase.from('debts').update({
        status: 'paid',
        paid_at: now,
        notes: existingNotes + `\n\n🔄 LUNAS via NETTING OTOMATIS — Di-offset dengan tagihan sebaliknya (${smallerBillNames}). Tidak perlu transfer.`,
      }).eq('id', debt.id);
      remainingToOffset -= debt.amount;
    } else {
      // Partially offset — reduce the amount
      const newAmount = debt.amount - remainingToOffset;
      const offsetted = remainingToOffset;
      await supabase.from('debts').update({
        amount: newAmount,
        notes: existingNotes + `\n\n🔄 NETTING OTOMATIS — Rp ${offsetted.toLocaleString('id-ID')} sudah di-offset dengan tagihan sebaliknya (${smallerBillNames}). Sisa yang perlu dibayar: Rp ${newAmount.toLocaleString('id-ID')}.`,
      }).eq('id', debt.id);
      remainingToOffset = 0;
    }
  }

  // After netting, check if any bills now have ALL debts paid → update bill status to 'settled'
  const allAffectedDebts = [...smallerDebts, ...largerDebts];
  const affectedBillIds = new Set<string>();
  
  // Collect bill_ids from the affected debts
  for (const debt of allAffectedDebts) {
    const { data: debtRecord } = await supabase
      .from('debts')
      .select('bill_id')
      .eq('id', debt.id)
      .single();
    if (debtRecord?.bill_id) {
      affectedBillIds.add(debtRecord.bill_id);
    }
  }

  // For each affected bill, check if there are remaining unpaid debts
  for (const billId of affectedBillIds) {
    const { data: remainingUnpaid } = await supabase
      .from('debts')
      .select('id')
      .eq('bill_id', billId)
      .eq('status', 'unpaid');
    
    if (!remainingUnpaid || remainingUnpaid.length === 0) {
      // All debts for this bill are paid — mark bill as settled
      await supabase.from('bills').update({ status: 'settled' }).eq('id', billId);
    }
  }

  // Announce via WA Webhook
  try {
    fetch('/api/webhook-wa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'netting',
        pair: {
          personA: personA.name,
          personB: personB.name,
          offsetAmount,
          netDirection,
          netAmount
        }
      })
    }).catch(console.error);
  } catch (e) {
    console.error(e);
  }

  // Build result description
  if (netDirection === 'settled') {
    return `✅ Hutang antara ${personA.name} dan ${personB.name} sudah saling lunas! (Rp ${offsetAmount.toLocaleString('id-ID')} di-offset)`;
  } else {
    const payer = netDirection === 'a_pays_b' ? personA : personB;
    const receiver = netDirection === 'a_pays_b' ? personB : personA;
    return `✅ Netting berhasil! ${payer.name} tinggal bayar Rp ${netAmount.toLocaleString('id-ID')} ke ${receiver.name}. (Rp ${offsetAmount.toLocaleString('id-ID')} sudah di-offset otomatis)`;
  }
}

/**
 * Auto-run netting after new debts are created.
 * Called from the assign page after saving debts.
 */
export async function autoProcessNetting(friendId: string): Promise<{ message: string; netted: boolean }> {
  const pairs = await calculateNettingSummary(friendId);
  
  if (pairs.length === 0) {
    return { message: '', netted: false };
  }

  const messages: string[] = [];
  
  for (const pair of pairs) {
    const result = await processNetting(pair);
    messages.push(result);
  }

  return {
    message: messages.join('\n'),
    netted: true,
  };
}
