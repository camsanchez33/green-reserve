// INQUIRY_CALL_SPEC IC-1 §2 — the discovery-call agenda catalog, and the
// small derivations the sheet, the detail page and the queue share.
//
// The catalog lives in code on purpose (assumption A2): changing what we ask
// a course is a one-line commit, and nobody but Cam runs calls today.
import { parseCallAnswers, summarize, type ItemAnswers } from './call-answers';

export type CallLike = {
  id?: string;
  scheduledAt: string | Date;
  outcome: string;
  answersJson?: string | null;
  agendaJson?: string | null;
  agendaExtra?: string | null;
  durationMin?: number;
  direction?: string;
  phone?: string;
  notes?: string | null;
  followUpAt?: string | Date | null;
  completedAt?: string | Date | null;
};

export type InquiryLike = {
  status: string;
  greenFeeRange?: string | null;
  teeTimesPerDay?: number | null;
  currentBookingMethod?: string | null;
  hasResidentPricing?: boolean | null;
  hasMemberPricing?: boolean | null;
  hasCaddies?: boolean | null;
  callSkippedReason?: string | null;
};

/** The parsed setup sheet (detailsJson) — only the keys the agenda reads. */
export type SheetLike = Record<string, unknown> | null;
/** The parsed needsJson — only the keys the agenda reads. */
export type NeedsLike = Record<string, unknown> | null;

export type AgendaItem = {
  key: string;
  label: string;
  short: string;
  always: boolean;
  answered: (inq: InquiryLike, sheet: SheetLike, needs: NeedsLike) => string | null;
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const nonEmpty = (...vals: unknown[]): string | null => {
  const parts = vals.map(str).filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
};
const yesNo = (v: unknown): string | null => (typeof v === 'boolean' ? (v ? 'yes' : 'no') : str(v) || null);

export const AGENDA: AgendaItem[] = [
  { key: 'green_fees', label: 'Green fee range (weekday / weekend / twilight)', short: 'Green fees', always: false,
    answered: (inq, sheet) => nonEmpty(inq.greenFeeRange, sheet?.greenFeeWeekday, sheet?.greenFeeWeekend, sheet?.twilightFee, sheet?.publicGreenFee) },
  { key: 'tee_times', label: 'Tee times per day and interval', short: 'Tee times / day', always: false,
    answered: (inq, sheet) => nonEmpty(inq.teeTimesPerDay, sheet?.firstTeeTime, sheet?.lastTeeTime, sheet?.intervalMinutes) },
  // IF-1 §4a: always on the agenda — the form's one-line answer is the opener
  // ("They said: GolfNow"), the call confirms and digs. `answered` still reads
  // the form so the row can show it as context.
  { key: 'booking_today', label: 'How they take bookings today (phone, GolfNow, own site)', short: 'Booking method today', always: true,
    answered: (inq, _sheet, needs) => nonEmpty(inq.currentBookingMethod, needs?.memberBookingToday) },
  { key: 'resident_member', label: "Resident / member pricing — who qualifies, how it's proven", short: 'Resident pricing', always: false,
    answered: (inq, sheet, needs) => nonEmpty(needs?.residentRates, needs?.hasMemberships, inq.hasResidentPricing ? 'resident pricing' : '', inq.hasMemberPricing ? 'member pricing' : '', sheet?.memberRate) },
  { key: 'cancellation', label: 'Cancellation and no-show policy', short: 'Cancellation policy', always: false,
    answered: (_inq, sheet) => nonEmpty(sheet?.cancellationPolicy, sheet?.cancellationHours) },
  { key: 'carts_caddies', label: 'Cart / caddie options', short: 'Carts / caddies', always: false,
    answered: (inq, sheet) => nonEmpty(inq.hasCaddies ? 'caddies' : '', sheet?.cartFee, yesNo(sheet?.walkingAllowed) ? `walking ${yesNo(sheet?.walkingAllowed)}` : '') },
  { key: 'season_hours', label: 'Season and days open', short: 'Season / hours', always: false,
    answered: (_inq, sheet) => nonEmpty(sheet?.seasonOpen, sheet?.seasonClose, Array.isArray(sheet?.daysOpen) && (sheet!.daysOpen as unknown[]).length ? `${(sheet!.daysOpen as unknown[]).length} days` : '') },
  { key: 'protected_times', label: 'Leagues, outings, blocked times', short: 'Blocked times', always: false,
    answered: (_inq, sheet, needs) => nonEmpty(sheet?.protectedTimes, sheet?.outingsVolume, needs?.outsideOutings) },
  { key: 'assets', label: 'Logo + 3 course photos — who sends them, by when', short: 'Logo / photos', always: true,
    answered: (_inq, sheet) => Array.isArray(sheet?.photos) && (sheet!.photos as unknown[]).length ? `${(sheet!.photos as unknown[]).length} photo(s)` : null },
  { key: 'people', label: 'Who signs off and who runs the tee sheet day to day', short: 'Decision maker', always: true, answered: () => null },
  { key: 'fee_model', label: 'Walk through the fee model and what go-live looks like', short: 'Fee model', always: true, answered: () => null },
];

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** Keys the Set-up-call card pre-checks: always-on items plus anything still unanswered. */
export function defaultAgenda(inq: InquiryLike, sheet: SheetLike, needs: NeedsLike): string[] {
  return AGENDA.filter(a => a.always || a.answered(inq, sheet, needs) === null).map(a => a.key);
}

export type AgendaStatusRow = { key: string; label: string; short: string; answered: string | null; fromCall: string | null; callItem: ItemAnswers | null };

/** One row per catalog item. An item is OPEN when both `answered` and `fromCall` are null. */
export function agendaStatus(inq: InquiryLike, sheet: SheetLike, needs: NeedsLike, calls: CallLike[]): AgendaStatusRow[] {
  const talked = calls.filter(c => c.outcome === 'talked').sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0];
  // IC-5: answers are structured (v2) — the old flat prose shape still parses.
  const answers = talked ? parseCallAnswers(talked.answersJson) : { v: 2 as const, items: {} };
  return AGENDA.map(a => ({
    key: a.key, label: a.label, short: a.short,
    answered: a.answered(inq, sheet, needs),
    fromCall: summarize(a.key, answers.items[a.key]) || null,
    callItem: answers.items[a.key] ?? null,
  }));
}

