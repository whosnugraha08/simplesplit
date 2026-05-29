'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Debt, Friend, Bill } from '@/lib/types';
import { formatRupiah } from '@/lib/formatters';
import { runAutoCleanup } from '@/lib/cleanup';
import { calculateNettingSummary, NettingPair } from '@/lib/netting';
import { DebtCard } from '@/components/ui/DebtCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { HintCard } from '@/components/ui/HintCard';
import Link from 'next/link';

export default function HomePage() {
  const { user } = useAuth();
  const [myDebts, setMyDebts] = useState<(Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill })[]>([]);
  const [owedToMe, setOwedToMe] = useState<(Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill })[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nettingPairs, setNettingPairs] = useState<NettingPair[]>([]);

  useEffect(() => {
    runAutoCleanup();
    if (user?.friend_id) loadData();
    else setLoading(false);
  }, [user]);

  async function loadData() {
    try {
      const friendId = user!.friend_id;

      const [myDebtsRes, owedRes, friendsRes] = await Promise.all([
        supabase
          .from('debts')
          .select('*, debtor:debtor_id(id,name), creditor:creditor_id(id,name), bill:bill_id(id,title)')
          .eq('debtor_id', friendId)
          .eq('status', 'unpaid')
          .order('created_at', { ascending: false }),
        supabase
          .from('debts')
          .select('*, debtor:debtor_id(id,name), creditor:creditor_id(id,name), bill:bill_id(id,title)')
          .eq('creditor_id', friendId)
          .eq('status', 'unpaid')
          .order('created_at', { ascending: false }),
        supabase.from('friends').select('id'),
      ]);

      setMyDebts((myDebtsRes.data as typeof myDebts) || []);
      setOwedToMe((owedRes.data as typeof owedToMe) || []);
      setFriendCount(friendsRes.data?.length || 0);

      try {
        const pairs = await calculateNettingSummary(friendId!);
        setNettingPairs(pairs);
      } catch {
        /* optional */
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totalIowe = myDebts.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalOwedToMe = owedToMe.reduce((sum, d) => sum + Number(d.amount), 0);
  const creditorCount = new Set(myDebts.map(d => d.creditor_id)).size;

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Pagi';
    if (hour < 15) return 'Siang';
    if (hour < 18) return 'Sore';
    return 'Malam';
  })();

  return (
    <div className="content-padding pt-6 pb-4">
      <div className="mb-6 animate-fade-in">
        <p className="text-sm text-warm-muted">Selamat {greeting} 👋</p>
        <h1 className="font-display text-2xl font-bold text-espresso">
          {user?.display_name || 'User'}
        </h1>
      </div>

      {/* Summary banner */}
      {totalIowe > 0 && (
        <div className="warm-card p-4 mb-6 flex items-center gap-3 bg-gradient-to-r from-blush to-cream animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-2xl shrink-0">
            💸
          </div>
          <div>
            <p className="text-sm text-warm-muted">Ringkasan hutangmu</p>
            <p className="font-display text-lg font-semibold text-espresso">
              Kamu punya hutang {formatRupiah(totalIowe)} ke {creditorCount} orang
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="warm-card p-4 border-ruby/20 bg-ruby-light/30 animate-fade-in">
          <p className="text-warm-muted text-xs font-medium mb-1">Aku Hutang</p>
          <p className="money text-xl text-ruby">{formatRupiah(totalIowe)}</p>
          <p className="text-warm-muted text-[10px] mt-1">{myDebts.length} transaksi</p>
        </div>
        <div className="warm-card p-4 border-forest/20 bg-forest-light animate-fade-in" style={{ animationDelay: '50ms' }}>
          <p className="text-warm-muted text-xs font-medium mb-1">Piutangku</p>
          <p className="money text-xl text-forest">{formatRupiah(totalOwedToMe)}</p>
          <p className="text-warm-muted text-[10px] mt-1">{owedToMe.length} transaksi</p>
        </div>
      </div>

      {nettingPairs.length > 0 && (
        <Link href="/debts" className="block mb-4 animate-fade-in">
          <div className="warm-card p-4 border-primary/25 bg-primary/5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔄</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-primary">Ada hutang yang bisa di-offset!</p>
                <p className="text-[11px] text-warm-muted mt-0.5">
                  {nettingPairs.length} pasangan hutang bisa dikurangi otomatis
                </p>
              </div>
              <span className="text-primary text-sm">→</span>
            </div>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href="/bills/new" className="warm-card p-4 card-hover flex flex-col items-center gap-2 text-center">
          <span className="text-2xl">📸</span>
          <span className="text-sm font-semibold text-espresso">Scan Nota</span>
          <span className="text-xs text-warm-muted">Upload & split bill</span>
        </Link>
        <Link href="/debts" className="warm-card p-4 card-hover flex flex-col items-center gap-2 text-center">
          <span className="text-2xl">📊</span>
          <span className="text-sm font-semibold text-espresso">Lihat Hutang</span>
          <span className="text-xs text-warm-muted">Detail hutang & piutang</span>
        </Link>
      </div>

      <HintCard hintKey="home_debts_empty">
        Belum ada hutang? Buat split bill pertama kamu dengan tap <strong>(+)</strong> di pojok kanan bawah.
      </HintCard>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-bold text-espresso">Hutangku</h2>
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
          <EmptyState
            emoji="🎉"
            title="Tidak ada hutang!"
            description="Kamu bebas — waktunya traktir teman?"
          />
        ) : (
          <div className="space-y-3">
            {myDebts.slice(0, 5).map(debt => (
              <DebtCard
                key={debt.id}
                id={debt.id}
                href={`/pay/${debt.id}`}
                name={`ke ${debt.creditor?.name}`}
                subtitle={debt.bill?.title || 'Bill'}
                amount={Number(debt.amount)}
                variant="owe"
                status="unpaid"
                createdAt={debt.created_at}
              />
            ))}
          </div>
        )}
      </div>

      {owedToMe.length > 0 && (
        <div className="mb-6">
          <h2 className="font-display text-lg font-bold text-espresso mb-3">Yang Hutang ke Aku</h2>
          <div className="space-y-3">
            {owedToMe.slice(0, 3).map(debt => (
              <DebtCard
                key={debt.id}
                id={debt.id}
                name={debt.debtor?.name || '?'}
                subtitle={debt.bill?.title || 'Bill'}
                amount={Number(debt.amount)}
                variant="owed"
                status="unpaid"
                createdAt={debt.created_at}
              />
            ))}
          </div>
        </div>
      )}

      <div className="warm-card p-4 flex items-center gap-3">
        <span className="text-2xl">👥</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-espresso">{friendCount} Teman</p>
          <p className="text-xs text-warm-muted">di sirkel kamu</p>
        </div>
        <Link href="/friends" className="text-sm text-primary font-medium">
          Kelola →
        </Link>
      </div>
    </div>
  );
}
