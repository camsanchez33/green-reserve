import { prisma } from './prisma';
import { startOfPlatformMonth, startOfPlatformMonthsAgo, dayKey } from './admin-day';
import { cronHealth, lastStripeWebhook } from './cron-log';
import { sumExpensesForPeriodCents } from './expenses';
import { fetchStripeFeeWindow } from './platform-stripe';
import { FUNNEL_SEGMENTS, ACTIVE_STATUSES, queueSignal, daysSince } from './inquiry-status';
import vercelConfig from '../../vercel.json';

// AW-4: the data behind the admin Today page's Health, Money and Onboarding
// sections (Needs you now is lib/admin-action-queue.ts). The route gates each
// by role; nothing here checks who is asking.

const CRONS = ((vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? []);
/** In one stage this long, with nothing snoozed, an inquiry is stuck. */
export const STUCK_DAYS = 7;
const PAID = { paymentStatus: 'paid', roundPaymentIntentId: { not: '' } } as const;
const WEBHOOK_QUIET_DAYS = 7;

export async function todayMoney(now: Date, owner: boolean) {
  const start = startOfPlatformMonth(now);
  const priorStart = startOfPlatformMonthsAgo(now, 1);
  // "Same point last month": as far into last month as we are into this one.
  const priorEnd = new Date(Math.min(priorStart.getTime() + (now.getTime() - start.getTime()), start.getTime()));
  const windowSum = async (from: Date, to: Date) => {
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
  };
  const [cur, prior] = await Promise.all([windowSum(start, now), windowSum(priorStart, priorEnd)]);
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
      .filter(({ s }) => s.waitingOn !== 'snoozed' && daysSince(s.enteredAt, now) >= STUCK_DAYS)
      .map(({ i, s }) => ({ id: i.id, name: i.courseName, days: daysSince(s.enteredAt, now), waitingOn: s.waitingOn }))
      .sort((a, b) => b.days - a.days);
    return { key: seg.key, label: seg.key === 'live' ? 'Went live this month' : seg.label, count: here.length, stuck };
  });
  return { stages, stuckDays: STUCK_DAYS };
}

