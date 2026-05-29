import { describe, it, expect } from 'vitest';
import {
  distributeWithLargestRemainder,
  calculateSplit,
  validateSplitInput,
} from './calculations';
import { Friend, ItemWithAssignees } from './types';

const friends: Friend[] = [
  { id: 'a', name: 'Andi', is_admin: false, created_at: '', updated_at: '' },
  { id: 'b', name: 'Budi', is_admin: false, created_at: '', updated_at: '' },
  { id: 'c', name: 'Cindi', is_admin: false, created_at: '', updated_at: '' },
];

describe('distributeWithLargestRemainder', () => {
  it('distributes exactly with no remainder loss', () => {
    const result = distributeWithLargestRemainder(10000, { a: 1, b: 1, c: 1 });
    const sum = Object.values(result).reduce((s, v) => s + v, 0);
    expect(sum).toBe(10000);
  });

  it('favors larger weights', () => {
    const result = distributeWithLargestRemainder(100, { a: 2, b: 1 });
    expect(result.a + result.b).toBe(100);
    expect(result.a).toBeGreaterThan(result.b);
  });
});

describe('calculateSplit', () => {
  it('equal split with proportional tax', () => {
    const items: ItemWithAssignees[] = [
      {
        id: '1',
        bill_id: 'b1',
        item_name: 'Nasi',
        item_price: 30000,
        quantity: 1,
        created_at: '',
        assignee_ids: ['a', 'b', 'c'],
      },
    ];
    const breakdowns = calculateSplit(items, friends, 3000, 1500);
    const total = breakdowns.reduce((s, b) => s + b.total, 0);
    expect(total).toBe(30000 + 3000 + 1500);
    breakdowns.forEach(b => {
      expect(b.tax_share + b.service_share).toBeGreaterThan(0);
    });
  });

  it('single person item not charged to others', () => {
    const items: ItemWithAssignees[] = [
      {
        id: '1',
        bill_id: 'b1',
        item_name: 'Kopi',
        item_price: 25000,
        quantity: 1,
        created_at: '',
        assignments: [{ friendId: 'a', qty: 1 }],
      },
      {
        id: '2',
        bill_id: 'b1',
        item_name: 'Teh',
        item_price: 15000,
        quantity: 1,
        created_at: '',
        assignments: [{ friendId: 'b', qty: 1 }],
      },
    ];
    const breakdowns = calculateSplit(items, friends, 0, 0);
    expect(breakdowns).toHaveLength(2);
    expect(breakdowns.find(b => b.friend.id === 'a')?.items_subtotal).toBe(25000);
    expect(breakdowns.find(b => b.friend.id === 'b')?.items_subtotal).toBe(15000);
    expect(breakdowns.find(b => b.friend.id === 'c')).toBeUndefined();
  });

  it('rejects empty bill', () => {
    expect(() => calculateSplit([], friends, 0, 0)).toThrow();
  });

  it('validates duplicate names', () => {
    const dupFriends = [
      ...friends,
      { id: 'd', name: 'Andi', is_admin: false, created_at: '', updated_at: '' },
    ];
    const err = validateSplitInput(
      [{ id: '1', bill_id: 'b', item_name: 'X', item_price: 1000, quantity: 1, created_at: '', assignee_ids: ['a'] }],
      dupFriends,
    );
    expect(err?.field).toBe('friends');
  });
});
