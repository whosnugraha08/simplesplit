'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Debt, Friend, Bill, PaymentMethod } from '@/lib/types';
import { formatRupiah, getInitials, getAvatarColor } from '@/lib/formatters';
import { generateDynamicQRIS } from '@/lib/qris';
import { useToast } from '@/components/Toast';
import { playPaidSound } from '@/lib/sounds';
import { burstConfetti } from '@/lib/confetti';

export default function PayPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const debtId = params.debtId as string;

  const [debt, setDebt] = useState<(Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill }) | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPM, setSelectedPM] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [showQris, setShowQris] = useState(false);
  const [expandNotes, setExpandNotes] = useState(false);
  const [isCash, setIsCash] = useState(false);

  // Payment proof
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [showProofFull, setShowProofFull] = useState(false);

  const [dynamicQris, setDynamicQris] = useState<string | null>(null);
  const [generatingQris, setGeneratingQris] = useState(false);
  const [qrisMode, setQrisMode] = useState<'dynamic' | 'static'>('dynamic');

  useEffect(() => { loadDebt(); }, [debtId]);

  useEffect(() => {
    if (selectedPM?.qris_image_url && debt?.amount) {
      (async () => {
        setGeneratingQris(true); setDynamicQris(null);
        try {
          const result = await generateDynamicQRIS(selectedPM.qris_image_url!, Math.round(Number(debt.amount)));
          if (result) { setDynamicQris(result.dataUrl); setQrisMode('dynamic'); }
          else setQrisMode('static');
        } catch { setQrisMode('static'); }
        setGeneratingQris(false);
      })();
    } else { setDynamicQris(null); }
  }, [selectedPM?.id, debt?.amount]);

  async function loadDebt() {
    const { data } = await supabase.from('debts')
      .select('*, debtor:debtor_id(*), creditor:creditor_id(*), bill:bill_id(id,title)')
      .eq('id', debtId).single();

    const debtData = data as any;
    setDebt(debtData);

    if (debtData?.creditor_id) {
      try {
        const { data: pms } = await supabase.from('payment_methods').select('*').eq('friend_id', debtData.creditor_id).order('created_at');
        if (pms && pms.length > 0) { setPaymentMethods(pms); setSelectedPM(pms[0]); }
      } catch {}
    }
    setLoading(false);
  }

  function handleProofFile(file: File) {
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  }

  async function uploadProof(): Promise<string | null> {
    if (!proofFile) return null;
    const fileExt = proofFile.name.split('.').pop();
    const fileName = `proof_${debtId}_${Date.now()}.${fileExt}`;
    // Try 'receipts' bucket (most likely exists)
    const { error } = await supabase.storage.from('receipts').upload(`proofs/${fileName}`, proofFile, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(`proofs/${fileName}`);
      return urlData.publicUrl;
    }
    // Fallback: base64 data URL
    try {
      const reader = new FileReader();
      return await new Promise<string>((resolve) => { reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(proofFile); });
    } catch { return null; }
  }

  async function handleMarkPaid() {
    if (!isCash && !proofFile) {
      showToast('Upload bukti pembayaran dulu ya!', 'error');
      return;
    }
    setMarkingPaid(true);
    
    // Upload proof image
    let proofUrl = isCash ? 'CASH' : await uploadProof();
    
    // Verifikasi AI (jika bukan cash)
    if (!isCash && proofUrl && proofUrl !== 'CASH') {
      try {
        const verifyRes = await fetch('/api/verify-proof', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proofUrl,
            expectedAmount: Number(debt?.amount || 0),
            expectedCreditor: debt?.creditor?.name || ''
          })
        });
        const verifyData = await verifyRes.json();
        
        if (!verifyData.valid) {
          showToast(`❌ Bukti ditolak AI: ${verifyData.reason || 'Gambar tidak valid'}`, 'error');
          setMarkingPaid(false);
          return;
        }
      } catch (e) {
        console.error('Verify error', e);
      }
    }

    // Step 1: Mark as paid (must succeed)
    await supabase.from('debts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', debtId);
    // Step 2: Try to save proof URL (may fail if column doesn't exist yet)
    if (proofUrl) {
      try { await supabase.from('debts').update({ proof_image_url: proofUrl }).eq('id', debtId); } catch {}
    }
    if (debt) {
      const { data: remaining } = await supabase.from('debts').select('id').eq('bill_id', debt.bill_id).eq('status', 'unpaid');
      if (!remaining || remaining.length <= 1) {
        await supabase.from('bills').update({ status: 'settled' }).eq('id', debt.bill_id);
      }
      if (debt.bill) {
        fetch('/api/webhook-wa', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bill: { id: debt.bill.id, title: debt.bill.title, paid_by: debt.creditor_id, paid_by_friend: debt.creditor }, items: [], debts: [{ ...debt, proof_image_url: proofUrl }], type: 'paid' }),
        }).catch(console.error);
      }
    }
    playPaidSound();
    burstConfetti();
    showToast('Hutang berhasil dilunasi!', 'success');
    router.push('/debts');
  }

  if (loading) {
    return <div className="content-padding pt-6"><div className="skeleton h-8 w-48 mb-4" /><div className="skeleton h-64 w-full" /></div>;
  }

  if (!debt || !debt.creditor) {
    return <div className="content-padding pt-6 text-center py-16"><p className="text-3xl mb-3">🤷</p><p className="text-[var(--outline)]">Data hutang tidak ditemukan</p></div>;
  }

  const creditor = debt.creditor;
  const debtor = debt.debtor;
  const qrisImageToShow = qrisMode === 'dynamic' && dynamicQris ? dynamicQris : selectedPM?.qris_image_url;

  return (
    <div className="content-padding pt-6 pb-4 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-xl text-[var(--outline)] p-1">←</button>
        <div>
          <h1 className="text-xl font-bold">Bayar Hutang</h1>
          <p className="text-xs text-[var(--outline)]">{debt.bill?.title}</p>
        </div>
      </div>

      {/* Amount Card */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-6 mb-6 text-white text-center">
        <p className="text-blue-100 text-sm mb-1">Jumlah yang harus dibayar</p>
        <p className="money text-4xl text-white">{formatRupiah(Number(debt.amount))}</p>
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white/30"
            style={{ backgroundColor: getAvatarColor(debtor?.name || '') }}>
            {getInitials(debtor?.name || '?')}
          </div>
          <span className="text-blue-100">{debtor?.name}</span>
          <span className="text-blue-200">→</span>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white/30"
            style={{ backgroundColor: getAvatarColor(creditor.name) }}>
            {getInitials(creditor.name)}
          </div>
          <span className="text-blue-100">{creditor.name}</span>
        </div>
      </div>

      {/* Debt Detail / Notes */}
      {debt.notes && (
        <div className="glass-card p-4 mb-4">
          <button onClick={() => setExpandNotes(!expandNotes)} className="w-full flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--outline)]">📋 Detail Item</span>
            <span className="text-xs text-amber-400 font-medium">{expandNotes ? '▲' : '▼'}</span>
          </button>
          {expandNotes && (
            <div className="mt-3 bg-[var(--surface-container)] rounded-xl p-3 animate-fade-in">
              {debt.notes.split('\n').map((line, i) => (
                <p key={i} className="text-xs text-[var(--outline)]">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment Methods */}
      {paymentMethods.length > 1 && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-[var(--outline)] mb-2">Pilih Metode Pembayaran</p>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {paymentMethods.map(pm => (
              <button key={pm.id} onClick={() => setSelectedPM(pm)}
                className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedPM?.id === pm.id ? 'bg-[var(--primary-container)] text-white ' : 'bg-[var(--navy)] text-[var(--outline)] border border-[var(--outline-variant)]'
                }`}>
                {pm.label || pm.bank_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedPM ? (
        <>
          <div className="glass-card p-5 mb-4">
            <h2 className="text-sm font-semibold text-[var(--outline)] mb-4">Transfer ke</h2>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: getAvatarColor(creditor.name) }}>
                {getInitials(creditor.name)}
              </div>
              <div>
                <p className="font-bold text-lg">{creditor.name}</p>
                <p className="text-sm text-[var(--outline)]">{selectedPM.label || selectedPM.bank_name}</p>
              </div>
            </div>
            {selectedPM.account_number && (
              <div className="bg-[var(--surface-container)] rounded-xl p-4 mb-3">
                <p className="text-xs text-[var(--outline)] mb-1">Nomor Rekening</p>
                <div className="flex items-center justify-between">
                  <p className="money text-xl">{selectedPM.account_number}</p>
                  <button onClick={() => { navigator.clipboard.writeText(selectedPM.account_number || ''); showToast('Nomor rekening disalin!', 'success'); }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold">📋 Salin</button>
                </div>
                <p className="text-sm text-[var(--outline)] mt-1">{selectedPM.bank_name}</p>
              </div>
            )}
          </div>

          {selectedPM.qris_image_url && (
            <div className="glass-card p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[var(--outline)]">Scan QRIS</h2>
                {dynamicQris && (
                  <div className="flex gap-1 bg-[var(--surface-container)] rounded-lg p-0.5">
                    <button onClick={() => setQrisMode('dynamic')}
                      className={`px-2 py-1 rounded-md text-[10px] font-semibold transition ${qrisMode === 'dynamic' ? 'bg-[var(--primary-container)] text-white' : 'text-[var(--outline)]'}`}>
                      ⚡ Dynamic
                    </button>
                    <button onClick={() => setQrisMode('static')}
                      className={`px-2 py-1 rounded-md text-[10px] font-semibold transition ${qrisMode === 'static' ? 'bg-[var(--primary-container)] text-white ' : 'text-[var(--outline)]'}`}>
                      📷 Asli
                    </button>
                  </div>
                )}
              </div>
              {qrisMode === 'dynamic' && dynamicQris && (
                <div className="bg-emerald-500/10 rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2">
                  <span className="text-emerald-400 text-xs">⚡</span>
                  <p className="text-[10px] text-emerald-400 font-medium">Nominal {formatRupiah(Number(debt.amount))} sudah terisi</p>
                </div>
              )}
              {generatingQris ? (
                <div className="py-8 text-center">
                  <div className="inline-block w-8 h-8 border-2 border-[var(--lime)] border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-xs text-[var(--outline)]">Generating QRIS...</p>
                </div>
              ) : (
                <button onClick={() => setShowQris(true)} className="w-full">
                  <img src={qrisImageToShow || selectedPM.qris_image_url} alt="QRIS" className="w-full max-h-64 object-contain rounded-xl border border-[var(--outline-variant)]" />
                  <p className="text-xs text-amber-400 font-medium mt-2">Tap untuk perbesar</p>
                </button>
              )}
            </div>
          )}
        </>
      ) : paymentMethods.length === 0 ? (
        <div className="glass-card p-8 mb-6 text-center">
          <p className="text-3xl mb-2">⚠️</p>
          <p className="text-sm text-[var(--outline)]">{creditor.name} belum punya metode pembayaran.</p>
          <a href="/friends" className="text-sm text-amber-400 font-semibold mt-2 inline-block">Tambahkan di Teman →</a>
        </div>
      ) : null}

      {/* Proof Upload / Cash Toggle */}
      <div className="glass-card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--outline)]">📸 Bukti Pembayaran</h2>
          <label className="flex items-center gap-2 cursor-pointer bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
            <input type="checkbox" checked={isCash} onChange={e => setIsCash(e.target.checked)} className="rounded text-amber-500 focus:ring-amber-500 w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold text-amber-500">Bayar Cash (Tunai)</span>
          </label>
        </div>
        
        {isCash ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl mb-1">💵</p>
            <p className="text-xs text-emerald-400 font-medium">Pembayaran Tunai</p>
            <p className="text-[10px] text-[var(--outline)] mt-1">Tidak perlu upload bukti transfer. Otomatis diteruskan sebagai Cash.</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-[var(--outline)] mb-3">Screenshot bukti transfer kamu setelah pembayaran berhasil. Bukti ini akan diverifikasi oleh AI secara otomatis.</p>
            <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleProofFile(f); }} className="hidden" id="proof-upload" />
        {proofPreview ? (
          <div className="relative">
            <button onClick={() => setShowProofFull(true)} className="w-full">
              <img src={proofPreview} alt="Bukti" className="w-full max-h-48 object-contain rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container)]" />
            </button>
            <button onClick={() => { setProofFile(null); setProofPreview(null); }}
              className="absolute top-2 right-2 bg-[var(--navy)]/10 rounded-full w-7 h-7 flex items-center justify-center shadow text-sm">✕</button>
            <p className="text-[10px] text-emerald-400 font-medium mt-1.5 text-center">✓ Bukti pembayaran siap dikirim</p>
          </div>
        ) : (
          <label htmlFor="proof-upload"
            className="block w-full py-8 rounded-xl border-2 border-dashed border-amber-500/20 hover:border-amber-500/30 bg-blue-500/10/50 transition-colors cursor-pointer text-center">
            <span className="text-3xl block mb-2">📷</span>
            <span className="text-sm text-amber-400 font-semibold">Upload Bukti Transfer</span>
            <span className="block text-[11px] text-[var(--outline)] mt-1">Tap untuk foto atau pilih dari galeri</span>
          </label>
        )}
        </>
        )}
      </div>

      {/* Action */}
      <button onClick={handleMarkPaid} disabled={markingPaid || (!isCash && !proofFile)}
        className={`w-full py-3.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition shadow-lg ${
          (isCash || proofFile)
            ? 'bg-emerald-600 text-white shadow-emerald-500/20'
            : 'bg-[var(--navy)]/10 text-[var(--outline)] cursor-not-allowed shadow-none'
        } disabled:opacity-50`}>
        {markingPaid ? 'Memproses...' : isCash ? '✓ Konfirmasi Bayar Cash' : proofFile ? '✓ Kirim Bukti & Tandai Lunas' : '📷 Upload bukti dulu'}
      </button>

      {/* QRIS Fullscreen */}
      {showQris && qrisImageToShow && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center" onClick={() => setShowQris(false)}>
          <button className="absolute top-4 right-4 text-white bg-[var(--navy)]/20 rounded-full w-10 h-10 flex items-center justify-center text-lg z-10"
            onClick={() => setShowQris(false)}>✕</button>
          {qrisMode === 'dynamic' && dynamicQris && (
            <div className="bg-emerald-600/90 rounded-full px-4 py-1.5 mb-4">
              <p className="text-white text-xs font-semibold">⚡ Dynamic — {formatRupiah(Number(debt.amount))}</p>
            </div>
          )}
          <img src={qrisImageToShow} alt="QRIS" className="max-w-[95vw] max-h-[80vh] object-contain bg-[var(--surface-container)] rounded-2xl p-4" />
          {dynamicQris && (
            <div className="mt-4 flex gap-2">
              <button onClick={e => { e.stopPropagation(); setQrisMode('dynamic'); }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${qrisMode === 'dynamic' ? 'bg-[var(--primary-container)] text-white' : 'bg-[var(--navy)]/20 text-white'}`}>⚡ Dynamic</button>
              <button onClick={e => { e.stopPropagation(); setQrisMode('static'); }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${qrisMode === 'static' ? 'bg-[var(--navy)] text-gray-900' : 'bg-[var(--navy)]/20 text-white'}`}>📷 Asli</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
