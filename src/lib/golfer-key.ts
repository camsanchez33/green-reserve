// Who a golfer is at a course: their email, else their mobile's last 10 digits, else
// their GreenReserve account — never a placeholder address. One rule, read by
// Analytics, the golfer record (lib/golfer-record) and the online-booking block.
// A key is per course in use: the same person at two courses is two records
// (Cam 2026-10-29: "Only their own history").

/** The placeholder domain counter bookings without an email use (lib/email). Kept here so this file stays client-safe. */
const PLACEHOLDER = '@noemail.greenreserve.app';

export function golferKey(b: { golferEmail?: string | null; golferPhone?: string | null; golferAccountId?: string | null }): string | null {
  const email = (b.golferEmail ?? '').trim().toLowerCase();
  if (email && !email.endsWith(PLACEHOLDER)) return `e:${email}`;
  const digits = (b.golferPhone ?? '').replace(/\D/g, '');
  if (digits.length >= 10) return `p:${digits.slice(-10)}`;
  if (b.golferAccountId) return `a:${b.golferAccountId}`;
  return null;
}

/** A key from a URL, checked: e:<email>, p:<10 digits> or a:<id>. */
export function parseGolferKey(raw: string): string | null {
  const k = raw.trim();
  if (/^e:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k) && k.length <= 202) return k.toLowerCase();
  if (/^p:\d{10}$/.test(k)) return k;
  if (/^a:[A-Za-z0-9_-]{8,40}$/.test(k)) return k;
  return null;
}

/** The bookings a key matches, as a Prisma OR (email case-insensitive, phone by its digits' tail, account by id). */
export function keyMatch(key: string): { golferEmail?: { equals: string; mode: 'insensitive' }; golferAccountId?: string; golferPhone?: { endsWith: string } } {
  if (key.startsWith('e:')) return { golferEmail: { equals: key.slice(2), mode: 'insensitive' } };
  if (key.startsWith('a:')) return { golferAccountId: key.slice(2) };
  return { golferPhone: { endsWith: key.slice(-4) } };
}
