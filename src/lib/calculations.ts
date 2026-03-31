import { ItemWithAssignees, PersonBreakdown, Friend } from './types';

/**
 * Calculate how much each person owes.
 * 
 * Logic:
 * 1. For each item, divide price equally among assignees
 * 2. Sum up each person's item subtotal
 * 3. Distribute tax & service charge proportionally based on each person's subtotal
 * 4. Final total per person = their subtotal + their proportional tax + their proportional service
 */
export function calculateSplit(
  items: ItemWithAssignees[],
  friends: Friend[],
  taxAmount: number,
  serviceChargeAmount: number,
): PersonBreakdown[] {
  // Build a map of friend_id → items subtotal
  const subtotalMap: Record<string, number> = {};

  // Initialize all friends to 0
  friends.forEach(f => {
    subtotalMap[f.id] = 0;
  });

  // Calculate each person's share of items
  items.forEach(item => {
    if (item.assignee_ids.length === 0) return;
    
    const totalItemPrice = item.item_price * item.quantity;
    const sharePerPerson = totalItemPrice / item.assignee_ids.length;
    
    item.assignee_ids.forEach(friendId => {
      if (subtotalMap[friendId] !== undefined) {
        subtotalMap[friendId] += sharePerPerson;
      }
    });
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
): { debtorId: string; creditorId: string; amount: number }[] {
  const debts: { debtorId: string; creditorId: string; amount: number }[] = [];

  breakdowns.forEach(breakdown => {
    // Skip the payer (they don't owe themselves)
    if (breakdown.friend.id === payerId) return;
    
    if (breakdown.total > 0) {
      debts.push({
        debtorId: breakdown.friend.id,
        creditorId: payerId,
        amount: breakdown.total,
      });
    }
  });

  return debts;
}
