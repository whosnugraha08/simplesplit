'use client';

import { dismissHint, isHintDismissed } from '@/lib/settings';
import { useEffect, useState } from 'react';

interface HintCardProps {
  hintKey: string;
  children: React.ReactNode;
}

export function HintCard({ hintKey, children }: HintCardProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!isHintDismissed(hintKey));
  }, [hintKey]);

  if (!visible) return null;

  return (
    <div className="mb-4 p-3 rounded-xl flex gap-3 animate-fade-in" style={{ background: 'var(--surface-container)', border: '1px solid var(--outline-variant)' }}>
      <span className="text-lg shrink-0">💡</span>
      <div className="flex-1 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{children}</div>
      <button
        type="button"
        onClick={() => { dismissHint(hintKey); setVisible(false); }}
        className="text-xs shrink-0 btn-press"
        style={{ color: 'var(--outline)' }}
      >
        ✕
      </button>
    </div>
  );
}
