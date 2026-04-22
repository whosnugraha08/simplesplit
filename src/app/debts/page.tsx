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
  const [tab, setTab] = useState<'my-debts' | 'owed-to-me'>('my-debts');
  const [statusFilter, setStatusFilter] = useState<'unpaid' | 'paid' | 'all'>('unpaid');
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);

  // Proof upload modal
  const [proofModal, setProofModal] = useState<{ debtId: string; mode: 'single' | 'all' } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [showProofView, setShowProofView] = useState<string | null>(null);

  // Pay all modal
  const [payAllConfirm, setPayAllConfirm] = useState<{ creditorId: string; creditor: string; total: number; count: number; debtIds: string[] } | null>(null);
  const [payingAll, setPayingAll] = useState(false);
  const [payAllPMs, setPayAllPMs] = useState<PaymentMethod[]>([]);
  const [selectedPM, setSelectedPM] = useState<PaymentMethod | null>(null);
  const [loadingPMs, setLoadingPMs] = useState(false);
  const [payAllProofFile, setPayAllProofFile] = useState<File | null>(null);
  const [payAllProofPreview, setPayAllProofPreview] = useState<string | null>(null);
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

    // ALWAYS filter by the logged-in user's friendId
    // "my-debts" = I owe someone, "owed-to-me" = someone owes me
    if (tab === 'my-debts') {
      query = query.eq('debtor_id', friendId);
    } else {
      query = query.eq('creditor_id', friendId);
    }

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data } = await query;
    setDebts((data as any[]) || []);
    setLoading(false);
  }

  function openProofModal(debtId: string) {
    setProofModal({ debtId, mode: 'single' });
    setProofFile(null);
    setProofPreview(null);
  }

  async function uploadProofImage(file: File, debtId: string): Promise<string | null> {
    const fileExt = file.name.split('.').pop();
    const fileName = `proof_${debtId}_${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage.from('receipts').upload(`proofs/${fileName}`, file, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(`proofs/${fileName}`);
      return urlData.publicUrl;
    }
    try {
      const reader = new FileReader();
      return await new Promise<string>((resolve) => { reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(file); });
    } catch { return null; }
  }

  async function submitProofAndMarkPaid() {
    if (!proofModal || !proofFile) return;
    setSubmittingProof(true);
    const proofUrl = await uploadProofImage(proofFile, proofModal.debtId);
    // Step 1: Mark as paid (must succeed)
    await supabase.from('debts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', proofModal.debtId);
    // Step 2: Try to save proof URL (may fail if column doesn't exist yet)
    if (proofUrl) {
      try { await supabase.from('debts').update({ proof_image_url: proofUrl }).eq('id', proofModal.debtId); } catch {}
    }
    const debt = debts.find(d => d.id === proofModal.debtId);
    if (debt) {
      const { data: remaining } = await supabase.from('debts').select('id').eq('bill_id', debt.bill_id).eq('status', 'unpaid');
      if (!remaining || remaining.length <= 1) {
        await supabase.from('bills').update({ status: 'settled' }).eq('id', debt.bill_id);
      }
      fetch('/api/webhook-wa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill: { id: debt.bill_id, title: debt.bill?.title || 'Tagihan', paid_by: debt.creditor_id, paid_by_friend: debt.creditor }, items: [], debts: [{ ...debt, proof_image_url: proofUrl }], type: 'paid' }),
      }).catch(console.error);
    }
    setSubmittingProof(false);
    setProofModal(null);
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
    setPayAllProofFile(null); setPayAllProofPreview(null);
    try {
      const { data: pms } = await supabase.from('payment_methods').select('*').eq('friend_id', creditorId).order('created_at');
      if (pms && pms.length > 0) { setPayAllPMs(pms); setSelectedPM(pms[0]); }
    } catch {}
    setLoadingPMs(false);
  }

  async function doPayAll() {
    if (!payAllConfirm) return;
    if (!payAllProofFile) {
      showToast('Upload bukti pembayaran dulu ya!', 'error');
      return;
    }
    setPayingAll(true);
    // Upload proof
    const proofUrl = await uploadProofImage(payAllProofFile, `payall_${payAllConfirm.creditorId}`);
    const now = new Date().toISOString();
    for (const id of payAllConfirm.debtIds) {
      // Step 1: Mark as paid (must succeed)
      await supabase.from('debts').update({ status: 'paid', paid_at: now }).eq('id', id);
      // Step 2: Try to save proof URL
      if (proofUrl) {
        try { await supabase.from('debts').update({ proof_image_url: proofUrl }).eq('id', id); } catch {}
      }
    }
    const matching = debts.filter(d => payAllConfirm.debtIds.includes(d.id));
    const billIds = Array.from(new Set(matching.map(d => d.bill_id)));
    for (const billId of billIds) {
      const { data: remaining } = await supabase.from('debts').select('id').eq('bill_id', billId).eq('status', 'unpaid');
      if (!remaining || remaining.length === 0) await supabase.from('bills').update({ status: 'settled' }).eq('id', billId);
    }
    // Send collective notification via WhatsApp
    const creditor = matching[0]?.creditor;
    fetch('/api/webhook-wa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bill: { id: matching[0]?.bill_id, title: 'Pelunasan Kolektif', paid_by: payAllConfirm.creditorId, paid_by_friend: creditor },
        items: [],
        debts: matching.map(d => ({ ...d, proof_image_url: proofUrl })),
        type: 'paid_all',
      }),
    }).catch(console.error);

    setPayingAll(false); setPayAllConfirm(null);
    showToast(`Semua hutang ke ${payAllConfirm.creditor} dilunasi!`, 'success');
    loadDebts();
  }

  // Group unpaid debts for "pay all" summary — now includes bill details
  const netSummary = (() => {
    if (tab !== 'my-debts') return [];
    const unpaid = debts.filter(d => d.status === 'unpaid');
    const map = new Map<string, { creditorId: string; creditor: string; total: number; count: number; bills: { title: string; amount: number; billId: string }[] }>();
    for (const d of unpaid) {
      const key = d.creditor?.id || '';
      const billEntry = { title: d.bill?.title || 'Bill', amount: Number(d.amount), billId: d.bill_id };
      const existing = map.get(key);
      if (existing) { existing.total += Number(d.amount); existing.count++; existing.bills.push(billEntry); }
      else map.set(key, { creditorId: key, creditor: d.creditor?.name || '?', total: Number(d.amount), count: 1, bills: [billEntry] });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  })();

  const totalUnpaid = debts.filter(d => d.status === 'unpaid').reduce((sum, d) => sum + Number(d.amount), 0);

  // Parse notes into structured items
  function parseNotes(notes: string | null): { itemName: string; detail: string }[] {
    if (!notes) return [];
    return notes.split('\n').filter(l => l.trim()).map(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        return { itemName: parts[0].trim(), detail: parts[1].trim() };
      }
      return { itemName: line.trim(), detail: '' };
    });
  }

  return (
    <div className="content-padding pt-6 pb-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Hutang</h1>
        <p className="text-sm text-white/50">Kelola hutang & piutang kamu</p>
      </div>

      {/* Tab: My Debts vs Owed to Me — only personal, no "all" */}
      <div className="flex gap-1 bg-white/5 rounded-2xl p-1 border border-white/8 mb-4">
        <button
          onClick={() => setTab('my-debts')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            tab === 'my-debts' ? 'bg-primary text-white shadow-sm' : 'text-white/50 hover:text-white'
          }`}
        >
          💸 Aku Hutang
        </button>
        <button
          onClick={() => setTab('owed-to-me')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            tab === 'owed-to-me' ? 'bg-primary text-white shadow-sm' : 'text-white/50 hover:text-white'
          }`}
        >
          💰 Piutangku
        </button>
      </div>

      {/* Summary */}
      {statusFilter === 'unpaid' && debts.length > 0 && (
        <div className={`rounded-2xl p-4 mb-4 text-white ${tab === 'my-debts' ? 'bg-gradient-to-r from-red-500 to-rose-600' : 'bg-gradient-to-r from-emerald-500 to-teal-600'}`}>
          <p className="text-white/70 text-xs font-medium mb-0.5">
            {tab === 'my-debts' ? 'Total yang aku hutang' : 'Total yang orang hutang ke aku'}
          </p>
          <p className="money text-2xl text-white">{formatRupiah(totalUnpaid)}</p>
          <p className="text-white/50 text-[10px] mt-1">{debts.filter(d => d.status === 'unpaid').length} transaksi belum lunas</p>
        </div>
      )}

      {/* Net summary — Pay All buttons (only for my-debts tab) */}
      {tab === 'my-debts' && statusFilter === 'unpaid' && netSummary.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-white/50 mb-2">Ringkasan per orang</p>
          <div className="space-y-2">
            {netSummary.map((s, idx) => (
              <div key={idx} className="bg-white/5 rounded-xl border border-white/8 px-4 py-3 animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: getAvatarColor(s.creditor) }}>
                      {getInitials(s.creditor)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">ke {s.creditor}</p>
                      {/* Show bill title(s) */}
                      {s.count === 1 ? (
                        <p className="text-[10px] text-white/30 truncate">📋 {s.bills[0].title}</p>
                      ) : (
                        <p className="text-[10px] text-white/30">{s.count} tagihan</p>
                      )}
                    </div>
                  </div>
                  <p className="money text-sm text-danger shrink-0 ml-2">{formatRupiah(s.total)}</p>
                </div>

                {/* Bill breakdown for multiple bills */}
                {s.count > 1 && (
                  <div className="mt-2 bg-white/5 rounded-lg p-2.5 space-y-1.5">
                    {s.bills.map((b, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="text-white/50 truncate mr-2">📋 {b.title}</span>
                        <span className="money text-white font-semibold shrink-0">{formatRupiah(b.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => openPayAll(s.creditorId, s.creditor)}
                  className="mt-2 w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold active:scale-[0.98] transition"
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
              statusFilter === f ? 'bg-primary text-white' : 'bg-white/5 text-white/50 border border-white/8'
            }`}
          >
            {f === 'unpaid' ? 'Belum Lunas' : f === 'paid' ? 'Lunas' : 'Semua Status'}
          </button>
        ))}
      </div>

      {/* Debts List */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-24 w-full" />)}</div>
      ) : debts.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-4xl mb-3">{statusFilter === 'unpaid' ? '🎉' : '📭'}</p>
          <p className="text-white/50 text-sm">
            {statusFilter === 'unpaid'
              ? (tab === 'my-debts' ? 'Kamu tidak punya hutang! Bebas! 🎉' : 'Tidak ada yang hutang ke kamu saat ini.')
              : 'Belum ada data.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {debts.map((debt, idx) => {
            const isMyDebt = tab === 'my-debts';
            const otherPerson = isMyDebt ? debt.creditor : debt.debtor;
            const isExpanded = expandedDebt === debt.id;
            const noteItems = parseNotes(debt.notes);

            return (
              <div
                key={debt.id}
                className="glass-card overflow-hidden animate-fade-in"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="p-4">
                  {/* Header row */}
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
                          <>Hutang ke <span className="text-danger">{otherPerson?.name}</span></>
                        ) : (
                          <><span className="text-success">{otherPerson?.name}</span> hutang ke kamu</>
                        )}
                      </p>
                      <p className="text-xs text-white/50 mt-0.5">
                        📋 {debt.bill?.title || 'Bill'} • {formatDate(debt.bill?.bill_date || debt.created_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`money text-lg ${debt.status === 'paid' ? 'text-success line-through opacity-60' : isMyDebt ? 'text-danger' : 'text-success'}`}>
                        {isMyDebt ? '-' : '+'}{formatRupiah(Number(debt.amount))}
                      </p>
                      {debt.status === 'paid' && (
                        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          ✓ LUNAS {debt.paid_at ? formatDate(debt.paid_at) : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Always show a brief summary of items if notes exist */}
                  {noteItems.length > 0 && (
                    <div className="mt-3">
                      {/* Show first 2 items preview always */}
                      <div className="bg-white/5 rounded-xl p-3 space-y-1">
                        <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1">Detail Item:</p>
                        {noteItems.slice(0, isExpanded ? undefined : 2).map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-white/50">{item.itemName}</span>
                            {item.detail && <span className="money text-white font-semibold">{item.detail}</span>}
                          </div>
                        ))}
                        {!isExpanded && noteItems.length > 2 && (
                          <button
                            onClick={() => setExpandedDebt(debt.id)}
                            className="text-[11px] text-amber-400 font-medium mt-1 w-full text-left"
                          >
                            ... dan {noteItems.length - 2} item lainnya ▼
                          </button>
                        )}
                        {isExpanded && noteItems.length > 2 && (
                          <button
                            onClick={() => setExpandedDebt(null)}
                            className="text-[11px] text-amber-400 font-medium mt-1 w-full text-left"
                          >
                            Sembunyikan ▲
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No notes — show bill link */}
                  {noteItems.length === 0 && (
                    <Link href={`/bills/${debt.bill_id}`} className="mt-2 inline-block text-xs text-amber-400 font-medium">
                      📋 Lihat detail bill →
                    </Link>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-3">
                    {debt.status === 'unpaid' ? (
                      <>
                        {isMyDebt && (
                          <Link
                            href={`/pay/${debt.id}`}
                            className="flex-1 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold text-center"
                          >
                            💳 Bayar
                          </Link>
                        )}
                        <button
                          onClick={() => openProofModal(debt.id)}
                          disabled={markingPaid === debt.id}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 active:scale-[0.98] transition"
                        >
                          {markingPaid === debt.id ? '...' : '📸 Tandai Lunas'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => markAsUnpaid(debt.id)}
                        disabled={markingPaid === debt.id}
                        className="flex-1 py-2.5 rounded-xl border border-white/8 text-white/50 text-xs font-semibold disabled:opacity-50"
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
          <div className="bg-[#1a1a2e] border border-white/10 w-full max-w-lg rounded-3xl p-6 animate-slide-up max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Bayar Semua</h3>
              <button onClick={() => !payingAll && setPayAllConfirm(null)} className="text-white/50 text-xl p-1">✕</button>
            </div>

            <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 mb-4 text-white text-center">
              <p className="text-blue-100 text-xs mb-0.5">Total ke {payAllConfirm.creditor}</p>
              <p className="money text-2xl text-white">{formatRupiah(payAllConfirm.total)}</p>
              <p className="text-blue-200 text-[10px] mt-1">{payAllConfirm.count} transaksi</p>
            </div>

            {loadingPMs ? (
              <div className="py-4 text-center text-sm text-white/50">Memuat metode pembayaran...</div>
            ) : payAllPMs.length > 0 ? (
              <div className="mb-4">
                <p className="text-xs font-semibold text-white/50 mb-2">Transfer ke</p>
                {payAllPMs.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
                    {payAllPMs.map(pm => (
                      <button key={pm.id} onClick={() => { setSelectedPM(pm); setShowQris(false); }}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${selectedPM?.id === pm.id ? 'bg-primary text-white' : 'bg-white/5 text-white/50 border border-white/8'}`}>
                        {pm.label || pm.bank_name}
                      </button>
                    ))}
                  </div>
                )}
                {selectedPM && (
                  <div className="bg-white/5 rounded-xl p-4 space-y-3">
                    {selectedPM.account_number && (
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-[10px] text-white/30 mb-0.5">{selectedPM.bank_name}</p>
                        <div className="flex items-center justify-between">
                          <p className="money text-base">{selectedPM.account_number}</p>
                          <button onClick={() => { navigator.clipboard.writeText(selectedPM.account_number || ''); showToast('Nomor rekening disalin!', 'success'); }}
                            className="px-2 py-1 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-semibold">📋 Salin</button>
                        </div>
                      </div>
                    )}
                    {selectedPM.qris_image_url && (
                      <div className="space-y-2">
                        {generatingQris ? (
                          <div className="py-4 text-center">
                            <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-1" />
                            <p className="text-[10px] text-white/50">Generating QRIS...</p>
                          </div>
                        ) : (
                          <button onClick={() => setShowQris(true)} className="w-full">
                            <img src={qrisMode === 'dynamic' && dynamicQris ? dynamicQris : selectedPM.qris_image_url} alt="QRIS"
                              className="w-full max-h-40 object-contain rounded-lg border border-white/8 bg-white" />
                            <p className="text-[10px] text-amber-400 font-medium mt-1">Tap untuk perbesar</p>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white/5 rounded-xl p-4 mb-4 text-center">
                <p className="text-xs text-white/50">Belum ada metode pembayaran untuk {payAllConfirm.creditor}</p>
              </div>
            )}

            {/* Proof Upload for Pay All */}
            <div className="glass-card p-4 mb-4">
              <h3 className="text-sm font-semibold text-white/50 mb-1">📸 Bukti Pembayaran</h3>
              <p className="text-[10px] text-white/30 mb-3">Upload screenshot bukti transfer. Akan dikirim otomatis ke penagih via WhatsApp.</p>
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setPayAllProofFile(f); setPayAllProofPreview(URL.createObjectURL(f)); } }} className="hidden" id="proof-payall-upload" />
              {payAllProofPreview ? (
                <div className="relative">
                  <img src={payAllProofPreview} alt="Bukti" className="w-full max-h-40 object-contain rounded-xl border border-white/8 bg-white/5" />
                  <button onClick={() => { setPayAllProofFile(null); setPayAllProofPreview(null); }}
                    className="absolute top-2 right-2 bg-white/10 rounded-full w-7 h-7 flex items-center justify-center shadow text-sm">✕</button>
                  <p className="text-[10px] text-emerald-400 font-medium mt-1 text-center">✓ Bukti siap dikirim</p>
                </div>
              ) : (
                <label htmlFor="proof-payall-upload"
                  className="block w-full py-6 rounded-xl border-2 border-dashed border-amber-500/20 hover:border-amber-500/30 bg-blue-500/10/50 transition-colors cursor-pointer text-center">
                  <span className="text-2xl block mb-1">📷</span>
                  <span className="text-xs text-amber-400 font-semibold">Upload Bukti Transfer</span>
                </label>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPayAllConfirm(null)} disabled={payingAll}
                className="flex-1 py-3 rounded-xl border border-white/8 font-semibold text-sm disabled:opacity-50">Batal</button>
              <button onClick={doPayAll} disabled={payingAll || !payAllProofFile}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition ${payAllProofFile ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/40'}`}>
                {payingAll ? 'Memproses...' : payAllProofFile ? '✓ Lunas Semua' : '📷 Upload bukti dulu'}
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
            className="max-w-[95vw] max-h-[80vh] object-contain bg-white/5 rounded-2xl p-4" />
        </div>
      )}
      {/* Proof Upload Modal */}
      {proofModal && (
        <div className="fixed inset-0 overlay z-50 flex items-center justify-center p-4" onClick={() => !submittingProof && setProofModal(null)}>
          <div className="bg-[#1a1a2e] border border-white/10 w-full max-w-lg rounded-3xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">📸 Bukti Pembayaran</h3>
              <button onClick={() => !submittingProof && setProofModal(null)} className="text-white/50 text-xl p-1">✕</button>
            </div>

            <div className="bg-amber-500/10 rounded-xl p-3 mb-4">
              <p className="text-xs text-amber-400">⚠️ <strong>Wajib upload bukti transfer</strong> sebelum menandai lunas. Screenshot akan dikirim otomatis ke penagih via WhatsApp.</p>
            </div>

            <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setProofFile(f); setProofPreview(URL.createObjectURL(f)); } }} className="hidden" id="proof-debt-upload" />
            
            {proofPreview ? (
              <div className="relative mb-4">
                <img src={proofPreview} alt="Bukti" className="w-full max-h-52 object-contain rounded-xl border border-white/8 bg-white/5" />
                <button onClick={() => { setProofFile(null); setProofPreview(null); }}
                  className="absolute top-2 right-2 bg-white/10 rounded-full w-7 h-7 flex items-center justify-center shadow text-sm">✕</button>
                <p className="text-[10px] text-emerald-400 font-medium mt-1.5 text-center">✓ Bukti pembayaran siap dikirim</p>
              </div>
            ) : (
              <label htmlFor="proof-debt-upload"
                className="block w-full py-8 rounded-xl border-2 border-dashed border-amber-500/20 hover:border-amber-500/30 bg-blue-500/10/50 transition-colors cursor-pointer text-center mb-4">
                <span className="text-3xl block mb-2">📷</span>
                <span className="text-sm text-amber-400 font-semibold">Upload Bukti Transfer</span>
                <span className="block text-[11px] text-white/30 mt-1">Tap untuk foto atau pilih dari galeri</span>
              </label>
            )}

            <div className="flex gap-3">
              <button onClick={() => setProofModal(null)} disabled={submittingProof}
                className="flex-1 py-3 rounded-xl border border-white/8 font-semibold text-sm disabled:opacity-50">Batal</button>
              <button onClick={submitProofAndMarkPaid} disabled={submittingProof || !proofFile}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition ${proofFile ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/40'}`}>
                {submittingProof ? 'Mengunggah...' : proofFile ? '✓ Kirim & Tandai Lunas' : '📷 Upload dulu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Image Viewer */}
      {showProofView && (
        <div className="fixed inset-0 bg-black z-[60] flex flex-col items-center justify-center" onClick={() => setShowProofView(null)}>
          <button className="absolute top-4 right-4 text-white bg-white/20 rounded-full w-10 h-10 flex items-center justify-center text-lg z-10"
            onClick={() => setShowProofView(null)}>✕</button>
          <p className="text-white/70 text-xs mb-3">📸 Bukti Pembayaran</p>
          <img src={showProofView} alt="Bukti" className="max-w-[95vw] max-h-[80vh] object-contain bg-white/5 rounded-2xl p-2" />
        </div>
      )}
    </div>
  );
}
