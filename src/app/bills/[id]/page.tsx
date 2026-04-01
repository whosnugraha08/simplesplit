'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Bill, BillItem, Friend, Debt } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import Link from 'next/link';

export default function BillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const billId = params.id as string;

  const [bill, setBill] = useState<(Bill & { paid_by_friend?: Friend }) | null>(null);
  const [items, setItems] = useState<BillItem[]>([]);
  const [debts, setDebts] = useState<(Debt & { debtor?: Friend })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [sendingWA, setSendingWA] = useState(false);
  const [sendingRemind, setSendingRemind] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    loadBill();
  }, [billId]);

  async function loadBill() {
    const [billRes, itemsRes, debtsRes] = await Promise.all([
      supabase
        .from('bills')
        .select('*, paid_by_friend:paid_by(id,name)')
        .eq('id', billId)
        .single(),
      supabase.from('bill_items').select('*').eq('bill_id', billId).order('created_at'),
      supabase
        .from('debts')
        .select('*, debtor:debtor_id(id,name)')
        .eq('bill_id', billId)
        .order('amount', { ascending: false }),
    ]);

    setBill(billRes.data as any);
    setItems(itemsRes.data || []);
    setDebts((debtsRes.data as any[]) || []);
    setLoading(false);
  }

  async function handleDelete() {
    setDeleting(true);
    await supabase.from('bills').delete().eq('id', billId);
    router.push('/bills');
  }

  async function handleSendWA() {
    if (!bill || debts.length === 0) return;
    setSendingWA(true);
    try {
      const res = await fetch('/api/webhook-wa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill, items, debts }),
      });
      
      if (!res.ok) {
        throw new Error('Gagal mengirim webhook');
      }
      
      alert('✅ Permintaan kirim pesan berhasil masuk ke antrean Bot!');
    } catch (err) {
      console.error(err);
      alert('❌ Gagal menghubungi server Bot WA.');
    } finally {
      setSendingWA(false);
    }
  }

  async function handleRemind(debt: Debt & { debtor?: Friend }) {
    if (!bill) return;
    setSendingRemind(debt.id);
    try {
      const res = await fetch('/api/webhook-wa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill, items, debts: [debt], type: 'remind' }),
      });
      if (!res.ok) throw new Error('Gagal');
      alert(`✅ Pengingat langsung dikirim ke ${debt.debtor?.name}!`);
    } catch (err) {
      alert(`❌ Gagal mengirim pengingat ke ${debt.debtor?.name}`);
    } finally {
      setSendingRemind(null);
    }
  }

  if (loading) {
    return (
      <div className="px-4 pt-6">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-32 w-full mb-4" />
        <div className="skeleton h-24 w-full mb-3" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="px-4 pt-6 text-center py-16">
        <p className="text-3xl mb-3">🤷</p>
        <p className="text-text-secondary">Bill tidak ditemukan</p>
      </div>
    );
  }

  const statusLabel: Record<string, { text: string; color: string }> = {
    draft: { text: 'Draft', color: 'bg-warning-light text-yellow-700' },
    assigned: { text: 'Dibagi', color: 'bg-primary-light text-primary' },
    settled: { text: 'Selesai', color: 'bg-success-light text-success' },
  };
  const status = statusLabel[bill.status] || statusLabel.draft;

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/bills')} className="text-xl text-text-secondary p-1">←</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold truncate">{bill.title}</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${status.color}`}>
              {status.text}
            </span>
          </div>
          <p className="text-xs text-text-secondary">{formatDate(bill.bill_date)}</p>
        </div>
      </div>

      {/* Payer Info */}
      <div className="bg-white rounded-2xl border border-border p-4 mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: getAvatarColor(bill.paid_by_friend?.name || '') }}
          >
            {getInitials(bill.paid_by_friend?.name || '?')}
          </div>
          <div>
            <p className="text-xs text-text-secondary">Ditalangi oleh</p>
            <p className="font-semibold">{bill.paid_by_friend?.name}</p>
          </div>
        </div>
      </div>

      {/* Amount Summary */}
      <div className="bg-primary rounded-2xl p-4 mb-4 text-white">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-blue-100">Subtotal</span>
            <span className="money">{formatRupiah(Number(bill.subtotal))}</span>
          </div>
          {Number(bill.tax_amount) > 0 && (
            <div className="flex justify-between">
              <span className="text-blue-100">Pajak</span>
              <span className="money">{formatRupiah(Number(bill.tax_amount))}</span>
            </div>
          )}
          {Number(bill.service_charge_amount) > 0 && (
            <div className="flex justify-between">
              <span className="text-blue-100">Service Charge</span>
              <span className="money">{formatRupiah(Number(bill.service_charge_amount))}</span>
            </div>
          )}
          <div className="border-t border-blue-400/30 pt-1.5 flex justify-between">
            <span className="font-semibold">Total</span>
            <span className="money text-lg">{formatRupiah(Number(bill.total_amount))}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-2">Item ({items.length})</h2>
        <div className="bg-white rounded-2xl border border-border divide-y divide-border">
          {items.map(item => (
            <div key={item.id} className="px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium">{item.item_name}</p>
                {item.quantity > 1 && (
                  <p className="text-xs text-text-secondary">{item.quantity}x @ {formatRupiah(Number(item.item_price))}</p>
                )}
              </div>
              <p className="money text-sm">{formatRupiah(Number(item.item_price) * item.quantity)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Debts */}
      {debts.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-text-secondary mb-2">Pembagian</h2>
          <div className="space-y-2">
            {debts.map(debt => (
              <div key={debt.id} className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: getAvatarColor(debt.debtor?.name || '') }}
                >
                  {getInitials(debt.debtor?.name || '?')}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{debt.debtor?.name}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <p className={`money text-sm ${debt.status === 'paid' ? 'text-success' : 'text-danger'}`}>
                    {formatRupiah(Number(debt.amount))}
                  </p>
                  <div className="flex items-center gap-2">
                    {debt.status !== 'paid' && bill.status !== 'draft' && (
                      <button
                        onClick={() => handleRemind(debt)}
                        disabled={sendingRemind === debt.id}
                        className="p-1 rounded-md bg-warning-light hover:bg-yellow-200 text-yellow-700 transition active:scale-95 disabled:opacity-50"
                        title="Kirim Ping Pengingat (P!)"
                      >
                        {sendingRemind === debt.id ? '⏳' : '🔔'}
                      </button>
                    )}
                    <span className={`text-[10px] font-bold ${debt.status === 'paid' ? 'text-success' : 'text-warning'}`}>
                      {debt.status === 'paid' ? '✓ LUNAS' : 'BELUM LUNAS'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {bill.status === 'draft' && (
          <Link
            href={`/bills/${billId}/assign`}
            className="block w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-sm text-center"
          >
            Bagi Item ke Teman →
          </Link>
        )}
        
        {bill.status !== 'draft' && debts.length > 0 && (
          <button
            onClick={handleSendWA}
            disabled={sendingWA}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            <span>📱</span>
            {sendingWA ? 'Menghubungi Bot...' : 'Kirim Tagihan via WA'}
          </button>
        )}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full py-3 rounded-xl border border-danger text-danger font-semibold text-sm"
        >
          🗑️ Hapus Bill
        </button>
      </div>

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 overlay z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">Hapus Bill?</h3>
            <p className="text-sm text-text-secondary mb-6">Bill "{bill.title}" dan semua data terkait akan dihapus.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm">
                Batal
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-3 rounded-xl bg-danger text-white font-semibold text-sm disabled:opacity-50">
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
