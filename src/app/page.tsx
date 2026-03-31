'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Debt, Friend, Bill } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import { runAutoCleanup } from '@/lib/cleanup';
import Link from 'next/link';

export default function HomePage() {
  const [debts, setDebts] = useState<(Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill })[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Auto-cleanup old settled bills (30+ days) on app load
    runAutoCleanup();
    loadData();
  }, []);

  async function loadData() {
    try {
      const [debtsRes, friendsRes] = await Promise.all([
        supabase
          .from('debts')
          .select('*, debtor:debtor_id(id,name), creditor:creditor_id(id,name), bill:bill_id(id,title)')
          .eq('status', 'unpaid')
          .order('created_at', { ascending: false }),
        supabase.from('friends').select('*').order('name'),
      ]);

      setDebts((debtsRes.data as any[]) || []);
      setFriends(friendsRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totalUnpaid = debts.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">SimpleSplit</h1>
        <p className="text-sm text-text-secondary mt-0.5">Split bill, tanpa ribet.</p>
      </div>

      {/* Summary Card */}
      <div className="bg-primary rounded-2xl p-5 mb-6 text-white">
        <p className="text-blue-100 text-sm font-medium mb-1">Total Hutang Belum Lunas</p>
        <p className="money text-3xl text-white">{formatRupiah(totalUnpaid)}</p>
        <p className="text-blue-200 text-xs mt-2">{debts.length} transaksi aktif</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link
          href="/bills/new"
          className="bg-white rounded-2xl p-4 border border-border card-hover flex flex-col items-center gap-2 text-center"
        >
          <span className="text-2xl">📸</span>
          <span className="text-sm font-semibold text-text-primary">Scan Nota</span>
          <span className="text-xs text-text-secondary">Upload & split bill</span>
        </Link>
        <Link
          href="/debts"
          className="bg-white rounded-2xl p-4 border border-border card-hover flex flex-col items-center gap-2 text-center"
        >
          <span className="text-2xl">📊</span>
          <span className="text-sm font-semibold text-text-primary">Lihat Hutang</span>
          <span className="text-xs text-text-secondary">Cek siapa hutang siapa</span>
        </Link>
      </div>

      {/* Recent Debts */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Hutang Terbaru</h2>
          <Link href="/debts" className="text-sm text-primary font-medium">
            Lihat semua →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton h-20 w-full" />
            ))}
          </div>
        ) : debts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center">
            <p className="text-3xl mb-3">🎉</p>
            <p className="text-text-secondary text-sm">Belum ada hutang. Yuk mulai split bill!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {debts.slice(0, 5).map((debt, idx) => (
              <div
                key={debt.id}
                className="bg-white rounded-2xl border border-border p-4 animate-fade-in"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: getAvatarColor(debt.debtor?.name || '') }}
                  >
                    {getInitials(debt.debtor?.name || '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {debt.debtor?.name} → {debt.creditor?.name}
                    </p>
                    <p className="text-xs text-text-secondary truncate">
                      {debt.bill?.title || 'Bill'}
                    </p>
                  </div>
                  <p className="money text-base text-danger shrink-0">
                    {formatRupiah(Number(debt.amount))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Friends count */}
      <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
        <span className="text-2xl">👥</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{friends.length} Teman</p>
          <p className="text-xs text-text-secondary">di sirkel kamu</p>
        </div>
        <Link href="/friends" className="text-sm text-primary font-medium">
          Kelola →
        </Link>
      </div>
    </div>
  );
}
