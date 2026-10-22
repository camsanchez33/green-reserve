// AW-7 (Cam 2026-10-21): the admin course page's four tabs — Bookings, Money,
// Setup, Contact & notes — and which one it opens on: the tab with a problem,
// otherwise Bookings. Client-safe: no database.
import { addDaysStr } from './course-time';

export type CourseTab = 'bookings' | 'money' | 'setup' | 'contact';

export const COURSE_TABS: { key: CourseTab; label: string }[] = [
  { key: 'bookings', label: 'Bookings' },
  { key: 'money', label: 'Money' },
  { key: 'setup', label: 'Setup' },
  { key: 'contact', label: 'Contact & notes' },
];

export type SetupCheckKey = 'stripe' | 'agreement' | 'schedule' | 'staff';
export type SetupCheck = { key: SetupCheckKey; label: string; done: boolean; detail: string };

export type SetupInput = {
  stripeAccountActive: boolean;
  agreements: { signed: number; total: number; missing: unknown[] };
  agreementAccepted: boolean;
  hasSchedule: boolean;
  owner: { emailVerified: boolean } | null;
  ownerLastLoginAt: string | null;
  staffCount: number;
};

/** The four things a course needs to run on GreenReserve, each done or not. */
export function setupChecks(i: SetupInput): SetupCheck[] {
  // Every signable document signed when there are any on disk; otherwise the recorded acceptance.
  const agreementDone = i.agreements.total > 0 ? i.agreements.signed >= i.agreements.total : i.agreementAccepted;
  const ownerIn = !!i.owner && (i.owner.emailVerified || !!i.ownerLastLoginAt);
  const staff = i.staffCount === 0 ? 'no staff logins yet' : `${i.staffCount} staff login${i.staffCount === 1 ? '' : 's'}`;
  return [
    { key: 'stripe', label: 'Stripe', done: i.stripeAccountActive, detail: i.stripeAccountActive ? 'Can take payments' : 'Not connected — they can’t take payments' },
    { key: 'agreement', label: 'Agreement', done: agreementDone, detail: agreementDone ? 'Signed' : i.agreements.total > 0 ? `${i.agreements.signed} of ${i.agreements.total} signed` : 'Not signed' },
    { key: 'schedule', label: 'Schedule', done: i.hasSchedule, detail: i.hasSchedule ? 'Tee times are generated from it' : 'No schedule — no tee times' },
    { key: 'staff', label: 'Staff', done: ownerIn, detail: !i.owner ? 'No owner login' : ownerIn ? `Owner can sign in · ${staff}` : `Owner hasn’t signed in · ${staff}` },
  ];
}

export type ProblemInput = {
  archived: boolean;
  failedCharges: number;
  setup: SetupCheck[];
  unreadMessages: number;
  checkInOverdue: boolean;
};

/** Which tabs have a problem. Money first: it is money already lost. */
export function tabProblems(i: ProblemInput): Record<CourseTab, boolean> {
  if (i.archived) return { bookings: false, money: false, setup: false, contact: false };
  return {
    bookings: false,
    money: i.failedCharges > 0,
    setup: i.setup.some(s => !s.done),
    contact: i.unreadMessages > 0 || i.checkInOverdue,
  };
}

export function openingTab(i: ProblemInput, asked?: string | null): CourseTab {
  if (asked && COURSE_TABS.some(t => t.key === asked)) return asked as CourseTab;
  const p = tabProblems(i);
  return (['money', 'setup', 'contact'] as CourseTab[]).find(t => p[t]) ?? 'bookings';
}

export const COURSE_WEEKS = 8;

/** Monday of the week a YYYY-MM-DD falls in. */
export function weekStart(date: string): string {
  const d = new Date(date + 'T12:00:00Z');
  return addDaysStr(date, -((d.getUTCDay() + 6) % 7));
}

export type WeekRow = { weekStart: string; online: number; counter: number };

/**
 * Players on rounds played in each of the last COURSE_WEEKS weeks (this week
 * so far included), in the course's timezone: booked online vs entered at the
 * counter (walk-in or phone). Cancelled bookings don't count. Oldest first.
 */
export function bucketWeeks(rows: { date: string; source: string; players: number }[], today: string, weeks = COURSE_WEEKS): WeekRow[] {
  const thisWeek = weekStart(today);
  const out: WeekRow[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ weekStart: addDaysStr(thisWeek, -7 * i), online: 0, counter: 0 });
  const byWeek = new Map(out.map(w => [w.weekStart, w]));
  for (const r of rows) {
    if (r.date > today) continue;
    const w = byWeek.get(weekStart(r.date));
    if (!w) continue;
    if (r.source === 'online') w.online += r.players; else w.counter += r.players;
  }
  return out;
}
