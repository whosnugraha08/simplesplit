'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Debt, Friend, Bill } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import { runAutoCleanup } from '@/lib/cleanup';
import Link from 'next/link';

export default function HomePage() {
  const { user } = useAuth();
  const [myDebts, setMyDebts] = useState<(Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill })[]>([]);
  const [owedToMe, setOwedToMe] = useState<(Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill })[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runAutoCleanup();
    if (user?.friend_id) loadData();
    else setLoading(false);
  }, [user]);

  async function loadData() {
    try {
      const friendId = user!.friend_id;

      const [myDebtsRes, owedRes, friendsRes] = await Promise.all([
        // My debts (I owe someone)
        supabase
          .from('debts')
          .select('*, debtor:debtor_id(id,name), creditor:creditor_id(id,name), bill:bill_id(id,title)')
          .eq('debtor_id', friendId)
          .eq('status', 'unpaid')
          .order('created_at', { ascending: false }),
        // Owed to me (someone owes me)
        supabase
          .from('debts')
          .select('*, debtor:debtor_id(id,name), creditor:creditor_id(id,name), bill:bill_id(id,title)')
          .eq('creditor_id', friendId)
          .eq('status', 'unpaid')
          .order('created_at', { ascending: false }),
        supabase.from('friends').select('id'),
      ]);

      setMyDebts((myDebtsRes.data as any[]) || []);
      setOwedToMe((owedRes.data as any[]) || []);
      setFriendCount(friendsRes.data?.length || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totalIowe = myDebts.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalOwedToMe = owedToMe.reduce((sum, d) => sum + Number(d.amount), 0);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Pagi';
    if (hour < 15) return 'Siang';
    if (hour < 18) return 'Sore';
    return 'Malam';
  })();

  return (
    <div className="content-padding pt-6 pb-4">
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <p className="text-sm text-text-secondary">Selamat {greeting} 👋</p>
        <h1 className="text-2xl font-extrabold text-text-primary">{user?.display_name || 'User'}</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-4 text-white animate-fade-in" style={{ animationDelay: '50ms' }}>
          <p className="text-white/70 text-xs font-medium mb-1">Aku Hutang</p>
          <p className="money text-2xl text-white">{formatRupiah(totalIowe)}</p>
          <p className="text-white/50 text-[10px] mt-1">{myDebts.length} transaksi</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white animate-fade-in" style={{ animationDelay: '100ms' }}>
          <p className="text-white/70 text-xs font-medium mb-1">Piutangku</p>
          <p className="money text-2xl text-white">{formatRupiah(totalOwedToMe)}</p>
          <p className="text-white/50 text-[10px] mt-1">{owedToMe.length} transaksi</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link
          href="/bills/new"
          className="bg-white rounded-2xl p-4 border border-border card-hover flex flex-col items-center gap-2 text-center animate-fade-in"
          style={{ animationDelay: '150ms' }}
        >
          <span className="text-2xl">📸</span>
          <span className="text-sm font-semibold text-text-primary">Scan Nota</span>
          <span className="text-xs text-text-secondary">Upload & split bill</span>
        </Link>
        <Link
          href="/debts"
          className="bg-white rounded-2xl p-4 border border-border card-hover flex flex-col items-center gap-2 text-center animate-fade-in"
          style={{ animationDelay: '200ms' }}
        >
          <span className="text-2xl">📊</span>
          <span className="text-sm font-semibold text-text-primary">Lihat Hutang</span>
          <span className="text-xs text-text-secondary">Detail hutang & piutang</span>
        </Link>
      </div>

      {/* My Debts (I owe) */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Hutangku</h2>
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
        ) : myDebts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-6 text-center">
            <p className="text-2xl mb-2">🎉</p>
            <p className="text-text-secondary text-sm">Tidak ada hutang! Kamu bebas!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myDebts.slice(0, 5).map((debt, idx) => (
              <Link
                key={debt.id}
                href={`/pay/${debt.id}`}
                className="block bg-white rounded-2xl border border-border p-4 card-hover animate-fade-in"
                style={{ animationDelay: `${(idx + 3) * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: getAvatarColor(debt.creditor?.name || '') }}
                  >
                    {getInitials(debt.creditor?.name || '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      ke {debt.creditor?.name}
                    </p>
                    <p className="text-xs text-text-secondary truncate">
                      {debt.bill?.title || 'Bill'}
                    </p>
                  </div>
                  <p className="money text-base text-danger shrink-0">
                    {formatRupiah(Number(debt.amount))}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Owed to me */}
      {owedToMe.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Yang Hutang ke Aku</h2>
          </div>
          <div className="space-y-3">
            {owedToMe.slice(0, 3).map((debt, idx) => (
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
                      {debt.debtor?.name}
                    </p>
                    <p className="text-xs text-text-secondary truncate">
                      {debt.bill?.title || 'Bill'}
                    </p>
                  </div>
                  <p className="money text-base text-success shrink-0">
                    +{formatRupiah(Number(debt.amount))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends count */}
      <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3 animate-fade-in">
        <span className="text-2xl">👥</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{friendCount} Teman</p>
          <p className="text-xs text-text-secondary">di sirkel kamu</p>
        </div>
        <Link href="/friends" className="text-sm text-primary font-medium">
          Kelola →
        </Link>
      </div>
    </div>
  );
}
