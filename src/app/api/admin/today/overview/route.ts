import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, requireOwner, SUPPORT_PLUS } from '@/lib/admin-session';
import { hasArea, type AdminArea } from '@/lib/admin-areas';
import { todayMoney, todayOnboarding } from '@/lib/admin-today';
import { buildActionQueue } from '@/lib/admin-action-queue';
import { listProblems } from '@/lib/problems';
import { REAL_COURSE, ON_REAL_COURSE, ON_REAL_BOOKING } from '@/lib/real-courses';
import { startOfPlatformMonth, startOfPlatformMonthsAgo, dayKey } from '@/lib/admin-day';
import { addDaysStr } from '@/lib/course-time';
import { golferKey } from '@/lib/golfer-key';

// ADMIN-REDO Overview (Cam 2026-11-11, the "green glass" mockup): the admin's
// first page. READ-ONLY. Every figure is counted here or by the libs the old
// Home used; nothing is estimated. TEST-2: test courses never count.
//
// Like /api/admin/today (its sibling), the route is open to every signed-in
// support+ login and each section needs its own area (AW-11); a section the
// person can't see comes back null and the page leaves it out:
//   coursesLive, players  Courses        revenue, chart  Money
//   golfers               Golfers        onboarding      Pipeline
//   net                   owner only (Revenue's own net: fees − Stripe − expenses)
//   activity / attention  each row by the area it comes from
//
// "This month" is the platform month so far; it is compared with last month
// up to the same point (todayMoney's rule), never with a finished month.

const DAY = 86_400_000;
const PAID = { paymentStatus: 'paid', roundPaymentIntentId: { not: '' }, ...ON_REAL_COURSE } as const;
const LIVE = { status: { not: 'cancelled' }, ...ON_REAL_COURSE } as const;

