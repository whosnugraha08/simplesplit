import { ItemWithAssignees, PersonBreakdown, Friend } from './types';

/**
 * Largest Remainder Method — distributes `total` across ids by weight.
 * Sum of outputs always equals `total` exactly.
 */
export function distributeWithLargestRemainder(
  total: number,
  weights: Record<string, number>,
): Record<string, number> {
  const ids = Object.keys(weights);
  if (total <= 0 || ids.length === 0) {
    return Object.fromEntries(ids.map(id => [id, 0]));
  }

  const totalWeight = ids.reduce((sum, id) => sum + weights[id], 0);
  if (totalWeight <= 0) {
    return Object.fromEntries(ids.map(id => [id, 0]));
  }

  const parts = ids.map(id => {
    const exact = (total * weights[id]) / totalWeight;
    const floor = Math.floor(exact);
    return { id, floor, remainder: exact - floor };
  });

  let distributed = parts.reduce((sum, p) => sum + p.floor, 0);
  let leftover = total - distributed;

  const sorted = [...parts].sort((a, b) => b.remainder - a.remainder);
  const result: Record<string, number> = {};
  parts.forEach(p => { result[p.id] = p.floor; });

  for (let i = 0; leftover > 0 && i < sorted.length; i++) {
    result[sorted[i].id]++;
    leftover--;
  }

  return result;
}

export interface SplitValidationError {
  field: string;
  message: string;
}

/**
 * Validate bill split inputs before calculation.
 */
export function validateSplitInput(
  items: ItemWithAssignees[],
  friends: Friend[],
): SplitValidationError | null {
  if (!items.length) {
    return { field: 'items', message: 'Bill harus punya minimal 1 item.' };
  }

  const names = friends.map(f => f.name.trim().toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) {
    return { field: 'friends', message: 'Ada nama teman yang duplikat.' };
  }

  for (const item of items) {
    if (Number(item.item_price) < 0) {
      return { field: 'items', message: `Harga "${item.item_name}" tidak boleh negatif.` };
    }
    if (item.quantity <= 0) {
      return { field: 'items', message: `Qty "${item.item_name}" harus lebih dari 0.` };
    }

    const hasAssignees =
      (item.assignments && item.assignments.some(a => a.qty > 0)) ||
      (item.assignee_ids && item.assignee_ids.length > 0);

    if (!hasAssignees) {
      return {
        field: 'items',
        message: `"${item.item_name}" belum di-assign ke siapa pun.`,
      };
    }
  }

  return null;
}

/**
 * Calculate how much each person owes — v2.0
 * - Qty-based item split
 * - Tax & service proportional to each person's subtotal (LRM)
 * - Item subtotals rounded with LRM so bill total stays exact
 */
export function calculateSplit(
  items: ItemWithAssignees[],
  friends: Friend[],
  taxAmount: number,
  serviceChargeAmount: number,
): PersonBreakdown[] {
  const validationError = validateSplitInput(items, friends);
  if (validationError) {
    throw new Error(validationError.message);
  }

  const subtotalMap: Record<string, number> = {};
  const itemDetailsMap: Record<string, { itemName: string; qty: number; amount: number }[]> = {};

  friends.forEach(f => {
    subtotalMap[f.id] = 0;
    itemDetailsMap[f.id] = [];
  });

  items.forEach(item => {
    const totalItemPrice = Number(item.item_price) * item.quantity;

    if (item.assignments && item.assignments.length > 0) {
      const activeAssignments = item.assignments.filter(a => a.qty > 0);
      const totalAssignedQty = activeAssignments.reduce((sum, a) => sum + a.qty, 0);
      if (totalAssignedQty === 0) return;

      const weights: Record<string, number> = {};
      activeAssignments.forEach(a => {
        weights[a.friendId] = (weights[a.friendId] || 0) + a.qty;
      });

      const shares = distributeWithLargestRemainder(Math.round(totalItemPrice), weights);

      Object.entries(shares).forEach(([friendId, shareAmount]) => {
        if (subtotalMap[friendId] !== undefined && shareAmount > 0) {
          subtotalMap[friendId] += shareAmount;
          itemDetailsMap[friendId].push({
            itemName: item.item_name,
            qty: weights[friendId],
            amount: shareAmount,
          });
        }
      });
    } else if (item.assignee_ids && item.assignee_ids.length > 0) {
      const weights: Record<string, number> = {};
      item.assignee_ids.forEach(id => {
        weights[id] = 1;
      });
      const shares = distributeWithLargestRemainder(Math.round(totalItemPrice), weights);

      item.assignee_ids.forEach(friendId => {
        if (subtotalMap[friendId] !== undefined) {
          const shareAmount = shares[friendId] ?? 0;
          subtotalMap[friendId] += shareAmount;
          itemDetailsMap[friendId].push({
            itemName: item.item_name,
            qty: 1,
            amount: shareAmount,
          });
        }
      });
    }
  });

  const peopleWithItems = friends.filter(f => (subtotalMap[f.id] || 0) > 0);
  const subtotalWeights: Record<string, number> = {};
  peopleWithItems.forEach(f => {
    subtotalWeights[f.id] = subtotalMap[f.id];
  });

  const taxShares = distributeWithLargestRemainder(Math.round(taxAmount), subtotalWeights);
  const serviceShares = distributeWithLargestRemainder(
    Math.round(serviceChargeAmount),
    subtotalWeights,
  );

  const breakdowns: PersonBreakdown[] = peopleWithItems.map(friend => {
    const itemsSubtotal = Math.round(subtotalMap[friend.id] || 0);
    const taxShare = taxShares[friend.id] ?? 0;
    const serviceShare = serviceShares[friend.id] ?? 0;

    return {
      friend,
      items_subtotal: itemsSubtotal,
      tax_share: taxShare,
      service_share: serviceShare,
      total: itemsSubtotal + taxShare + serviceShare,
      item_details: itemDetailsMap[friend.id] || [],
    };
  });

  breakdowns.sort((a, b) => b.total - a.total);
  return breakdowns;
}

/**
 * Calculate the debts from a bill split.
 */
export function calculateDebts(
  breakdowns: PersonBreakdown[],
  payerId: string,
): { debtorId: string; creditorId: string; amount: number; notes: string }[] {
  const debts: { debtorId: string; creditorId: string; amount: number; notes: string }[] = [];

  breakdowns.forEach(breakdown => {
    if (breakdown.friend.id === payerId) return;

    if (breakdown.total > 0) {
      const noteLines = breakdown.item_details.map(
        d => `${d.itemName} x${d.qty} = Rp ${d.amount.toLocaleString('id-ID')}`,
      );
      if (breakdown.tax_share > 0) {
        noteLines.push(`Tax: Rp ${breakdown.tax_share.toLocaleString('id-ID')}`);
      }
      if (breakdown.service_share > 0) {
        noteLines.push(`Service: Rp ${breakdown.service_share.toLocaleString('id-ID')}`);
      }

      debts.push({
        debtorId: breakdown.friend.id,
        creditorId: payerId,
        amount: breakdown.total,
        notes: noteLines.join('\n'),
      });
    }
  });

  return debts;
}
