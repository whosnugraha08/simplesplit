'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Debt, Friend, Bill, PaymentMethod } from '@/lib/types';
import { formatRupiah, getInitials, getAvatarColor } from '@/lib/formatters';

export default function PayPage() {
  const params = useParams();
  const router = useRouter();
  const debtId = params.debtId as string;

  const [debt, setDebt] = useState<(Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill }) | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPM, setSelectedPM] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [showQris, setShowQris] = useState(false);

  useEffect(() => {
    loadDebt();
  }, [debtId]);

  async function loadDebt() {
    const { data } = await supabase
      .from('debts')
      .select('*, debtor:debtor_id(*), creditor:creditor_id(*), bill:bill_id(id,title)')
      .eq('id', debtId)
      .single();

    const debtData = data as any;
    setDebt(debtData);

    // Load payment methods for the creditor
    if (debtData?.creditor_id) {
      const { data: pms } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('friend_id', debtData.creditor_id)
        .order('created_at');
      const methods = pms || [];
      setPaymentMethods(methods);
      // Auto-select first method
      if (methods.length > 0) setSelectedPM(methods[0]);
    }

    setLoading(false);
  }

  async function handleMarkPaid() {
    setMarkingPaid(true);
    await supabase
      .from('debts')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', debtId);

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

    router.push('/debts');
  }

  if (loading) {
    return (
      <div className="px-4 pt-6">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  if (!debt || !debt.creditor) {
    return (
      <div className="px-4 pt-6 text-center py-16">
        <p className="text-3xl mb-3">🤷</p>
        <p className="text-text-secondary">Data hutang tidak ditemukan</p>
      </div>
    );
  }

  const creditor = debt.creditor;
  const debtor = debt.debtor;

  return (
    <div className="px-4 pt-6 pb-4 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-xl text-text-secondary p-1">←</button>
        <div>
          <h1 className="text-xl font-bold">Bayar Hutang</h1>
          <p className="text-xs text-text-secondary">{debt.bill?.title}</p>
        </div>
      </div>

      {/* Amount Card */}
      <div className="bg-primary rounded-2xl p-6 mb-6 text-white text-center">
        <p className="text-blue-100 text-sm mb-1">Jumlah yang harus dibayar</p>
        <p className="money text-4xl text-white">{formatRupiah(Number(debt.amount))}</p>
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white/30"
            style={{ backgroundColor: getAvatarColor(debtor?.name || '') }}
          >
            {getInitials(debtor?.name || '?')}
          </div>
          <span className="text-blue-100">{debtor?.name}</span>
          <span className="text-blue-200">→</span>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white/30"
            style={{ backgroundColor: getAvatarColor(creditor.name) }}
          >
            {getInitials(creditor.name)}
          </div>
          <span className="text-blue-100">{creditor.name}</span>
        </div>
      </div>

      {/* Payment Method Selector */}
      {paymentMethods.length > 1 && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-text-secondary mb-2">Pilih Metode Pembayaran</p>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {paymentMethods.map(pm => (
              <button
                key={pm.id}
                onClick={() => setSelectedPM(pm)}
                className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedPM?.id === pm.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white text-text-secondary border border-border'
                }`}
              >
                {pm.label || pm.bank_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected Payment Method Info */}
      {selectedPM ? (
        <>
          <div className="bg-white rounded-2xl border border-border p-5 mb-4">
            <h2 className="text-sm font-semibold text-text-secondary mb-4">Transfer ke</h2>

            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: getAvatarColor(creditor.name) }}
              >
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
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedPM.account_number || '');
                      alert('Nomor rekening disalin!');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary-light text-primary text-xs font-semibold"
                  >
                    📋 Salin
                  </button>
                </div>
                <p className="text-sm text-text-secondary mt-1">{selectedPM.bank_name}</p>
              </div>
            )}

            {!selectedPM.account_number && !selectedPM.qris_image_url && (
              <div className="bg-warning-light rounded-xl p-4 text-center">
                <p className="text-sm text-yellow-700">
                  ⚠️ Data rekening/QRIS belum diisi untuk metode ini
                </p>
              </div>
            )}
          </div>

          {/* QRIS */}
          {selectedPM.qris_image_url && (
            <div className="bg-white rounded-2xl border border-border p-5 mb-6">
              <h2 className="text-sm font-semibold text-text-secondary mb-3">Scan QRIS</h2>
              <button onClick={() => setShowQris(true)} className="w-full">
                <img
                  src={selectedPM.qris_image_url}
                  alt={`QRIS ${selectedPM.label}`}
                  className="w-full max-h-64 object-contain rounded-xl border border-border"
                />
                <p className="text-xs text-primary font-medium mt-2">Tap untuk perbesar</p>
              </button>
            </div>
          )}
        </>
      ) : paymentMethods.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-8 mb-6 text-center">
          <p className="text-3xl mb-2">⚠️</p>
          <p className="text-sm text-text-secondary">
            {creditor.name} belum punya metode pembayaran.
          </p>
          <a href="/friends" className="text-sm text-primary font-semibold mt-2 inline-block">
            Tambahkan di halaman Teman →
          </a>
        </div>
      ) : null}

      {/* Action Button */}
      <button
        onClick={handleMarkPaid}
        disabled={markingPaid}
        className="w-full py-3.5 rounded-xl bg-success text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition"
      >
        {markingPaid ? 'Memproses...' : '✓ Sudah Bayar — Tandai Lunas'}
      </button>

      {/* QRIS Fullscreen Modal */}
      {showQris && selectedPM?.qris_image_url && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setShowQris(false)}
        >
          <button
            className="absolute top-4 right-4 text-white bg-white/20 rounded-full w-10 h-10 flex items-center justify-center text-lg z-10"
            onClick={() => setShowQris(false)}
          >
            ✕
          </button>
          <img
            src={selectedPM.qris_image_url}
            alt={`QRIS ${selectedPM.label}`}
            className="max-w-[95vw] max-h-[90vh] object-contain"
          />
        </div>
      )}
    </div>
  );
}
