// POS-3 R4 (Cam 2026-10-24: "end of day close-out", after Square's close
// drawer). At the end of a course day staff count the register: what the day's
// records say should be in the drawer, against what is there.
//
//   expected cash = starting cash
//                 + cash rung up at the register that day (items and green fees: ShopSale paid_cash)
//                 + groups marked paid at the counter on the tee sheet that day (paid_offline — since CASH-1
//                   (2026-10-25) new cash goes through the register, so these are older records;
//                   not settled through the register — those are already in the register's cash)
//                 + other cash taken that day: membership dues and event payments in cash (LEDGER-2, from MoneyMove)
//                 − cash handed back for refunds that day (and for those payments)
//
// "Paid at the counter" on the tee sheet records no tender (cash, a check, another
// terminal), so it is its own line on the close-out, never folded silently into
// "cash sales". Card taken that day is shown for reference and never counted
// against the drawer. Each count is a row (RegisterClose); a recount adds one and
// the latest stands. The day is the course's own (its timezone).
import { prisma } from './prisma';
import { todayIn, addDaysStr } from './course-time';
import { teeTimeInstant } from './booking-events';
import { counterDueCents } from './counter-pay';
import { roundChargeCents } from './shop';

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const MAX_CENTS = 10_000_000; // $100,000 — a typo guard
/** How far back a day can still be closed out (the day picker's range). */
export const CLOSE_BACK_DAYS = 14;

export type DaySummary = {
  day: string;
  /** untaxed: cash sales taken with no tax while Stripe Tax was down (ShopSale.taxUnavailable). */
  cashSales: { count: number; cents: number; itemsCents: number; roundsCents: number; untaxed: number };
  counterRounds: { count: number; cents: number };
  cashRefunds: { count: number; cents: number };
  /** Dues and event payments taken in cash, less their cash refunds (net). */
  otherCash: { count: number; cents: number };
  /** Cash taken, before the starting float: sales + counter rounds + other cash − refunds. */
  cashTakenCents: number;
  card: { shopCents: number; roundsCents: number; refundsCents: number; cents: number };
  /** Launch walk (Cam 2026-10-31): every cash movement of the day from the money ledger, so a short drawer can be traced. */
  cashMoves: { at: string; what: string; amountCents: number; note: string }[];
};
export type CloseView = {
  id: string; day: string; openingFloatCents: number; expectedCashCents: number; countedCashCents: number; differenceCents: number;
  cashSalesCents: number; counterRoundsCents: number; cashRefundsCents: number; otherCashCents: number; cardCents: number; note: string; closedBy: string; createdAt: string;
};
type CloseRow = Omit<CloseView, 'createdAt'> & { createdAt: Date; courseId: string };
const closeView = ({ courseId: _c, ...c }: CloseRow): CloseView => ({ ...c, createdAt: c.createdAt.toISOString() });

async function courseDay(courseId: string, day?: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  if (!course) return fail(404, 'Course not found.');
  const today = todayIn(course.timezone);
  const d = day || today;
  // Revamp 3 dead end 24 (Cam 2026-10-29): any of the last two weeks — Saturday's drawer can be
  // closed on Monday. Never a day still to come.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today || d < addDaysStr(today, -(CLOSE_BACK_DAYS - 1))) return fail(400, `Close out a day from the last ${CLOSE_BACK_DAYS} days.`);
  const start = teeTimeInstant(course.timezone, d, '00:00');
  const end = teeTimeInstant(course.timezone, addDaysStr(d, 1), '00:00');
  if (!start || !end) return fail(400, 'Bad day.');
  return { ok: true as const, value: { day: d, today, start, end } };
}

