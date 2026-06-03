type DebtStatus = 'unpaid' | 'paid' | 'pending';

const config: Record<DebtStatus, { label: string; style: React.CSSProperties }> = {
  unpaid: {
    label: 'Belum Bayar',
    style: { background: 'rgba(255,92,92,0.15)', color: 'var(--red)', border: '1px solid var(--red)' }
  },
  pending: {
    label: 'Menunggu',
    style: { background: 'rgba(255,183,129,0.15)', color: 'var(--lime)', border: '1px solid var(--tertiary)' }
  },
  paid: {
    label: '✅ Lunas',
    style: { background: 'rgba(200,241,53,0.15)', color: 'var(--lime)', border: 'none' }
  },
};

export function StatusBadge({ status }: { status: DebtStatus }) {
  const { label, style } = config[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full font-bold uppercase"
      style={{ ...style, fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.03em' }}
    >
      {label}
    </span>
  );
}

export function OverdueBadge({ days }: { days: number }) {
  if (days < 7) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full"
      style={{ 
        background: 'var(--surface-container-high)', 
        color: 'var(--outline)', 
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600
      }}
    >
      {days}d ago
    </span>
  );
}
