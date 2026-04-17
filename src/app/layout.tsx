import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ClientLayout } from './client-layout';

export const metadata: Metadata = {
  title: 'SimpleSplit — Split Bill & Debt Tracker',
  description: 'Aplikasi split bill dan pelacak hutang personal. Fleksibel, detail, gratis.',
  keywords: ['split bill', 'bagi tagihan', 'hutang', 'debt tracker'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0F172A',
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
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
