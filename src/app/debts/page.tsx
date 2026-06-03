'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Debt, Friend, Bill, PaymentMethod } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import { generateDynamicQRIS } from '@/lib/qris';
import { useToast } from '@/components/Toast';
import { calculateNettingSummary, processNetting, NettingPair } from '@/lib/netting';
import { playPaidSound } from '@/lib/sounds';
import { burstConfetti } from '@/lib/confetti';
import { PageHeader } from '@/components/ui/PageHeader';
import { HintCard } from '@/components/ui/HintCard';
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

  // Netting
  const [nettingPairs, setNettingPairs] = useState<NettingPair[]>([]);
  const [processingNetting, setProcessingNetting] = useState(false);
  const [expandedNetting, setExpandedNetting] = useState<string | null>(null);

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

  // Load netting data whenever debts change
  useEffect(() => { if (friendId) loadNetting(); }, [friendId, debts]);

  async function loadNetting() {
    if (!friendId) return;
    try {
      const pairs = await calculateNettingSummary(friendId);
      setNettingPairs(pairs);
    } catch (err) {
      console.error('Error loading netting:', err);
    }
  }

  async function handleProcessNetting(pair: NettingPair) {
    setProcessingNetting(true);
    try {
      const result = await processNetting(pair);
      showToast(result, 'success');
      await loadDebts();
    } catch (err) {
      showToast('Gagal memproses netting', 'error');
    }
    setProcessingNetting(false);
  }

  async function handleProcessAllNetting() {
    setProcessingNetting(true);
    try {
      for (const pair of nettingPairs) {
        await processNetting(pair);
      }
      showToast('Semua hutang berhasil di-netting! 🎉', 'success');
      await loadDebts();
    } catch (err) {
      showToast('Gagal memproses netting', 'error');
    }
    setProcessingNetting(false);
  }

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
    playPaidSound();
    burstConfetti();
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
      <PageHeader title="Hutang" subtitle="Kelola hutang & piutang kamu" />

      <HintCard hintKey="debts_empty">
        Belum ada hutang? Buat split bill pertama dengan tap <strong>(+)</strong> di pojok kanan bawah.
      </HintCard>

      <div className="flex gap-1 bg-[var(--navy)] rounded-xl p-1 border border-[var(--outline-variant)] mb-4 ">
        <button
          onClick={() => setTab('my-debts')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            tab === 'my-debts' ? 'bg-[var(--primary-container)] text-white ' : 'text-[var(--outline)] hover:text-[var(--on-surface)]'
          }`}
        >
          💸 Aku Hutang
        </button>
        <button
          onClick={() => setTab('owed-to-me')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            tab === 'owed-to-me' ? 'bg-[var(--primary-container)] text-white ' : 'text-[var(--outline)] hover:text-[var(--on-surface)]'
          }`}
        >
          💰 Piutangku
        </button>
      </div>

      {/* Summary */}
      {statusFilter === 'unpaid' && debts.length > 0 && (
        <div className={`rounded-2xl p-4 mb-4 text-white ${tab === 'my-debts' ? 'bg-[var(--red)] text-white' : 'bg-[var(--primary-container)] text-[var(--on-primary-container)]'}`}>
          <p className="text-white/70 text-xs font-medium mb-0.5">
            {tab === 'my-debts' ? 'Total yang aku hutang' : 'Total yang orang hutang ke aku'}
          </p>
          <p className="money text-2xl text-white">{formatRupiah(totalUnpaid)}</p>
          <p className="text-[var(--outline)] text-[10px] mt-1">{debts.filter(d => d.status === 'unpaid').length} transaksi belum lunas</p>
        </div>
      )}

      {/* 🔄 NETTING SECTION — Clear explanation */}
      {nettingPairs.length > 0 && statusFilter === 'unpaid' && (
        <div className="mb-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🔄</span>
              <p className="text-xs font-bold text-[var(--lime)]">Ada Hutang yang Bisa Di-offset!</p>
            </div>
            {nettingPairs.length > 1 && (
              <button
                onClick={handleProcessAllNetting}
                disabled={processingNetting}
                className="px-3 py-1.5 rounded-lg bg-[rgba(200,241,53,0.2)] text-[var(--lime)] border border-[rgba(200,241,53,0.3)] text-[10px] font-semibold disabled:opacity-50 active:scale-[0.98] transition"
              >
                {processingNetting ? '⏳ Proses...' : '🔄 Offset Semua'}
              </button>
            )}
          </div>

          {/* Explanation banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3">
            <p className="text-[11px] text-blue-900 leading-relaxed">
              💡 <strong>Apa itu offset?</strong> Kalau kamu hutang ke seseorang, tapi dia juga hutang ke kamu, 
              maka hutang kalian bisa saling dikurangi. Jadi yang perlu transfer cuma <strong>selisihnya</strong> aja — 
              gak perlu saling kirim uang bolak-balik!
            </p>
          </div>

          <div className="space-y-3">
            {nettingPairs.map((pair, idx) => {
              const isMe = (id: string) => id === friendId;
              const me = isMe(pair.personA.id) ? pair.personA : pair.personB;
              const other = isMe(pair.personA.id) ? pair.personB : pair.personA;
              const iOwe = isMe(pair.personA.id) ? pair.aOwesB.total : pair.bOwesA.total;
              const theyOwe = isMe(pair.personA.id) ? pair.bOwesA.total : pair.aOwesB.total;
              const iOweDebts = isMe(pair.personA.id) ? pair.aOwesB.debts : pair.bOwesA.debts;
              const theyOweDebts = isMe(pair.personA.id) ? pair.bOwesA.debts : pair.aOwesB.debts;
              
              // Net result from MY perspective
              const netIPay = iOwe > theyOwe ? iOwe - theyOwe : 0;
              const netTheyPay = theyOwe > iOwe ? theyOwe - iOwe : 0;
              const isSettled = iOwe === theyOwe;
              const pairKey = `${pair.personA.id}|${pair.personB.id}`;
              const isExpanded = expandedNetting === pairKey;

              return (
                <div key={idx} className="bg-[var(--surface-container)] border border-[rgba(200,241,53,0.2)] rounded-2xl p-4 animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: getAvatarColor(me.name) }}>
                        {getInitials(me.name)}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--lime)] text-black flex items-center justify-center text-[8px]">🔄</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[var(--outline)] text-lg">⇄</span>
                    </div>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: getAvatarColor(other.name) }}>
                      {getInitials(other.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">Kamu ↔ {other.name}</p>
                      <p className="text-[10px] text-[var(--outline)]">Saling punya hutang</p>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="bg-[var(--surface-container)] rounded-xl p-3 mb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-red-400">🔴 Kamu hutang ke {other.name}</span>
                      <span className="money text-xs text-red-400 font-bold">{formatRupiah(iOwe)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-emerald-400">🟢 {other.name} hutang ke kamu</span>
                      <span className="money text-xs text-emerald-400 font-bold">{formatRupiah(theyOwe)}</span>
                    </div>
                    <div className="border-t border-[var(--outline-variant)] pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--outline)]">🔄 Di-offset (saling dikurangi)</span>
                        <span className="money text-xs text-[var(--lime)] font-bold">-{formatRupiah(pair.offsetAmount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Result — VERY CLEAR */}
                  <div className={`rounded-xl p-3 mb-3 text-center ${
                    isSettled 
                      ? 'bg-emerald-500/15 border border-emerald-500/25' 
                      : netIPay > 0 
                        ? 'bg-red-500/10 border border-red-500/20' 
                        : 'bg-emerald-500/10 border border-emerald-500/20'
                  }`}>
                    {isSettled ? (
                      <>
                        <p className="text-emerald-400 text-sm font-bold">✅ Impas! Gak ada yang perlu transfer</p>
                        <p className="text-emerald-400/60 text-[10px] mt-1">Hutang kalian saling menghapus karena jumlahnya sama</p>
                      </>
                    ) : netIPay > 0 ? (
                      <>
                        <p className="text-xs text-[var(--outline)] mb-0.5">Setelah di-offset, kamu tinggal bayar:</p>
                        <p className="money text-xl text-red-400 font-bold">{formatRupiah(netIPay)}</p>
                        <p className="text-[10px] text-[var(--outline)] mt-0.5">ke {other.name}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-[var(--outline)] mb-0.5">Setelah di-offset, {other.name} tinggal bayar:</p>
                        <p className="money text-xl text-emerald-400 font-bold">{formatRupiah(netTheyPay)}</p>
                        <p className="text-[10px] text-[var(--outline)] mt-0.5">ke kamu</p>
                      </>
                    )}
                  </div>

                  {/* Detail toggle */}
                  <button onClick={() => setExpandedNetting(isExpanded ? null : pairKey)}
                    className="w-full text-[11px] text-[var(--lime)] font-medium mb-2">
                    {isExpanded ? '▲ Sembunyikan detail asal hutang' : '▼ Lihat detail asal hutang'}
                  </button>

                  {isExpanded && (
                    <div className="bg-[var(--surface-container)] rounded-xl p-3 space-y-2 animate-fade-in mb-3">
                      <p className="text-[10px] font-bold text-[var(--outline)] uppercase tracking-wider">Hutang kamu ke {other.name}:</p>
                      {iOweDebts.map((d, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-red-400/70">📋 {d.billTitle}</span>
                          <span className="money text-red-400 font-semibold">{formatRupiah(d.amount)}</span>
                        </div>
                      ))}
                      <div className="border-t border-[var(--outline-variant)] pt-2 mt-2">
                        <p className="text-[10px] font-bold text-[var(--outline)] uppercase tracking-wider">Hutang {other.name} ke kamu:</p>
                      </div>
                      {theyOweDebts.map((d, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-emerald-400/70">📋 {d.billTitle}</span>
                          <span className="money text-emerald-400 font-semibold">{formatRupiah(d.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={() => handleProcessNetting(pair)}
                    disabled={processingNetting}
                    className="w-full py-2.5 rounded-xl bg-[var(--lime)] text-black text-white text-xs font-bold disabled:opacity-50 active:scale-[0.98] transition  shadow-none"
                  >
                    {processingNetting ? '⏳ Memproses...' : '🔄 Proses Offset Sekarang'}
                  </button>
                  <p className="text-[9px] text-[var(--outline)] text-center mt-1.5">
                    Hutang yang saling berlawanan akan otomatis ditandai lunas, sisanya tetap perlu dibayar
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Net summary — Pay All buttons (only for my-debts tab) */}
      {tab === 'my-debts' && statusFilter === 'unpaid' && netSummary.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-[var(--outline)] mb-2">Ringkasan per orang</p>
          <div className="space-y-2">
            {netSummary.map((s, idx) => (
              <div key={idx} className="warm-card px-4 py-3 animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: getAvatarColor(s.creditor) }}>
                      {getInitials(s.creditor)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">ke {s.creditor}</p>
                      {/* Show bill title(s) */}
                      {s.count === 1 ? (
                        <p className="text-[10px] text-[var(--outline)] truncate">📋 {s.bills[0].title}</p>
                      ) : (
                        <p className="text-[10px] text-[var(--outline)]">{s.count} tagihan</p>
                      )}
                    </div>
                  </div>
                  <p className="money text-sm text-danger shrink-0 ml-2">{formatRupiah(s.total)}</p>
                </div>

                {/* Bill breakdown for multiple bills */}
                {s.count > 1 && (
                  <div className="mt-2 bg-[var(--surface-container)] rounded-lg p-2.5 space-y-1.5">
                    {s.bills.map((b, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="text-[var(--outline)] truncate mr-2">📋 {b.title}</span>
                        <span className="money text-[var(--on-surface)] font-semibold shrink-0">{formatRupiah(b.amount)}</span>
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
              statusFilter === f ? 'bg-[var(--primary-container)] text-white' : 'bg-[var(--navy)] text-[var(--on-surface)] border border-[var(--outline-variant)] '
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
          <p className="text-[var(--outline)] text-sm">
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
                      <p className="text-xs text-[var(--outline)] mt-0.5">
                        📋 {debt.bill?.title || 'Bill'} • {formatDate(debt.bill?.bill_date || debt.created_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`money text-lg ${debt.status === 'paid' ? 'text-success line-through opacity-60' : isMyDebt ? 'text-danger' : 'text-success'}`}>
                        {isMyDebt ? '-' : '+'}{formatRupiah(Number(debt.amount))}
                      </p>
                      {debt.status === 'paid' && (
                        <span className="bg-[rgba(200,241,53,0.15)] text-[var(--lime)] border border-[var(--lime)] text-[10px] font-bold px-2 py-0.5 rounded-full">
                          ✓ LUNAS {debt.paid_at ? formatDate(debt.paid_at) : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Always show a brief summary of items if notes exist */}
                  {noteItems.length > 0 && (
                    <div className="mt-3">
                      {/* Show first 2 items preview always */}
                      <div className="bg-[var(--surface-container)] rounded-xl p-3 space-y-1 border border-[var(--outline-variant)]/50">
                        <p className="text-[10px] font-bold text-[var(--on-surface)]/70 uppercase tracking-wider mb-1">Detail Item:</p>
                        {noteItems.slice(0, isExpanded ? undefined : 2).map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-[var(--on-surface)]/80">{item.itemName}</span>
                            {item.detail && <span className="money text-[var(--on-surface)] font-semibold">{item.detail}</span>}
                          </div>
                        ))}
                        {!isExpanded && noteItems.length > 2 && (
                          <button
                            onClick={() => setExpandedDebt(debt.id)}
                            className="text-[11px] text-[var(--lime)] font-medium mt-1 w-full text-left"
                          >
                            ... dan {noteItems.length - 2} item lainnya ▼
                          </button>
                        )}
                        {isExpanded && noteItems.length > 2 && (
                          <button
                            onClick={() => setExpandedDebt(null)}
                            className="text-[11px] text-[var(--lime)] font-medium mt-1 w-full text-left"
                          >
                            Sembunyikan ▲
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No notes — show bill link */}
                  {noteItems.length === 0 && (
                    <Link href={`/bills/${debt.bill_id}`} className="mt-2 inline-block text-xs text-[var(--lime)] font-medium">
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
                            className="flex-1 py-2.5 rounded-xl bg-[rgba(200,241,53,0.2)] text-[var(--lime)] border border-[rgba(200,241,53,0.3)] text-xs font-semibold text-center"
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
                        className="flex-1 py-2.5 rounded-xl border border-[var(--outline-variant)] text-[var(--outline)] text-xs font-semibold disabled:opacity-50"
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
          <div className="bg-[var(--navy)] border border-[var(--outline-variant)] -lg w-full max-w-lg rounded-3xl p-6 animate-slide-up max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[var(--on-surface)]">Bayar Semua</h3>
              <button onClick={() => !payingAll && setPayAllConfirm(null)} className="text-[var(--outline)] text-xl p-1 hover:text-[var(--on-surface)]">✕</button>
            </div>

            <div className="btn-primary rounded-xl p-4 mb-4 text-white text-center">
              <p className="text-blue-100 text-xs mb-0.5">Total ke {payAllConfirm.creditor}</p>
              <p className="money text-2xl text-white">{formatRupiah(payAllConfirm.total)}</p>
              <p className="text-blue-200 text-[10px] mt-1">{payAllConfirm.count} transaksi</p>
            </div>

            {loadingPMs ? (
              <div className="py-4 text-center text-sm text-[var(--outline)]">Memuat metode pembayaran...</div>
            ) : payAllPMs.length > 0 ? (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[var(--outline)] mb-2">Transfer ke</p>
                {payAllPMs.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
                    {payAllPMs.map(pm => (
                      <button key={pm.id} onClick={() => { setSelectedPM(pm); setShowQris(false); }}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${selectedPM?.id === pm.id ? 'bg-[var(--primary-container)] text-white' : 'bg-[var(--navy)] text-[var(--on-surface)] border border-[var(--outline-variant)]'}`}>
                        {pm.label || pm.bank_name}
                      </button>
                    ))}
                  </div>
                )}
                {selectedPM && (
                  <div className="bg-[var(--surface-container)] rounded-xl p-4 space-y-3">
                    {selectedPM.account_number && (
                      <div className="bg-[var(--surface-container)] rounded-lg p-3">
                        <p className="text-[10px] text-[var(--outline)] mb-0.5">{selectedPM.bank_name}</p>
                        <div className="flex items-center justify-between">
                          <p className="money text-base">{selectedPM.account_number}</p>
                          <button onClick={() => { navigator.clipboard.writeText(selectedPM.account_number || ''); showToast('Nomor rekening disalin!', 'success'); }}
                            className="px-2 py-1 rounded-md bg-[rgba(200,241,53,0.2)] text-[var(--lime)] border border-[rgba(200,241,53,0.3)] text-[10px] font-semibold">📋 Salin</button>
                        </div>
                      </div>
                    )}
                    {selectedPM.qris_image_url && (
                      <div className="space-y-2">
                        {generatingQris ? (
                          <div className="py-4 text-center">
                            <div className="inline-block w-6 h-6 border-2 border-[var(--lime)] border-t-transparent rounded-full animate-spin mb-1" />
                            <p className="text-[10px] text-[var(--outline)]">Generating QRIS...</p>
                          </div>
                        ) : (
                          <button onClick={() => setShowQris(true)} className="w-full">
                            <img src={qrisMode === 'dynamic' && dynamicQris ? dynamicQris : selectedPM.qris_image_url} alt="QRIS"
                              className="w-full max-h-40 object-contain rounded-lg border border-[var(--outline-variant)] bg-[var(--navy)]" />
                            <p className="text-[10px] text-[var(--lime)] font-medium mt-1">Tap untuk perbesar</p>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[var(--surface-container)] rounded-xl p-4 mb-4 text-center">
                <p className="text-xs text-[var(--outline)]">Belum ada metode pembayaran untuk {payAllConfirm.creditor}</p>
              </div>
            )}

            {/* Proof Upload for Pay All */}
            <div className="glass-card p-4 mb-4">
              <h3 className="text-sm font-semibold text-[var(--outline)] mb-1">📸 Bukti Pembayaran</h3>
              <p className="text-[10px] text-[var(--outline)] mb-3">Upload screenshot bukti transfer. Akan dikirim otomatis ke penagih via WhatsApp.</p>
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setPayAllProofFile(f); setPayAllProofPreview(URL.createObjectURL(f)); } }} className="hidden" id="proof-payall-upload" />
              {payAllProofPreview ? (
                <div className="relative">
                  <img src={payAllProofPreview} alt="Bukti" className="w-full max-h-40 object-contain rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container)]" />
                  <button onClick={() => { setPayAllProofFile(null); setPayAllProofPreview(null); }}
                    className="absolute top-2 right-2 bg-[var(--navy)]/10 rounded-full w-7 h-7 flex items-center justify-center shadow text-sm">✕</button>
                  <p className="text-[10px] text-emerald-400 font-medium mt-1 text-center">✓ Bukti siap dikirim</p>
                </div>
              ) : (
                <label htmlFor="proof-payall-upload"
                  className="block w-full py-6 rounded-xl border-2 border-dashed border-[rgba(200,241,53,0.2)] hover:border-[rgba(200,241,53,0.3)] bg-blue-500/10/50 transition-colors cursor-pointer text-center">
                  <span className="text-2xl block mb-1">📷</span>
                  <span className="text-xs text-[var(--lime)] font-semibold">Upload Bukti Transfer</span>
                </label>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPayAllConfirm(null)} disabled={payingAll}
                className="flex-1 py-3 rounded-xl border border-[var(--outline-variant)] font-semibold text-sm disabled:opacity-50">Batal</button>
              <button onClick={doPayAll} disabled={payingAll || !payAllProofFile}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition ${payAllProofFile ? 'bg-emerald-600 text-white' : 'bg-[var(--navy)]/10 text-[var(--outline)]'}`}>
                {payingAll ? 'Memproses...' : payAllProofFile ? '✓ Lunas Semua' : '📷 Upload bukti dulu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QRIS Fullscreen */}
      {showQris && selectedPM?.qris_image_url && (
        <div className="fixed inset-0 bg-black z-[60] flex flex-col items-center justify-center" onClick={() => setShowQris(false)}>
          <button className="absolute top-4 right-4 text-white bg-[var(--navy)]/20 rounded-full w-10 h-10 flex items-center justify-center text-lg z-10"
            onClick={() => setShowQris(false)}>✕</button>
          <img src={qrisMode === 'dynamic' && dynamicQris ? dynamicQris : selectedPM.qris_image_url} alt="QRIS"
            className="max-w-[95vw] max-h-[80vh] object-contain bg-[var(--surface-container)] rounded-2xl p-4" />
        </div>
      )}
      {/* Proof Upload Modal */}
      {proofModal && (
        <div className="fixed inset-0 overlay z-50 flex items-center justify-center p-4" onClick={() => !submittingProof && setProofModal(null)}>
          <div className="bg-[var(--navy)] -lg border border-[var(--outline-variant)] w-full max-w-lg rounded-3xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[var(--on-surface)]">📸 Bukti Pembayaran</h3>
              <button onClick={() => !submittingProof && setProofModal(null)} className="text-[var(--outline)] hover:text-[var(--on-surface)] text-xl p-1">✕</button>
            </div>

            <div className="bg-[rgba(200,241,53,0.05)] rounded-xl border border-[rgba(200,241,53,0.3)] p-3 mb-4">
              <p className="text-xs text-[var(--lime)]">⚠️ <strong>Wajib upload bukti transfer</strong> sebelum menandai lunas. Screenshot akan dikirim otomatis ke penagih via WhatsApp.</p>
            </div>

            <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setProofFile(f); setProofPreview(URL.createObjectURL(f)); } }} className="hidden" id="proof-debt-upload" />
            
            {proofPreview ? (
              <div className="relative mb-4">
                <img src={proofPreview} alt="Bukti" className="w-full max-h-52 object-contain rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container)]" />
                <button onClick={() => { setProofFile(null); setProofPreview(null); }}
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center shadow text-sm">✕</button>
                <p className="text-[10px] text-emerald-600 font-medium mt-1.5 text-center">✓ Bukti pembayaran siap dikirim</p>
              </div>
            ) : (
              <label htmlFor="proof-debt-upload"
                className="block w-full py-8 rounded-xl border-2 border-dashed border-[var(--outline-variant)] hover:border-[var(--lime)] bg-[rgba(200,241,53,0.05)] transition-colors cursor-pointer text-center mb-4">
                <span className="text-3xl block mb-2">📷</span>
                <span className="text-sm text-[var(--lime)] font-semibold">Upload Bukti Transfer</span>
                <span className="block text-[11px] text-[var(--outline)] mt-1">Tap untuk foto atau pilih dari galeri</span>
              </label>
            )}

            <div className="flex gap-3">
              <button onClick={() => setProofModal(null)} disabled={submittingProof}
                className="flex-1 py-3 rounded-xl border border-[var(--outline-variant)] text-[var(--on-surface)] hover:bg-warm-50 font-semibold text-sm disabled:opacity-50">Batal</button>
              <button onClick={submitProofAndMarkPaid} disabled={submittingProof || !proofFile}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition ${proofFile ? 'bg-emerald-600 text-white shadow-emerald' : 'bg-warm-100 text-[var(--outline)]'}`}>
                {submittingProof ? 'Mengunggah...' : proofFile ? '✓ Kirim & Tandai Lunas' : '📷 Upload dulu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Image Viewer */}
      {showProofView && (
        <div className="fixed inset-0 bg-black z-[60] flex flex-col items-center justify-center" onClick={() => setShowProofView(null)}>
          <button className="absolute top-4 right-4 text-white bg-[var(--navy)]/20 rounded-full w-10 h-10 flex items-center justify-center text-lg z-10"
            onClick={() => setShowProofView(null)}>✕</button>
          <p className="text-white/70 text-xs mb-3">📸 Bukti Pembayaran</p>
          <img src={showProofView} alt="Bukti" className="max-w-[95vw] max-h-[80vh] object-contain bg-[var(--surface-container)] rounded-2xl p-2" />
        </div>
      )}
    </div>
  );
}
