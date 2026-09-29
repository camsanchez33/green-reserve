// MP-9 (ADMIN_V4 V4-6 §3) — the one place admin pages format money and time.
// Before this, ten money formatters disagreed (no thousands separator in two,
// no sign handling in most, '—' vs '$0.00' for missing) and eighteen date
// helpers produced four formats, on a product whose business is a $1.50 fee.
// Pages import these under their old local names so call sites did not churn.
//
// Golfer-facing pages (receipt, check-in, manage) keep their own long tee-date
// wording on purpose; those take calendar-day strings, not instants.

const EASTERN = 'America/New_York';

/** Dollars → "$1,234.50" / "-$12.00"; null or undefined → "—". */
export function formatMoney(dollars: number | null | undefined): string {
  if (dollars === null || dollars === undefined || Number.isNaN(dollars)) return '—';
  const abs = Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (dollars < 0 ? '-$' : '$') + abs;
}

/** Integer cents → the same string as formatMoney(cents / 100). */
export function formatCents(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '—' : formatMoney(cents / 100);
}

/** "Sep 29, 2026" */
export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Sep 29, 2026, 3:04 PM" */
export function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "Sep 29, 3:04 PM" — a recent timestamp where the year is noise. */
export function formatStamp(d: string | Date): string {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Eastern calendar labels for instants (calls, go-live): "Sep 29". */
export function formatEasternDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: EASTERN });
}

/** "Tue, Sep 29" in Eastern. */
export function formatEasternDay(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: EASTERN });
}

// Tee dates are calendar days ("2026-09-29"), not instants. Noon keeps the day
// from sliding across midnight in any US timezone.
/** "2026-09-29" → "Sep 29". */
export function formatTeeDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "2026-09-29" → "Tue, Sep 29". */
export function formatTeeDay(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Tee sheet wall-clock "14:05" → "2:05 PM". */
export function formatTeeTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "just now" / "12s ago" / "4m ago" / "3h ago" / "2d ago". */
export function formatRelative(ts: number, nowMs: number = Date.now()): string {
  const s = Math.floor((nowMs - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
