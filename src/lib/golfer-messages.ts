// MSG-1 (PLATFORM_ROADMAP_SPEC §5, Cam 2026-10-07: "easily allow courses to
// reach out to customers via messaging"): a course's notice to the golfers
// booked on one day, or a window of it — "frost delay, first tee 9:00",
// "cart path only today". Operational only: the audience is always the
// confirmed bookings in that window, never a list, so no marketing consent is
// involved. Email always; a text too when Twilio is configured and the course
// asks. Each golfer is messaged once however many bookings they hold.
import { prisma } from './prisma';
import { sendCourseNoticeEmail, isPlaceholderEmail } from './email';
import { sendSms, smsConfigured } from './twilio';
import { normalizePhone } from './golfer-otp';
import { formatTeeTime, formatTeeDay } from './format';

export const MAX_MESSAGE_CHARS = 600;
/** A text carries "{course}: {message}" in this many characters, then the STOP line. */
export const SMS_CHARS = 300;
export const smsRoom = (courseName: string) => SMS_CHARS - courseName.length - 2;
/** Stop well inside the route's maxDuration so a run always finishes and logs. */
const BUDGET_MS = 240_000;

export type Window = { date: string; from?: string | null; to?: string | null };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function checkWindow(w: Window): string | null {
  if (!DATE.test(w.date)) return 'Pick a day.';
  if (w.from && !HHMM.test(w.from)) return 'The start time must be HH:MM.';
  if (w.to && !HHMM.test(w.to)) return 'The end time must be HH:MM.';
  if (w.from && w.to && w.to < w.from) return 'The end time is before the start time.';
  return null;
}

type Recipient = { name: string; email: string | null; phone: string | null; teeTime: string };

/** The golfers booked in the window, one entry per golfer (earliest tee time). */
export async function audience(courseId: string, w: Window): Promise<Recipient[]> {
  const times = await prisma.teeTime.findMany({
    where: { courseId, date: w.date, ...(w.from || w.to ? { time: { ...(w.from ? { gte: w.from } : {}), ...(w.to ? { lte: w.to } : {}) } } : {}) },
    orderBy: { time: 'asc' },
    select: { time: true, bookings: { where: { status: 'confirmed', courseId }, select: { golferName: true, golferEmail: true, golferPhone: true } } },
  });
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const t of times) for (const b of t.bookings) {
    const email = b.golferEmail && !isPlaceholderEmail(b.golferEmail) ? b.golferEmail.trim().toLowerCase() : null;
    const digits = (b.golferPhone || '').replace(/\D/g, '');
    const phone = digits.length >= 10 ? b.golferPhone : null;
    const key = email ?? (phone ? `p:${digits.slice(-10)}` : `n:${b.golferName.toLowerCase()}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: b.golferName, email, phone, teeTime: t.time });
  }
  return out;
}

export function reach(list: Recipient[]) {
  return { golfers: list.length, email: list.filter(r => r.email).length, sms: list.filter(r => r.phone).length, unreachable: list.filter(r => !r.email && !r.phone).length };
}

export async function sendCourseMessage(opts: {
  courseId: string; window: Window; body: string; sms: boolean; sentBy: string;
}): Promise<{ sentEmail: number; sentSms: number; failed: { name: string; how: 'email' | 'sms'; error: string }[]; unreachable: number }> {
  const course = await prisma.course.findUnique({ where: { id: opts.courseId }, select: { name: true, operator: { select: { email: true } } } });
  if (!course) throw new Error('Course not found');
  const list = await audience(opts.courseId, opts.window);
  const doSms = opts.sms && smsConfigured();
  const dateLabel = formatTeeDay(opts.window.date);
  const failed: { name: string; how: 'email' | 'sms'; error: string }[] = [];
  let sentEmail = 0, sentSms = 0;
  // The route refuses a text that wouldn't fit; never cut one short here.
  const text = `${course.name}: ${opts.body} Reply STOP to opt out.`;
  // Logged BEFORE sending and updated as it goes, so a run that dies part-way
  // still shows under "Recently sent" with what actually went out.
  const log = await prisma.courseMessage.create({ data: {
    courseId: opts.courseId, date: opts.window.date, fromTime: opts.window.from || null, toTime: opts.window.to || null,
    body: opts.body, sentBy: opts.sentBy,
  } });
  const save = () => prisma.courseMessage.update({ where: { id: log.id }, data: { sentEmail, sentSms, failed: failed.length } });
  const start = Date.now();
  // Sequential: a day's sheet is at most a few hundred golfers, and Resend and
  // Twilio both rate-limit bursts. Every send is awaited (CLAUDE.md gotcha 6).
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (Date.now() - start > BUDGET_MS) {
      // Out of time: say exactly who was not reached instead of dying silently.
      for (const left of list.slice(i)) {
        if (left.email) failed.push({ name: left.name, how: 'email', error: 'Ran out of time — not sent' });
        if (doSms && left.phone) failed.push({ name: left.name, how: 'sms', error: 'Ran out of time — not sent' });
      }
      break;
    }
    if (r.email) {
      try {
        await sendCourseNoticeEmail({ to: r.email, golferName: r.name, courseName: course.name, replyTo: course.operator?.email ?? null, dateLabel, teeTime: formatTeeTime(r.teeTime), body: opts.body });
        sentEmail++;
      } catch (err) { failed.push({ name: r.name, how: 'email', error: err instanceof Error ? err.message : String(err) }); }
    }
    if (doSms && r.phone) {
      try { await sendSms(normalizePhone(r.phone), text); sentSms++; }
      catch (err) { failed.push({ name: r.name, how: 'sms', error: err instanceof Error ? err.message : String(err) }); }
    }
    if ((i + 1) % 20 === 0) await save();
  }
  const unreachable = list.filter(r => !r.email && !(doSms && r.phone)).length;
  await save();
  return { sentEmail, sentSms, failed, unreachable };
}
