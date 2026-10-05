// BIRDIE_AI_SPEC B4a (Cam 2026-10-05) — live-data READ tools for the operator persona.
//
// Three tools, one rule each:
//   - the course is ALWAYS the session's (`ctx.courseId`); no tool takes a course,
//     and every query filters on it — a prompt naming another course's id gets
//     nothing back, because no input can reach a different courseId;
//   - every tool re-checks the login's own permission here, at run time (the
//     same keys the dashboard routes use). The tool LIST is the same for every
//     session so the cached prompt prefix holds; a login without the permission
//     gets an error result the model turns into words, never the data;
//   - every model-supplied input is validated by hand before it touches a query
//     (no zod in this project), and outputs are compact summaries, not raw rows.
// Nothing here writes. Proposals (B4b) live in their own module.
import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../prisma';
import { computeAnalytics, headline, previousRange, type Range } from '../analytics';
import { listSchedules } from '../schedule-service';
import { todayIn, addDaysStr } from '../course-time';
import { centsToDollarsOr0 } from '../money';
import type { PermissionKey } from '../staff-permissions';

export type ToolContext = {
  courseId: string;
  timezone: string | null;
  can: (key: PermissionKey) => boolean;
};

export type ToolOutcome = { content: string; isError: boolean };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

// Deterministic order and wording: these sit at the front of the cached prefix.
export const READ_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_analytics',
    description:
      "The course's own numbers for a date range: money collected vs expected, fill rate (and by day of week), the hours and days that lose the most revenue to empty spots, no-shows, cancellations, customers (new vs returning, top regulars) and booking behaviour. Use it for any question about how the course has been doing. Dates are course-local YYYY-MM-DD, inclusive; leave both out for the last 30 days. Set compare to true to also get the previous period of the same length.",
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date, YYYY-MM-DD (course-local).' },
        to: { type: 'string', description: 'End date, YYYY-MM-DD (course-local), inclusive.' },
        compare: { type: 'boolean', description: 'Also return the previous period of the same length.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_schedules',
    description:
      "The course's tee-time schedules (the recipes that generate bookable times: days of the week, first and last tee, interval, rates, running or paused) plus its blocked days from today on. Use it for questions about hours, intervals, prices or closures, and before suggesting any schedule change.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_tee_sheet',
    description:
      "One day of the course's tee sheet: every time with its status, spots booked and open, and each group on it (name, players, booked / checked in / no-show). Use it for questions about a specific day. Date is course-local YYYY-MM-DD; leave it out for today.",
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'The day, YYYY-MM-DD (course-local).' } },
      additionalProperties: false,
    },
  },
];

const err = (msg: string): ToolOutcome => ({ content: msg, isError: true });
const ok = (data: unknown): ToolOutcome => ({ content: JSON.stringify(data), isError: false });
const dollars = (cents: number) => Math.round(cents) / 100;

function asObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

async function getAnalytics(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  if (!ctx.can('analytics.view')) return err("This login can't see Analytics — the course owner decides that under Settings → Staff & permissions.");
  const today = todayIn(ctx.timezone);
  const from = typeof input.from === 'string' ? input.from : '';
  const to = typeof input.to === 'string' ? input.to : '';
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return err('Dates must be YYYY-MM-DD.');
  const range: Range = from && to ? { from, to } : from ? { from, to: today } : { from: addDaysStr(today, -29), to: today };
  if (range.from > range.to) return err('The start date is after the end date.');
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86400000 + 1;
  if (!Number.isFinite(span) || span > MAX_DAYS) return err(`Pick a range of ${MAX_DAYS} days or fewer.`);

  const a = await computeAnalytics(ctx.courseId, range);
  // Dollars only: handing the model both cents and dollars invites it to quote the wrong one.
  const inDollars = (h: ReturnType<typeof headline>) => {
    const { collectedCents, expectedCents, lostCents, ...rest } = h;
    return { collected: dollars(collectedCents), expected: dollars(expectedCents), lostToEmptySpots: dollars(lostCents), ...rest };
  };
  const compare = input.compare === true ? { range: previousRange(range), headline: inDollars(headline(await computeAnalytics(ctx.courseId, previousRange(range)))) } : null;
  // A compact summary: the same numbers as the Analytics tab, minus the per-row lists.
  return ok({
    range, today,
    note: 'Money is in dollars. Revenue is the course share (green, cart, range) — GreenReserve fees are not included.',
    headline: inDollars(headline(a)),
    compare,
    fillByDayOfWeek: a.utilization.byDow,
    blockedTimes: a.utilization.blockedTimes,
    worstHours: a.unfilled.worstHours.map(({ lostCents, ...r }) => ({ ...r, lost: dollars(lostCents) })),
    worstDays: a.unfilled.worstDays.map(({ lostCents, ...r }) => ({ ...r, lost: dollars(lostCents) })),
    noShows: { count: a.noShows.count, ratePct: a.noShows.ratePct, impact: dollars(a.noShows.impactCents), repeatOffenders: a.noShows.repeat.slice(0, 5) },
    cancellations: { count: a.cancellations.count, ratePct: a.cancellations.ratePct, lost: dollars(a.cancellations.lostCents), lateFeesKept: dollars(a.cancellations.lateFeesKeptCents), rebookedPct: a.cancellations.rebookedPct },
    customers: {
      identified: a.customers.identified, new: a.customers.newCustomers, returning: a.customers.returning, returningPct: a.customers.returningPct,
      retentionPct: a.customers.retentionPct, avgDaysBetweenVisits: a.customers.avgDaysBetweenVisits,
      topByRounds: a.customers.topByRounds.slice(0, 5),
    },
    behavior: { bookings: a.behavior.bookings, players: a.behavior.players, avgGroupSize: a.behavior.avgGroupSize, avgLeadDays: a.behavior.avgLeadDays, channel: a.behavior.channel },
  });
}

