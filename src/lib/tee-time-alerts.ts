// ALERTS-2 (Cam 2026-11-18, lanes/golfer.md item 7, lanes/build.md "Tee time alerts").
//
// A golfer asks to be told when a tee time opens: on one or more dates, in parts of the
// day, for N players, or for one full time (optionally "and other times in that part of
// the day"). First come, first served; nothing is held.
//
//   - A guest's alert starts 'pending' and turns on only from the emailed confirm link
//     (a POST from the confirm page: mail scanners prefetch GET links).
//   - A golfer logged in at this course (gr_member: member or resident, email proven) turns it
//     on in one tap; the email is the log-in email, never one typed into the form.
//   - It ends after the last tee time on its last date (course local), or the end of that
//     day when the date has no times. (Build ruling 2026-11-18: the "unless the course
//     set a later end" rule belongs to the course alert line, not here.)
//   - At most one opening message per date (`notifiedDates`), claimed with a conditional
//     update BEFORE sending, so two openings at once never send twice.
//   - Texts only with the alert's own consent, through sendSms(scope 'alerts').
//   - Course switch `teeTimeAlertsOn` off: no new alerts, none sent; rows are kept.
//
// Openings are checked where tee times open (cancellation, a move off a time, a smaller
// party, staff adding or reopening times) and by the hourly sweep, which also catches
// times the generator adds and ends expired alerts. Every send is awaited.
import { randomBytes } from 'crypto';
import { prisma } from './prisma';
import { todayIn, clockIn, addDaysStr } from './course-time';
import { teeToUtcMs } from './tee-time-utils';
import { withinWindow, windowFor } from './booking-window';
import { rulesFor } from './booking-rules';
import { membershipLive } from './member-rates';
import { liveMembershipFor, canLogIn } from './member-session';
import { consentPhone, recordSmsConsent, type SmsScope } from './sms-consent';
import { ALERT_SMS_CONSENT_VERSION, ALERT_SMS_CONFIRMATION, alertSmsConsentText } from './sms-consent-copy';
import { formatTeeDay, formatTeeTime } from './format';

/** Parts of the day as the approved sheet draws them (7–11 AM, 11 AM–2 PM, 2–5 PM). Times
 *  before 7 count as morning and after 5 as late day, so every tee time has a part. */
export const ALERT_PARTS = [
  { key: 'morning', label: 'Morning', hint: '7–11 AM' },
  { key: 'midday', label: 'Mid day', hint: '11 AM–2 PM' },
  { key: 'late', label: 'Late day', hint: '2–5 PM' },
] as const;
export type AlertPart = (typeof ALERT_PARTS)[number]['key'];
const PART_KEYS = new Set<string>(ALERT_PARTS.map(p => p.key));

export function partOf(time: string): AlertPart {
  return time < '11:00' ? 'morning' : time < '14:00' ? 'midday' : 'late';
}

export const MAX_ALERT_DATES = 14;
const SEND_CAP_PER_DATE = 200;
/** In a request (a cancel, a move), only this many alerts are told; the hourly sweep tells the
 *  rest. Keeps a golfer's cancel or staff's move quick however many alerts a date has. */
export const REQUEST_SEND_CAP = 25;
const SMS_SCOPE: SmsScope = 'alerts';

