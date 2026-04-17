'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Debt, Friend, Bill, PaymentMethod } from '@/lib/types';
import { formatRupiah, getInitials, getAvatarColor } from '@/lib/formatters';
import { generateDynamicQRIS } from '@/lib/qris';
import { useToast } from '@/components/Toast';

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

  async function handleMarkPaid() {
    setMarkingPaid(true);
    await supabase.from('debts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', debtId);
    if (debt) {
      const { data: remaining } = await supabase.from('debts').select('id').eq('bill_id', debt.bill_id).eq('status', 'unpaid');
      if (!remaining || remaining.length <= 1) {
        await supabase.from('bills').update({ status: 'settled' }).eq('id', debt.bill_id);
      }
      if (debt.bill) {
        fetch('/api/webhook-wa', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bill: { id: debt.bill.id, title: debt.bill.title, paid_by: debt.creditor_id, paid_by_friend: debt.creditor }, items: [], debts: [debt], type: 'paid' }),
        }).catch(console.error);
      }
    }
    showToast('Hutang berhasil dilunasi!', 'success');
    router.push('/debts');
  }

  if (loading) {
    return <div className="content-padding pt-6"><div className="skeleton h-8 w-48 mb-4" /><div className="skeleton h-64 w-full" /></div>;
  }

  if (!debt || !debt.creditor) {
    return <div className="content-padding pt-6 text-center py-16"><p className="text-3xl mb-3">🤷</p><p className="text-text-secondary">Data hutang tidak ditemukan</p></div>;
  }

  const creditor = debt.creditor;
  const debtor = debt.debtor;
  const qrisImageToShow = qrisMode === 'dynamic' && dynamicQris ? dynamicQris : selectedPM?.qris_image_url;

  return (
    <div className="content-padding pt-6 pb-4 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-xl text-text-secondary p-1">←</button>
        <div>
          <h1 className="text-xl font-bold">Bayar Hutang</h1>
          <p className="text-xs text-text-secondary">{debt.bill?.title}</p>
        </div>
      </div>

      {/* Amount Card */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-6 mb-6 text-white text-center">
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
        <div className="bg-white rounded-2xl border border-border p-4 mb-4">
          <button onClick={() => setExpandNotes(!expandNotes)} className="w-full flex items-center justify-between">
            <span className="text-sm font-semibold text-text-secondary">📋 Detail Item</span>
            <span className="text-xs text-primary font-medium">{expandNotes ? '▲' : '▼'}</span>
          </button>
          {expandNotes && (
            <div className="mt-3 bg-page rounded-xl p-3 animate-fade-in">
              {debt.notes.split('\n').map((line, i) => (
                <p key={i} className="text-xs text-text-secondary">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment Methods */}
      {paymentMethods.length > 1 && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-text-secondary mb-2">Pilih Metode Pembayaran</p>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {paymentMethods.map(pm => (
              <button key={pm.id} onClick={() => setSelectedPM(pm)}
                className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedPM?.id === pm.id ? 'bg-primary text-white shadow-sm' : 'bg-white text-text-secondary border border-border'
                }`}>
                {pm.label || pm.bank_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedPM ? (
        <>
          <div className="bg-white rounded-2xl border border-border p-5 mb-4">
            <h2 className="text-sm font-semibold text-text-secondary mb-4">Transfer ke</h2>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: getAvatarColor(creditor.name) }}>
                {getInitials(creditor.name)}
              </div>
              <div>
                <p className="font-bold text-lg">{creditor.name}</p>
                <p className="text-sm text-text-secondary">{selectedPM.label || selectedPM.bank_name}</p>
              </div>
            </div>
            {selectedPM.account_number && (
              <div className="bg-page rounded-xl p-4 mb-3">
                <p className="text-xs text-text-secondary mb-1">Nomor Rekening</p>
                <div className="flex items-center justify-between">
                  <p className="money text-xl">{selectedPM.account_number}</p>
                  <button onClick={() => { navigator.clipboard.writeText(selectedPM.account_number || ''); showToast('Nomor rekening disalin!', 'success'); }}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-primary text-xs font-semibold">📋 Salin</button>
                </div>
                <p className="text-sm text-text-secondary mt-1">{selectedPM.bank_name}</p>
              </div>
            )}
          </div>

          {selectedPM.qris_image_url && (
            <div className="bg-white rounded-2xl border border-border p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-text-secondary">Scan QRIS</h2>
                {dynamicQris && (
                  <div className="flex gap-1 bg-page rounded-lg p-0.5">
                    <button onClick={() => setQrisMode('dynamic')}
                      className={`px-2 py-1 rounded-md text-[10px] font-semibold transition ${qrisMode === 'dynamic' ? 'bg-primary text-white' : 'text-text-secondary'}`}>
                      ⚡ Dynamic
                    </button>
                    <button onClick={() => setQrisMode('static')}
                      className={`px-2 py-1 rounded-md text-[10px] font-semibold transition ${qrisMode === 'static' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'}`}>
                      📷 Asli
                    </button>
                  </div>
                )}
              </div>
              {qrisMode === 'dynamic' && dynamicQris && (
                <div className="bg-emerald-50 rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2">
                  <span className="text-emerald-600 text-xs">⚡</span>
                  <p className="text-[10px] text-emerald-600 font-medium">Nominal {formatRupiah(Number(debt.amount))} sudah terisi</p>
                </div>
              )}
              {generatingQris ? (
                <div className="py-8 text-center">
                  <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-xs text-text-secondary">Generating QRIS...</p>
                </div>
              ) : (
                <button onClick={() => setShowQris(true)} className="w-full">
                  <img src={qrisImageToShow || selectedPM.qris_image_url} alt="QRIS" className="w-full max-h-64 object-contain rounded-xl border border-border" />
                  <p className="text-xs text-primary font-medium mt-2">Tap untuk perbesar</p>
                </button>
              )}
            </div>
          )}
        </>
      ) : paymentMethods.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-8 mb-6 text-center">
          <p className="text-3xl mb-2">⚠️</p>
          <p className="text-sm text-text-secondary">{creditor.name} belum punya metode pembayaran.</p>
          <a href="/friends" className="text-sm text-primary font-semibold mt-2 inline-block">Tambahkan di Teman →</a>
        </div>
      ) : null}

      {/* Action */}
      <button onClick={handleMarkPaid} disabled={markingPaid}
        className="w-full py-3.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition shadow-lg shadow-emerald-500/20">
        {markingPaid ? 'Memproses...' : '✓ Sudah Bayar — Tandai Lunas'}
      </button>

      {/* QRIS Fullscreen */}
      {showQris && qrisImageToShow && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center" onClick={() => setShowQris(false)}>
          <button className="absolute top-4 right-4 text-white bg-white/20 rounded-full w-10 h-10 flex items-center justify-center text-lg z-10"
            onClick={() => setShowQris(false)}>✕</button>
          {qrisMode === 'dynamic' && dynamicQris && (
            <div className="bg-emerald-500/90 rounded-full px-4 py-1.5 mb-4">
              <p className="text-white text-xs font-semibold">⚡ Dynamic — {formatRupiah(Number(debt.amount))}</p>
            </div>
          )}
          <img src={qrisImageToShow} alt="QRIS" className="max-w-[95vw] max-h-[80vh] object-contain bg-white rounded-2xl p-4" />
          {dynamicQris && (
            <div className="mt-4 flex gap-2">
              <button onClick={e => { e.stopPropagation(); setQrisMode('dynamic'); }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${qrisMode === 'dynamic' ? 'bg-primary text-white' : 'bg-white/20 text-white'}`}>⚡ Dynamic</button>
              <button onClick={e => { e.stopPropagation(); setQrisMode('static'); }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${qrisMode === 'static' ? 'bg-white text-gray-900' : 'bg-white/20 text-white'}`}>📷 Asli</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