async function getSchedules(ctx: ToolContext): Promise<ToolOutcome> {
  if (!ctx.can('schedule.view')) return err("This login can't see the schedule — the course owner decides that under Settings → Staff & permissions.");
  const today = todayIn(ctx.timezone);
  const [schedules, blackouts] = await Promise.all([
    listSchedules(ctx.courseId),
    prisma.blackout.findMany({ where: { courseId: ctx.courseId, date: { gte: today } }, orderBy: { date: 'asc' }, take: 60, select: { id: true, date: true, reason: true } }),
  ]);
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return ok({
    today,
    schedules: schedules.map(s => {
      const w = s as Record<string, unknown>;
      return {
        id: w.id, running: w.active, days: (w.daysOfWeek as number[] | undefined)?.map(d => DOW[d]) ?? [],
        firstTee: w.startTime, lastTee: w.endTime, intervalMinutes: w.intervalMinutes, holes: w.holes, round: w.productLabel ?? null,
        greenFeeWeekday: w.greenFeeWeekday, greenFeeWeekend: w.greenFeeWeekend, cartFee: w.cartFee,
        memberRateWeekday: w.memberRateWeekday ?? null, memberRateWeekend: w.memberRateWeekend ?? null,
      };
    }),
    blockedDays: blackouts,
  });
}

async function getTeeSheet(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  if (!ctx.can('sheet.view')) return err("This login can't see the tee sheet.");
  const today = todayIn(ctx.timezone);
  const date = typeof input.date === 'string' && input.date ? input.date : today;
  if (!DATE.test(date)) return err('The date must be YYYY-MM-DD.');
  const times = await prisma.teeTime.findMany({
    where: { courseId: ctx.courseId, date },
    orderBy: { time: 'asc' },
    select: {
      time: true, status: true, holes: true, playersAvailable: true, playersBooked: true, greenFeeCents: true,
      bookings: {
        where: { status: { in: ['confirmed', 'completed'] } },
        select: { golferName: true, players: true, status: true, checkedInAt: true, noShowAt: true },
      },
    },
  });
  const groups = times.flatMap(t => t.bookings);
  return ok({
    date, today,
    summary: {
      times: times.length,
      groupsBooked: groups.length,
      playersBooked: groups.reduce((s, b) => s + b.players, 0),
      checkedIn: groups.filter(b => b.checkedInAt || b.status === 'completed').length,
      noShows: groups.filter(b => b.noShowAt).length,
      // playersAvailable is the slot's capacity; what is left is capacity − booked.
      openSpots: times.filter(t => t.status !== 'blocked').reduce((s, t) => s + Math.max(0, t.playersAvailable - t.playersBooked), 0),
    },
    times: times.map(t => ({
      time: t.time, status: t.status, holes: t.holes, booked: t.playersBooked, open: t.status === 'blocked' ? 0 : Math.max(0, t.playersAvailable - t.playersBooked), greenFee: centsToDollarsOr0(t.greenFeeCents),
      groups: t.bookings.map(b => ({ name: b.golferName, players: b.players, state: b.noShowAt ? 'no-show' : (b.checkedInAt || b.status === 'completed') ? 'checked in' : 'booked' })),
    })),
  });
}

/** Runs one tool call. Unknown names and bad inputs come back as errors, never throws on model input. */
export async function runReadTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const args = asObject(input);
  switch (name) {
    case 'get_analytics': return getAnalytics(args, ctx);
    case 'get_schedules': return getSchedules(ctx);
    case 'get_tee_sheet': return getTeeSheet(args, ctx);
    default: return err(`There is no tool called ${name}.`);
  }
}
