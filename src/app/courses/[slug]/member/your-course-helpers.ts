// Your <Course> (lanes/golfer.md item 6): the membership line and the upcoming rows, kept out of the component so
// scripts/golfer-your-course-test.ts can test them directly.

export type SessionGroup = { kind: 'member'; name: string; color: string | null } | { kind: 'resident'; name: 'Resident'; expiresOn: string };

/** One upcoming booking (Build's 2b payload; the page shows the list only once the field is there). */
export type Upcoming = {
  bookingId: string;
  /** The booking's manage link (the same one its emails carry). */
  manageUrl: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM, 24-hour
  players: number;
  holes: number;
  membersOnlyDay?: boolean;
  /** One line of what is owed, written by the server, e.g. "$101.00 due at the course". */
  dueLine?: string | null;
};

/** GET /api/member/<slug>/session, as this page reads it. benefits, renewsOn and upcoming arrive with 2b. */
export type YourSession = {
  name: string;
  membershipType: string;
  status: string | null;
  expiresAt: string | null;
  tier?: { name: string } | null;
  groups?: SessionGroup[];
  benefits?: string | null;
  renewsOn?: string | null;
  /** #503: the last day of a membership that doesn't renew (YYYY-MM-DD). */
  expiresOn?: string | null;
  /** 2b: the membership renews itself (the course charges the saved card). */
  autoRenew?: boolean;
  /** 2b: the last renewal charge failed (autoRenewFailedAt is set). Past the date alone isn't a failure: the charge
   *  runs after the date, can be held for notice, or skipped. */
  renewalFailed?: boolean;
  upcoming?: Upcoming[];
};

export type Dot = 'ok' | 'warn' | 'bad';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/** A YYYY-MM-DD (or an ISO timestamp) that is a real calendar day: 2026-13-45 is not. */
export function isDay(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DAY.test(s)) return false;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parts(day: string) {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Mar 31, 2027" */
export function longDay(day: string): string {
  const p = parts(day);
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

function daysBetween(a: string, b: string): number {
  const pa = parts(a), pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/**
 * A dated group: green while it runs, amber in its last 30 days (unless it renews), red once the date has passed.
 * No date: green, and nothing said.
 */
export function datedStatus(endsOn: string | null | undefined, today: string, renews = false): { dot: Dot; when: string | null } {
  if (!isDay(endsOn)) return { dot: 'ok', when: null };
  const day = endsOn.slice(0, 10);
  const label = longDay(day);
  if (day < today) return { dot: 'bad', when: `ended ${label}` };
  if (renews) return { dot: 'ok', when: `renews ${label}` };
  return { dot: daysBetween(today, day) <= 30 ? 'warn' : 'ok', when: `expires ${label}` };
}

/** The membership line, or null for a golfer who is only a resident here. */
/** Said, in red, when a membership set to renew itself is past its date (Build 2026-11-18). */
export const RENEWAL_FAILED = 'Your renewal didn’t go through. Call the pro shop.';

/** Said, with an amber dot, when a membership set to renew is past its date and no charge has failed yet: the charge
 *  runs after the date and can wait for a notice period (Build 2026-11-18). */
export const RENEWAL_PENDING = 'Your renewal is being processed.';

export function membershipLine(s: YourSession, today: string = localToday()): { group: string; dot: Dot; when: string | null; problem?: string; note?: string } | null {
  const m = s.groups?.find(gr => gr.kind === 'member');
  if (!m && (s.groups?.length || s.membershipType === 'Resident')) return null;
  const group = m?.name ?? s.tier?.name ?? s.membershipType;
  // 2b says when a membership renews; until then (or if the date is unreadable) only the end date is known, so it
  // reads "expires".
  // An explicit autoRenew wins; without it, a renewsOn date means it renews.
  const renews = s.autoRenew ?? isDay(s.renewsOn);
  const day = isDay(s.renewsOn) ? s.renewsOn : isDay(s.expiresOn) ? s.expiresOn : s.expiresAt;
  const st = datedStatus(day, today, renews);
  // Only the server's own record of a failed charge says the renewal failed (Build 2026-11-18).
  if (s.renewalFailed === true) return { group, dot: 'bad', when: null, problem: RENEWAL_FAILED };
  if (renews && st.dot === 'bad') return { group, dot: 'warn', when: null, note: RENEWAL_PENDING };
  return { group, ...st };
}

/** The resident line: "Resident · expires Dec 31, 2026". */
export function residentLine(s: YourSession, today: string = localToday()): { dot: Dot; when: string | null } | null {
  const r = s.groups?.find(gr => gr.kind === 'resident');
  return r && r.kind === 'resident' ? datedStatus(r.expiresOn, today) : null;
}

/** "7:40 AM" and "Sat Nov 21" for an upcoming row. */
export function upcomingWhen(date: string, time: string): { time: string; day: string } {
  const [h, min] = time.split(':').map(Number);
  const t = Number.isFinite(h) && Number.isFinite(min) ? `${h % 12 || 12}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` : time;
  if (!isDay(date)) return { time: t, day: date };
  const p = parts(date);
  return { time: t, day: `${DAYS[p.dow]} ${MONTHS[p.m - 1]} ${p.d}` };
}

/**
 * A manage link from the payload, only if it is this site's manage page (a relative /manage/… path, or the same on
 * greenreserve.app). Anything else is null, so the payload can never put another site or a script URL in an href.
 */
export function manageHref(url: unknown): string | null {
  if (typeof url !== 'string' || /[\s\\]/.test(url)) return null;
  let u: URL;
  try { u = new URL(url, 'https://greenreserve.app'); } catch { return null; }
  if (u.origin !== 'https://greenreserve.app' || !u.pathname.startsWith('/manage/')) return null;
  return `${u.pathname}${u.search}${u.hash}`;
}
