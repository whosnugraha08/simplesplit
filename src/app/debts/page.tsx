'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Debt, Friend, Bill, PaymentMethod } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import { generateDynamicQRIS } from '@/lib/qris';
import Link from 'next/link';

type DebtWithRelations = Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill };

export default function DebtsPage() {
  const [debts, setDebts] = useState<DebtWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid');
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [payAllConfirm, setPayAllConfirm] = useState<NetSummaryItem | null>(null);
  const [payingAll, setPayingAll] = useState(false);
  const [payAllPMs, setPayAllPMs] = useState<PaymentMethod[]>([]);
  const [selectedPM, setSelectedPM] = useState<PaymentMethod | null>(null);
  const [loadingPMs, setLoadingPMs] = useState(false);
  const [showQris, setShowQris] = useState(false);
  const [dynamicQris, setDynamicQris] = useState<string | null>(null);
  const [generatingQris, setGeneratingQris] = useState(false);
  const [qrisMode, setQrisMode] = useState<'dynamic' | 'static'>('dynamic');

  // Generate dynamic QRIS when payment method or amount changes
  useEffect(() => {
    if (selectedPM?.qris_image_url && payAllConfirm?.total) {
      (async () => {
        setGeneratingQris(true);
        setDynamicQris(null);
        try {
          const result = await generateDynamicQRIS(selectedPM.qris_image_url!, Math.round(payAllConfirm.total));
          if (result) {
            setDynamicQris(result.dataUrl);
            setQrisMode('dynamic');
          } else {
            setQrisMode('static');
          }
        } catch {
          setQrisMode('static');
        }
        setGeneratingQris(false);
      })();
    } else {
      setDynamicQris(null);
    }
  }, [selectedPM?.id, payAllConfirm?.total]);

  useEffect(() => {
    loadDebts();
  }, [filter]);

  async function loadDebts() {
    setLoading(true);
    let query = supabase
      .from('debts')
      .select('*, debtor:debtor_id(id,name), creditor:creditor_id(id,name), bill:bill_id(id,title,bill_date)')
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
    
    const debt = debts.find(d => d.id === debtId);
    if (debt) {
      const { data: remaining } = await supabase
        .from('debts')
        .select('id')
        .eq('bill_id', debt.bill_id)
        .eq('status', 'unpaid');
      
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

  // --- BAYAR SEMUA: Mark all unpaid debts from debtor→creditor as paid ---
  // Open "Bayar Semua" modal — load payment methods for creditor
  async function openPayAll(summary: NetSummaryItem) {
    setPayAllConfirm(summary);
    setPayAllPMs([]);
    setSelectedPM(null);
    setLoadingPMs(true);
    setShowQris(false);

    try {
      const { data: pms, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('friend_id', summary.creditorId)
        .order('created_at');

      if (!error && pms && pms.length > 0) {
        setPayAllPMs(pms);
        setSelectedPM(pms[0]);
      } else {
        // Fallback: check old schema fields
        const { data: friend } = await supabase
          .from('friends')
          .select('*')
          .eq('id', summary.creditorId)
          .single();
        const f = friend as any;
        if (f?.bank_name || f?.bank_account_number || f?.qris_image_url) {
          const fallback: PaymentMethod = {
            id: 'legacy',
            friend_id: f.id,
            label: f.bank_name || 'Rekening',
            bank_name: f.bank_name || '',
            account_number: f.bank_account_number || null,
            qris_image_url: f.qris_image_url || null,
            created_at: f.created_at,
          };
          setPayAllPMs([fallback]);
          setSelectedPM(fallback);
        }
      }
    } catch {
      // Silently handle — modal will show without payment info
    }

    setLoadingPMs(false);
  }

  async function markAllPaid(summary: NetSummaryItem) {
    setPayingAll(true);

    // Find all matching unpaid debts
    const matchingDebts = debts.filter(
      d => d.status === 'unpaid' &&
        d.debtor?.id === summary.debtorId &&
        d.creditor?.id === summary.creditorId
    );

    const now = new Date().toISOString();

    // Mark all as paid
    for (const debt of matchingDebts) {
      await supabase
        .from('debts')
        .update({ status: 'paid', paid_at: now })
        .eq('id', debt.id);
    }

    // Check and settle bills where all debts are now paid
    const billIds = Array.from(new Set(matchingDebts.map(d => d.bill_id)));
    for (const billId of billIds) {
      const { data: remaining } = await supabase
        .from('debts')
        .select('id')
        .eq('bill_id', billId)
        .eq('status', 'unpaid');

      if (!remaining || remaining.length === 0) {
        await supabase.from('bills').update({ status: 'settled' }).eq('id', billId);
      }
    }

    setPayingAll(false);
    setPayAllConfirm(null);
    loadDebts();
  }

  const totalUnpaid = debts
    .filter(d => d.status === 'unpaid')
    .reduce((sum, d) => sum + Number(d.amount), 0);

  // --- Net debt summary: group unpaid debts by debtor→creditor ---
  const netSummary: NetSummaryItem[] = (() => {
    const unpaid = debts.filter(d => d.status === 'unpaid');
    const map = new Map<string, NetSummaryItem>();

    for (const d of unpaid) {
      const key = `${d.debtor?.id}→${d.creditor?.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.total += Number(d.amount);
        existing.count += 1;
      } else {
        map.set(key, {
          debtorId: d.debtor?.id || '',
          creditorId: d.creditor?.id || '',
          debtor: d.debtor?.name || '?',
          creditor: d.creditor?.name || '?',
          total: Number(d.amount),
          count: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  })();

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

      {/* Net summary per person pair */}
      {filter === 'unpaid' && netSummary.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-text-secondary mb-2">Ringkasan per Orang</p>
          <div className="space-y-2">
            {netSummary.map((s, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl border border-border px-4 py-3 animate-fade-in"
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: getAvatarColor(s.debtor) }}
                    >
                      {getInitials(s.debtor)}
                    </div>
                    <span className="text-xs text-text-secondary">→</span>
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: getAvatarColor(s.creditor) }}
                    >
                      {getInitials(s.creditor)}
                    </div>
                    <div className="min-w-0 ml-1">
                      <p className="text-xs font-semibold truncate">{s.debtor} → {s.creditor}</p>
                      <p className="text-[10px] text-text-muted">{s.count} transaksi</p>
                    </div>
                  </div>
                  <p className="money text-sm text-danger shrink-0 ml-2">{formatRupiah(s.total)}</p>
                </div>
                {/* Bayar Semua button */}
                <button
                  onClick={() => openPayAll(s)}
                  className="mt-2 w-full py-2 rounded-lg bg-success text-white text-xs font-semibold active:scale-[0.98] transition"
                >
                  ✓ Bayar Semua ({formatRupiah(s.total)})
                </button>
              </div>
            ))}
          </div>
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

      {/* Bayar Semua Modal with Payment Info */}
      {payAllConfirm && (
        <div className="fixed inset-0 overlay z-50 flex items-center justify-center p-4" onClick={() => !payingAll && setPayAllConfirm(null)}>
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 animate-slide-up max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Bayar Semua</h3>
              <button onClick={() => !payingAll && setPayAllConfirm(null)} className="text-text-secondary text-xl p-1">✕</button>
            </div>

            {/* Amount + People */}
            <div className="bg-primary rounded-xl p-4 mb-4 text-white text-center">
              <p className="text-blue-100 text-xs mb-0.5">Total yang harus dibayar</p>
              <p className="money text-2xl text-white">{formatRupiah(payAllConfirm.total)}</p>
              <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border border-white/30"
                  style={{ backgroundColor: getAvatarColor(payAllConfirm.debtor) }}>
                  {getInitials(payAllConfirm.debtor)}
                </div>
                <span className="text-blue-200">{payAllConfirm.debtor} → {payAllConfirm.creditor}</span>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border border-white/30"
                  style={{ backgroundColor: getAvatarColor(payAllConfirm.creditor) }}>
                  {getInitials(payAllConfirm.creditor)}
                </div>
              </div>
              <p className="text-blue-200 text-[10px] mt-1">{payAllConfirm.count} transaksi</p>
            </div>

            {/* Payment Methods */}
            {loadingPMs ? (
              <div className="py-4 text-center text-sm text-text-secondary">Memuat metode pembayaran...</div>
            ) : payAllPMs.length > 0 ? (
              <div className="mb-4">
                <p className="text-xs font-semibold text-text-secondary mb-2">Transfer ke</p>

                {/* Method selector (if multiple) */}
                {payAllPMs.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
                    {payAllPMs.map(pm => (
                      <button
                        key={pm.id}
                        onClick={() => { setSelectedPM(pm); setShowQris(false); }}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                          selectedPM?.id === pm.id
                            ? 'bg-primary text-white'
                            : 'bg-page text-text-secondary border border-border'
                        }`}
                      >
                        {pm.label || pm.bank_name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected method info */}
                {selectedPM && (
                  <div className="bg-page rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: getAvatarColor(payAllConfirm.creditor) }}>
                        {getInitials(payAllConfirm.creditor)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{payAllConfirm.creditor}</p>
                        <p className="text-[10px] text-text-muted">{selectedPM.label || selectedPM.bank_name}</p>
                      </div>
                    </div>

                    {selectedPM.account_number && (
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-[10px] text-text-muted mb-0.5">{selectedPM.bank_name}</p>
                        <div className="flex items-center justify-between">
                          <p className="money text-base">{selectedPM.account_number}</p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(selectedPM.account_number || '');
                              alert('Nomor rekening disalin!');
                            }}
                            className="px-2 py-1 rounded-md bg-primary-light text-primary text-[10px] font-semibold"
                          >
                            📋 Salin
                          </button>
                        </div>
                      </div>
                    )}


                    {selectedPM.qris_image_url && (
                      <div className="space-y-2">
                        {/* Mode toggle */}
                        {dynamicQris && (
                          <div className="flex gap-1 bg-white rounded-lg p-0.5">
                            <button
                              onClick={() => setQrisMode('dynamic')}
                              className={`flex-1 px-2 py-1 rounded-md text-[10px] font-semibold transition ${
                                qrisMode === 'dynamic' ? 'bg-primary text-white' : 'text-text-secondary'
                              }`}
                            >
                              ⚡ Dynamic
                            </button>
                            <button
                              onClick={() => setQrisMode('static')}
                              className={`flex-1 px-2 py-1 rounded-md text-[10px] font-semibold transition ${
                                qrisMode === 'static' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'
                              }`}
                            >
                              📷 Asli
                            </button>
                          </div>
                        )}

                        {/* Dynamic badge */}
                        {qrisMode === 'dynamic' && dynamicQris && (
                          <div className="bg-success-light rounded-md px-2 py-1 flex items-center gap-1">
                            <span className="text-success text-[10px]">⚡</span>
                            <p className="text-[9px] text-success font-medium">
                              Nominal {formatRupiah(payAllConfirm.total)} sudah terisi
                            </p>
                          </div>
                        )}

                        {generatingQris ? (
                          <div className="py-4 text-center">
                            <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-1" />
                            <p className="text-[10px] text-text-secondary">Generating QRIS...</p>
                          </div>
                        ) : (
                          <button onClick={() => setShowQris(true)} className="w-full">
                            <img
                              src={qrisMode === 'dynamic' && dynamicQris ? dynamicQris : selectedPM.qris_image_url}
                              alt="QRIS"
                              className="w-full max-h-40 object-contain rounded-lg border border-border bg-white"
                            />
                            <p className="text-[10px] text-primary font-medium mt-1">Tap untuk perbesar</p>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-page rounded-xl p-4 mb-4 text-center">
                <p className="text-xs text-text-secondary">
                  Belum ada metode pembayaran untuk {payAllConfirm.creditor}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setPayAllConfirm(null)}
                disabled={payingAll}
                className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={() => markAllPaid(payAllConfirm)}
                disabled={payingAll}
                className="flex-1 py-3 rounded-xl bg-success text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition"
              >
                {payingAll ? 'Memproses...' : '✓ Lunas Semua'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QRIS Fullscreen */}
      {showQris && selectedPM?.qris_image_url && (
        <div className="fixed inset-0 bg-black z-[60] flex flex-col items-center justify-center" onClick={() => setShowQris(false)}>
          <button className="absolute top-4 right-4 text-white bg-white/20 rounded-full w-10 h-10 flex items-center justify-center text-lg z-10"
            onClick={() => setShowQris(false)}>✕</button>

          {qrisMode === 'dynamic' && dynamicQris && payAllConfirm && (
            <div className="bg-success/90 rounded-full px-4 py-1.5 mb-4">
              <p className="text-white text-xs font-semibold">
                ⚡ Dynamic — {formatRupiah(payAllConfirm.total)}
              </p>
            </div>
          )}

          <img
            src={qrisMode === 'dynamic' && dynamicQris ? dynamicQris : selectedPM.qris_image_url}
            alt="QRIS"
            className="max-w-[95vw] max-h-[80vh] object-contain bg-white rounded-2xl p-4"
          />

          {dynamicQris && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); setQrisMode('dynamic'); }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  qrisMode === 'dynamic' ? 'bg-primary text-white' : 'bg-white/20 text-white'
                }`}
              >
                ⚡ Dynamic
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setQrisMode('static'); }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  qrisMode === 'static' ? 'bg-white text-gray-900' : 'bg-white/20 text-white'
                }`}
              >
                📷 QRIS Asli
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface NetSummaryItem {
  debtorId: string;
  creditorId: string;
  debtor: string;
  creditor: string;
  total: number;
  count: number;
}
