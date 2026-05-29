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
    <div className="mb-4 p-3 rounded-card bg-blush/50 border border-primary/15 flex gap-3 animate-fade-in">
      <span className="text-lg shrink-0">💡</span>
      <div className="flex-1 text-sm text-espresso/80">{children}</div>
      <button
        type="button"
        onClick={() => {
          dismissHint(hintKey);
          setVisible(false);
        }}
        className="text-warm-muted hover:text-espresso text-xs shrink-0"
      >
        ✕
      </button>
    </div>
  );
}
