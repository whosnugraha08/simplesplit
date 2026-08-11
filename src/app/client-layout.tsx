'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import { markUserInteracted } from '@/lib/sounds';
import { scheduleKeepAlive } from '@/lib/keep-alive';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <LayoutInner>{children}</LayoutInner>
      </ToastProvider>
    </AuthProvider>
  );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    const handler = () => markUserInteracted();
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, []);

  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.push('/login');
    }
  }, [loading, user, isLoginPage, router]);

  // Keep Supabase alive when user is logged in
  useEffect(() => {
    if (user) {
      scheduleKeepAlive();
    }
  }, [user]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[var(--outline-variant)] border-t-[var(--lime)] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm" style={{ color: 'var(--outline)' }}>Memuat...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <DesktopSidebar />
      <main className="flex-1 md:ml-64 pb-28 md:pb-6 min-h-screen">
        <div className="mx-auto max-w-2xl w-full animate-page-enter">
          {children}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

const BASE_NAV_ITEMS = [
  { href: '/', icon: 'home', label: 'Home' },
  { href: '/bills', icon: 'receipt_long', label: 'Bills' },
  { href: '/debts', icon: 'account_balance_wallet', label: 'Hutang' },
];

function DesktopSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navItems = [
    ...BASE_NAV_ITEMS,
    ...(user?.is_admin ? [{ href: '/friends', icon: 'group', label: 'Teman' }] : []),
    { href: '/profile', icon: 'person', label: 'Profil' },
    ...(user?.is_admin ? [{ href: '/admin', icon: 'admin_panel_settings', label: 'Admin' }] : []),
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 flex-col z-40" style={{ background: 'var(--primary-container)', borderRight: '2px solid var(--outline-variant)' }}>
      <div className="p-6" style={{ borderBottom: '1px solid rgba(200,241,53,0.2)' }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'var(--lime)', color: '#000' }}>
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', fontWeight: 800, color: 'var(--lime)' }}>SimpleSplit</h1>
            <p className="text-[10px]" style={{ color: 'var(--on-primary-container)', opacity: 0.6 }}>v3.0 • Neo-Fin</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all btn-press ${
                isActive
                  ? ''
                  : 'hover:opacity-80'
              }`}
              style={{
                background: isActive ? 'rgba(200,241,53,0.15)' : 'transparent',
                color: isActive ? 'var(--lime)' : 'var(--on-primary-container)',
                border: isActive ? '1px solid rgba(200,241,53,0.3)' : '1px solid transparent'
              }}
            >
              <span className="material-symbols-outlined text-xl" style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4" style={{ borderTop: '1px solid rgba(200,241,53,0.2)' }}>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--lime)', color: '#000' }}>
            {user?.display_name?.slice(0, 2).toUpperCase() || '??'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--on-primary-container)' }}>{user?.display_name}</p>
            <p className="text-[10px]" style={{ color: 'var(--outline)' }}>@{user?.username}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full mt-2 px-4 py-2 rounded-xl text-xs font-medium transition-colors btn-press"
          style={{ color: 'var(--red)', background: 'rgba(255,92,92,0.1)' }}
        >
          ← Keluar
        </button>
      </div>
    </aside>
  );
}

function MobileBottomNav() {
  const { user } = useAuth();
  const pathname = usePathname();

  const navItems = [
    { href: '/', icon: 'home', label: 'Home' },
    { href: '/debts', icon: 'account_balance_wallet', label: 'Hutang' },
    { href: '/bills/new', icon: 'add_box', label: 'Add', isCenter: true },
    ...(user?.is_admin ? [{ href: '/friends', icon: 'group', label: 'Teman' }] : [{ href: '/bills', icon: 'receipt_long', label: 'Bills' }]),
    ...(user?.is_admin ? [{ href: '/admin', icon: 'admin_panel_settings', label: 'Admin' }] : [{ href: '/profile', icon: 'person', label: 'Profil' }]),
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom"
      style={{ 
        background: 'var(--surface-container-lowest)', 
        borderTop: '2px solid var(--outline-variant)',
        borderRadius: '16px 16px 0 0'
      }}
    >
      <div className="flex items-center justify-around px-2 h-20 w-full">
        {navItems.map(item => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && item.href !== '/bills/new' && pathname.startsWith(item.href));
          const isCenter = (item as any).isCenter;

          if (isCenter) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center relative btn-press"
              >
                <div
                  className="absolute -top-7 w-14 h-14 rounded-2xl flex items-center justify-center rotate-neg"
                  style={{ background: 'var(--lime)', color: '#000', border: '2px solid var(--navy)' }}
                >
                  <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>add_box</span>
                </div>
                <span className="label-caps mt-7" style={{ color: 'var(--outline)', fontSize: '10px' }}>Add</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-all btn-press`}
              style={{
                background: isActive ? 'var(--tertiary)' : 'transparent',
                color: isActive ? 'var(--on-tertiary)' : 'var(--outline)',
              }}
            >
              <span 
                className="material-symbols-outlined text-2xl" 
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              <span className="label-caps" style={{ fontSize: '10px' }}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
