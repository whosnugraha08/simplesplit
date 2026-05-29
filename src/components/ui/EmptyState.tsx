interface EmptyStateProps {
  emoji?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ emoji = '🍞', title, description, action }: EmptyStateProps) {
  return (
    <div className="warm-card p-8 text-center animate-fade-in">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blush flex items-center justify-center text-3xl">
        {emoji}
      </div>
      <p className="font-display text-lg font-semibold text-espresso">{title}</p>
      {description && (
        <p className="text-sm text-warm-muted mt-2 max-w-xs mx-auto">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
