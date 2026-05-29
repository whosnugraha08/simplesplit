'use client';

import { useState } from 'react';

export function FormHelper({ text }: { text: string }) {
  return <p className="text-xs text-warm-muted mt-1">{text}</p>;
}

export function FieldTooltip({ label, hint }: { label: string; hint: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center gap-1">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-4 h-4 rounded-full bg-blush text-espresso/60 text-[10px] font-bold hover:bg-primary-light"
        aria-label="Info"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-0 top-full mt-1 z-50 w-56 p-2 text-xs bg-espresso text-cream rounded-lg shadow-warm">
          {hint}
        </span>
      )}
    </span>
  );
}
