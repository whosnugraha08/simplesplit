'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BillItem, Friend, ItemWithAssignees, PersonBreakdown, Bill } from '@/lib/types';
import { calculateSplit, calculateDebts } from '@/lib/calculations';
import { formatRupiah, getInitials, getAvatarColor } from '@/lib/formatters';

export default function AssignPage() {
  const params = useParams();
  const router = useRouter();
  const billId = params.id as string;

  const [bill, setBill] = useState<Bill | null>(null);
  const [items, setItems] = useState<ItemWithAssignees[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [breakdowns, setBreakdowns] = useState<PersonBreakdown[]>([]);

  useEffect(() => {
    loadData();
  }, [billId]);

  // Recalculate whenever items or assignments change
  useEffect(() => {
    if (items.length > 0 && friends.length > 0 && bill) {
      const result = calculateSplit(
        items,
        friends,
        Number(bill.tax_amount),
        Number(bill.service_charge_amount),
      );
      setBreakdowns(result);
    }
  }, [items, friends, bill]);

  async function loadData() {
    const [billRes, itemsRes, friendsRes] = await Promise.all([
      supabase.from('bills').select('*').eq('id', billId).single(),
      supabase.from('bill_items').select('*').eq('bill_id', billId).order('created_at'),
      supabase.from('friends').select('*').order('is_admin', { ascending: false }).order('name'),
    ]);

    setBill(billRes.data);
    setItems((itemsRes.data || []).map(item => ({ ...item, assignee_ids: [] })));
    setFriends(friendsRes.data || []);
    setLoading(false);
  }

  function toggleAssignment(itemIndex: number, friendId: string) {
    const updated = [...items];
    const item = updated[itemIndex];
    const idx = item.assignee_ids.indexOf(friendId);
    if (idx >= 0) {
      item.assignee_ids.splice(idx, 1);
    } else {
      item.assignee_ids.push(friendId);
    }
    setItems(updated);
  }

  function assignAllToEveryone() {
    const allIds = friends.map(f => f.id);
    setItems(items.map(item => ({ ...item, assignee_ids: [...allIds] })));
  }

  async function handleSave() {
    if (!bill) return;
    setSaving(true);

    try {
      // 1. Delete existing assignments and debts for this bill
      const itemIds = items.map(i => i.id);
      await supabase.from('item_assignments').delete().in('bill_item_id', itemIds);
      await supabase.from('debts').delete().eq('bill_id', billId);

      // 2. Insert new assignments
      const assignments: { bill_item_id: string; friend_id: string; share_amount: number }[] = [];
      items.forEach(item => {
        if (item.assignee_ids.length === 0) return;
        const shareAmount = (Number(item.item_price) * item.quantity) / item.assignee_ids.length;
        item.assignee_ids.forEach(friendId => {
          assignments.push({
            bill_item_id: item.id,
            friend_id: friendId,
            share_amount: Math.round(shareAmount),
          });
        });
      });

      if (assignments.length > 0) {
        await supabase.from('item_assignments').insert(assignments);
      }

      // 3. Calculate and insert debts
      const debtRecords = calculateDebts(breakdowns, bill.paid_by);
      if (debtRecords.length > 0) {
        await supabase.from('debts').insert(
          debtRecords.map(d => ({
            bill_id: billId,
            debtor_id: d.debtorId,
            creditor_id: d.creditorId,
            amount: d.amount,
            status: 'unpaid',
          }))
        );
      }

      // 4. Update bill status
      await supabase.from('bills').update({ status: 'assigned' }).eq('id', billId);

      router.push(`/bills/${billId}`);
    } catch (err) {
      console.error('Error saving assignments:', err);
      alert('Gagal menyimpan pembagian. Coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-4 pt-6">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-32 w-full" />)}
        </div>
      </div>
    );
  }

  if (!bill) {
    return <div className="px-4 pt-6 text-center py-16 text-text-secondary">Bill tidak ditemukan</div>;
  }

  const allAssigned = items.every(item => item.assignee_ids.length > 0);

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.back()} className="text-xl text-text-secondary p-1">←</button>
        <div>
          <h1 className="text-xl font-bold">Bagi Item</h1>
          <p className="text-xs text-text-secondary">Centang siapa yang pesan tiap item</p>
        </div>
      </div>

      {/* Quick Action */}
      <div className="flex gap-2 mb-4 mt-3">
        <button
          onClick={assignAllToEveryone}
          className="px-3 py-1.5 rounded-lg bg-primary-light text-primary text-xs font-semibold"
        >
          Semua bagi rata
        </button>
      </div>

      {/* Friends Legend */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4 scrollbar-hide">
        {friends.map(friend => (
          <div key={friend.id} className="flex items-center gap-1.5 shrink-0 bg-white rounded-full px-3 py-1.5 border border-border">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
              style={{ backgroundColor: getAvatarColor(friend.name) }}
            >
              {getInitials(friend.name)}
            </div>
            <span className="text-xs font-medium whitespace-nowrap">{friend.name}</span>
          </div>
        ))}
      </div>

      {/* Items with checkboxes */}
      <div className="space-y-3 mb-6">
        {items.map((item, idx) => (
          <div key={item.id} className="bg-white rounded-2xl border border-border p-4 animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
            {/* Item info */}
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-semibold text-sm">{item.item_name}</p>
                {item.quantity > 1 && (
                  <p className="text-xs text-text-secondary">{item.quantity}x @ {formatRupiah(Number(item.item_price))}</p>
                )}
              </div>
              <p className="money text-sm">{formatRupiah(Number(item.item_price) * item.quantity)}</p>
            </div>

            {/* Assignee checkboxes */}
            <div className="flex flex-wrap gap-2">
              {friends.map(friend => {
                const isAssigned = item.assignee_ids.includes(friend.id);
                return (
                  <button
                    key={friend.id}
                    onClick={() => toggleAssignment(idx, friend.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isAssigned
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-page text-text-secondary hover:bg-primary-light hover:text-primary'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                        isAssigned ? 'bg-white/30 text-white' : ''
                      }`}
                      style={!isAssigned ? { backgroundColor: getAvatarColor(friend.name), color: 'white' } : {}}
                    >
                      {isAssigned ? '✓' : getInitials(friend.name)}
                    </div>
                    {friend.name}
                  </button>
                );
              })}
            </div>

            {/* Per-person share preview */}
            {item.assignee_ids.length > 0 && (
              <p className="text-xs text-text-secondary mt-2 text-right">
                = {formatRupiah((Number(item.item_price) * item.quantity) / item.assignee_ids.length)} / orang
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Breakdown Preview */}
      {breakdowns.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-text-secondary mb-2">Ringkasan Per Orang</h2>
          <div className="bg-white rounded-2xl border border-border divide-y divide-border">
            {breakdowns.map(b => {
              const isPayer = b.friend.id === bill.paid_by;
              return (
                <div key={b.friend.id} className="px-4 py-3 flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: getAvatarColor(b.friend.name) }}
                  >
                    {getInitials(b.friend.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {b.friend.name}
                      {isPayer && <span className="text-primary text-[10px] font-bold ml-1">PAYER</span>}
                    </p>
                    <p className="text-[10px] text-text-secondary">
                      item {formatRupiah(b.items_subtotal)}
                      {b.tax_share > 0 && ` + tax ${formatRupiah(b.tax_share)}`}
                      {b.service_share > 0 && ` + svc ${formatRupiah(b.service_share)}`}
                    </p>
                  </div>
                  <p className={`money text-sm ${isPayer ? 'text-success' : 'text-text-primary'}`}>
                    {formatRupiah(b.total)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving || !allAssigned}
        className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition"
      >
        {saving ? 'Menyimpan...' : !allAssigned ? 'Centang semua item dulu' : '✓ Simpan Pembagian'}
      </button>

      {!allAssigned && (
        <p className="text-xs text-warning text-center mt-2">
          ⚠️ Semua item harus di-assign ke minimal 1 orang
        </p>
      )}
    </div>
  );
}
