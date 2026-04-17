'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Debt, Friend, Bill, PaymentMethod } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import { generateDynamicQRIS } from '@/lib/qris';
import { useToast } from '@/components/Toast';
import Link from 'next/link';

type DebtWithRelations = Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill };

export default function DebtsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const friendId = user?.friend_id;

  const [debts, setDebts] = useState<DebtWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'my-debts' | 'owed-to-me' | 'all'>('my-debts');
  const [statusFilter, setStatusFilter] = useState<'unpaid' | 'paid' | 'all'>('unpaid');
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);

  // Pay all modal
  const [payAllConfirm, setPayAllConfirm] = useState<{ creditorId: string; creditor: string; total: number; count: number; debtIds: string[] } | null>(null);
  const [payingAll, setPayingAll] = useState(false);
  const [payAllPMs, setPayAllPMs] = useState<PaymentMethod[]>([]);
  const [selectedPM, setSelectedPM] = useState<PaymentMethod | null>(null);
  const [loadingPMs, setLoadingPMs] = useState(false);
  const [showQris, setShowQris] = useState(false);
  const [dynamicQris, setDynamicQris] = useState<string | null>(null);
  const [generatingQris, setGeneratingQris] = useState(false);
  const [qrisMode, setQrisMode] = useState<'dynamic' | 'static'>('dynamic');

  useEffect(() => {
    if (selectedPM?.qris_image_url && payAllConfirm?.total) {
      (async () => {
        setGeneratingQris(true);
        setDynamicQris(null);
        try {
          const result = await generateDynamicQRIS(selectedPM.qris_image_url!, Math.round(payAllConfirm.total));
          if (result) { setDynamicQris(result.dataUrl); setQrisMode('dynamic'); }
          else setQrisMode('static');
        } catch { setQrisMode('static'); }
        setGeneratingQris(false);
      })();
    } else { setDynamicQris(null); }
  }, [selectedPM?.id, payAllConfirm?.total]);

  useEffect(() => { loadDebts(); }, [tab, statusFilter, friendId]);

  async function loadDebts() {
    if (!friendId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase
      .from('debts')
      .select('*, debtor:debtor_id(id,name,whatsapp_number), creditor:creditor_id(id,name,whatsapp_number), bill:bill_id(id,title,bill_date)')
      .order('created_at', { ascending: false });

    if (tab === 'my-debts') query = query.eq('debtor_id', friendId);
    else if (tab === 'owed-to-me') query = query.eq('creditor_id', friendId);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data } = await query;
    setDebts((data as any[]) || []);
    setLoading(false);
  }

  async function markAsPaid(debtId: string) {
    setMarkingPaid(debtId);
    await supabase.from('debts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', debtId);
    const debt = debts.find(d => d.id === debtId);
    if (debt) {
      const { data: remaining } = await supabase.from('debts').select('id').eq('bill_id', debt.bill_id).eq('status', 'unpaid');
      if (!remaining || remaining.length <= 1) {
        await supabase.from('bills').update({ status: 'settled' }).eq('id', debt.bill_id);
      }
      fetch('/api/webhook-wa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill: { id: debt.bill_id, title: debt.bill?.title || 'Tagihan', paid_by: debt.creditor_id, paid_by_friend: debt.creditor }, items: [], debts: [debt], type: 'paid' }),
      }).catch(console.error);
    }
    setMarkingPaid(null);
    showToast('Hutang ditandai lunas!', 'success');
    loadDebts();
  }

  async function markAsUnpaid(debtId: string) {
    setMarkingPaid(debtId);
    await supabase.from('debts').update({ status: 'unpaid', paid_at: null }).eq('id', debtId);
    const debt = debts.find(d => d.id === debtId);
    if (debt) await supabase.from('bills').update({ status: 'assigned' }).eq('id', debt.bill_id);
    setMarkingPaid(null);
    showToast('Status hutang dibatalkan', 'info');
    loadDebts();
  }

  async function openPayAll(creditorId: string, creditorName: string) {
    const matching = debts.filter(d => d.status === 'unpaid' && d.debtor?.id === friendId && d.creditor?.id === creditorId);
    const total = matching.reduce((sum, d) => sum + Number(d.amount), 0);
    setPayAllConfirm({ creditorId, creditor: creditorName, total, count: matching.length, debtIds: matching.map(d => d.id) });
    setPayAllPMs([]); setSelectedPM(null); setLoadingPMs(true); setShowQris(false);
    try {
      const { data: pms } = await supabase.from('payment_methods').select('*').eq('friend_id', creditorId).order('created_at');
      if (pms && pms.length > 0) { setPayAllPMs(pms); setSelectedPM(pms[0]); }
    } catch {}
    setLoadingPMs(false);
  }

  async function doPayAll() {
    if (!payAllConfirm) return;
    setPayingAll(true);
    const now = new Date().toISOString();
    for (const id of payAllConfirm.debtIds) {
      await supabase.from('debts').update({ status: 'paid', paid_at: now }).eq('id', id);
    }
    const matching = debts.filter(d => payAllConfirm.debtIds.includes(d.id));
    const billIds = Array.from(new Set(matching.map(d => d.bill_id)));
    for (const billId of billIds) {
      const { data: remaining } = await supabase.from('debts').select('id').eq('bill_id', billId).eq('status', 'unpaid');
      if (!remaining || remaining.length === 0) await supabase.from('bills').update({ status: 'settled' }).eq('id', billId);
    }
    setPayingAll(false); setPayAllConfirm(null);
    showToast(`Semua hutang ke ${payAllConfirm.creditor} dilunasi!`, 'success');
    loadDebts();
  }

  // Group unpaid debts for "pay all" summary
  const netSummary = (() => {
    if (tab !== 'my-debts') return [];
    const unpaid = debts.filter(d => d.status === 'unpaid');
    const map = new Map<string, { creditorId: string; creditor: string; total: number; count: number }>();
    for (const d of unpaid) {
      const key = d.creditor?.id || '';
      const existing = map.get(key);
      if (existing) { existing.total += Number(d.amount); existing.count++; }
      else map.set(key, { creditorId: key, creditor: d.creditor?.name || '?', total: Number(d.amount), count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  })();

  const totalUnpaid = debts.filter(d => d.status === 'unpaid').reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div className="content-padding pt-6 pb-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Hutang</h1>
        <p className="text-sm text-text-secondary">Kelola hutang & piutang kamu</p>
      </div>

      {/* Tab: My Debts vs Owed to Me */}
      <div className="flex gap-1 bg-white rounded-2xl p-1 border border-border mb-4">
        {([
          { key: 'my-debts', label: '💸 Aku Hutang' },
          { key: 'owed-to-me', label: '💰 Piutangku' },
          { key: 'all', label: 'Semua' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {statusFilter === 'unpaid' && debts.length > 0 && (
        <div className={`rounded-2xl p-4 mb-4 text-white ${tab === 'my-debts' ? 'bg-gradient-to-r from-red-500 to-rose-600' : tab === 'owed-to-me' ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-gradient-to-r from-blue-500 to-indigo-600'}`}>
          <p className="text-white/70 text-xs font-medium mb-0.5">
            {tab === 'my-debts' ? 'Total Hutangku' : tab === 'owed-to-me' ? 'Total Piutangku' : 'Total Belum Lunas'}
          </p>
          <p className="money text-2xl text-white">{formatRupiah(totalUnpaid)}</p>
        </div>
      )}

      {/* Net summary — Pay All buttons (only for my-debts tab) */}
      {tab === 'my-debts' && statusFilter === 'unpaid' && netSummary.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-text-secondary mb-2">Ringkasan</p>
          <div className="space-y-2">
            {netSummary.map((s, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-border px-4 py-3 animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: getAvatarColor(s.creditor) }}>
                      {getInitials(s.creditor)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">ke {s.creditor}</p>
                      <p className="text-[10px] text-text-muted">{s.count} transaksi</p>
                    </div>
                  </div>
                  <p className="money text-sm text-danger shrink-0 ml-2">{formatRupiah(s.total)}</p>
                </div>
                <button
                  onClick={() => openPayAll(s.creditorId, s.creditor)}
                  className="mt-2 w-full py-2 rounded-lg bg-emerald-500 text-white text-xs font-semibold active:scale-[0.98] transition"
                >
                  ✓ Bayar Semua ({formatRupiah(s.total)})
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2 mb-4">
        {(['unpaid', 'paid', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              statusFilter === f ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border'
            }`}
          >
            {f === 'unpaid' ? 'Belum Lunas' : f === 'paid' ? 'Lunas' : 'Semua'}
          </button>
        ))}
      </div>

      {/* Debts List */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-24 w-full" />)}</div>
      ) : debts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <p className="text-4xl mb-3">{statusFilter === 'unpaid' ? '🎉' : '📭'}</p>
          <p className="text-text-secondary text-sm">
            {statusFilter === 'unpaid' ? 'Tidak ada hutang! Semua lunas.' : 'Belum ada data.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {debts.map((debt, idx) => {
            const isMyDebt = debt.debtor?.id === friendId;
            const otherPerson = isMyDebt ? debt.creditor : debt.debtor;
            const isExpanded = expandedDebt === debt.id;

            return (
              <div
                key={debt.id}
                className="bg-white rounded-2xl border border-border overflow-hidden animate-fade-in"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ backgroundColor: getAvatarColor(otherPerson?.name || '') }}
                    >
                      {getInitials(otherPerson?.name || '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {isMyDebt ? (
                          <>ke <span className="text-danger">{otherPerson?.name}</span></>
                        ) : (
                          <>dari <span className="text-success">{otherPerson?.name}</span></>
                        )}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {debt.bill?.title} • {formatDate(debt.bill?.bill_date || debt.created_at)}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <p className={`money text-lg ${debt.status === 'paid' ? 'text-success line-through' : isMyDebt ? 'text-danger' : 'text-success'}`}>
                          {isMyDebt ? '' : '+'}{formatRupiah(Number(debt.amount))}
                        </p>
                        {debt.status === 'paid' && (
                          <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full">✓ LUNAS</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expand/collapse for notes/details */}
                  {debt.notes && (
                    <button
                      onClick={() => setExpandedDebt(isExpanded ? null : debt.id)}
                      className="mt-2 text-xs text-primary font-medium"
                    >
                      {isExpanded ? '▲ Sembunyikan detail' : '▼ Lihat detail item'}
                    </button>
                  )}

                  {isExpanded && debt.notes && (
                    <div className="mt-2 bg-page rounded-xl p-3 animate-fade-in">
                      <p className="text-[10px] font-semibold text-text-secondary mb-1">Detail Item:</p>
                      {debt.notes.split('\n').map((line, i) => (
                        <p key={i} className="text-xs text-text-secondary">{line}</p>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-3">
                    {debt.status === 'unpaid' ? (
                      <>
                        {isMyDebt && (
                          <Link
                            href={`/pay/${debt.id}`}
                            className="flex-1 py-2.5 rounded-xl bg-blue-50 text-primary text-xs font-semibold text-center"
                          >
                            💳 Bayar
                          </Link>
                        )}
                        <button
                          onClick={() => markAsPaid(debt.id)}
                          disabled={markingPaid === debt.id}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 active:scale-[0.98] transition"
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
              </div>
            );
          })}
        </div>
      )}

      {/* Pay All Modal */}
      {payAllConfirm && (
        <div className="fixed inset-0 overlay z-50 flex items-center justify-center p-4" onClick={() => !payingAll && setPayAllConfirm(null)}>
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 animate-slide-up max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Bayar Semua</h3>
              <button onClick={() => !payingAll && setPayAllConfirm(null)} className="text-text-secondary text-xl p-1">✕</button>
            </div>

            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-4 mb-4 text-white text-center">
              <p className="text-blue-100 text-xs mb-0.5">Total ke {payAllConfirm.creditor}</p>
              <p className="money text-2xl text-white">{formatRupiah(payAllConfirm.total)}</p>
              <p className="text-blue-200 text-[10px] mt-1">{payAllConfirm.count} transaksi</p>
            </div>

            {loadingPMs ? (
              <div className="py-4 text-center text-sm text-text-secondary">Memuat metode pembayaran...</div>
            ) : payAllPMs.length > 0 ? (
              <div className="mb-4">
                <p className="text-xs font-semibold text-text-secondary mb-2">Transfer ke</p>
                {payAllPMs.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
                    {payAllPMs.map(pm => (
                      <button key={pm.id} onClick={() => { setSelectedPM(pm); setShowQris(false); }}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${selectedPM?.id === pm.id ? 'bg-primary text-white' : 'bg-page text-text-secondary border border-border'}`}>
                        {pm.label || pm.bank_name}
                      </button>
                    ))}
                  </div>
                )}
                {selectedPM && (
                  <div className="bg-page rounded-xl p-4 space-y-3">
                    {selectedPM.account_number && (
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-[10px] text-text-muted mb-0.5">{selectedPM.bank_name}</p>
                        <div className="flex items-center justify-between">
                          <p className="money text-base">{selectedPM.account_number}</p>
                          <button onClick={() => { navigator.clipboard.writeText(selectedPM.account_number || ''); showToast('Nomor rekening disalin!', 'success'); }}
                            className="px-2 py-1 rounded-md bg-blue-50 text-primary text-[10px] font-semibold">📋 Salin</button>
                        </div>
                      </div>
                    )}
                    {selectedPM.qris_image_url && (
                      <div className="space-y-2">
                        {generatingQris ? (
                          <div className="py-4 text-center">
                            <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-1" />
                            <p className="text-[10px] text-text-secondary">Generating QRIS...</p>
                          </div>
                        ) : (
                          <button onClick={() => setShowQris(true)} className="w-full">
                            <img src={qrisMode === 'dynamic' && dynamicQris ? dynamicQris : selectedPM.qris_image_url} alt="QRIS"
                              className="w-full max-h-40 object-contain rounded-lg border border-border bg-white" />
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
                <p className="text-xs text-text-secondary">Belum ada metode pembayaran untuk {payAllConfirm.creditor}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setPayAllConfirm(null)} disabled={payingAll}
                className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm disabled:opacity-50">Batal</button>
              <button onClick={doPayAll} disabled={payingAll}
                className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition">
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
          <img src={qrisMode === 'dynamic' && dynamicQris ? dynamicQris : selectedPM.qris_image_url} alt="QRIS"
            className="max-w-[95vw] max-h-[80vh] object-contain bg-white rounded-2xl p-4" />
        </div>
      )}
    </div>
  );
}