type Grouping = 'day' | 'week' | 'month' | 'quarter' | 'year';
const SERIES: Record<Grouping, { n: number; sub: string }> = {
  day: { n: 14, sub: 'last 14 days' },
  week: { n: 12, sub: 'last 12 weeks' },
  month: { n: 12, sub: 'last 12 months' },
  quarter: { n: 4, sub: 'last 4 quarters' },
  year: { n: 3, sub: 'last 3 years' },
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Monday of the week a YYYY-MM-DD day falls in. */
function mondayOf(d: string): string {
  const dow = new Date(d + 'T12:00:00Z').getUTCDay();
  return addDaysStr(d, dow === 0 ? -6 : 1 - dow);
}
function bucketOf(g: Grouping, d: string): string {
  if (g === 'day') return d;
  if (g === 'week') return mondayOf(d);
  if (g === 'month') return d.slice(0, 7);
  if (g === 'quarter') return `${d.slice(0, 4)}-Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;
  return d.slice(0, 4);
}
/** The bucket `k` steps before the one `key` names. */
function stepBack(g: Grouping, key: string, k: number): string {
  if (g === 'day') return addDaysStr(key, -k);
  if (g === 'week') return addDaysStr(key, -7 * k);
  if (g === 'month') {
    const m = Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1 - k;
    return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
  }
  if (g === 'quarter') {
    const q = Number(key.slice(0, 4)) * 4 + Number(key.slice(6)) - 1 - k;
    return `${Math.floor(q / 4)}-Q${(q % 4) + 1}`;
  }
  return String(Number(key) - k);
}
function labelOf(g: Grouping, key: string): string {
  if (g === 'day' || g === 'week') return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`;
  if (g === 'month') return MONTHS[Number(key.slice(5, 7)) - 1];
  if (g === 'quarter') return `${key.slice(5)} ${key.slice(0, 4)}`;
  return key;
}

/** Fees collected per platform day — paidWindow's rule: round fees by paidAt, plus booking fees charged on their own, less refunds. */
async function feesPerDay(from: Date): Promise<Map<string, number>> {
  const [rounds, events] = await Promise.all([
    prisma.booking.findMany({ where: { ...PAID, paidAt: { gte: from } }, select: { paidAt: true, accessFeeTotal: true } }),
    prisma.paymentEvent.findMany({ where: { kind: { in: ['fee_charged', 'fee_refunded'] }, createdAt: { gte: from }, ...ON_REAL_BOOKING }, select: { kind: true, amountCents: true, createdAt: true } }),
  ]);
  const out = new Map<string, number>();
  const add = (at: Date, c: number) => { const k = dayKey(at); out.set(k, (out.get(k) ?? 0) + c); };
  for (const r of rounds) if (r.paidAt) add(r.paidAt, r.accessFeeTotal ?? 0);
  for (const e of events) add(e.createdAt, e.kind === 'fee_charged' ? e.amountCents : -e.amountCents);
  return out;
}

function buildChart(perDay: Map<string, number>, today: string) {
  const out = {} as Record<Grouping, { labels: string[]; cur: number[]; prev: number[]; totalCents: number; sub: string }>;
  for (const g of Object.keys(SERIES) as Grouping[]) {
    const { n, sub } = SERIES[g];
    const sums = new Map<string, number>();
    for (const [d, c] of perDay) { const b = bucketOf(g, d); sums.set(b, (sums.get(b) ?? 0) + c); }
    const last = bucketOf(g, today);
    const keys = Array.from({ length: n }, (_, i) => stepBack(g, last, n - 1 - i));
    const prevKeys = keys.map(k => stepBack(g, k, n));
    const cur = keys.map(k => sums.get(k) ?? 0);
    out[g] = { labels: keys.map(k => labelOf(g, k)), cur, prev: prevKeys.map(k => sums.get(k) ?? 0), totalCents: cur.reduce((a, b) => a + b, 0), sub };
  }
  return out;
}

/** Players booked and distinct golfers among bookings made in a window. */
async function bookedIn(from: Date, to: Date) {
  const rows = await prisma.booking.findMany({
    where: { ...LIVE, createdAt: { gte: from, lt: to } },
    select: { players: true, splitFromId: true, golferEmail: true, golferPhone: true, golferAccountId: true },
  });
  const keys = new Set<string>();
  let players = 0;
  for (const r of rows) {
    // PARTIAL-1/SPLIT-1: a split part carries players taken off its group, so players add up across parts;
    // the golfer is the group's, so only the group counts toward golfers.
    players += r.players;
    if (r.splitFromId) continue;
    const k = golferKey(r);
    if (k) keys.add(k);
  }
  return { players, golfers: keys.size };
}

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const support = requireRole(session, SUPPORT_PLUS);
  const can = (a: AdminArea) => support && hasArea(session, a);
  const owner = requireOwner(session);
  const now = new Date();
  const today = dayKey(now);
  const start = startOfPlatformMonth(now);
  const priorStart = startOfPlatformMonthsAgo(now, 1);
  const priorEnd = new Date(Math.min(priorStart.getTime() + (now.getTime() - start.getTime()), start.getTime()));
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  // The chart's earliest bucket: the year view's first "period before" year.
  const chartFrom = new Date(`${Number(today.slice(0, 4)) - 2 * SERIES.year.n + 1}-01-01T00:00:00Z`);

  const [money, perDay, liveCount, wentLive, wentLivePrior, booked, bookedPrior, onboarding, queue, problems, newInquiries, liveEvents, agreements] = await Promise.all([
    can('money') || owner ? todayMoney(now, owner) : null,
    can('money') ? feesPerDay(chartFrom) : null,
    can('courses') ? prisma.course.count({ where: { active: true, archivedAt: null, ...REAL_COURSE } }) : null,
    can('courses') ? prisma.course.count({ where: { firstWentLiveAt: { gte: start, lt: now }, ...REAL_COURSE } }) : null,
    can('courses') ? prisma.course.count({ where: { firstWentLiveAt: { gte: priorStart, lt: priorEnd }, ...REAL_COURSE } }) : null,
    can('courses') || can('golfers') ? bookedIn(start, now) : null,
    can('courses') || can('golfers') ? bookedIn(priorStart, priorEnd) : null,
    can('pipeline') ? todayOnboarding(now) : null,
    can('pipeline') || can('courses') ? buildActionQueue(now) : null,
    can('problems') ? listProblems(now) : null,
    can('pipeline') ? prisma.courseInquiry.findMany({ where: { createdAt: { gte: weekAgo } }, select: { id: true, courseName: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 8 }) : null,
    can('courses') ? prisma.course.findMany({ where: { firstWentLiveAt: { gte: weekAgo }, ...REAL_COURSE }, select: { id: true, name: true, firstWentLiveAt: true }, orderBy: { firstWentLiveAt: 'desc' }, take: 8 }) : null,
    can('courses') ? prisma.agreementAcceptance.findMany({ where: { acceptedAt: { gte: weekAgo }, course: REAL_COURSE }, select: { id: true, acceptedAt: true, course: { select: { id: true, name: true } } }, orderBy: { acceptedAt: 'desc' }, take: 8 }) : null,
  ]);

  const waiting = onboarding ? onboarding.stages.filter(s => s.key !== 'live') : null;

  type Activity = { id: string; at: string; text: string; tone: 'ok' | 'neutral' | 'brand'; href: string };
  const activity: Activity[] = [
    ...(liveEvents ?? []).map(c => ({ id: `live-${c.id}`, at: c.firstWentLiveAt!.toISOString(), text: `${c.name} went live`, tone: 'ok' as const, href: `/admin/courses/${c.id}` })),
    ...(agreements ?? []).map(a => ({ id: `agr-${a.id}`, at: a.acceptedAt.toISOString(), text: `${a.course.name} signed the operator agreement`, tone: 'brand' as const, href: `/admin/courses/${a.course.id}` })),
    ...(newInquiries ?? []).map(i => ({ id: `inq-${i.id}`, at: i.createdAt.toISOString(), text: `New course enquiry: ${i.courseName}`, tone: 'neutral' as const, href: `/admin/inquiries/${i.id}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  type Attention = { id: string; text: string; tone: 'bad' | 'warn'; href: string; action: string };
  const queueRows = queue ? queue.rows.filter(r => (r.courseId ? can('courses') : can('pipeline'))) : [];
  const attention: Attention[] = [
    ...(problems?.open ?? []).map(p => ({ id: `p-${p.id}`, text: p.title, tone: 'bad' as const, href: '/admin/problems', action: 'Open' })),
    ...queueRows.map(r => ({ id: `q-${r.id}`, text: `${r.who}: ${r.why}`, tone: r.severity, href: r.href, action: r.actionLabel })),
  ];
  attention.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'bad' ? -1 : 1));

  return NextResponse.json({
    at: now.toISOString(),
    month: { from: dayKey(start), priorFrom: dayKey(priorStart), priorTo: dayKey(priorEnd) },
    coursesLive: liveCount === null ? null : { count: liveCount, wentLive: wentLive ?? 0, wentLivePrior: wentLivePrior ?? 0 },
    revenue: money && can('money') ? { cents: Math.round(money.current.fees * 100), priorCents: Math.round(money.prior.fees * 100) } : null,
    players: booked && bookedPrior && can('courses') ? { count: booked.players, prior: bookedPrior.players } : null,
    golfers: booked && bookedPrior && can('golfers') ? { count: booked.golfers, prior: bookedPrior.golfers } : null,
    onboarding: waiting ? { waiting: waiting.reduce((a, s) => a + s.count, 0), stuck: waiting.reduce((a, s) => a + s.stuck.length, 0), stuckDays: onboarding!.stuckDays } : null,
    net: owner && money?.net ? {
      cents: money.net.current === null ? null : Math.round(money.net.current * 100),
      priorCents: money.net.prior === null ? null : Math.round(money.net.prior * 100),
      stripeUnavailable: money.net.stripeUnavailable,
    } : null,
    chart: perDay ? buildChart(perDay, today) : null,
    activity: support ? activity : null,
    attention: support ? { rows: attention.slice(0, 6), total: attention.length } : null,
  });
}
