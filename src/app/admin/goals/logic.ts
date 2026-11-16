// Settings → Goals (Cam approved the mockup 2026-11-16, lanes/admin/goals-mockup.html; lanes/admin.md "Approved, to
// build: Settings → Goals"). Pure helpers: the page works the pace out here from what /api/admin/goals already returns
// (start, due, current, target), so the API doesn't change and the maths can be tested.
//
// Pace (Cam): green when ahead of where it should be by today, amber when within 10% under it, red when further behind.
// "Where it should be by today" is target × the share of the time gone. That is the same test as the shared GOAL-PACE
// rule (projected end ≥ target, or within 10% of it), so this uses goalPace() from src/lib/goal-pace — including its
// first-three-days "too early to tell" (Cam 2026-11-12), so a goal set an hour ago isn't red.
import { goalPace, projectAtEnd, EARLY_DAYS, type PaceTone } from '@/lib/goal-pace';

export type Metric = 'courses_live' | 'online_rounds' | 'fees';
export interface Goal {
  id: string; metric: Metric; label: string; unit: 'count' | 'cents';
  target: number; current: number; startsAt: string; dueAt: string; createdBy: string;
  status: 'met' | 'on_pace' | 'behind' | 'missed'; daysLeft: number;
}

export const METRICS: { key: Metric; label: string; hint: string }[] = [
  { key: 'courses_live', label: 'Live courses', hint: 'Counted as of today.' },
  { key: 'online_rounds', label: 'Online bookings', hint: 'Counted from the day it’s set until the date.' },
  { key: 'fees', label: 'GreenReserve fees', hint: 'Counted from the day it’s set until the date.' },
];
export const metricLabel = (m: Metric) => METRICS.find(x => x.key === m)?.label ?? m;

const DAY = 86_400_000;

/** A count, or cents shown as whole dollars ("$5,000", as the mockup). */
export function fmt(unit: Goal['unit'], n: number): string {
  return unit === 'cents' ? '$' + Math.round(n / 100).toLocaleString('en-US') : Math.round(n).toLocaleString('en-US');
}

const ET = 'America/New_York';
/** The due day: dueAt is the END of that day (the next platform midnight), so step back a moment. "Dec 31, 2026". */
export const dueDay = (iso: string) => new Date(new Date(iso).getTime() - 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: ET });
/** "Oct 1" this year, "Oct 1, 2025" another year. */
export function startDay(iso: string, now: number): string {
  const d = new Date(iso);
  const y = (x: Date) => x.toLocaleDateString('en-US', { year: 'numeric', timeZone: ET });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y(d) === y(new Date(now)) ? {} : { year: 'numeric' }), timeZone: ET });
}

export type Tone = 'ok' | 'warn' | 'bad' | 'early';
const WORD: Record<PaceTone, string> = { ok: 'Ahead of pace', warn: 'Close to pace', bad: 'Behind pace', early: 'Too early to tell' };

export interface GoalView {
  finished: boolean;
  tone: Tone;
  word: string;          // "Ahead of pace" … or "Reached" / "Missed"
  pct: number;           // 0–100, the bar and the big number
  progress: string;      // "4 of 10"
  // Running goals only:
  markPct?: number;      // where it should be by today, 0–100
  shouldBe?: string;     // "Should be at 5 by today (1 behind)"
  daysLeft?: string;     // "45 days left"
  started?: string;
  toGo?: string;
  perWeek?: string;
  endsAt?: string;
}

/** Everything one goal row shows, at `now` (ms). Reached and missed come from the API's status. */
export function goalView(g: Goal, now: number): GoalView {
  const progress = `${fmt(g.unit, g.current)} of ${fmt(g.unit, g.target)}`;
  const share0 = g.target > 0 ? Math.min(1, Math.max(0, g.current / g.target)) : 0;
  if (g.status === 'met' || g.status === 'missed') {
    const met = g.status === 'met';
    return { finished: true, tone: met ? 'ok' : 'bad', word: met ? 'Reached' : 'Missed', pct: met ? 100 : Math.floor(share0 * 100), progress };
  }
  const start = new Date(g.startsAt).getTime(), due = new Date(g.dueAt).getTime();
  const span = due - start;
  const share = span > 0 ? Math.min(1, Math.max(0, (now - start) / span)) : 1;
  const daysElapsed = Math.max(0, (now - start) / DAY);
  const { tone } = goalPace({ progress: g.current, target: g.target, share, daysElapsed });

  const expected = g.target * share;
  const diff = g.current - expected;
  const d = g.unit === 'cents' ? Math.round(Math.abs(diff) / 100) : Math.round(Math.abs(diff));
  const diffText = d === 0 ? '' : ` (${fmt(g.unit, g.unit === 'cents' ? d * 100 : d)} ${diff >= 0 ? 'ahead' : 'behind'})`;

  const need = Math.max(0, g.target - g.current);
  const weeksLeft = Math.max(0, due - now) / (7 * DAY);
  // A week or less left: all of it is needed this week, never more than what's left.
  const per = weeksLeft > 0 ? Math.min(need, need / weeksLeft) : need;
  let perWeek: string;
  if (g.unit === 'cents') perWeek = fmt('cents', Math.ceil(per / 100) * 100);
  else if (g.metric === 'courses_live') { const v = Math.ceil(per * 10) / 10; perWeek = `${v} ${v === 1 ? 'course' : 'courses'}`; }
  else { const v = Math.ceil(per); perWeek = `${v.toLocaleString('en-US')} ${v === 1 ? 'booking' : 'bookings'}`; }

  return {
    finished: false, tone, word: WORD[tone],
    pct: Math.floor(share0 * 100), progress,
    markPct: Math.round(share * 100),
    shouldBe: `Should be at ${fmt(g.unit, expected)} by today${diffText}`,
    daysLeft: `${g.daysLeft} ${g.daysLeft === 1 ? 'day' : 'days'} left`,
    started: startDay(g.startsAt, now),
    toGo: fmt(g.unit, need),
    perWeek,
    // A few hours of progress can't say where it ends (the same early days as the pace word).
    endsAt: daysElapsed < EARLY_DAYS ? 'Too early to tell' : fmt(g.unit, projectAtEnd(g.current, share)),
  };
}
