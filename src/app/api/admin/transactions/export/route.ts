import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';

// MP-6c: a transaction-level export for an accountant. One row per money
// event across every course in the period: round charges (placed by
// check-in), late-cancellation fees charged by the cron, and refunds (from
// the PaymentEvent ledger). The per-course table's CSV is a summary; this is
// the ledger. Manager+ — it carries golfer names.
//
// GET /api/admin/transactions/export?from=YYYY-MM-DD&to=YYYY-MM-DD

const esc = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (cents: number) => (cents / 100).toFixed(2);

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'The transaction export needs manager access.' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
  }
  const start = new Date(from + 'T00:00:00.000Z');
  const end = new Date(to + 'T23:59:59.999Z');
  if (end.getTime() - start.getTime() > 400 * 86400000) return NextResponse.json({ error: 'Export at most 400 days at a time.' }, { status: 400 });
  const win = { gte: start, lte: end };

  const bookingSelect = {
    id: true, golferName: true, golferEmail: true, players: true,
    totalAmount: true, greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, accessFeeTotal: true, cancellationFeeTotal: true,
    checkedInAt: true, cancellationFeeChargedAt: true, roundPaymentIntentId: true, cancellationFeeChargeId: true,
    course: { select: { name: true } }, teeTime: { select: { date: true, time: true } },
  } as const;

  const [charges, lateFees, refunds] = await Promise.all([
    prisma.booking.findMany({ where: { paymentStatus: { in: ['paid', 'refunded'] }, roundPaymentIntentId: { not: '' }, checkedInAt: win }, select: bookingSelect, orderBy: { checkedInAt: 'asc' } }),
    prisma.booking.findMany({ where: { cancellationFeeChargedAt: win }, select: bookingSelect, orderBy: { cancellationFeeChargedAt: 'asc' } }),
    prisma.paymentEvent.findMany({
      where: { kind: 'refund', createdAt: win },
      select: { id: true, amountCents: true, stripeId: true, actor: true, actorName: true, detail: true, createdAt: true, booking: { select: bookingSelect } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  type Row = { at: Date; kind: string; course: string; golfer: string; email: string; teeDate: string; teeTime: string; players: number; gross: number; green: number; cart: number; range: number; grFee: number; courseNet: number; stripeRef: string; note: string; bookingId: string };
  const rows: Row[] = [];
  for (const b of charges) {
    rows.push({ at: b.checkedInAt as Date, kind: 'round_charge', course: b.course.name, golfer: b.golferName, email: b.golferEmail, teeDate: b.teeTime.date, teeTime: b.teeTime.time, players: b.players,
      gross: b.totalAmount, green: b.greenFeeTotal, cart: b.cartFeeTotal, range: b.rangeBallsTotal, grFee: b.accessFeeTotal, courseNet: b.totalAmount - b.accessFeeTotal, stripeRef: b.roundPaymentIntentId, note: '', bookingId: b.id });
  }
  for (const b of lateFees) {
    rows.push({ at: b.cancellationFeeChargedAt as Date, kind: 'late_cancellation_fee', course: b.course.name, golfer: b.golferName, email: b.golferEmail, teeDate: b.teeTime.date, teeTime: b.teeTime.time, players: b.players,
      gross: b.cancellationFeeTotal, green: 0, cart: 0, range: 0, grFee: 0, courseNet: b.cancellationFeeTotal, stripeRef: b.cancellationFeeChargeId, note: 'course revenue; GreenReserve takes $0', bookingId: b.id });
  }
  for (const r of refunds) {
    const b = r.booking;
    // GreenReserve's fee reverses pro rata on a refund (refund_application_fee).
    const feeShare = b.totalAmount > 0 ? Math.round(r.amountCents * (b.accessFeeTotal / b.totalAmount)) : 0;
    rows.push({ at: r.createdAt, kind: 'refund', course: b.course.name, golfer: b.golferName, email: b.golferEmail, teeDate: b.teeTime.date, teeTime: b.teeTime.time, players: b.players,
      gross: -r.amountCents, green: 0, cart: 0, range: 0, grFee: -feeShare, courseNet: -(r.amountCents - feeShare), stripeRef: r.stripeId, note: `${r.actor}${r.actorName ? ' ' + r.actorName : ''}: ${r.detail}`.slice(0, 200), bookingId: b.id });
  }
  rows.sort((a, b) => a.at.getTime() - b.at.getTime());

  const header = ['Date (UTC)', 'Type', 'Course', 'Golfer', 'Email', 'Tee date', 'Tee time', 'Players', 'Gross', 'Green fee', 'Cart fee', 'Range balls', 'GreenReserve fee', 'Course net', 'Stripe ref', 'Note', 'Booking ID'];
  const lines = [
    `# GreenReserve transactions ${from} to ${to} · ${rows.length} rows · amounts in USD · round charges placed by check-in time · refunds reduce GreenReserve's fee pro rata · exported by ${session.name} ${new Date().toISOString()}`,
    header.map(esc).join(','),
    ...rows.map(r => [r.at.toISOString(), r.kind, r.course, r.golfer, r.email, r.teeDate, r.teeTime, r.players, money(r.gross), money(r.green), money(r.cart), money(r.range), money(r.grFee), money(r.courseNet), r.stripeRef, r.note, r.bookingId].map(esc).join(',')),
  ];

  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="greenreserve-transactions_${from}_to_${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
