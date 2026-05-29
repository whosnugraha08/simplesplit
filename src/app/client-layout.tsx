'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { markUserInteracted } from '@/lib/sounds';
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

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-blush border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-warm-muted">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <DesktopSidebar />
      <main className="flex-1 md:ml-64 pb-24 md:pb-6 min-h-screen">
        <div className="mx-auto max-w-content w-full animate-page-enter">
          {children}
        </div>
      </main>
      <MobileBottomNav />
      <FloatingActionButton />
    </div>
  );
}

const NAV_ITEMS = [
  { href: '/', icon: '🏠', label: 'Beranda' },
  { href: '/bills', icon: '🧾', label: 'Split Bill' },
  { href: '/debts', icon: '💰', label: 'Hutang' },
  { href: '/friends', icon: '👥', label: 'Teman' },
];

function DesktopSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navItems = [
    ...NAV_ITEMS,
    ...(user?.is_admin ? [{ href: '/admin', icon: '⚙️', label: 'Admin' }] : []),
    { href: '/profile', icon: '👤', label: 'Profil' },
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-warm-border flex-col z-40 shadow-warm">
      <div className="p-6 border-b border-warm-border">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-card bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-warm">
            <span className="text-lg">🍞</span>
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-espresso">SimpleSplit</h1>
            <p className="text-[10px] text-warm-muted">v2.0 • Warm & Cozy</p>
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
              className={`flex items-center gap-3 px-4 py-3 rounded-card text-sm font-medium transition-all btn-press ${
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-warm-muted hover:bg-blush/40 hover:text-espresso'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-warm-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold">
            {user?.display_name?.slice(0, 2).toUpperCase() || '??'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-espresso truncate">{user?.display_name}</p>
            <p className="text-[10px] text-warm-muted">@{user?.username}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full mt-2 px-4 py-2 rounded-card text-xs font-medium text-warm-muted hover:bg-ruby-light hover:text-ruby transition-colors btn-press"
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
    ...NAV_ITEMS,
    ...(user?.is_admin ? [{ href: '/admin', icon: '⚙️', label: 'Admin' }] : []),
    { href: '/profile', icon: '👤', label: 'Profil' },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom bg-white/95 backdrop-blur-lg border-t border-warm-border shadow-warm"
    >
      <div className="flex items-center overflow-x-auto scrollbar-hide snap-x px-2 h-16 w-full justify-between sm:justify-around">
        {navItems.map(item => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`snap-center flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[70px] shrink-0 transition-colors btn-press ${
                isActive ? 'text-primary' : 'text-warm-muted'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
              {isActive && <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
