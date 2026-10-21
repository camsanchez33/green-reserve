import { prisma } from './prisma';
import { startOfPlatformMonth, startOfPlatformMonthsAgo, dayKey } from './admin-day';
import { cronHealth, lastStripeWebhook } from './cron-log';
import { sumExpensesForPeriodCents } from './expenses';
import { fetchStripeFeeWindow } from './platform-stripe';
import { FUNNEL_SEGMENTS, ACTIVE_STATUSES, queueSignal, daysSince } from './inquiry-status';
import { todayIn, addDaysStr } from './course-time';
import type { ActionRow } from './admin-action-queue';
import vercelConfig from '../../vercel.json';

// AW-4: the data behind the admin Today page's Health, Money and Onboarding
// sections (AW-4b: the page shows Health and the Courses list below; Money and
// Onboarding stay for Revenue and Inquiries to reuse) (Needs you now is lib/admin-action-queue.ts). The route gates each
// by role; nothing here checks who is asking.

const CRONS = ((vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? []);
/** In one stage this long, with nothing snoozed, an inquiry is stuck. */
export const STUCK_DAYS = 7;
const PAID = { paymentStatus: 'paid', roundPaymentIntentId: { not: '' } } as const;
const WEBHOOK_QUIET_DAYS = 7;

/**
 * Paid rounds between two instants: count, volume through courses and
 * GreenReserve's fees (round fees plus FB-3 fees charged on their own, minus
 * those refunded), all in cents. ONE definition — Today, Goals and the tests
 * read it.
 */
export async function paidWindow(from: Date, to: Date) {
  const range = { gte: from, lt: to };
  const [rounds, sepCharged, sepRefunded] = await Promise.all([
    prisma.booking.aggregate({ where: { ...PAID, paidAt: range }, _sum: { greenFeeTotal: true, cartFeeTotal: true, accessFeeTotal: true }, _count: { id: true } }),
    // FB-3: booking fees charged on their own count toward what we earned (as on Revenue).
    prisma.paymentEvent.aggregate({ where: { kind: 'fee_charged', createdAt: range }, _sum: { amountCents: true } }),
    prisma.paymentEvent.aggregate({ where: { kind: 'fee_refunded', createdAt: range }, _sum: { amountCents: true } }),
  ]);
  return {
    rounds: rounds._count.id,
    volumeCents: (rounds._sum.greenFeeTotal ?? 0) + (rounds._sum.cartFeeTotal ?? 0),
    feesCents: (rounds._sum.accessFeeTotal ?? 0) + (sepCharged._sum.amountCents ?? 0) - (sepRefunded._sum.amountCents ?? 0),
  };
}

export async function todayMoney(now: Date, owner: boolean) {
  const start = startOfPlatformMonth(now);
  const priorStart = startOfPlatformMonthsAgo(now, 1);
  // "Same point last month": as far into last month as we are into this one.
  const priorEnd = new Date(Math.min(priorStart.getTime() + (now.getTime() - start.getTime()), start.getTime()));
  const [cur, prior] = await Promise.all([paidWindow(start, now), paidWindow(priorStart, priorEnd)]);
  const out = {
    from: dayKey(start), daysIn: Number(dayKey(now).split('-')[2]),
    current: { rounds: cur.rounds, volume: cur.volumeCents / 100, fees: cur.feesCents / 100 },
    prior: { rounds: prior.rounds, volume: prior.volumeCents / 100, fees: prior.feesCents / 100 },
    net: null as null | { current: number | null; prior: number | null; stripeUnavailable: boolean },
  };
  if (!owner) return out;
  const expenses = await prisma.expense.findMany();
  const stripeCost = async (from: Date, to: Date) => {
    try { return (await fetchStripeFeeWindow(Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000))).processingCostCents; }
    catch (e) { console.error('[today] Stripe fee fetch failed', e); return null; }
  };
  const [sc, sp] = await Promise.all([stripeCost(start, now), stripeCost(priorStart, priorEnd)]);
  const net = (fees: number, stripe: number | null, from: Date, to: Date) => stripe === null ? null : (fees - stripe - sumExpensesForPeriodCents(expenses, from, to)) / 100;
  out.net = { current: net(cur.feesCents, sc, start, now), prior: net(prior.feesCents, sp, priorStart, priorEnd), stripeUnavailable: sc === null || sp === null };
  return out;
}

export async function todayHealth(now: Date) {
  const [jobs, webhook, liveCourses, blocked] = await Promise.all([
    cronHealth(CRONS, now),
    lastStripeWebhook(),
    prisma.course.count({ where: { active: true, archivedAt: null } }),
    prisma.course.count({ where: { active: true, stripeAccountActive: false, archivedAt: null } }),
  ]);
  const bad = jobs.filter(j => j.status === 'bad');
  const webhookAgeDays = webhook ? daysSince(new Date(webhook.at), now) : null;
  return {
    jobs: { total: jobs.length, bad: bad.map(j => ({ job: j.job, note: j.note })), notYetRun: jobs.filter(j => j.status === 'warn').length },
    stripeWebhook: {
      lastAt: webhook?.at ?? null,
      ok: !!webhook && webhook.outcome !== 'error' && (webhookAgeDays ?? 99) < WEBHOOK_QUIET_DAYS,
      lastError: webhook?.outcome === 'error' ? (webhook.error || 'The last event failed.') : null,
    },
    payments: { live: liveCourses, blocked },
  };
}

