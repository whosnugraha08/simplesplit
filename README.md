# SimpleSplit

Aplikasi split bill & pelacak hutang untuk sirkel pertemanan. Mobile-first, minimalist, 100% gratis.

## Features

- 📸 **Scan Nota** — OCR otomatis pakai Tesseract.js (gratis, client-side)
- 🧮 **Split Bill** — Bagi item ke teman, tax & service proporsional otomatis
- 💰 **Debt Tracker** — Siapa hutang berapa ke siapa
- 💳 **Payment Flow** — Lihat QRIS & rekening teman untuk bayar
- 👥 **Kelola Teman** — Simpan nama, bank, QRIS tiap teman
- 🗑️ **Auto-Cleanup** — History lunas >30 hari otomatis terhapus

## Tech Stack (100% Free)

- **Next.js 14** — React framework
- **Tailwind CSS 3** — Utility-first CSS
- **Supabase** — PostgreSQL database + file storage (free tier)
- **Tesseract.js** — Client-side OCR engine
- **Vercel** — Deployment (free tier)

## Setup

1. Clone repo
2. `npm install`
3. Copy `.env.example` ke `.env.local` dan isi Supabase credentials
4. Run SQL migration di Supabase SQL Editor: `supabase/migrations/001_initial_schema.sql`
5. Buat 2 storage bucket di Supabase: `receipts` (public) & `qris` (public)
6. `npm run dev`

## Deploy to Vercel

1. Push ke GitHub
2. Buka [vercel.com](https://vercel.com) dan import repo
3. Set environment variables: `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy! 🚀
