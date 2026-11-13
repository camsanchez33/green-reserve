import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, areaGate } from '@/lib/admin-session';
import { hasArea } from '@/lib/admin-areas';
import { FAILED_CHARGE_WHERE, openDisputes } from '@/lib/money-problems';
import { ON_REAL_COURSE } from '@/lib/real-courses';
import { roundChargeCents } from '@/lib/booking-fees';
import { dayKey } from '@/lib/admin-day';
import { FILTERS, isFilter, type BookingFilter, numberQuery, bookingNumber, sumLedger, EMPTY_LEDGER, payState, feeState, policyLine, rowAmount, isDisputeRow, paidBeforeDispute, type BookingFacts } from './plan';

// ADMIN-REDO page 4 — Bookings (Cam 2026-11-12). READ-ONLY, by design: "book keeping for legality if someone ever
// asks". Every booking on GreenReserve, newest booked first: what was owed, what was paid (the ledger), whether our
// service fee was collected, and the history. There is no charge, retry, refund, dispute or message action here,
// and none may be added (Cam: "it is not allowed or in our responsibility to retry the payment").
//
// Who sees it (AW-11): the Money area, support+ (as Revenue). The golfer's email and phone also need Golfers.
// Test courses never show (TEST-2: ON_REAL_COURSE), like every platform-wide list.

const PAGE = 50;
const SELECT = {
  id: true, createdAt: true, status: true, paymentStatus: true, paidOffline: true, source: true, players: true,
  golferName: true, accessFeeTotal: true, stripePaymentMethodId: true, checkInFailReason: true, checkedInAt: true, noShowAt: true,
  roundPaymentIntentId: true, totalAmount: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, feePaidCents: true,
  course: { select: { id: true, name: true } }, teeTime: { select: { date: true, time: true } },
} satisfies Prisma.BookingSelect;
type Row = Prisma.BookingGetPayload<{ select: typeof SELECT }>;

function filterWhere(f: BookingFilter, today: string, disputedIds: string[]): Prisma.BookingWhereInput {
  switch (f) {
    case 'problems': return { OR: [FAILED_CHARGE_WHERE, { id: { in: disputedIds } }] };
    case 'today': return { teeTime: { date: today } };
    case 'upcoming': return { status: 'confirmed', teeTime: { date: { gt: today } } };
    case 'noshows': return { noShowAt: { not: null } };
    case 'cancelled': return { status: 'cancelled' };
    default: return {};
  }
}

async function ledgerFor(ids: string[]) {
  const moves = ids.length ? await prisma.moneyMove.findMany({ where: { bookingId: { in: ids } }, select: { bookingId: true, direction: true, amountCents: true, platformFeeCents: true, stripeId: true, what: true } }) : [];
  const by = new Map<string, typeof moves>();
  for (const m of moves) { const k = m.bookingId!; by.set(k, [...(by.get(k) ?? []), m]); }
  return (id: string) => (by.has(id) ? sumLedger(by.get(id)!) : EMPTY_LEDGER);
}