const ms = (d: string | Date) => new Date(d).getTime();
const HALF_DAY = 12 * 3600_000;

/** The most recent call by scheduledAt. */
export function latestCall<T extends CallLike>(calls: T[]): T | null {
  return calls.slice().sort((a, b) => ms(b.scheduledAt) - ms(a.scheduledAt))[0] ?? null;
}

/** A scheduled call from the last 12h onward — this morning's call still counts as "next" until it is logged. */
export function nextCall<T extends CallLike>(calls: T[], now: Date = new Date()): T | null {
  return calls
    .filter(c => c.outcome === 'scheduled' && ms(c.scheduledAt) >= now.getTime() - HALF_DAY)
    .sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt))[0] ?? null;
}

/** A scheduled call that went off more than 12h ago and was never logged. */
export function overdueCall<T extends CallLike>(calls: T[], now: Date = new Date()): T | null {
  return calls
    .filter(c => c.outcome === 'scheduled' && ms(c.scheduledAt) < now.getTime() - HALF_DAY)
    .sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt))[0] ?? null;
}

/** Assumption A1: building needs a logged call, or an explicit skip with a reason. */
export function callGate(inq: InquiryLike, calls: CallLike[]): { ok: boolean; why: string } {
  if (calls.some(c => c.outcome === 'talked')) return { ok: true, why: '' };
  if (inq.callSkippedReason && inq.callSkippedReason.trim()) return { ok: true, why: '' };
  return { ok: false, why: 'No discovery call has been logged for this inquiry. Set one up and log it, or skip the call with a reason, before building.' };
}

export function fmtCallTime(d: string | Date): string {
  const dt = new Date(d);
  return dt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}
export function fmtCallClock(d: string | Date): string {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}
export function isSameEasternDay(a: string | Date, b: Date): boolean {
  const f = (d: string | Date) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return f(a) === f(b);
}

// IC-2: the cards take a date + a clock time typed in Eastern (the only
// timezone Cam schedules in) and need the instant. Done with Intl so it is
// right on either side of a DST change without a tz library.
export function easternToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const guess = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const asEt = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return new Date(guess.getTime() - (asEt - guess.getTime())).toISOString();
}

/** The Eastern date (YYYY-MM-DD) and clock (HH:MM) of an instant — for prefilling the reschedule row. */
export function easternParts(d: string | Date): { date: string; time: string } {
  const dt = new Date(d);
  const date = dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const time = dt.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).slice(0, 5);
  return { date, time };
}

export const OUTCOME_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', talked: 'Talked', no_answer: 'No answer', not_a_fit: 'Not a fit', cancelled: 'Cancelled',
};
export const DIRECTION_LABEL: Record<string, string> = { we_call: 'We call them', they_call: 'They call us' };
