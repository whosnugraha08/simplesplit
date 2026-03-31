import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SimpleSplit — Split Bill & Debt Tracker',
  description: 'Aplikasi split bill dan pelacak hutang untuk sirkel pertemanan. Simple, cepat, gratis.',
  keywords: ['split bill', 'bagi tagihan', 'hutang', 'debt tracker'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2563EB',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-page text-text-primary">
        <main className="mx-auto max-w-lg min-h-screen">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}

function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border safe-bottom">
      <div className="mx-auto max-w-lg flex items-center justify-around h-16">
        <NavItem href="/" icon="🏠" label="Beranda" />
        <NavItem href="/bills" icon="🧾" label="Bills" />
        <NavItem href="/debts" icon="💰" label="Hutang" />
        <NavItem href="/friends" icon="👥" label="Teman" />
      </div>
    </nav>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl text-text-secondary hover:text-primary hover:bg-primary-light transition-colors min-w-[64px]"
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-[11px] font-medium">{label}</span>
    </a>
  );
}
