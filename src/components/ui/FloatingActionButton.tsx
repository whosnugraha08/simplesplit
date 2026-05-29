'use client';

import Link from 'next/link';
import { useState } from 'react';

export function FloatingActionButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 overlay"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="md:hidden fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2">
        {open && (
          <>
            <Link
              href="/bills/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-warm text-sm font-semibold text-espresso animate-slide-up btn-press"
            >
              📸 Split Bill Baru
            </Link>
            <Link
              href="/debts"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-warm text-sm font-semibold text-espresso animate-slide-up btn-press"
              style={{ animationDelay: '50ms' }}
            >
              💰 Lihat Hutang
            </Link>
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`w-14 h-14 rounded-full btn-primary flex items-center justify-center text-2xl shadow-warm-lg btn-press transition-transform ${
            open ? 'rotate-45' : ''
          }`}
          aria-label="Aksi utama"
        >
          +
        </button>
      </div>
    </>
  );
}
