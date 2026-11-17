// Settings → Security (Cam approved the mockup 2026-11-17, lanes/admin/security-mockup.html). The page's types, the
// plain-English words for each sign-in event, and the date formatting. No data is made up here: every number and line
// on the page comes from GET /api/admin/security (today's route) or, once Build ships it, GET /api/admin/security/checker.
import type { Check } from '@/lib/security-checklist';
import type { SentryIssuesResult } from '@/lib/sentry-issues';

export type Kind = 'signin_failed' | 'signin_ok' | 'locked_out' | 'second_factor_failed' | 'step_up_failed' | 'rate_limited' | 'new_device' | 'password_changed';
export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

export interface SecurityEventRow { at: string; kind: Kind; surface: string; ip: string; email: string; detail: string; browser: string }
export interface SecurityData {
  checklist: Check[];
  sentry: SentryIssuesResult;
  overview: {
    last24h: Partial<Record<Kind, number>>; last30d: Partial<Record<Kind, number>>;
    topIps: { ip: string; failed: number }[]; topEmails: { email: string; failed: number }[];
    recent: SecurityEventRow[];
    lockedNow: { who: string; email: string; until: string }[];
  };
}

/** The checker (Build's job). The shape the page reads; sent to Build 2026-11-17 and written in the PR. */
export type ApproveLabel = 'Approve fix' | 'Approve';
export interface CheckerAction { id: string; at: string; kind: 'done' | 'proposed' | 'note'; text: string; canUndo: boolean; approveLabel: ApproveLabel | null }
export interface CheckerIncident {
  id: string; title: string; courseName: string | null; at: string;
  status: 'fixed' | 'watching' | 'needs_you'; fixedHow: 'auto' | 'open' | 'none' | 'you';
  affected: string; timeline: { at: string; step: string; text: string }[];
  actionId: string | null; canUndo: boolean; approveLabel: ApproveLabel | null;
}
export interface CheckerData {
  status: 'clear' | 'needs_you';
  lastRunAt: string | null; nextRunAt: string | null;
  summary: { happened: string; didOnItsOwn: string | null; needsYou: string | null };
  actions: CheckerAction[];
  courses: { courseId: string; name: string; state: 'ok' | 'warn' | 'bad'; text: string; incidentId: string | null }[];
  incidents: CheckerIncident[];
}

/** [label, tone, what it means in plain words] — the mockup's wording. */
export const KIND: Record<Kind, [string, Tone, string]> = {
  signin_failed: ['Sign-in failed', 'warn', 'Someone typed a wrong password. Normal in small numbers.'],
  signin_ok: ['Signed in', 'ok', 'A good sign-in.'],
  locked_out: ['Locked out', 'bad', 'Too many wrong tries, so that account is paused for 15 minutes.'],
  second_factor_failed: ['Wrong second factor', 'bad', 'The password was right but the code from the phone was not. Worth a look if it repeats.'],
  step_up_failed: ['Confirm-it’s-you failed', 'bad', 'Someone signed in tried a sensitive action and failed the extra check.'],
  rate_limited: ['Too many tries', 'warn', 'One address hammered a sign-in page and was slowed down automatically.'],
  new_device: ['New owner device', 'warn', 'A new phone or computer was approved to sign in as you.'],
  password_changed: ['Password changed', 'neutral', 'A person changed their own password.'],
};
export const kindOf = (k: string): [string, Tone, string] => KIND[k as Kind] ?? [k, 'neutral', ''];

export const DOOR: Record<string, string> = { admin: 'Admin', owner: 'Owner (/cam)', course: 'Course dashboard', golfer: 'Golfer', member: 'Member' };

export const INCIDENT_STATUS: Record<CheckerIncident['status'], [string, Tone]> = { fixed: ['Fixed', 'ok'], watching: ['Watching', 'warn'], needs_you: ['Needs you', 'bad'] };
export const FIXED_HOW: Record<CheckerIncident['fixedHow'], string> = {
  auto: 'Fixed by the checker on its own.', open: 'Not fixed yet.', none: 'Nothing needed fixing.', you: 'Fixed with your approval.',
};

export const failedOf = (c: Partial<Record<Kind, number>>) => (c.signin_failed ?? 0) + (c.locked_out ?? 0) + (c.second_factor_failed ?? 0) + (c.step_up_failed ?? 0);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const TZ = 'America/New_York';
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

/** "Today" / "Yesterday" / "Nov 14", and "9:58 AM", in the company's time zone. */
export function dayAndTime(iso: string, now = new Date()): { day: string; time: string } {
  if (!iso) return { day: '—', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: '—', time: '' };
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  const today = ymd(now);
  const yesterday = ymd(new Date(now.getTime() - 24 * 3600 * 1000));
  const tomorrow = ymd(new Date(now.getTime() + 24 * 3600 * 1000));
  const day = ymd(d) === today ? 'Today' : ymd(d) === yesterday ? 'Yesterday' : ymd(d) === tomorrow ? 'Tomorrow'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
  return { day, time };
}
export const when = (iso: string, now = new Date()) => { const w = dayAndTime(iso, now); return w.time ? `${w.day} ${w.time}` : w.day; };

/** The Protections lead, as today's page words it. */
export function protectionsLead(checks: Check[]): string {
  const bad = checks.filter(c => c.status === 'bad').length;
  const warn = checks.filter(c => c.status === 'warn').length;
  if (bad) return `${plural(bad, 'protection')} ${bad === 1 ? 'is' : 'are'} off. Fix ${bad === 1 ? 'it' : 'them'} first.`;
  if (warn) return `Everything essential is on. ${plural(warn, 'thing')} could be stronger.`;
  return 'Every protection is on.';
}
