const CATEGORIES = [
  { id: 'makan', label: 'Makan', emoji: '🍜' },
  { id: 'bensin', label: 'Bensin', emoji: '⛽' },
  { id: 'liburan', label: 'Liburan', emoji: '✈️' },
  { id: 'lainnya', label: 'Lainnya', emoji: '📦' },
] as const;

export type BillCategory = (typeof CATEGORIES)[number]['id'];

interface CategoryChipProps {
  value?: BillCategory | null;
  onChange: (category: BillCategory) => void;
}

export function CategoryChips({ value, onChange }: CategoryChipProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map(cat => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onChange(cat.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all btn-press ${
            value === cat.id
              ? 'bg-[var(--primary-container)] text-white '
              : 'bg-[var(--surface-container)] text-[var(--on-surface)] hover:bg-[var(--surface-container)]'
          }`}
        >
          <span>{cat.emoji}</span>
          <span>{cat.label}</span>
        </button>
      ))}
    </div>
  );
}

export { CATEGORIES };
