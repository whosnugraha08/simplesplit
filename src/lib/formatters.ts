/**
 * Format number to Indonesian Rupiah string
 * Example: 50000 → "Rp 50.000"
 */
export function formatRupiah(amount: number): string {
  const rounded = Math.round(amount);
  return 'Rp ' + rounded.toLocaleString('id-ID');
}

/**
 * Format date to Indonesian locale
 * Example: "2024-01-15" → "15 Jan 2024"
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format date with time
 */
export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get initials from name (for avatar)
 * Example: "Faiz Ahmad" → "FA" 
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Generate a consistent color from a name (for avatar backgrounds)
 */
export function getAvatarColor(name: string): string {
  const colors = [
    '#2563EB', '#7C3AED', '#DB2777', '#EA580C',
    '#16A34A', '#0891B2', '#4F46E5', '#C026D3',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Parse a price string from OCR text into a number
 * Handles formats like: "50.000", "50,000", "50000", "Rp 50.000"
 */
export function parsePrice(priceStr: string): number {
  // Remove currency symbols and whitespace
  let cleaned = priceStr.replace(/[Rr]p\.?\s*/g, '').trim();
  
  // Determine if dots are thousands separators (Indonesian format)
  // If there's a dot followed by exactly 3 digits at the end, it's a thousands separator
  if (/\.\d{3}$/.test(cleaned) && !cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '');
  } else if (/,\d{3}$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  }
  
  // Remove any remaining non-numeric characters except dots and minus
  cleaned = cleaned.replace(/[^\d.-]/g, '');
  
  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}
