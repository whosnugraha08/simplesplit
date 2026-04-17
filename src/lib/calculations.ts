import { ItemWithAssignees, PersonBreakdown, Friend } from './types';

/**
 * Calculate how much each person owes — v2 with per-item qty.
 * 
 * Logic:
 * 1. For each item, calculate share based on assigned qty per person
 *    - If assignments array has data, use qty-based split
 *    - Fallback: if only assignee_ids, divide equally (backwards compat)
 * 2. Sum up each person's item subtotal
 * 3. Distribute tax & service charge proportionally
 * 4. Final total per person = subtotal + proportional tax + service
 */
export function calculateSplit(
  items: ItemWithAssignees[],
  friends: Friend[],
  taxAmount: number,
  serviceChargeAmount: number,
): PersonBreakdown[] {
  // Build a map of friend_id → items subtotal + item details
  const subtotalMap: Record<string, number> = {};
  const itemDetailsMap: Record<string, { itemName: string; qty: number; amount: number }[]> = {};

  // Initialize all friends to 0
  friends.forEach(f => {
    subtotalMap[f.id] = 0;
    itemDetailsMap[f.id] = [];
  });

  // Calculate each person's share of items
  items.forEach(item => {
    const totalItemPrice = Number(item.item_price) * item.quantity;

    // v2: Check if we have per-person qty assignments
    if (item.assignments && item.assignments.length > 0) {
      // Qty-based split
      const totalAssignedQty = item.assignments.reduce((sum, a) => sum + a.qty, 0);
      if (totalAssignedQty === 0) return;

      const pricePerUnit = totalItemPrice / totalAssignedQty;

      item.assignments.forEach(assignment => {
        if (subtotalMap[assignment.friendId] !== undefined && assignment.qty > 0) {
          const shareAmount = pricePerUnit * assignment.qty;
          subtotalMap[assignment.friendId] += shareAmount;
          itemDetailsMap[assignment.friendId].push({
            itemName: item.item_name,
            qty: assignment.qty,
            amount: Math.round(shareAmount),
          });
        }
      });
    } else if (item.assignee_ids && item.assignee_ids.length > 0) {
      // Fallback: equal split (backwards compatibility)
      const sharePerPerson = totalItemPrice / item.assignee_ids.length;
      
      item.assignee_ids.forEach(friendId => {
        if (subtotalMap[friendId] !== undefined) {
          subtotalMap[friendId] += sharePerPerson;
          itemDetailsMap[friendId].push({
            itemName: item.item_name,
            qty: Math.round(item.quantity / item.assignee_ids.length) || 1,
            amount: Math.round(sharePerPerson),
          });
        }
      });
    }
  });

  // Calculate total subtotal across all people
  const grandSubtotal = Object.values(subtotalMap).reduce((sum, val) => sum + val, 0);

  // Build the breakdown for each person who has items
  const breakdowns: PersonBreakdown[] = [];

  friends.forEach(friend => {
    const itemsSubtotal = subtotalMap[friend.id] || 0;
    
    if (itemsSubtotal <= 0) return;

    // Proportional share of tax and service charge
    const proportion = grandSubtotal > 0 ? itemsSubtotal / grandSubtotal : 0;
    const taxShare = taxAmount * proportion;
    const serviceShare = serviceChargeAmount * proportion;

    breakdowns.push({
      friend,
      items_subtotal: Math.round(itemsSubtotal),
      tax_share: Math.round(taxShare),
      service_share: Math.round(serviceShare),
      total: Math.round(itemsSubtotal + taxShare + serviceShare),
      item_details: itemDetailsMap[friend.id] || [],
    });
  });

  // Sort by total descending
  breakdowns.sort((a, b) => b.total - a.total);

  return breakdowns;
}

/**
 * Calculate the debts from a bill split.
 * Everyone except the payer owes the payer their total amount.
 */
export function calculateDebts(
  breakdowns: PersonBreakdown[],
  payerId: string,
): { debtorId: string; creditorId: string; amount: number; notes: string }[] {
  const debts: { debtorId: string; creditorId: string; amount: number; notes: string }[] = [];

  breakdowns.forEach(breakdown => {
    // Skip the payer (they don't owe themselves)
    if (breakdown.friend.id === payerId) return;
    
    if (breakdown.total > 0) {
      // Build notes from item details
      const noteLines = breakdown.item_details.map(
        d => `${d.itemName} x${d.qty} = Rp ${d.amount.toLocaleString('id-ID')}`
      );
      if (breakdown.tax_share > 0) noteLines.push(`Tax: Rp ${breakdown.tax_share.toLocaleString('id-ID')}`);
      if (breakdown.service_share > 0) noteLines.push(`Service: Rp ${breakdown.service_share.toLocaleString('id-ID')}`);

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
