'use client';

import Link from 'next/link';
import { formatRupiah } from '@/lib/formatters';
import { getInitials, getAvatarColor } from '@/lib/formatters';
import { StatusBadge, OverdueBadge } from './StatusBadge';

interface DebtCardProps {
  id: string;
  name: string;
  subtitle?: string;
  amount: number;
  variant?: 'owe' | 'owed';
  status?: 'unpaid' | 'paid' | 'pending';
  createdAt?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
  exiting?: boolean;
}

function daysSince(dateStr?: string): number {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function DebtCard({
  id,
  name,
  subtitle,
  amount,
  variant = 'owe',
  status = 'unpaid',
  createdAt,
  href,
  onClick,
  className = '',
  exiting = false,
}: DebtCardProps) {
  const days = daysSince(createdAt);
  const content = (
    <div
      className={`neo-card p-4 neo-card-hover flex items-center gap-3 transition-all duration-300 ${
        exiting ? 'opacity-0 translate-x-8 scale-95' : 'animate-fade-in'
      } ${className}`}
      onClick={onClick}
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 animate-pop-in"
        style={{ 
          backgroundColor: variant === 'owed' ? 'var(--lime)' : 'var(--primary-container)',
          color: variant === 'owed' ? '#000' : 'var(--on-primary-container)',
          border: `3px solid ${variant === 'owed' ? 'var(--lime)' : 'var(--primary)'}`,
        }}
      >
        {getInitials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--on-surface)' }}>{name}</p>
          <StatusBadge status={status} />
          <OverdueBadge days={days} />
        </div>
        {subtitle && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--outline)' }}>{subtitle}</p>
        )}
      </div>
      <p className="font-amount money-lg shrink-0" style={{ color: variant === 'owe' ? 'var(--red)' : 'var(--lime)' }}>
        {variant === 'owed' ? '+' : '-'}{formatRupiah(amount)}
      </p>
    </div>
  );

  if (href) {
    return (
      <Link key={id} href={href} className="block">
        {content}
      </Link>
    );
  }

  return <div key={id}>{content}</div>;
}
