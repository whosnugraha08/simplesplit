'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Debt, Friend, Bill } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import Link from 'next/link';

type DebtWithRelations = Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill };

export default function DebtsPage() {
  const [debts, setDebts] = useState<DebtWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid');
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  useEffect(() => {
    loadDebts();
  }, [filter]);

  async function loadDebts() {
    setLoading(true);
    let query = supabase
      .from('debts')
      .select('*, debtor:debtor_id(id,name,bank_name,bank_account_number,qris_image_url), creditor:creditor_id(id,name,bank_name,bank_account_number,qris_image_url), bill:bill_id(id,title,bill_date)')
      .order('created_at', { ascending: false });
    
    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data } = await query;
    setDebts((data as any[]) || []);
    setLoading(false);
  }

  async function markAsPaid(debtId: string) {
    setMarkingPaid(debtId);
    await supabase
      .from('debts')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', debtId);
    
    // Check if all debts for this bill are paid, then settle the bill
    const debt = debts.find(d => d.id === debtId);
    if (debt) {
      const { data: remaining } = await supabase
        .from('debts')
        .select('id')
        .eq('bill_id', debt.bill_id)
        .eq('status', 'unpaid');
      
      // Only the current debt was unpaid, now all are paid
      if (!remaining || remaining.length <= 1) {
        await supabase.from('bills').update({ status: 'settled' }).eq('id', debt.bill_id);
      }
    }

    setMarkingPaid(null);
    loadDebts();
  }

  async function markAsUnpaid(debtId: string) {
    setMarkingPaid(debtId);
    await supabase
      .from('debts')
      .update({ status: 'unpaid', paid_at: null })
      .eq('id', debtId);
    
    const debt = debts.find(d => d.id === debtId);
    if (debt) {
      await supabase.from('bills').update({ status: 'assigned' }).eq('id', debt.bill_id);
    }

    setMarkingPaid(null);
    loadDebts();
  }

  const totalUnpaid = debts
    .filter(d => d.status === 'unpaid')
    .reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Hutang</h1>
        <p className="text-sm text-text-secondary">Siapa hutang berapa ke siapa</p>
      </div>

      {/* Summary */}
      {filter === 'unpaid' && debts.length > 0 && (
        <div className="bg-danger rounded-2xl p-4 mb-4 text-white">
          <p className="text-red-100 text-xs font-medium mb-0.5">Total Belum Lunas</p>
          <p className="money text-2xl text-white">{formatRupiah(totalUnpaid)}</p>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {(['unpaid', 'paid', 'all'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              filter === tab
                ? 'bg-primary text-white'
                : 'bg-white text-text-secondary border border-border'
            }`}
          >
            {tab === 'unpaid' ? 'Belum Lunas' : tab === 'paid' ? 'Lunas' : 'Semua'}
          </button>
        ))}
      </div>

      {/* Debts List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 w-full" />)}
        </div>
      ) : debts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <p className="text-4xl mb-3">{filter === 'unpaid' ? '🎉' : '📭'}</p>
          <p className="text-text-secondary text-sm">
            {filter === 'unpaid' ? 'Tidak ada hutang! Semua sudah lunas.' : 'Belum ada data hutang.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {debts.map((debt, idx) => (
            <div
              key={debt.id}
              className="bg-white rounded-2xl border border-border p-4 animate-fade-in"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className="flex items-start gap-3">
                {/* Debtor avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: getAvatarColor(debt.debtor?.name || '') }}
                >
                  {getInitials(debt.debtor?.name || '?')}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">
                    {debt.debtor?.name}
                    <span className="font-normal text-text-secondary"> → </span>
                    {debt.creditor?.name}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {debt.bill?.title} • {formatDate(debt.bill?.bill_date || debt.created_at)}
                  </p>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <p className={`money text-lg ${debt.status === 'paid' ? 'text-success line-through' : 'text-danger'}`}>
                      {formatRupiah(Number(debt.amount))}
                    </p>
                    {debt.status === 'paid' && (
                      <span className="bg-success-light text-success text-[10px] font-bold px-2 py-0.5 rounded-full">
                        ✓ LUNAS
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                {debt.status === 'unpaid' ? (
                  <>
                    <Link
                      href={`/pay/${debt.id}`}
                      className="flex-1 py-2.5 rounded-xl bg-primary-light text-primary text-xs font-semibold text-center"
                    >
                      💳 Bayar
                    </Link>
                    <button
                      onClick={() => markAsPaid(debt.id)}
                      disabled={markingPaid === debt.id}
                      className="flex-1 py-2.5 rounded-xl bg-success text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {markingPaid === debt.id ? '...' : '✓ Tandai Lunas'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => markAsUnpaid(debt.id)}
                    disabled={markingPaid === debt.id}
                    className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-xs font-semibold disabled:opacity-50"
                  >
                    {markingPaid === debt.id ? '...' : '↩ Batalkan Lunas'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
