'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
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

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.push('/login');
    }
  }, [loading, user, isLoginPage, router]);

  // Login page gets no nav
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-white/10 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-white/40">Memuat...</p>
        </div>
      </div>
    );
  }

  // Not logged in → show nothing (redirect happening)
  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <DesktopSidebar />

      {/* Main Content */}
      <main className="flex-1 md:ml-72 pb-20 md:pb-4">
        <div className="mx-auto max-w-4xl">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav />
    </div>
  );
}

function DesktopSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navItems = [
    { href: '/', icon: '🏠', label: 'Beranda' },
    { href: '/bills', icon: '🧾', label: 'Bills' },
    { href: '/debts', icon: '💰', label: 'Hutang' },
    { href: '/profile', icon: '👤', label: 'Profil' },
    ...(user?.is_admin ? [{ href: '/friends', icon: '👥', label: 'Teman' }] : []),
    ...(user?.is_admin ? [{ href: '/admin', icon: '⚙️', label: 'Admin' }] : []),
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-72 glass flex-col z-40">
      {/* Logo Area */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <span className="text-lg">💰</span>
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-white tracking-tight">SimpleSplit</h1>
            <p className="text-[10px] text-white/30">v2 • Personal</p>
          </div>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-amber-500/20">
            {user?.display_name?.slice(0, 2).toUpperCase() || '??'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user?.display_name}</p>
            <p className="text-[10px] text-white/30">@{user?.username}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full mt-2 px-4 py-2 rounded-xl text-xs font-medium text-white/40 hover:bg-red-500/10 hover:text-red-400 transition-colors"
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
    { href: '/', icon: '🏠', label: 'Beranda' },
    { href: '/bills', icon: '🧾', label: 'Bills' },
    { href: '/debts', icon: '💰', label: 'Hutang' },
    { href: '/profile', icon: '👤', label: 'Profil' },
    ...(user?.is_admin ? [{ href: '/admin', icon: '⚙️', label: 'Admin' }] : []),
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom"
      style={{ background: 'rgba(10, 10, 18, 0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-around h-16">
        {navItems.map(item => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[64px] transition-colors ${
                isActive
                  ? 'text-amber-400'
                  : 'text-white/35 hover:text-white/60'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className={`text-[11px] ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
              {isActive && <div className="w-1 h-1 rounded-full bg-amber-400 mt-0.5" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
