// AW-3b (Cam 2026-10-21: "that search bar AI feature where I can find anything"):
// the admin search's "Ask" mode. A question goes to the model with READ-ONLY
// tools over platform data; the answer links to the admin pages it found.
//
// One rule per tool, as in lib/birdie/tools.ts:
//   - nothing here writes — there is no tool that changes anything;
//   - every tool re-checks the asker's role at run time against the gate of the
//     admin page that shows the same data, so Ask is never a way around a page;
//   - every model-supplied input is validated by hand before a query, and
//     outputs are compact summaries (no card details, no tokens, no secrets).
import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma';
import { VIEWER_PLUS, SUPPORT_PLUS } from './admin-roles';
import { FAILED_CHARGE_WHERE, openDisputes } from './money-problems';
import { dayKey } from './admin-day';

export type AskOutcome = { content: string; isError: boolean };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;
const PAID = { paymentStatus: 'paid', roundPaymentIntentId: { not: '' } } as const;
const dollars = (cents: number) => Math.round(cents) / 100;

// Deterministic order and wording: the tool list is the front of the cached prefix.
export const ASK_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'list_courses',
    description: "Every course on GreenReserve (archived ones left out) with its page status (draft / live …), whether it is taking bookings, whether its Stripe account can take payments, when it was added and first went live, and the date of its most recent booking. Use it for questions about which courses exist, are live, are stuck, or have gone quiet.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'bookings_by_course',
    description: "Bookings per course for a date range of TEE TIMES (YYYY-MM-DD, inclusive): bookings, players, cancelled, no-shows, checked in, and GreenReserve fees collected on rounds paid in that range. Courses with no bookings in the range are listed with zeros, so 'which courses had no bookings' is answerable. Leave both dates out for the last 7 days.",
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'First tee-time date, YYYY-MM-DD.' },
        to: { type: 'string', description: 'Last tee-time date, YYYY-MM-DD, inclusive.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_inquiries',
    description: "Course inquiries (the onboarding pipeline: pending → in_review → details_requested → details_submitted → building → live, or closed) with the course, the contact, the stage and how many days since it last changed. Filter by stage, or by how long it has sat unchanged.",
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Only this stage, e.g. pending or details_requested.' },
        unchangedForDays: { type: 'integer', description: 'Only inquiries that have not changed for at least this many days.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'money_problems',
    description: 'Money that should exist and does not: cards declined at check-in that nobody has collected since, and chargebacks the bank opened that are not closed. Each with the course, golfer and amount.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

export const ASK_TOOL_NAMES = new Set(ASK_TOOLS.map(t => t.name));

function err(content: string): AskOutcome { return { content, isError: true }; }
function ok(data: unknown): AskOutcome { return { content: JSON.stringify(data), isError: false }; }

export async function runAskTool(name: string, input: unknown, role: string): Promise<AskOutcome> {
  const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const allowed = (roles: string[]) => roles.includes(role);

  if (name === 'list_courses') {
    if (!allowed(VIEWER_PLUS)) return err('This login cannot see courses.');
    const courses = await prisma.course.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, city: true, state: true, active: true, liveStatus: true, stripeAccountActive: true, createdAt: true, firstWentLiveAt: true },
    });
    const last = await prisma.booking.groupBy({ by: ['courseId'], _max: { createdAt: true } });
    const lastBy = new Map(last.map(l => [l.courseId, l._max.createdAt]));
    return ok(courses.map(c => ({
      id: c.id, name: c.name, place: [c.city, c.state].filter(Boolean).join(', '),
      page: c.liveStatus, takingBookings: c.active, stripeReady: c.stripeAccountActive,
      added: c.createdAt.toISOString().slice(0, 10), firstLive: c.firstWentLiveAt?.toISOString().slice(0, 10) ?? null,
      lastBookingMade: lastBy.get(c.id)?.toISOString().slice(0, 10) ?? null,
      link: `/admin/courses/${c.id}`,
    })));
  }

  if (name === 'bookings_by_course') {
    if (!allowed(SUPPORT_PLUS)) return err('This login cannot see bookings or revenue.');
    const today = dayKey(new Date());
    const back7 = dayKey(new Date(Date.now() - 6 * 86_400_000));
    const from = typeof args.from === 'string' ? args.from : back7;
    const to = typeof args.to === 'string' ? args.to : today;
    if (!DATE.test(from) || !DATE.test(to) || from > to) return err('Dates must be YYYY-MM-DD with from on or before to.');
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_DAYS) return err(`Ask for ${MAX_DAYS} days or fewer.`);
    const inRange = { teeTime: { date: { gte: from, lte: to } } };
    const [courses, rows] = await Promise.all([
      prisma.course.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
      prisma.booking.findMany({
        where: inRange,
        select: { courseId: true, players: true, status: true, noShowAt: true, checkedInAt: true, paymentStatus: true, roundPaymentIntentId: true, accessFeeTotal: true },
      }),
    ]);
    const by = new Map(courses.map(c => [c.id, { course: c.name, link: `/admin/courses/${c.id}`, bookings: 0, players: 0, cancelled: 0, noShows: 0, checkedIn: 0, feesCollected: 0 }]));
    for (const b of rows) {
      const r = by.get(b.courseId);
      if (!r) continue;
      r.bookings++; r.players += b.players;
      if (b.status === 'cancelled') r.cancelled++;
      if (b.noShowAt) r.noShows++;
      if (b.checkedInAt) r.checkedIn++;
      if (b.paymentStatus === PAID.paymentStatus && b.roundPaymentIntentId) r.feesCollected += b.accessFeeTotal;
    }
    return ok({ from, to, courses: [...by.values()].map(r => ({ ...r, feesCollected: dollars(r.feesCollected) })).sort((a, b) => b.bookings - a.bookings) });
  }

  if (name === 'list_inquiries') {
    if (!allowed(VIEWER_PLUS)) return err('This login cannot see inquiries.');
    const status = typeof args.status === 'string' ? args.status.slice(0, 40) : undefined;
    const days = Number.isInteger(args.unchangedForDays) && (args.unchangedForDays as number) >= 0 ? Math.min(args.unchangedForDays as number, 3650) : undefined;
    const rows = await prisma.courseInquiry.findMany({
      where: { ...(status ? { status } : {}), ...(days !== undefined ? { updatedAt: { lte: new Date(Date.now() - days * 86_400_000) } } : {}) },
      orderBy: { updatedAt: 'asc' },
      take: 60,
      select: { id: true, courseName: true, contactName: true, status: true, createdAt: true, updatedAt: true },
    });
    const now = Date.now();
    return ok(rows.map(i => ({
      course: i.courseName, contact: i.contactName, stage: i.status,
      received: i.createdAt.toISOString().slice(0, 10),
      daysSinceLastChange: Math.floor((now - i.updatedAt.getTime()) / 86_400_000),
      link: `/admin/inquiries/${i.id}`,
    })));
  }

  if (name === 'money_problems') {
    if (!allowed(SUPPORT_PLUS)) return err('This login cannot see money problems.');
    const [failed, disputes] = await Promise.all([
      prisma.booking.findMany({
        where: FAILED_CHARGE_WHERE, take: 40, orderBy: { createdAt: 'desc' },
        select: { golferName: true, totalAmount: true, checkInFailReason: true, course: { select: { id: true, name: true } }, teeTime: { select: { date: true } } },
      }),
      openDisputes(),
    ]);
    return ok({
      declinedCards: failed.map(b => ({ course: b.course.name, golfer: b.golferName, round: b.teeTime.date, amount: dollars(b.totalAmount), why: b.checkInFailReason.slice(0, 120) })),
      openChargebacks: disputes.map(d => ({ course: d.booking?.course.name ?? '', golfer: d.booking?.golferName ?? '', amount: dollars(d.amountCents), opened: d.createdAt.toISOString().slice(0, 10) })),
      link: '/admin/revenue',
    });
  }

  return err('Unknown tool.');
}