export async function todayOnboarding(now: Date) {
  const inquiries = await prisma.courseInquiry.findMany({
    where: { OR: [{ status: { in: ACTIVE_STATUSES } }, { status: 'live', wentLiveAt: { gte: startOfPlatformMonth(now) } }] },
    select: {
      id: true, courseName: true, status: true, createdAt: true, snoozeUntil: true, nextFollowUpAt: true, callInviteSentAt: true,
      calls: { select: { scheduledAt: true, outcome: true }, where: { kind: 'discovery' } },
      events: { select: { fromStatus: true, toStatus: true, actorName: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  const stages = FUNNEL_SEGMENTS.map(seg => {
    const here = inquiries.filter(i => (seg.statuses as readonly string[]).includes(i.status));
    const stuck = seg.key === 'live' ? [] : here
      .map(i => ({ i, s: queueSignal(i, now) }))
      .filter(({ i, s }) => s.waitingOn !== 'snoozed' && daysSince(s.enteredAt, now) >= STUCK_DAYS
        // A discovery call on the books is progress, not a stall (the Inquiries queue reads it the same way).
        && !(i.calls ?? []).some(c => c.outcome === 'scheduled' && new Date(c.scheduledAt) > now))
      .map(({ i, s }) => ({ id: i.id, name: i.courseName, days: daysSince(s.enteredAt, now), waitingOn: s.waitingOn }))
      .sort((a, b) => b.days - a.days);
    return { key: seg.key, label: seg.key === 'live' ? 'Went live this month' : seg.label, count: here.length, stuck };
  });
  return { stages, stuckDays: STUCK_DAYS };
}


// ─── AW-4b: the Courses list ────────────────────────────────────────────────

/** "Staff seen" goes amber after this many days quiet — only while the course is open. */
export const STAFF_QUIET_DAYS = 3;

/**
 * Amber when nobody from the course has used the dashboard for STAFF_QUIET_DAYS
 * AND the course had tee times in that stretch. A course closed for winter (no
 * tee times, or all blocked) stays quiet — a closed course isn't slipping.
 */
export function staffSeenSignal(lastSeen: Date | null, hadTeeTimes: boolean, now: Date): { quiet: boolean; days: number | null } {
  const days = lastSeen ? Math.floor((now.getTime() - lastSeen.getTime()) / 86_400_000) : null;
  const quiet = hadTeeTimes && (days === null || days >= STAFF_QUIET_DAYS);
  return { quiet, days };
}

export type TodayCourse = {
  id: string; name: string; live: boolean;
  staffSeenAt: string | null; staffQuiet: boolean;
  feesThisMonth: number;
  rows: ActionRow[];
};

/**
 * One entry per live or draft course with its own to-dos (rows carrying its
 * courseId), "Staff seen" and its GreenReserve fees since the 1st. Courses with
 * a to-do first (red before amber), then the quiet ones, then by name.
 */
export async function todayCourses(now: Date, rows: ActionRow[]): Promise<TodayCourse[]> {
  const courses = await prisma.course.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, active: true, timezone: true, staffLastSeenAt: true },
    orderBy: { name: 'asc' },
  });
  if (courses.length === 0) return [];
  const ids = courses.map(c => c.id);
  const start = startOfPlatformMonth(now);
  // Widest window any course's "last 3 days" can cover; each course is then checked in its own timezone.
  const from = addDaysStr(dayKey(now), -(STAFF_QUIET_DAYS + 1));
  const [fees, feeEvents, teeTimes] = await Promise.all([
    prisma.booking.groupBy({ by: ['courseId'], where: { ...PAID, courseId: { in: ids }, paidAt: { gte: start, lt: now } }, _sum: { accessFeeTotal: true } }),
    prisma.paymentEvent.findMany({
      where: { kind: { in: ['fee_charged', 'fee_refunded'] }, createdAt: { gte: start, lt: now }, booking: { courseId: { in: ids } } },
      select: { kind: true, amountCents: true, booking: { select: { courseId: true } } },
    }),
    prisma.teeTime.groupBy({ by: ['courseId', 'date'], where: { courseId: { in: ids }, date: { gte: from }, status: { not: 'blocked' } } }),
  ]);
  const feeCents = new Map<string, number>();
  for (const f of fees) feeCents.set(f.courseId, f._sum.accessFeeTotal ?? 0);
  for (const e of feeEvents) {
    const id = e.booking.courseId;
    feeCents.set(id, (feeCents.get(id) ?? 0) + (e.kind === 'fee_charged' ? e.amountCents : -e.amountCents));
  }
  const datesByCourse = new Map<string, string[]>();
  for (const t of teeTimes) datesByCourse.set(t.courseId, [...(datesByCourse.get(t.courseId) ?? []), t.date]);
  const rowsByCourse = new Map<string, ActionRow[]>();
  for (const r of rows) if (r.courseId) rowsByCourse.set(r.courseId, [...(rowsByCourse.get(r.courseId) ?? []), r]);

  const out = courses.map((c): TodayCourse => {
    const today = todayIn(c.timezone, now);
    const windowStart = addDaysStr(today, -(STAFF_QUIET_DAYS - 1));
    const hadTeeTimes = (datesByCourse.get(c.id) ?? []).some(d => d >= windowStart && d <= today);
    // A draft has no staff working it yet; "Draft not yet live" is its to-do.
    const seen = staffSeenSignal(c.staffLastSeenAt, c.active && hadTeeTimes, now);
    return {
      id: c.id, name: c.name, live: c.active,
      staffSeenAt: c.staffLastSeenAt?.toISOString() ?? null, staffQuiet: seen.quiet,
      feesThisMonth: (feeCents.get(c.id) ?? 0) / 100,
      rows: rowsByCourse.get(c.id) ?? [],
    };
  });
  const rank = (c: TodayCourse) => c.rows.some(r => r.severity === 'bad') ? 0 : c.rows.length || c.staffQuiet ? 1 : 2;
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
