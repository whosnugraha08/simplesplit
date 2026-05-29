'use client';

import { useRouter } from 'next/navigation';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, back, action }: PageHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between mb-6 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {back && (
          <button
            type="button"
            onClick={() => router.back()}
            className="text-xl text-warm-muted p-1 shrink-0 btn-press"
            aria-label="Kembali"
          >
            ←
          </button>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-xl md:text-2xl font-bold text-espresso truncate">{title}</h1>
          {subtitle && <p className="text-sm text-warm-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