/** What the day's records say: cash in and out, card for reference. */
export async function daySummary(courseId: string, day?: string): Promise<Result<DaySummary & { today: string }>> {
  const cd = await courseDay(courseId, day);
  if (!cd.ok) return cd;
  const { start, end } = cd.value;
  const inDay = { gte: start, lt: end };
  const [cashSales, cardSales, refunds, counterAll, cardRounds, otherMoves] = await Promise.all([
    prisma.shopSale.findMany({ where: { courseId, status: 'paid_cash', paidAt: inDay }, select: { totalCents: true, roundsCents: true, taxUnavailable: true } }),
    prisma.shopSale.findMany({ where: { courseId, status: 'paid_card', paidAt: inDay }, select: { totalCents: true } }),
    prisma.shopSaleRefund.findMany({ where: { courseId, status: 'done', createdAt: inDay }, select: { amountCents: true, method: true } }),
    // Paid at the counter on the tee sheet — not the rounds the register already rang up in cash.
    prisma.booking.findMany({
      where: { courseId, paymentStatus: 'paid_offline', paidAt: inDay },
      select: { id: true, players: true, checkedInPlayers: true, totalAmount: true, accessFeeTotal: true, shopTotalCents: true, shopTaxCents: true, greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, residentPlayers: true, residentRateCents: true, memberRateCents: true, memberCartCents: true },
    }),
    prisma.booking.findMany({
      where: { courseId, paymentStatus: { in: ['paid', 'refunded'] }, roundPaymentIntentId: { not: '' }, paidAt: inDay },
      select: { roundChargedCents: true, totalAmount: true, accessFeeTotal: true, feePaidCents: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true },
    }),
    // Cash that never went through the register: dues and event payments.
    prisma.moneyMove.findMany({ where: { courseId, method: 'cash', what: { in: ['dues', 'event', 'account'] }, at: inDay }, select: { direction: true, amountCents: true } }),
  ]);
  // Rounds the register rang up are already in its cash sales.
  const viaRegister = counterAll.length
    ? new Set((await prisma.shopSaleLine.findMany({ where: { bookingId: { in: counterAll.map(b => b.id) }, sale: { courseId } }, select: { bookingId: true } })).map(l => l.bookingId))
    : new Set<string | null>();
  const counter = counterAll.filter(b => !viaRegister.has(b.id));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const cashRefunds = refunds.filter(r => r.method === 'cash');
  const s = {
    cashSales: { count: cashSales.length, cents: sum(cashSales.map(x => x.totalCents)), roundsCents: sum(cashSales.map(x => x.roundsCents)), itemsCents: sum(cashSales.map(x => x.totalCents - x.roundsCents)), untaxed: cashSales.filter(x => x.taxUnavailable).length },
    // A partial party paid for those who showed, as the counter charged it.
    counterRounds: { count: counter.length, cents: sum(counter.map(b => counterDueCents(b, b.checkedInPlayers ?? undefined))) },
    cashRefunds: { count: cashRefunds.length, cents: sum(cashRefunds.map(r => r.amountCents)) },
    otherCash: { count: otherMoves.length, cents: sum(otherMoves.map(m => (m.direction === 'out' ? -1 : 1) * m.amountCents)) },
  };
  const shopCard = sum(cardSales.map(x => x.totalCents));
  const roundsCard = sum(cardRounds.map(b => b.roundChargedCents ?? roundChargeCents(b)));
  const cashMoves = (await prisma.moneyMove.findMany({ where: { courseId, method: 'cash', at: inDay }, orderBy: { at: 'asc' }, take: 500, select: { at: true, what: true, direction: true, amountCents: true, note: true } }))
    .map(m => ({ at: m.at.toISOString(), what: m.what, amountCents: (m.direction === 'out' ? -1 : 1) * m.amountCents, note: m.note }));
  const cardRefunds = sum(refunds.filter(r => r.method === 'card').map(r => r.amountCents));
  return {
    ok: true,
    value: {
      day: cd.value.day, today: cd.value.today, ...s,
      cashTakenCents: s.cashSales.cents + s.counterRounds.cents + s.otherCash.cents - s.cashRefunds.cents,
      card: { shopCents: shopCard, roundsCents: roundsCard, refundsCents: cardRefunds, cents: shopCard + roundsCard - cardRefunds },
      cashMoves,
    },
  };
}

const cents = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_CENTS ? n : null;
};

/** Count the drawer: snapshot the day's figures with the count. */
export async function closeDay(courseId: string, input: { day?: unknown; openingFloatCents?: unknown; countedCashCents?: unknown; note?: unknown }, closedBy: string): Promise<Result<CloseView>> {
  const float = cents(input.openingFloatCents ?? 0);
  const counted = cents(input.countedCashCents);
  if (float === null) return fail(400, 'Enter the starting cash as an amount (0 if the drawer started empty).');
  if (counted === null) return fail(400, 'Enter the cash you counted in the drawer.');
  const s = await daySummary(courseId, typeof input.day === 'string' ? input.day : undefined);
  if (!s.ok) return s;
  const expected = float + s.value.cashTakenCents;
  const row = await prisma.registerClose.create({
    data: {
      courseId, day: s.value.day, openingFloatCents: float,
      cashSalesCents: s.value.cashSales.cents, counterRoundsCents: s.value.counterRounds.cents, cashRefundsCents: s.value.cashRefunds.cents, otherCashCents: s.value.otherCash.cents,
      expectedCashCents: expected, countedCashCents: counted, differenceCents: counted - expected,
      cardCents: s.value.card.cents, note: String(input.note ?? '').trim().slice(0, 500), closedBy: closedBy.slice(0, 200),
    },
  });
  return { ok: true, value: closeView(row) };
}

/** The last two weeks' counts, newest first; the latest count of each day stands. */
export async function recentCloses(courseId: string, limit = 30): Promise<CloseView[]> {
  const rows = await prisma.registerClose.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: limit });
  return rows.map(closeView);
}
