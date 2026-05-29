import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ClientLayout } from './client-layout';

export const metadata: Metadata = {
  title: 'SimpleSplit — Split Bill & Debt Tracker',
  description: 'Aplikasi split bill dan pelacak hutang personal. Warm, cozy, 100% gratis.',
  keywords: ['split bill', 'bagi tagihan', 'hutang', 'debt tracker'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#FDF6F0',
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
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-cream text-espresso font-sans">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
