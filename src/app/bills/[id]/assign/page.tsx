'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { BillItem, Friend, ItemWithAssignees, PersonBreakdown, Bill, AssignmentEntry } from '@/lib/types';
import { calculateSplit, calculateDebts } from '@/lib/calculations';
import { formatRupiah, getInitials, getAvatarColor } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import { autoProcessNetting } from '@/lib/netting';
import { notifyWhatsApp, notifyWhatsAppGroup } from '@/lib/notify';

export default function AssignPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const billId = params.id as string;

  const [bill, setBill] = useState<Bill | null>(null);
  const [items, setItems] = useState<ItemWithAssignees[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [breakdowns, setBreakdowns] = useState<PersonBreakdown[]>([]);
  const [splitMode, setSplitMode] = useState<'qty' | 'equal'>('qty');

  useEffect(() => { loadData(); }, [billId]);

  // Recalculate whenever items or assignments change
  useEffect(() => {
    if (items.length > 0 && friends.length > 0 && bill) {
      try {
        const result = calculateSplit(items, friends, Number(bill.tax_amount), Number(bill.service_charge_amount));
        setBreakdowns(result);
      } catch (err) {
        // Ignored: this happens normally when some items are not fully assigned yet
        setBreakdowns([]);
      }
    }
  }, [items, friends, bill]);

  async function loadData() {
    const [billRes, itemsRes, friendsRes] = await Promise.all([
      supabase.from('bills').select('*').eq('id', billId).single(),
      supabase.from('bill_items').select('*').eq('bill_id', billId).order('created_at'),
      supabase.from('friends').select('*').order('is_admin', { ascending: false }).order('name'),
    ]);

    setBill(billRes.data);
    setItems((itemsRes.data || []).map(item => ({
      ...item,
      assignee_ids: [],
      assignments: [],
    })));
    setFriends(friendsRes.data || []);
    setLoading(false);
  }

  // --- Qty-based assignment ---
  function setQty(itemIndex: number, friendId: string, qty: number) {
    const updated = [...items];
    const item = updated[itemIndex];
    const existingIdx = item.assignments.findIndex(a => a.friendId === friendId);

    if (qty <= 0) {
      // Remove assignment
      if (existingIdx >= 0) item.assignments.splice(existingIdx, 1);
      item.assignee_ids = item.assignments.filter(a => a.qty > 0).map(a => a.friendId);
    } else {
      if (existingIdx >= 0) {
        item.assignments[existingIdx].qty = qty;
      } else {
        item.assignments.push({ friendId, qty });
      }
      item.assignee_ids = item.assignments.filter(a => a.qty > 0).map(a => a.friendId);
    }
    setItems(updated);
  }

  function getQty(itemIndex: number, friendId: string): number {
    return items[itemIndex]?.assignments.find(a => a.friendId === friendId)?.qty || 0;
  }

  function getTotalAssignedQty(itemIndex: number): number {
    return items[itemIndex]?.assignments.reduce((sum, a) => sum + a.qty, 0) || 0;
  }

  // --- Equal split toggle ---
  function toggleEqualAssignment(itemIndex: number, friendId: string) {
    const updated = [...items];
    const item = updated[itemIndex];
    const idx = item.assignee_ids.indexOf(friendId);
    if (idx >= 0) {
      item.assignee_ids.splice(idx, 1);
      // Remove from assignments too
      item.assignments = item.assignments.filter(a => a.friendId !== friendId);
    } else {
      item.assignee_ids.push(friendId);
      // For equal mode, everyone gets equal share (1 qty each)
      if (!item.assignments.find(a => a.friendId === friendId)) {
        item.assignments.push({ friendId, qty: 1 });
      }
    }
    // In equal mode, all assigned people get qty = 1
    if (splitMode === 'equal') {
      item.assignments = item.assignee_ids.map(id => ({ friendId: id, qty: 1 }));
    }
    setItems(updated);
  }

  // Quick actions
  function assignAllEqual() {
    const allIds = friends.map(f => f.id);
    setItems(items.map(item => ({
      ...item,
      assignee_ids: [...allIds],
      assignments: allIds.map(id => ({ friendId: id, qty: 1 })),
    })));
  }

  function resetAll() {
    setItems(items.map(item => ({ ...item, assignee_ids: [], assignments: [] })));
  }

  async function handleSave() {
    if (!bill) return;
    setSaving(true);

    try {
      const itemIds = items.map(i => i.id);
      await supabase.from('item_assignments').delete().in('bill_item_id', itemIds);
      await supabase.from('debts').delete().eq('bill_id', billId);

      // Insert assignments with qty
      const assignments: { bill_item_id: string; friend_id: string; share_amount: number; assigned_qty: number }[] = [];
      items.forEach(item => {
        if (item.assignments.length === 0) return;
        const totalAssignedQty = item.assignments.reduce((sum, a) => sum + a.qty, 0);
        if (totalAssignedQty === 0) return;
        const totalItemPrice = Number(item.item_price) * item.quantity;
        const pricePerUnit = totalItemPrice / totalAssignedQty;

        item.assignments.forEach(assignment => {
          if (assignment.qty > 0) {
            assignments.push({
              bill_item_id: item.id,
              friend_id: assignment.friendId,
              share_amount: Math.round(pricePerUnit * assignment.qty),
              assigned_qty: assignment.qty,
            });
          }
        });
      });

      if (assignments.length > 0) {
        await supabase.from('item_assignments').insert(assignments);
      }

      // Calculate and insert debts with notes
      const debtRecords = calculateDebts(breakdowns, bill.paid_by);
      if (debtRecords.length > 0) {
        await supabase.from('debts').insert(
          debtRecords.map(d => ({
            bill_id: billId,
            debtor_id: d.debtorId,
            creditor_id: d.creditorId,
            amount: d.amount,
            status: 'unpaid',
            notes: d.notes,
          }))
        );
      }

      await supabase.from('bills').update({ status: 'assigned' }).eq('id', billId);

      const { data: insertedDebts } = await supabase
        .from('debts')
        .select('*, debtor:debtor_id(id,name,whatsapp_number), creditor:creditor_id(id,name,whatsapp_number)')
        .eq('bill_id', billId)
        .eq('status', 'unpaid');

      const { data: billFull } = await supabase
        .from('bills')
        .select('*, paid_by_friend:paid_by(id,name,whatsapp_number)')
        .eq('id', billId)
        .single();

      const { data: billItems } = await supabase.from('bill_items').select('*').eq('bill_id', billId);

      if (billFull && insertedDebts?.length) {
        notifyWhatsApp({ bill: billFull, items: billItems || [], debts: insertedDebts });
        notifyWhatsAppGroup({ type: 'group_notify', bill: billFull, items: billItems || [], debts: insertedDebts });
      }

      // Auto-netting: check if any debts can be offset
      const nettingResult = await autoProcessNetting(bill.paid_by);
      
      if (nettingResult.netted) {
        showToast('Pembagian disimpan & hutang di-netting otomatis! 🔄', 'success');
      } else {
        showToast('Pembagian berhasil disimpan!', 'success');
      }
      router.push(`/bills/${billId}`);
    } catch (err) {
      console.error('Error saving assignments:', err);
      showToast('Gagal menyimpan pembagian', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePoll() {
    if (!bill) return;
    setSaving(true);
    try {
      await supabase.from('bills').update({ status: 'polling' }).eq('id', billId);
      
      const { data: billFull } = await supabase
        .from('bills')
        .select('*, paid_by_friend:paid_by(id,name,whatsapp_number)')
        .eq('id', billId)
        .single();

      if (billFull) {
        fetch('/api/webhook-wa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'create_poll', bill: billFull, items: items })
        }).catch(console.error);
      }
      
      showToast('Polling berhasil dikirim ke grup WA! 📲', 'success');
      router.push(`/debts`);
    } catch (err) {
      console.error('Error creating poll:', err);
      showToast('Gagal membuat polling', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="content-padding pt-6">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-32 w-full" />)}
        </div>
      </div>
    );
  }

  if (!bill) {
    return <div className="content-padding pt-6 text-center py-16 text-[var(--outline)]">Bill tidak ditemukan</div>;
  }

  const allAssigned = items.every(item => item.assignments.length > 0 || item.assignee_ids.length > 0);

  return (
    <div className="content-padding pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.back()} className="text-xl text-[var(--outline)] p-1">←</button>
        <div>
          <h1 className="text-xl font-bold">Bagi Item</h1>
          <p className="text-xs text-[var(--outline)]">{bill.title}</p>
        </div>
      </div>

      {/* Split Mode Toggle */}
      <div className="flex gap-1 bg-[var(--surface-container)] rounded-2xl p-1 border border-[var(--outline-variant)] mb-4 mt-3">
        <button
          onClick={() => setSplitMode('qty')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            splitMode === 'qty' ? 'bg-[var(--primary-container)] text-white ' : 'text-[var(--outline)]'
          }`}
        >
          🔢 Per Qty
        </button>
        <button
          onClick={() => setSplitMode('equal')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            splitMode === 'equal' ? 'bg-[var(--primary-container)] text-white ' : 'text-[var(--outline)]'
          }`}
        >
          ➗ Bagi Rata
        </button>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 mb-4">
        <button onClick={assignAllEqual} className="px-3 py-1.5 rounded-lg bg-[rgba(200,241,53,0.2)] text-[var(--lime)] border border-[rgba(200,241,53,0.3)] text-xs font-semibold">
          Semua bagi rata
        </button>
        <button onClick={resetAll} className="px-3 py-1.5 rounded-lg bg-[var(--surface-container)] text-[var(--outline)] text-xs font-semibold border border-[var(--outline-variant)]">
          Reset
        </button>
      </div>

      {/* Friends Legend */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4 md:-mx-8 md:px-8 scrollbar-hide">
        {friends.map(friend => (
          <div key={friend.id} className="flex items-center gap-1.5 shrink-0 bg-[var(--surface-container)] rounded-full px-3 py-1.5 border border-[var(--outline-variant)]">
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

      {/* Items */}
      <div className="space-y-3 mb-6">
        {items.map((item, idx) => {
          const totalAssigned = getTotalAssignedQty(idx);
          const isOver = totalAssigned > item.quantity;
          const isExact = totalAssigned === item.quantity;

          return (
            <div key={item.id} className="glass-card p-4 animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
              {/* Item info */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-sm">{item.item_name}</p>
                  <p className="text-xs text-[var(--outline)]">
                    {item.quantity}x @ {formatRupiah(Number(item.item_price))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="money text-sm">{formatRupiah(Number(item.item_price) * item.quantity)}</p>
                  {splitMode === 'qty' && totalAssigned > 0 && (
                    <p className={`text-[10px] font-semibold ${isExact ? 'text-success' : isOver ? 'text-danger' : 'text-warning'}`}>
                      {totalAssigned}/{item.quantity} assigned
                    </p>
                  )}
                </div>
              </div>

              {/* Assignment UI */}
              {splitMode === 'qty' ? (
                // Qty mode: stepper per person
                <div className="space-y-2">
                  {friends.map(friend => {
                    const qty = getQty(idx, friend.id);
                    return (
                      <div key={friend.id} className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                          style={{ backgroundColor: getAvatarColor(friend.name) }}
                        >
                          {getInitials(friend.name)}
                        </div>
                        <span className="text-xs font-medium flex-1 truncate">{friend.name}</span>

                        {/* Qty stepper */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setQty(idx, friend.id, Math.max(0, qty - 1))}
                            className="qty-btn qty-btn-minus"
                            disabled={qty <= 0}
                          >
                            −
                          </button>
                          <span className={`w-8 text-center text-sm font-bold ${qty > 0 ? 'text-[var(--lime)]' : 'text-[var(--outline)]'}`}>
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQty(idx, friend.id, qty + 1)}
                            className="qty-btn qty-btn-plus"
                          >
                            +
                          </button>
                        </div>

                        {/* Per-person amount */}
                        {qty > 0 && (
                          <span className="money text-xs text-[var(--outline)] w-20 text-right shrink-0">
                            {formatRupiah((Number(item.item_price) * item.quantity / (totalAssigned || 1)) * qty)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Equal mode: checkbox per person
                <div className="flex flex-wrap gap-2">
                  {friends.map(friend => {
                    const isAssigned = item.assignee_ids.includes(friend.id);
                    return (
                      <button
                        key={friend.id}
                        onClick={() => toggleEqualAssignment(idx, friend.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                          isAssigned
                            ? 'bg-[var(--primary-container)] text-white '
                            : 'bg-[var(--surface-container)] text-[var(--outline)] hover:bg-blue-500/10 hover:text-[var(--lime)]'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                            isAssigned ? 'bg-[var(--navy)]/30 text-white' : ''
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
              )}

              {/* Per-person share preview (equal mode) */}
              {splitMode === 'equal' && item.assignee_ids.length > 0 && (
                <p className="text-xs text-[var(--outline)] mt-2 text-right">
                  = {formatRupiah((Number(item.item_price) * item.quantity) / item.assignee_ids.length)} / orang
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Breakdown Preview */}
      {breakdowns.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--outline)] mb-2">Ringkasan Per Orang</h2>
          <div className="glass-card divide-y divide-border">
            {breakdowns.map(b => {
              const isPayer = b.friend.id === bill.paid_by;
              return (
                <div key={b.friend.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: getAvatarColor(b.friend.name) }}
                    >
                      {getInitials(b.friend.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {b.friend.name}
                        {isPayer && <span className="text-[var(--lime)] text-[10px] font-bold ml-1">PAYER</span>}
                      </p>
                      <p className="text-[10px] text-[var(--outline)]">
                        {b.item_details.map(d => `${d.itemName} x${d.qty}`).join(', ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`money text-sm ${isPayer ? 'text-success' : 'text-[var(--on-surface)]'}`}>
                        {formatRupiah(b.total)}
                      </p>
                      {(b.tax_share > 0 || b.service_share > 0) && (
                        <p className="text-[9px] text-[var(--outline)]">
                          {b.tax_share > 0 && `+tax ${formatRupiah(b.tax_share)}`}
                          {b.service_share > 0 && ` +svc ${formatRupiah(b.service_share)}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex gap-3">
        <button
          onClick={handleCreatePoll}
          disabled={saving}
          className="flex-[2] py-3.5 rounded-xl bg-[#25D366] text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition  shadow-[#25D366]/20 flex items-center justify-center gap-2"
        >
          <span>💬</span> Polling Grup WA
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !allAssigned}
          className="flex-[3] py-3.5 rounded-xl btn-primary text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition  shadow-none"
        >
          {saving ? 'Menyimpan...' : !allAssigned ? 'Assign semua dulu' : '✓ Simpan Manual'}
        </button>
      </div>

      {!allAssigned && (
        <p className="text-xs text-warning text-center mt-2">
          ⚠️ Semua item harus di-assign ke minimal 1 orang
        </p>
      )}
    </div>
  );
}