function facts(b: Row, ledger: BookingFacts['ledger'], disputed: Set<string>): BookingFacts {
  return {
    status: b.status, paymentStatus: b.paymentStatus, paidOffline: b.paidOffline, accessFeeTotal: b.accessFeeTotal,
    paidByCard: b.paymentStatus === 'paid' && !!b.roundPaymentIntentId,
    hasCard: !!b.stripePaymentMethodId, failed: !!b.checkInFailReason && !b.checkedInAt, disputed: disputed.has(b.id),
    noShow: !!b.noShowAt, checkedIn: !!b.checkedInAt, ledger,
  };
}

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const noArea = areaGate(session, 'money');
  if (noArea) return noArea;
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: "Your login can't open bookings." }, { status: 403 });
  const seesContact = hasArea(session, 'golfers');
  const seesCourses = hasArea(session, 'courses');
  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const today = dayKey(now);
  const disputes = await openDisputes();
  const disputedIds = [...new Set(disputes.map(d => d.bookingId))];
  const disputed = new Set(disputedIds);

  const id = sp.get('id');
  if (id) return profile(id, disputed, seesContact, seesCourses);

  const f: BookingFilter = isFilter(sp.get('filter')) ? (sp.get('filter') as BookingFilter) : 'all';
  const q = (sp.get('q') ?? '').trim().slice(0, 100);
  const num = q ? numberQuery(q) : null;
  // Without Golfers, an email finds a booking only as the WHOLE address, compared in code: an insensitive equals is an
  // ILIKE in Postgres, where % and _ would let a login read addresses it can't see a letter at a time. The compare
  // below keeps only the exact address, so _ (common in emails) is safe; % and \\ are refused outright.
  let exactEmailIds: string[] = [];
  if (q && !seesContact && q.includes('@') && !/[%\\]/.test(q)) {
    const hits = await prisma.booking.findMany({ where: { golferEmail: { equals: q, mode: 'insensitive' }, ...ON_REAL_COURSE }, select: { id: true, golferEmail: true }, take: 500 });
    exactEmailIds = hits.filter(h => h.golferEmail.toLowerCase() === q.toLowerCase()).map(h => h.id);
  }
  const search: Prisma.BookingWhereInput = !q ? {} : {
    OR: [
      ...(num ? [{ id: { startsWith: num } }] : []),
      { golferName: { contains: q, mode: 'insensitive' } },
      { course: { name: { contains: q, mode: 'insensitive' } } },
      // Cam 2026-11-12 (Users & golfers dropped): support finds a golfer here, by email too. Without Golfers only the
      // whole address matches (support has it from the caller) — a part would let a login read emails it can't see.
      ...(seesContact ? [{ golferEmail: { contains: q, mode: 'insensitive' } }] : exactEmailIds.length ? [{ id: { in: exactEmailIds } }] : []),
    ],
  } as Prisma.BookingWhereInput;
  const base: Prisma.BookingWhereInput = { ...ON_REAL_COURSE, ...search };
  const cursor = sp.get('cursor');
  const [rows, counts] = await Promise.all([
    prisma.booking.findMany({
      where: { AND: [base, filterWhere(f, today, disputedIds)] }, select: SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: PAGE + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    Promise.all(FILTERS.map(k => prisma.booking.count({ where: { AND: [base, filterWhere(k, today, disputedIds)] } }))),
  ]);
  const page = rows.slice(0, PAGE);
  const ledger = await ledgerFor(page.map(b => b.id));
  return NextResponse.json({
    at: now.toISOString(), filter: f, q, seesCourses,
    counts: Object.fromEntries(FILTERS.map((k, i) => [k, counts[i]])),
    nextCursor: rows.length > PAGE ? page[page.length - 1].id : null,
    rows: page.map(b => {
      const fx = facts(b, ledger(b.id), disputed);
      const pay = payState(fx);
      return {
        // TODO(Build): show Booking.ref as GR-<n> once Build's field lands; bookingNumber(id) is the fallback while ref is null.
        id: b.id, number: bookingNumber(b.id), golferName: b.golferName, course: b.course.name, courseId: b.course.id,
        teeDate: b.teeTime.date, teeTime: b.teeTime.time, players: b.players, bookedAt: b.createdAt.toISOString(),
        // The amount: what moved once anything moved (a dispute: what was paid before it), else what the round
        // comes to (roundChargeCents, POS-1a).
        amountCents: rowAmount(fx, roundChargeCents(b)),
        pay: { key: pay.key, short: pay.short, tone: pay.tone },
      };
    }),
  });
}

// Test mode the way card-reader.ts tells it (an sk_test_ or rk_test_ key). The account comes before /test in Stripe's
// dashboard paths. NOTE: unverified against a live direct charge — Build to click one in both modes before launch.
const stripeTest = () => /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? '');

