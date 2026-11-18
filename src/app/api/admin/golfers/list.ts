// Golfers list (Cam approved the mockup 2026-11-17, lanes/admin/golfers-mockup.html): every golfer who has used
// GreenReserve on one line — name, home course, rounds, last played and a status dot — sorted by last played.
// Pure, so scripts/admin-golfers-list-test.ts pins it. One golfer is an account, plus the guest bookings made with
// the same email (as the record view joins them); a guest is everyone else, by email.
// The counts use the record's own rules (route.ts "trust"): rounds are completed bookings, a no-show is a confirmed
// past booking never checked in or paid with no decline, a late cancel kept its fee (a waived one reads 'refunded'), a failed charge is a decline
// that never checked in.

/** A receipt exists only for a round that was charged. A cancelled booking reads 'refunded' when its late fee or hold
 *  was given back, and there was no round, so no receipt. One rule for the page's button and the route's POST. */
export const canResendReceipt = (b: { status: string; paymentStatus: string }) =>
  b.status !== 'cancelled' && (b.paymentStatus === 'paid' || b.paymentStatus === 'refunded');

export type ListBooking = {
  golferAccountId: string | null; golferEmail: string; golferName: string; golferPhone: string;
  status: string; paymentStatus: string; checkedInAt: Date | null; checkInFailReason: string; cancellationFeeChargedAt: Date | null;
  createdAt: Date; courseId: string; courseName: string; teeDate: string;
};
export type ListAccount = { id: string; email: string; firstName: string; lastName: string; phone: string | null; createdAt: Date };

export const LIST_FILTERS = ['all', 'account', 'guest', 'noshow', 'failed'] as const;
export type ListFilter = typeof LIST_FILTERS[number];
export const isListFilter = (v: string): v is ListFilter => (LIST_FILTERS as readonly string[]).includes(v);

export type GolferLine = {
  key: string; id: string | null; guestEmail: string | null; name: string; email: string; phone: string;
  homeCourse: string | null; rounds: number; lastPlayed: string | null;
  noShows: number; lateCancels: number; failedCharges: number;
  tone: 'ok' | 'warn' | 'bad' | 'neutral'; latest: string;
};

export function golferLines(accounts: ListAccount[], bookings: ListBooking[], today: string): GolferLine[] {
  const byEmail = new Map(accounts.map(a => [a.email.toLowerCase(), a.id]));
  const groups = new Map<string, { account: ListAccount | null; rows: ListBooking[] }>();
  for (const a of accounts) groups.set('a:' + a.id, { account: a, rows: [] });
  for (const b of bookings) {
    const email = b.golferEmail.trim().toLowerCase();
    const acct = b.golferAccountId ?? byEmail.get(email) ?? null;
    if (!acct && !email) continue; // no account and no email: nobody to open
    const key = acct ? 'a:' + acct : 'g:' + email;
    let grp = groups.get(key);
    if (!grp) { if (acct) continue; grp = { account: null, rows: [] }; groups.set(key, grp); } // an account we weren't given
    grp.rows.push(b);
  }

  const lines: GolferLine[] = [];
  for (const [key, { account, rows }] of groups) {
    const played = rows.filter(r => r.status === 'completed');
    const noShows = rows.filter(r => r.status === 'confirmed' && r.teeDate < today && !r.checkedInAt && r.paymentStatus !== 'paid' && !r.checkInFailReason).length;
    const lateCancels = rows.filter(r => r.status === 'cancelled' && r.cancellationFeeChargedAt && r.paymentStatus === 'cancellation_fee_charged').length;
    const failedCharges = rows.filter(r => r.checkInFailReason && !r.checkedInAt).length;
    // Home course: where they've played most; a tie goes to the more recent. No rounds yet: their latest booking's.
    const per = new Map<string, { n: number; last: string }>();
    for (const r of played) { const c = per.get(r.courseName) ?? { n: 0, last: '' }; c.n++; if (r.teeDate > c.last) c.last = r.teeDate; per.set(r.courseName, c); }
    const newest = [...rows].sort((a, z) => z.teeDate.localeCompare(a.teeDate))[0];
    const home = [...per.entries()].sort((a, z) => z[1].n - a[1].n || z[1].last.localeCompare(a[1].last))[0]?.[0] ?? newest?.courseName ?? null;
    const lastPlayed = played.reduce<string | null>((m, r) => (m === null || r.teeDate > m ? r.teeDate : m), null);
    const latestBooked = rows.reduce((m, r) => (r.createdAt.toISOString() > m ? r.createdAt.toISOString() : m), account?.createdAt.toISOString() ?? '');
    const named = rows.find(r => r.golferName.trim()) ?? null;
    const name = account ? `${account.firstName} ${account.lastName}`.trim() : named?.golferName.trim() ?? '';
    const email = account?.email ?? key.slice(2);
    const phone = account?.phone ?? rows.find(r => r.golferPhone)?.golferPhone ?? '';
    lines.push({
      key, id: account?.id ?? null, guestEmail: account ? null : email, name: name || email, email, phone,
      homeCourse: home, rounds: played.length, lastPlayed, noShows, lateCancels, failedCharges,
      tone: failedCharges ? 'bad' : noShows || lateCancels ? 'warn' : account ? 'ok' : 'neutral',
      latest: latestBooked,
    });
  }
  // Last played first; never played goes after, newest activity first.
  return lines.sort((a, z) => (z.lastPlayed ?? '').localeCompare(a.lastPlayed ?? '') || z.latest.localeCompare(a.latest) || a.name.localeCompare(z.name));
}

export function matchesFilter(l: GolferLine, f: ListFilter): boolean {
  if (f === 'account') return l.id !== null;
  if (f === 'guest') return l.id === null;
  if (f === 'noshow') return l.noShows > 0 || l.lateCancels > 0;
  if (f === 'failed') return l.failedCharges > 0;
  return true;
}

export function matchesQuery(l: GolferLine, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if ((l.name + ' ' + l.email).toLowerCase().includes(s)) return true;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 4 && l.phone.replace(/\D/g, '').includes(digits);
}
