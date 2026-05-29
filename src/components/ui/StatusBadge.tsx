type DebtStatus = 'unpaid' | 'paid' | 'pending';

const config: Record<DebtStatus, { label: string; className: string }> = {
  unpaid: { label: 'Belum Bayar', className: 'bg-ruby-light text-ruby' },
  pending: { label: 'Menunggu Konfirmasi', className: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Lunas', className: 'bg-forest-light text-forest' },
};

export function StatusBadge({ status }: { status: DebtStatus }) {
  const { label, className } = config[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

export function OverdueBadge({ days }: { days: number }) {
  if (days < 7) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blush text-espresso/70">
      Sudah {days} hari
    </span>
  );
}
