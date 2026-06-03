'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Debt, Friend, Bill } from '@/lib/types';
import { formatRupiah, formatDate, getInitials, getAvatarColor } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import Link from 'next/link';

type DebtFull = Debt & { debtor?: Friend; creditor?: Friend; bill?: Bill };

export default function AdminPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'overview' | 'users' | 'debts' | 'bills'>('overview');

  // Data
  const [friends, setFriends] = useState<Friend[]>([]);
  const [allDebts, setAllDebts] = useState<DebtFull[]>([]);
  const [allBills, setAllBills] = useState<(Bill & { paid_by_friend?: Friend })[]>([]);
  const [users, setUsers] = useState<{ id: string; username: string; display_name: string; created_at: string; friend_id?: string }[]>([]);

  useEffect(() => {
    checkAdmin();
  }, [user]);

  async function checkAdmin() {
    if (!user?.friend_id) { setLoading(false); return; }
    const { data } = await supabase.from('friends').select('is_admin').eq('id', user.friend_id).single();
    if (data?.is_admin) {
      setIsAdmin(true);
      loadAll();
    } else {
      setIsAdmin(false);
      setLoading(false);
    }
  }

  async function loadAll() {
    const [friendsRes, debtsRes, billsRes, usersRes] = await Promise.all([
      supabase.from('friends').select('*').order('name'),
      supabase.from('debts').select('*, debtor:debtor_id(id,name), creditor:creditor_id(id,name), bill:bill_id(id,title,bill_date)').order('created_at', { ascending: false }).limit(100),
      supabase.from('bills').select('*, paid_by_friend:paid_by(id,name)').order('created_at', { ascending: false }).limit(100),
      supabase.from('users').select('*').order('created_at', { ascending: false }),
    ]);

    setFriends(friendsRes.data || []);
    setAllDebts((debtsRes.data as any[]) || []);
    setAllBills((billsRes.data as any[]) || []);

    // Match users to friends
    const usersData = (usersRes.data || []).map((u: any) => {
      const linkedFriend = (friendsRes.data || []).find((f: any) => f.user_id === u.id);
      return { ...u, friend_id: linkedFriend?.id };
    });
    setUsers(usersData);

    setLoading(false);
  }

  async function resetPin(userId: string, username: string) {
    // Reset to default PIN "1234"
    const encoder = new TextEncoder();
    const data = encoder.encode('1234_simplesplit_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await supabase.from('users').update({ pin_hash: pinHash }).eq('id', userId);
    showToast(`PIN ${username} direset ke 1234`, 'success');
  }

  async function deleteDebt(debtId: string) {
    await supabase.from('debts').delete().eq('id', debtId);
    showToast('Hutang dihapus', 'success');
    loadAll();
  }

  async function toggleDebtStatus(debt: DebtFull) {
    const newStatus = debt.status === 'paid' ? 'unpaid' : 'paid';
    await supabase.from('debts').update({
      status: newStatus,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', debt.id);
    showToast(`Status diubah ke ${newStatus === 'paid' ? 'Lunas' : 'Belum Lunas'}`, 'success');
    loadAll();
  }

  if (loading) {
    return (
      <div className="content-padding pt-6">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-20 w-full" />)}</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="content-padding pt-6 text-center py-16">
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-lg font-bold mb-2">Akses Ditolak</p>
        <p className="text-[var(--outline)] text-sm mb-4">Halaman ini hanya untuk Admin.</p>
        <Link href="/" className="text-amber-400 font-semibold text-sm">← Kembali ke Beranda</Link>
      </div>
    );
  }

  const totalUnpaid = allDebts.filter(d => d.status === 'unpaid').reduce((sum, d) => sum + Number(d.amount), 0);
  const totalPaid = allDebts.filter(d => d.status === 'paid').reduce((sum, d) => sum + Number(d.amount), 0);

  const sections = [
    { key: 'overview', label: '📊 Overview', icon: '📊' },
    { key: 'users', label: '👥 Users', icon: '👥' },
    { key: 'debts', label: '💰 Semua Hutang', icon: '💰' },
    { key: 'bills', label: '🧾 Semua Bills', icon: '🧾' },
  ] as const;

  return (
    <div className="content-padding pt-6 pb-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full">ADMIN</span>
          <h1 className="text-2xl font-bold text-[var(--on-surface)]">Admin Panel</h1>
        </div>
        <p className="text-sm text-[var(--outline)]">Kelola semua data SimpleSplit</p>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 bg-[var(--navy)] rounded-2xl p-1 border border-[var(--outline-variant)] mb-6 overflow-x-auto scrollbar-hide ">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap px-3 ${
              activeSection === s.key ? 'bg-[var(--primary-container)] text-white ' : 'text-[var(--outline)] hover:text-[var(--on-surface)]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeSection === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="glass-card p-4">
              <p className="text-[10px] text-[var(--outline)] font-semibold uppercase tracking-wider">Total Users</p>
              <p className="text-2xl font-bold mt-1">{users.length}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[10px] text-[var(--outline)] font-semibold uppercase tracking-wider">Total Bills</p>
              <p className="text-2xl font-bold mt-1">{allBills.length}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[10px] text-[var(--outline)] font-semibold uppercase tracking-wider">Belum Lunas</p>
              <p className="text-2xl font-bold text-danger mt-1">{formatRupiah(totalUnpaid)}</p>
              <p className="text-[10px] text-[var(--outline)]">{allDebts.filter(d => d.status === 'unpaid').length} transaksi</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[10px] text-[var(--outline)] font-semibold uppercase tracking-wider">Sudah Lunas</p>
              <p className="text-2xl font-bold text-success mt-1">{formatRupiah(totalPaid)}</p>
              <p className="text-[10px] text-[var(--outline)]">{allDebts.filter(d => d.status === 'paid').length} transaksi</p>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h2 className="text-sm font-semibold text-[var(--outline)] mb-2">Hutang Terbaru (Belum Lunas)</h2>
            <div className="space-y-2">
              {allDebts.filter(d => d.status === 'unpaid').slice(0, 5).map(debt => (
                <div key={debt.id} className="bg-[var(--surface-container)] rounded-xl border border-[var(--outline-variant)] p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: getAvatarColor(debt.debtor?.name || '') }}>
                      {getInitials(debt.debtor?.name || '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {debt.debtor?.name} → {debt.creditor?.name}
                      </p>
                      <p className="text-[10px] text-[var(--outline)] truncate">{debt.bill?.title}</p>
                    </div>
                    <p className="money text-sm text-danger shrink-0">{formatRupiah(Number(debt.amount))}</p>
                  </div>
                </div>
              ))}
              {allDebts.filter(d => d.status === 'unpaid').length === 0 && (
                <p className="text-center text-[var(--outline)] text-sm py-4">Semua lunas! 🎉</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* USERS */}
      {activeSection === 'users' && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-xs text-[var(--outline)] mb-2">{users.length} user terdaftar</p>
          {users.map((u, idx) => {
            const friend = friends.find(f => f.user_id === u.id);
            return (
              <div key={u.id} className="glass-card p-4 animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {u.display_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{u.display_name}</p>
                      {friend?.is_admin && <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full">ADMIN</span>}
                    </div>
                    <p className="text-xs text-[var(--outline)]">@{u.username}</p>
                    <p className="text-[10px] text-[var(--outline)]">Bergabung {formatDate(u.created_at)}</p>
                  </div>
                  <button
                    onClick={() => resetPin(u.id, u.username)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-semibold hover:bg-[rgba(255,183,129,0.15)] transition shrink-0"
                  >
                    🔑 Reset PIN
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ALL DEBTS */}
      {activeSection === 'debts' && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[var(--outline)]">{allDebts.length} total hutang</p>
          </div>
          {allDebts.map((debt, idx) => (
            <div key={debt.id} className="glass-card p-4 animate-fade-in" style={{ animationDelay: `${idx * 20}ms` }}>
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-1 shrink-0 mt-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: getAvatarColor(debt.debtor?.name || '') }}>
                    {getInitials(debt.debtor?.name || '?')}
                  </div>
                  <span className="text-[10px] text-[var(--outline)]">→</span>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: getAvatarColor(debt.creditor?.name || '') }}>
                    {getInitials(debt.creditor?.name || '?')}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {debt.debtor?.name} → {debt.creditor?.name}
                  </p>
                  <p className="text-xs text-[var(--outline)] truncate">
                    {debt.bill?.title} • {formatDate(debt.bill?.bill_date || debt.created_at)}
                  </p>
                  {debt.notes && (
                    <div className="mt-1.5 bg-[var(--surface-container)] rounded-lg p-2">
                      {debt.notes.split('\n').slice(0, 3).map((line, i) => (
                        <p key={i} className="text-[10px] text-[var(--outline)]">{line}</p>
                      ))}
                      {debt.notes.split('\n').length > 3 && <p className="text-[10px] text-[var(--outline)]">...</p>}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className={`money text-sm ${debt.status === 'paid' ? 'text-success' : 'text-danger'}`}>
                    {formatRupiah(Number(debt.amount))}
                  </p>
                  <span className={`text-[10px] font-bold ${debt.status === 'paid' ? 'text-success' : 'text-amber-400'}`}>
                    {debt.status === 'paid' ? '✓ LUNAS' : 'BELUM'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 mt-3 justify-end">
                <button onClick={() => toggleDebtStatus(debt)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition ${
                    debt.status === 'paid' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                  {debt.status === 'paid' ? '↩ Batalkan' : '✓ Lunaskan'}
                </button>
                <button onClick={() => deleteDebt(debt.id)}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 text-danger text-[10px] font-semibold hover:bg-red-100 transition">
                  🗑️ Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ALL BILLS */}
      {activeSection === 'bills' && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-xs text-[var(--outline)] mb-2">{allBills.length} total bills</p>
          {allBills.map((bill, idx) => {
            const statusLabel: Record<string, { text: string; color: string }> = {
              draft: { text: 'Draft', color: 'bg-amber-500/10 text-amber-400' },
              assigned: { text: 'Dibagi', color: 'bg-blue-500/10 text-blue-400' },
              settled: { text: 'Selesai', color: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
            };
            const status = statusLabel[bill.status] || statusLabel.draft;

            return (
              <Link key={bill.id} href={`/bills/${bill.id}`}
                className="block glass-card p-4 card-hover animate-fade-in"
                style={{ animationDelay: `${idx * 20}ms` }}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: getAvatarColor(bill.paid_by_friend?.name || '') }}>
                    {getInitials(bill.paid_by_friend?.name || '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{bill.title}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${status.color}`}>{status.text}</span>
                    </div>
                    <p className="text-xs text-[var(--outline)]">
                      Ditalangi {bill.paid_by_friend?.name} • {formatDate(bill.bill_date)}
                    </p>
                  </div>
                  <p className="money text-base shrink-0">{formatRupiah(Number(bill.total_amount))}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
