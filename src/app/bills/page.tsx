'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Bill, Friend } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import Link from 'next/link';

export default function BillsPage() {
  const [bills, setBills] = useState<(Bill & { paid_by_friend?: Friend })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBills();
  }, []);

  async function loadBills() {
    const { data } = await supabase
      .from('bills')
      .select('*, paid_by_friend:paid_by(id,name)')
      .order('created_at', { ascending: false });
    setBills((data as any[]) || []);
    setLoading(false);
  }

  const statusLabel: Record<string, { text: string; color: string }> = {
    draft: { text: 'Draft', color: 'bg-warning-light text-yellow-700' },
    assigned: { text: 'Dibagi', color: 'bg-primary-light text-primary' },
    settled: { text: 'Selesai', color: 'bg-success-light text-success' },
  };

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bills</h1>
          <p className="text-sm text-text-secondary">Riwayat split bill</p>
        </div>
        <Link
          href="/bills/new"
          className="bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors active:scale-95"
        >
          + Baru
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 w-full" />)}
        </div>
      ) : bills.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <p className="text-4xl mb-3">🧾</p>
          <p className="text-text-secondary mb-4">Belum ada bill. Yuk scan nota pertama!</p>
          <Link
            href="/bills/new"
            className="inline-block bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            📸 Scan Nota
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map((bill, idx) => {
            const status = statusLabel[bill.status] || statusLabel.draft;
            return (
              <Link
                key={bill.id}
                href={`/bills/${bill.id}`}
                className="block bg-white rounded-2xl border border-border p-4 card-hover animate-fade-in"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5"
                    style={{ backgroundColor: getAvatarColor(bill.paid_by_friend?.name || '') }}
                  >
                    {getInitials(bill.paid_by_friend?.name || '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold truncate">{bill.title}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${status.color}`}>
                        {status.text}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary">
                      Ditalangi oleh {bill.paid_by_friend?.name} • {formatDate(bill.bill_date)}
                    </p>
                  </div>
                  <p className="money text-base text-text-primary shrink-0">
                    {formatRupiah(Number(bill.total_amount))}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
