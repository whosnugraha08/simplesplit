interface EmptyStateProps {
  emoji?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ emoji = '🍞', title, description, action }: EmptyStateProps) {
  return (
    <div className="neo-card p-8 text-center animate-fade-in">
      <div
        className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-3xl rotate-neg"
        style={{ background: 'var(--surface-container-high)', border: '2px solid var(--outline-variant)' }}
      >
        {emoji}
      </div>
      <p className="text-lg font-semibold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--on-surface)' }}>{title}</p>
      {description && (
        <p className="text-sm mt-2 max-w-xs mx-auto" style={{ color: 'var(--outline)' }}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
