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
  const netBalance = totalOwedToMe - totalIowe;

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
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '28px', fontWeight: 800, color: 'var(--lime)' }}>
            SimpleSplit
          </h1>
        </div>
        <Link href="/profile" className="w-12 h-12 rounded-full overflow-hidden" style={{ border: '3px solid var(--lime)' }}>
          <div className="w-full h-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--primary-container)', color: 'var(--on-primary-container)' }}>
            {user?.display_name?.slice(0, 2).toUpperCase() || '??'}
          </div>
        </Link>
      </div>

      {/* Hero Card — Net Balance */}
      <section
        className="rounded-[20px] p-6 mb-6 relative overflow-hidden animate-fade-in rotate-neg"
        style={{ background: 'var(--primary-container)', border: '2px solid var(--lime)' }}
      >
        {/* Decorative dots */}
        <div className="absolute top-4 right-4 flex gap-1">
          <div className="neo-dot" /><div className="neo-dot" /><div className="neo-dot" />
        </div>

        <p className="text-base mb-1" style={{ color: 'var(--on-primary-container)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
          Halo, {user?.display_name || 'User'} 👋
        </p>
        <p className="label-caps mb-1" style={{ color: 'var(--on-primary-container)', opacity: 0.7 }}>Net Balance</p>
        <h2 className="font-amount text-4xl mb-4" style={{ color: netBalance >= 0 ? 'var(--lime)' : 'var(--red)' }}>
          {netBalance >= 0 ? '' : '-'}Rp {formatRupiah(Math.abs(netBalance)).replace('Rp ', '')}
        </h2>

        <div className="grid grid-cols-2 gap-4 pt-3" style={{ borderTop: '1px solid rgba(225,211,255,0.2)' }}>
          <div>
            <p className="label-caps mb-1" style={{ color: 'var(--red)' }}>Kamu Hutang</p>
            <p className="font-amount money-sm" style={{ color: 'var(--on-primary-container)' }}>{formatRupiah(totalIowe)}</p>
          </div>
          <div>
            <p className="label-caps mb-1" style={{ color: 'var(--lime)' }}>Orang Hutang</p>
            <p className="font-amount money-sm" style={{ color: 'var(--on-primary-container)' }}>{formatRupiah(totalOwedToMe)}</p>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-3 gap-3 mb-6 animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Link
          href="/bills/new"
          className="neo-card flex flex-col items-center justify-center gap-2 py-4 rotate-pos btn-press"
        >
          <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--lime)' }}>receipt_long</span>
          <span className="label-caps" style={{ fontSize: '10px' }}>Split Bill</span>
        </Link>
        <Link
          href="/debts"
          className="neo-card flex flex-col items-center justify-center gap-2 py-4 rotate-neg btn-press"
        >
          <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--lime)' }}>edit_document</span>
          <span className="label-caps" style={{ fontSize: '10px' }}>Catat Hutang</span>
        </Link>
        <Link
          href="/bills/new"
          className="neo-card flex flex-col items-center justify-center gap-2 py-4 rotate-pos btn-press"
        >
          <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--lime)' }}>document_scanner</span>
          <span className="label-caps" style={{ fontSize: '10px' }}>Scan Nota</span>
        </Link>
      </section>

      {/* Netting hint */}
      {nettingPairs.length > 0 && (
        <Link href="/debts" className="block mb-4 animate-fade-in">
          <div className="neo-card p-4" style={{ borderColor: 'var(--lime)' }}>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-2xl" style={{ color: 'var(--lime)' }}>sync_alt</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: 'var(--lime)' }}>Ada hutang yang bisa di-offset!</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--outline)' }}>
                  {nettingPairs.length} pasangan hutang bisa dikurangi otomatis
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ color: 'var(--lime)' }}>chevron_right</span>
            </div>
          </div>
        </Link>
      )}

      {/* Activity Feed — Hutangku */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="neo-dot" />
          <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' as const }}>
            Hutangku
          </h3>
          <div className="flex-1" />
          <Link href="/debts" className="text-sm font-medium" style={{ color: 'var(--tertiary)' }}>
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
            {myDebts.slice(0, 5).map((debt, i) => (
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
      </section>

      {/* Piutang */}
      {owedToMe.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="neo-dot" />
            <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' as const }}>
              Yang Hutang ke Aku
            </h3>
          </div>
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
        </section>
      )}

      {/* Friends */}
      <div className="neo-card p-4 flex items-center gap-3">
        <span className="material-symbols-outlined text-2xl" style={{ color: 'var(--tertiary)' }}>group</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{friendCount} Teman</p>
          <p className="text-xs" style={{ color: 'var(--outline)' }}>di sirkel kamu</p>
        </div>
        <Link href="/friends" className="text-sm font-medium" style={{ color: 'var(--tertiary)' }}>
          Kelola →
        </Link>
      </div>
    </div>
  );
}