async function profile(id: string, disputed: Set<string>, seesContact: boolean, seesCourses: boolean) {
  const b = await prisma.booking.findFirst({
    where: { id, ...ON_REAL_COURSE },
    select: {
      ...SELECT, golferEmail: true, golferPhone: true, golferAccountId: true, greenFeeTotal: true, cartFeeTotal: true, cartSelected: true,
      rangeBallsTotal: true, noShowFeeTotal: true, cancellationFeeTotal: true, cancellationHoursAtBooking: true, cancelledAt: true,
      checkedInPlayers: true, splitFromId: true, promoDiscountCents: true,
      teeTime: { select: { date: true, time: true, holes: true } },
      course: { select: { id: true, name: true, stripeAccountId: true } },
    },
  });
  if (!b) return NextResponse.json({ error: 'That booking is not on record here — go back to the list.' }, { status: 404 });
  const [moves, events, payEvents] = await Promise.all([
    prisma.moneyMove.findMany({ where: { bookingId: id }, orderBy: { at: 'asc' }, select: { at: true, what: true, direction: true, method: true, account: true, amountCents: true, platformFeeCents: true, stripeId: true, note: true } }),
    prisma.bookingEvent.findMany({ where: { bookingId: id }, orderBy: { occurredAt: 'asc' }, select: { type: true, occurredAt: true, actorType: true, amountCents: true, playerCount: true } }),
    prisma.paymentEvent.findMany({ where: { bookingId: id, kind: { in: ['charge_failed', 'dispute_opened', 'dispute_closed'] } }, orderBy: { createdAt: 'asc' }, select: { kind: true, createdAt: true, amountCents: true, detail: true } }),
  ]);
  const ledger = sumLedger(moves);
  const fx = facts(b, ledger, disputed);
  const pay = payState(fx);
  const fee = feeState(fx);
  // Stripe ↗ (view only): the first card payment on record, on the account it was made on.
  const card = moves.find(m => m.stripeId?.startsWith('pi_') && m.direction === 'in');
  const acct = card?.account === 'course' && b.course.stripeAccountId ? `/${b.course.stripeAccountId}` : '';
  const stripeUrl = card ? `https://dashboard.stripe.com${acct}${stripeTest() ? '/test' : ''}/payments/${card.stripeId}` : null;
  return NextResponse.json({
    id: b.id, number: bookingNumber(b.id), golferName: b.golferName, course: b.course.name, courseId: b.course.id, seesCourses,
    teeDate: b.teeTime.date, teeTime: b.teeTime.time, holes: b.teeTime.holes, players: b.players, riding: b.cartSelected,
    bookedAt: b.createdAt.toISOString(), source: b.source, status: b.status, splitFromId: b.splitFromId,
    contact: seesContact ? { email: b.golferEmail || null, phone: b.golferPhone || null, accountId: b.golferAccountId } : null,
    policy: policyLine({ cancellationHours: b.cancellationHoursAtBooking, lateFeeCents: b.cancellationFeeTotal, noShowFeeCents: b.noShowFeeTotal, source: b.source }),
    checkedIn: b.checkedInAt ? { at: b.checkedInAt.toISOString(), players: b.checkedInPlayers } : null,
    noShowAt: b.noShowAt?.toISOString() ?? null, cancelledAt: b.cancelledAt?.toISOString() ?? null,
    declineReason: fx.failed ? b.checkInFailReason : null,
    pay, fee,
    owed: {
      greenCents: b.greenFeeTotal, cartCents: b.cartFeeTotal, rangeCents: b.rangeBallsTotal, shopCents: b.shopTotalCents + (b.shopTaxCents ?? 0),
      discountCents: b.promoDiscountCents, feeCents: b.accessFeeTotal,
      // No round price for a booking that never played (cancelled, or a no-show that never checked in).
      roundCents: b.status === 'cancelled' || (b.noShowAt && !b.checkedInAt) ? null : roundChargeCents(b),
    },
    paid: { inCents: ledger.inCents, outCents: ledger.outCents, beforeDisputeCents: paidBeforeDispute(ledger), disputeOutCents: ledger.disputeOutCents },
    moves: moves.map(m => ({ at: m.at.toISOString(), what: m.what, direction: m.direction, method: m.method, account: m.account, cents: m.amountCents, feeCents: m.platformFeeCents, dispute: isDisputeRow(m) })),
    events: events.map(e => ({ at: e.occurredAt.toISOString(), type: e.type, by: e.actorType, cents: e.amountCents, players: e.playerCount })),
    problems: payEvents.map(p => ({ at: p.createdAt.toISOString(), kind: p.kind, cents: p.amountCents, detail: p.detail.slice(0, 200) })),
    stripeUrl,
  });
}
