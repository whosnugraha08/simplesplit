'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Bill, Friend } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import Link from 'next/link';

export default function BillsPage() {
  const [bills, setBills] = useState<(Bill & { paid_by_friend?: Friend })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadBills(); }, []);

  async function loadBills() {
    const { data } = await supabase
      .from('bills')
      .select('*, paid_by_friend:paid_by(id,name)')
      .order('created_at', { ascending: false });
    
    const loadedBills = (data as any[]) || [];
    
    // Self-healing: fix bills stuck on 'assigned' when all debts are actually paid (e.g. via netting)
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
          // Check that the bill actually has debts (not just an empty assigned bill)
          const { count } = await supabase
            .from('debts')
            .select('id', { count: 'exact', head: true })
            .eq('bill_id', bill.id);
          
          if (count && count > 0) {
            bill.status = 'settled';
            // Also fix in DB for future loads
            supabase.from('bills').update({ status: 'settled' }).eq('id', bill.id).then(() => {});
          }
        }
      }
    }
    
    setBills(loadedBills);
    setLoading(false);
  }

  const statusLabel: Record<string, { text: string; color: string }> = {
    draft: { text: 'Draft', color: 'bg-amber-500/15 text-amber-400' },
    assigned: { text: 'Dibagi', color: 'bg-blue-500/15 text-blue-400' },
    settled: { text: 'Selesai', color: 'bg-emerald-500/15 text-emerald-400' },
  };

  return (
    <div className="content-padding pt-6 pb-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Bills</h1>
          <p className="text-sm text-white/40">Riwayat split bill</p>
        </div>
        <Link
          href="/bills/new"
          className="btn-glow px-4 py-2.5 text-sm"
        >
          + Baru
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 w-full" />)}
        </div>
      ) : bills.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-4xl mb-3">🧾</p>
          <p className="text-white/50 mb-4">Belum ada bill. Yuk scan nota pertama!</p>
          <Link href="/bills/new" className="inline-block btn-glow px-5 py-2.5 text-sm">
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
                className="block glass-card p-4 card-hover animate-fade-in"
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
                      <p className="font-semibold text-white truncate">{bill.title}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${status.color}`}>
                        {status.text}
                      </span>
                    </div>
                    <p className="text-xs text-white/40">
                      Ditalangi oleh {bill.paid_by_friend?.name} • {formatDate(bill.bill_date)}
                    </p>
                  </div>
                  <p className="money text-base text-white shrink-0">
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