export function newAlertToken(): string {
  return randomBytes(24).toString('base64url');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The dates an alert watches: `dates`, or the single `date` on a row from before ALERTS-2. */
export function alertDates(a: { dates: string[]; date: string }): string[] {
  return a.dates.length ? a.dates : [a.date];
}

/** When an alert ends: the last tee time on its last date, else the end of that day. */
export async function endsAtFor(courseId: string, lastDate: string, tz: string): Promise<Date> {
  const last = await prisma.teeTime.findFirst({
    where: { courseId, date: lastDate, staffOnly: false },
    orderBy: { time: 'desc' },
    select: { time: true },
  });
  if (last) return new Date(teeToUtcMs(lastDate, last.time, tz));
  return new Date(teeToUtcMs(addDaysStr(lastDate, 1), '00:00', tz));
}

type MatchAlert = { teeTimeId: string | null; parts: string[]; players: number; windowStart: string; windowEnd: string };
type MatchTime = { id: string; time: string; spots: number; minPlayers: number };

/** Whether this open time is one the alert asked about. Pure. */
export function alertMatches(a: MatchAlert, t: MatchTime): boolean {
  if (t.spots < a.players || a.players < t.minPlayers) return false;
  if (a.teeTimeId) return t.id === a.teeTimeId || (a.parts.length > 0 && a.parts.includes(partOf(t.time)));
  if (a.parts.length && !a.parts.includes(partOf(t.time))) return false;
  // Rows from before ALERTS-2 kept a clock window.
  if (a.windowStart && t.time < a.windowStart) return false;
  if (a.windowEnd && t.time > a.windowEnd) return false;
  return true;
}

// ─── Creating ────────────────────────────────────────────────────────────────

export type CreateAlertInput = {
  courseId?: unknown; dates?: unknown; parts?: unknown; players?: unknown; teeTimeId?: unknown; wide?: unknown;
  date?: unknown; windowStart?: unknown; windowEnd?: unknown; // the booking page before the new sheet
  email?: unknown; name?: unknown; phone?: unknown; textConsent?: unknown;
};
/** gr_member (GOLFER-LOGIN-1, #483): an email proven at a course. Member or resident, it turns an
 *  alert on in one tap; a live membership here also gives the member booking window. */
export type MemberCtx = { courseId: string; email: string } | null;

export type CreateAlertResult =
  | { ok: true; status: 'active' | 'pending'; alert: { id: string; token: string; email: string; dates: string[] }; endsOn: string; maskedEmail: string; course: { id: string; name: string; slug: string }; textNew: boolean; phone: string | null; players: number; skipEmail?: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * The emails an alert request is counted against (the per-email limit). The typed email whenever
 * one is given (a lapsed member, or a log-in from another course, uses it), plus the log-in email
 * at its own course. Counting both means no session can spend a typed address's requests
 * elsewhere.
 */
export function alertRateKeys(session: { courseId: string; email: string } | null, body: { courseId?: unknown; email?: unknown }): string[] {
  const keys = new Set<string>();
  const typed = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (typed) keys.add(typed);
  if (session && session.courseId === body.courseId && session.email) keys.add(session.email.trim().toLowerCase());
  return [...keys];
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${(user || '').slice(0, 1)}•••@${domain || ''}`;
}

/**
 * Validate and store an alert. Sends nothing: the route sends the confirm email (guest) or
 * the text enrollment confirmation (member) so both are awaited in the request.
 */
export async function createAlert(input: CreateAlertInput, member: MemberCtx, now: Date = new Date()): Promise<CreateAlertResult> {
  const bad = (error: string, extra: Record<string, unknown> = {}) => ({ ok: false as const, status: 400, body: { error, ...extra } });
  const courseId = typeof input.courseId === 'string' ? input.courseId : '';
  if (!courseId) return bad('Missing course');
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, name: true, slug: true, active: true, liveStatus: true, timezone: true, teeTimeAlertsOn: true, publicAdvanceDays: true, memberAdvanceDays: true, memberGraceDays: true, minPlayers: true, maxPlayers: true, hasResidentPricing: true, memberLoginOn: true },
  });
  if (!course || !course.active || course.liveStatus !== 'live') return { ok: false, status: 404, body: { error: 'Course not found' } };
  if (!course.teeTimeAlertsOn) return { ok: false, status: 403, body: { error: 'This course isn’t taking tee time alerts.', alertsOff: true } };

  // Who: logged in at THIS course (its email proven) uses the log-in email and needs no confirm;
  // anyone else is a guest. A live membership also gives the member window.
  let membershipId: string | null = null;
  let memberTier: Parameters<typeof windowFor>[1] = null;
  let email = '';
  // #483: a session counts only while the email is in a group here now (canLogIn); a cookie whose
  // membership ended or card expired is a guest, with the email they typed.
  // A course with Log in off (Course.memberLoginOn) recognises no log-in here either: the golfer is a guest.
  const loggedIn = !!member && course.memberLoginOn && member.courseId === course.id && !!member.email.trim() && !!(await canLogIn(course, member.email));
  if (loggedIn) {
    email = member!.email.trim().toLowerCase();
    const m = await liveMembershipFor(course, email);
    if (m && membershipLive(m, course, now)) { membershipId = m.id; memberTier = { tier: m.tier }; }
  } else {
    email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email) || email.length > 200) return bad('Enter your email.', { field: 'email' });
  }

  // The booking page before the new alert sheet sends one `date` with a clock window
  // (windowStart/windowEnd, empty = any time). Accepted as it always was, so that page keeps working
  // until the Golfer lane's sheet replaces it.
  const legacy = input.dates === undefined && typeof input.date === 'string';
  const clock = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '');
  const windowStart = legacy ? clock(input.windowStart) : '';
  const windowEnd = legacy ? clock(input.windowEnd) : '';

  // Dates: 1–14, real, not past, inside the window this golfer can book.
  const rawDates = legacy ? [input.date] : Array.isArray(input.dates) ? input.dates : [];
  const dates = [...new Set(rawDates.filter((d): d is string => typeof d === 'string' && DATE_RE.test(d)))].sort();
  if (!dates.length || dates.length !== rawDates.length) return bad('Pick at least one date.', { field: 'dates' });
  if (dates.length > MAX_ALERT_DATES) return bad(`Pick up to ${MAX_ALERT_DATES} dates.`, { field: 'dates' });
  const win = windowFor(course, memberTier);
  const today = todayIn(course.timezone, now);
  if (dates.some(d => d < today || !withinWindow(d, win.days, now, course.timezone))) {
    return bad('Pick dates you can book.', { field: 'dates' });
  }

  const rules = rulesFor(course);
  const players = Number(input.players);
  if (!Number.isInteger(players) || players < 1 || players > Math.max(rules.maxPlayers, 1)) return bad('Pick how many players.', { field: 'players' });

  const rawParts = Array.isArray(input.parts) ? input.parts : [];
  let parts = [...new Set(rawParts.filter((p): p is string => typeof p === 'string' && PART_KEYS.has(p)))];
  if (parts.length !== rawParts.length) return bad('Pick a time of day.', { field: 'parts' });
  if (parts.length === PART_KEYS.size) parts = [];

  // One full time: it must be this course's, on the one date asked, and not past.
  let teeTimeId: string | null = null;
  if (input.teeTimeId != null && input.teeTimeId !== '') {
    if (typeof input.teeTimeId !== 'string') return bad('That tee time isn’t available for alerts.');
    const t = await prisma.teeTime.findUnique({ where: { id: input.teeTimeId }, select: { id: true, courseId: true, date: true, time: true, staffOnly: true } });
    if (!t || t.courseId !== course.id || t.staffOnly || dates.length !== 1 || dates[0] !== t.date) return bad('That tee time isn’t available for alerts.');
    if (t.date === today && t.time <= clockIn(course.timezone, now)) return bad('That tee time has already gone off.');
    teeTimeId = t.id;
    parts = input.wide === true ? [partOf(t.time)] : [];
  }

  // Alert texts: only with the separate, ticked alert-text box; US and Canadian numbers only.
  let phone: string | null = null;
  const rawPhone = typeof input.phone === 'string' ? input.phone.trim() : '';
  if (rawPhone) {
    if (input.textConsent !== true) return bad('Tick the box to agree to alert texts, or leave the phone empty.', { field: 'textConsent' });
    const { isNorthAmericanNumber } = await import('./twilio');
    phone = consentPhone(rawPhone);
    if (!phone || !isNorthAmericanNumber(phone)) return bad('Texts only go to US and Canadian numbers.', { field: 'phone' });
  }

  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 100) : '';
  const endsAt = await endsAtFor(course.id, dates[dates.length - 1], course.timezone);
  if (endsAt.getTime() <= now.getTime()) return bad('Pick dates you can book.', { field: 'dates' });

  const consentWording = phone ? alertSmsConsentText(course.name) : null;
  const status = loggedIn ? 'active' : 'pending';

  // The same alert asked again (same email, dates, parts, players, time) is the same row.
  const existing = await prisma.teeTimeAlert.findFirst({
    where: { courseId: course.id, email, status: { in: ['pending', 'active'] }, dates: { equals: dates }, parts: { equals: parts }, players, teeTimeId, windowStart, windowEnd },
  });
  // A guest can't change an alert that is already on (anyone can type any email): same answer,
  // nothing written, nothing sent.
  if (existing && existing.status === 'active' && !loggedIn) {
    return {
      ok: true, status: 'pending', alert: { id: existing.id, token: '', email, dates },
      endsOn: dates[dates.length - 1], maskedEmail: maskEmail(email),
      course: { id: course.id, name: course.name, slug: course.slug }, textNew: false, phone: null, players, skipEmail: true,
    };
  }
  const data = {
    name, phone, players,
    textConsentAt: phone ? now : null, textConsentWording: consentWording,
    membershipId, endsAt,
  };
  const alert = existing
    ? await prisma.teeTimeAlert.update({
        where: { id: existing.id },
        // A guest re-asking a pending alert gets a NEW confirm link, so only the newest email (which
        // names the phone on it) can turn it on; the older link stops working.
        data: { ...data, ...(loggedIn && existing.status === 'pending' ? { status: 'active', confirmedAt: now } : {}), ...(!loggedIn ? { token: newAlertToken() } : {}) },
      })
    : await prisma.teeTimeAlert.create({
        data: { ...data, courseId: course.id, email, date: dates[0], dates, parts, windowStart, windowEnd, teeTimeId, status, confirmedAt: loggedIn ? now : null, token: newAlertToken() },
      });

  // A member's text consent counts now; a guest's only once the email link is confirmed.
  let textNew = false;
  if (alert.status === 'active' && phone) textNew = await recordAlertTextConsent(alert, course.id);

  return {
    ok: true, status: alert.status as 'active' | 'pending',
    alert: { id: alert.id, token: alert.token, email, dates },
    endsOn: dates[dates.length - 1], maskedEmail: maskEmail(email),
    course: { id: course.id, name: course.name, slug: course.slug }, textNew, phone, players,
  };
}

/** Record the alert-text yes (scope 'alerts'). Returns whether it was new (send the enrollment text). */
async function recordAlertTextConsent(a: { phone: string | null; textConsentAt: Date | null }, courseId: string): Promise<boolean> {
  if (!a.phone || !a.textConsentAt) return false;
  return recordSmsConsent(a.phone, 'opt_in', { method: 'web_alert', courseId, scope: SMS_SCOPE, wording: ALERT_SMS_CONSENT_VERSION });
}

/** The one-time enrollment text for a number new to alert texts. Never throws. */
export async function sendAlertTextEnrollment(phone: string, courseId: string): Promise<void> {
  const { sendSms, smsConfigured } = await import('./twilio');
  if (!smsConfigured()) return;
  try { await sendSms(phone, ALERT_SMS_CONFIRMATION, { kind: 'alert_sms_confirmation', courseId, consentScope: SMS_SCOPE }); }
  catch (err) { console.error(JSON.stringify({ ev: 'alerts.text_enroll.fail', error: err instanceof Error ? err.message : String(err) })); }
}

// ─── Confirm and stop (by the emailed token) ─────────────────────────────────

export type TokenAlert = { id: string; status: string; dates: string[]; date: string; players: number; phone: string | null; course: { name: string; slug: string } };

export async function alertByToken(token: string): Promise<TokenAlert | null> {
  if (!token || token.length > 100) return null;
  return prisma.teeTimeAlert.findUnique({
    where: { token },
    select: { id: true, status: true, dates: true, date: true, players: true, phone: true, course: { select: { name: true, slug: true } } },
  });
}

/** Turn a pending alert on. 'ended' when its last date has passed. */
export async function confirmAlert(token: string, now: Date = new Date()): Promise<{ result: 'confirmed' | 'already' | 'ended' | 'stopped' | 'off' | 'missing'; alert: TokenAlert | null }> {
  const alert = await alertByToken(token);
  if (!alert) return { result: 'missing', alert: null };
  if (alert.status === 'active') return { result: 'already', alert };
  if (alert.status === 'stopped') return { result: 'stopped', alert };
  if (alert.status === 'ended') return { result: 'ended', alert };
  const row = await prisma.teeTimeAlert.findUnique({ where: { id: alert.id }, select: { endsAt: true, phone: true, textConsentAt: true, courseId: true, course: { select: { teeTimeAlertsOn: true } } } });
  // The course turned alerts off since: nothing turns on, no consent is recorded.
  if (row && !row.course.teeTimeAlertsOn) return { result: 'off', alert };
  if (row?.endsAt && row.endsAt.getTime() <= now.getTime()) {
    await prisma.teeTimeAlert.updateMany({ where: { id: alert.id, status: 'pending' }, data: { status: 'ended' } });
    return { result: 'ended', alert };
  }
  const r = await prisma.teeTimeAlert.updateMany({ where: { id: alert.id, status: 'pending' }, data: { status: 'active', confirmedAt: now } });
  if (r.count === 0) return { result: 'already', alert };
  if (row?.phone && row.textConsentAt) {
    const isNew = await recordAlertTextConsent(row, row.courseId);
    if (isNew) await sendAlertTextEnrollment(row.phone, row.courseId);
  }
  return { result: 'confirmed', alert };
}

/** Stop an alert. Idempotent. */
export async function stopAlertByToken(token: string, now: Date = new Date()): Promise<{ result: 'stopped' | 'already' | 'missing'; alert: TokenAlert | null }> {
  const alert = await alertByToken(token);
  if (!alert) return { result: 'missing', alert: null };
  const r = await prisma.teeTimeAlert.updateMany({ where: { id: alert.id, status: { in: ['pending', 'active'] } }, data: { status: 'stopped', stoppedAt: now } });
  return { result: r.count ? 'stopped' : 'already', alert };
}

// ─── Matching ────────────────────────────────────────────────────────────────

type OpenTime = MatchTime & { date: string };

/** Times on this date a golfer could book right now (the public list's rules, without its window). */
async function openTimes(course: { id: string; timezone: string; publicAdvanceDays: number | null; minPlayers: number | null; maxPlayers: number | null }, date: string, now: Date): Promise<(OpenTime & { publicOk: boolean })[]> {
  const rows = await prisma.teeTime.findMany({
    where: { courseId: course.id, date, status: { not: 'blocked' }, staffOnly: false },
    orderBy: { time: 'asc' },
    select: { id: true, date: true, time: true, playersAvailable: true, playersBooked: true, product: { select: { minPlayers: true, maxPlayers: true, publicAdvanceDays: true } } },
  });
  const today = todayIn(course.timezone, now);
  const clock = clockIn(course.timezone, now);
  return rows
    .filter(t => date !== today || t.time > clock)
    .map(t => {
      const rules = rulesFor(course, t.product);
      return {
        id: t.id, date: t.date, time: t.time,
        spots: Math.min(t.playersAvailable - t.playersBooked, rules.maxPlayers),
        minPlayers: rules.minPlayers,
        publicOk: withinWindow(date, rules.publicAdvanceDays, now, course.timezone),
      };
    })
    .filter(t => t.spots > 0);
}

/**
 * Send the opening message to every active alert on these dates that a bookable time now
 * matches. Returns how many alerts were told. Awaited by every caller; never throws.
 */
export async function notifyAlertsFor(courseId: string, dates: string[], now: Date = new Date(), maxSends: number = REQUEST_SEND_CAP): Promise<number> {
  try {
    return await notifyInner(courseId, dates, now, maxSends);
  } catch (err) {
    console.error(JSON.stringify({ ev: 'alerts.notify.fail', courseId, error: err instanceof Error ? err.message : String(err) }));
    return 0;
  }
}

async function notifyInner(courseId: string, dates: string[], now: Date, maxSends: number): Promise<number> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, name: true, slug: true, active: true, liveStatus: true, timezone: true, teeTimeAlertsOn: true, publicAdvanceDays: true, minPlayers: true, maxPlayers: true },
  });
  if (!course || !course.teeTimeAlertsOn || !course.active || course.liveStatus !== 'live') return 0;
  const { sendTeeTimeAlertEmail } = await import('./email');
  let told = 0;
  const today = todayIn(course.timezone, now);
  for (const date of [...new Set(dates)].sort()) {
    if (!DATE_RE.test(date) || date < today) continue;
    const alerts = await prisma.teeTimeAlert.findMany({
      where: {
        courseId, status: 'active',
        NOT: { notifiedDates: { has: date } },
        AND: [
          { OR: [{ dates: { has: date } }, { dates: { isEmpty: true }, date, notifiedAt: null }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: SEND_CAP_PER_DATE,
    });
    if (!alerts.length) continue;
    const times = await openTimes(course, date, now);
    if (!times.length) continue;
    for (const a of alerts) {
      if (told >= maxSends) return told;
      // A guest can't book past the public window (or a round's own shorter one).
      const usable = a.membershipId ? times : times.filter(t => t.publicOk);
      const hit = usable.find(t => alertMatches(a, t));
      if (!hit) continue;
      // The claim: only the caller that adds this date sends. Postgres re-checks the
      // NOT-has condition on the locked row, so a second caller updates nothing.
      const claim = await prisma.teeTimeAlert.updateMany({
        where: { id: a.id, status: 'active', NOT: { notifiedDates: { has: date } } },
        data: { notifiedDates: { push: date }, notifiedAt: now },
      });
      if (claim.count === 0) continue;
      told++;
      try {
        await sendTeeTimeAlertEmail({
          name: a.name, email: a.email, courseName: course.name, courseSlug: course.slug, courseId: course.id,
          date, time: hit.time, players: a.players, stopToken: a.token,
          lastDate: alertDates(a).slice(-1)[0],
        });
      } catch (err) {
        console.error(JSON.stringify({ ev: 'alerts.email.fail', alertId: a.id, error: err instanceof Error ? err.message : String(err) }));
      }
      if (a.phone && a.textConsentAt) {
        try {
          const { sendSms, smsConfigured } = await import('./twilio');
          if (smsConfigured()) {
            const base = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
            await sendSms(a.phone,
              `GreenReserve: a tee time opened at ${course.name}, ${formatTeeDay(date)} ${formatTeeTime(hit.time)} for ${a.players}. First to book gets it: ${base}/courses/${course.slug}?date=${date}&players=${a.players} Reply STOP to cancel.`,
              { kind: 'tee_time_alert_text', courseId: course.id, consentScope: SMS_SCOPE });
          }
        } catch (err) {
          console.error(JSON.stringify({ ev: 'alerts.text.fail', alertId: a.id, error: err instanceof Error ? err.message : String(err) }));
        }
      }
    }
  }
  return told;
}

/**
 * The hourly sweep: end alerts past their end, then check every
 * date with an active alert (catches times the generator or staff opened). Never throws.
 */
export async function sweepTeeTimeAlerts(now: Date = new Date()): Promise<{ ended: number; told: number }> {
  let ended = 0, told = 0;
  try {
    ended = (await prisma.teeTimeAlert.updateMany({
      where: { status: { in: ['pending', 'active'] }, endsAt: { lte: now } },
      data: { status: 'ended' },
    })).count;
    // Rows from before ALERTS-2 have no end and are never written here (that would be a backfill):
    // they keep their one date, and a date that has passed is skipped below.
    const live = await prisma.teeTimeAlert.findMany({
      where: {
        status: 'active', course: { teeTimeAlertsOn: true },
        OR: [{ endsAt: { gt: now } }, { endsAt: null, date: { gte: addDaysStr(todayIn('UTC', now), -1) } }],
      },
      select: { courseId: true, dates: true, date: true, notifiedDates: true },
    });
    const byCourse = new Map<string, Set<string>>();
    for (const a of live) {
      const set = byCourse.get(a.courseId) ?? new Set<string>();
      for (const d of alertDates(a)) if (!a.notifiedDates.includes(d)) set.add(d);
      byCourse.set(a.courseId, set);
    }
    for (const [courseId, ds] of byCourse) told += await notifyAlertsFor(courseId, [...ds], now, SEND_CAP_PER_DATE);
  } catch (err) {
    console.error(JSON.stringify({ ev: 'alerts.sweep.fail', error: err instanceof Error ? err.message : String(err) }));
  }
  return { ended, told };
}

// ─── A logged-in member's own alerts ─────────────────────────────────────────

export async function memberAlerts(courseId: string, email: string) {
  const rows = await prisma.teeTimeAlert.findMany({
    where: { courseId, email: email.trim().toLowerCase(), status: { in: ['pending', 'active'] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, dates: true, date: true, parts: true, players: true, teeTimeId: true, teeTime: { select: { time: true } }, status: true, endsAt: true, phone: true, notifiedDates: true },
  });
  return rows.map(r => ({
    id: r.id, dates: alertDates(r), parts: r.parts, players: r.players,
    teeTimeId: r.teeTimeId, time: r.teeTime?.time ?? null, status: r.status,
    endsAt: r.endsAt?.toISOString() ?? null,
    phoneLast4: r.phone ? r.phone.slice(-4) : null,
    notifiedDates: r.notifiedDates,
  }));
}

export async function stopMemberAlert(id: string, courseId: string, email: string, now: Date = new Date()): Promise<boolean> {
  const r = await prisma.teeTimeAlert.updateMany({
    where: { id, courseId, email: email.trim().toLowerCase(), status: { in: ['pending', 'active'] } },
    data: { status: 'stopped', stoppedAt: now },
  });
  return r.count > 0;
}
