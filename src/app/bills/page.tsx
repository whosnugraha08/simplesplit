'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Bill, Friend } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import Link from 'next/link';

const CATEGORY_EMOJI: Record<string, string> = {
  makan: '🍜',
  bensin: '⛽',
  liburan: '✈️',
  lainnya: '📦',
};

export default function BillsPage() {
  const [bills, setBills] = useState<(Bill & { paid_by_friend?: Friend; category?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadBills(); }, []);

  async function loadBills() {
    const { data } = await supabase
      .from('bills')
      .select('*, paid_by_friend:paid_by(id,name)')
      .order('created_at', { ascending: false });

    const loadedBills = (data as typeof bills) || [];

    const assignedBills = loadedBills.filter(b => b.status === 'assigned');
    if (assignedBills.length > 0) {
      const billIds = assignedBills.map(b => b.id);
      const { data: unpaidDebts } = await supabase
        .from('debts')
        .select('bill_id')
        .in('bill_id', billIds)
        .eq('status', 'unpaid');

      const billsWithUnpaid = new Set((unpaidDebts || []).map(d => d.bill_id));

      for (const bill of loadedBills) {
        if (bill.status === 'assigned' && !billsWithUnpaid.has(bill.id)) {
          const { count } = await supabase
            .from('debts')
            .select('id', { count: 'exact', head: true })
            .eq('bill_id', bill.id);

          if (count && count > 0) {
            bill.status = 'settled';
            supabase.from('bills').update({ status: 'settled' }).eq('id', bill.id).then(() => {});
          }
        }
      }
    }

    setBills(loadedBills);
    setLoading(false);
  }

  const statusLabel: Record<string, { text: string; className: string }> = {
    draft: { text: 'Draft', className: 'bg-blush text-[var(--on-surface)]/70' },
    assigned: { text: 'Dibagi', className: 'bg-primary/15 text-primary' },
    settled: { text: 'Selesai', className: 'bg-forest-light text-forest' },
  };

  return (
    <div className="content-padding pt-6 pb-4">
      <PageHeader
        title="Split Bill"
        subtitle="Riwayat split bill kamu"
        action={
          <Link href="/bills/new" className="btn-primary px-4 py-2.5 text-sm">
            + Baru
          </Link>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 w-full" />)}
        </div>
      ) : bills.length === 0 ? (
        <EmptyState
          emoji="🧾"
          title="Belum ada bill"
          description="Yuk scan nota pertama kamu!"
          action={
            <Link href="/bills/new" className="inline-block btn-primary px-5 py-2.5 text-sm">
              📸 Scan Nota
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {bills.map((bill, idx) => {
            const status = statusLabel[bill.status] || statusLabel.draft;
            const cat = (bill as { category?: string }).category || 'lainnya';
            return (
              <Link
                key={bill.id}
                href={`/bills/${bill.id}`}
                className="block warm-card p-4 card-hover animate-fade-in"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: getAvatarColor(bill.paid_by_friend?.name || '') }}
                  >
                    {getInitials(bill.paid_by_friend?.name || '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm">{CATEGORY_EMOJI[cat] || '📦'}</span>
                      <p className="font-semibold text-[var(--on-surface)] truncate">{bill.title}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${status.className}`}>
                        {status.text}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--outline)]">
                      Ditalangi {bill.paid_by_friend?.name} • {formatDate(bill.bill_date)}
                    </p>
                  </div>
                  <p className="money text-base text-[var(--on-surface)] shrink-0">
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
