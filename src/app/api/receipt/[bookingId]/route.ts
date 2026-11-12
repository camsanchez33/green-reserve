import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';
import { hasArea } from '@/lib/admin-areas';
import { receiptCharges, chargedNowCents } from '@/lib/receipt-charges';
import { roundChargedTotal, shopLinesFor } from '@/lib/shop';
import { stripe } from '@/lib/stripe';
import { counterPaidCents } from '@/lib/counter-pay';
import { bookingRefLabel } from '@/lib/booking-ref';

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const ip = clientIp(req);
  const ok = await rateLimit('receipt:' + ip, 30, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  // MP-2: an admin session is an alternative to the token, the same dual-auth
  // pattern /api/bookings/cancel and /api/manage/[bookingId] already use. This
  // is what lets the admin console link to a receipt WITHOUT being handed the
  // booking's checkInToken — that token is a bearer credential that also
  // authorizes a card charge via /api/checkin/[bookingId], so support staff
  // were being given charge power just to view a receipt.
  const adminSession = await resolveAdminSession();
  // AW-11: receipts open from a course page or a golfer lookup — either area will do.
  const adminMayView = !!adminSession && requireRole(adminSession, SUPPORT_PLUS) && (hasArea(adminSession, 'golfers') || hasArea(adminSession, 'courses'));

  const token = req.nextUrl.searchParams.get('token');
  if (!token && !adminMayView) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: { select: { date: true, time: true, holes: true, product: { select: { label: true } } } },
      course: { select: { name: true, number: true, slug: true, city: true, state: true, brandColor: true, stripeAccountId: true, timezone: true } },
    },
  });

  if (!booking || (!adminMayView && booking.checkInToken !== token)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // R-GOLF-010: what actually reached the golfer's card, from the money records.
  const charges = await receiptCharges(booking.id);

  // RECEIPT-2 (Cam 2026-11-08, "fix it … a smooth receipt for the card readers and printers"): how the round was
  // paid, when, and with what — cash (and the cash handed over, from the register sale), or the card that paid.
  // Cash collects no GreenReserve fee (PAY-2), so a cash round's paid figure leaves it out.
  let payment: { method: 'cash' | 'card' | 'account'; paidAt: string | null; amountCents: number; card?: string; tenderedCents?: number; changeCents?: number } | null = null;
  const played = booking.status === 'completed' && booking.paymentStatus !== 'refunded';
  if (played && booking.paidOffline) {
    const amountCents = counterPaidCents(booking, 'cash');
    // The register sale that took it — the cash handed over is only this round's when the sale was this round alone.
    const line = await prisma.shopSaleLine.findFirst({ where: { bookingId: booking.id }, select: { sale: { select: { cashTenderedCents: true, totalCents: true, paidAt: true, _count: { select: { lines: true } } } } } });
    const sale = line?.sale;
    const own = !!sale && sale._count.lines === 1 && sale.totalCents === amountCents;
    payment = {
      method: 'cash', paidAt: (sale?.paidAt ?? booking.paidAt)?.toISOString() ?? null, amountCents,
      ...(own && sale!.cashTenderedCents && sale!.cashTenderedCents > amountCents ? { tenderedCents: sale!.cashTenderedCents, changeCents: sale!.cashTenderedCents - amountCents } : {}),
    };
  } else if (played && booking.paymentStatus === 'on_account') {
    payment = { method: 'account', paidAt: booking.paidAt?.toISOString() ?? null, amountCents: counterPaidCents(booking, 'account') };
  } else if (played && booking.roundPaymentIntentId) {
    // The card's brand and last four, from Stripe — best effort, never blocking the receipt.
    let card: string | undefined;
    if (booking.course.stripeAccountId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(booking.roundPaymentIntentId, { expand: ['latest_charge'] }, { stripeAccount: booking.course.stripeAccountId, timeout: 4000 });
        const ch = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
        const d = ch?.payment_method_details;
        const c = d?.card ?? d?.card_present ?? null;
        if (c?.last4) card = `${(c.brand ?? 'Card').replace(/^./, x => x.toUpperCase())} ····${c.last4}${d?.card_present ? ' · tapped or inserted' : ''}`;
      } catch { /* the receipt shows "Card" */ }
    }
    payment = { method: 'card', paidAt: booking.paidAt?.toISOString() ?? null, amountCents: roundChargedTotal(booking), ...(card ? { card } : {}) };
  }

  return NextResponse.json({
    bookingId: booking.id,
    bookingRef: bookingRefLabel(booking),
    golferName: booking.golferName,
    courseName: booking.course.name,
    courseSlug: booking.course.slug,
    // Reskin batch (U-G shared change): the receipt's CourseHeaderBar wears the course's own color.
    brandColor: booking.course.brandColor,
    courseLocation: [booking.course.city, booking.course.state].filter(Boolean).join(', '),
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    holes: booking.teeTime.holes,
    productLabel: booking.teeTime.product?.label ?? null,
    players: booking.players,
    cartSelected: booking.cartSelected,
    // CART-4: the cart ticket on the receipt (Settings → Booking rules) — who rides and the cart numbers.
    // CART-5 (Cam 2026-11-09): every receipt says whether the cart is paid — no separate cart ticket, no cart number (the starter
    // writes that on the starter's sheet).
    cartTicket: booking.cartSelected ? { riders: booking.cartRiders ?? booking.players } : null,
    greenFeeTotal: booking.greenFeeTotal,
    cartFeeTotal: booking.cartFeeTotal,
    rangeBallsTotal: booking.rangeBallsTotal,
    accessFeeTotal: booking.accessFeeTotal,
    // POS-1a: pro-shop items charged with the round, and the total with them.
    shopLines: booking.shopTotalCents > 0 ? (await shopLinesFor(booking.id)).map(({ name, unitPriceCents, quantity }) => ({ name, unitPriceCents, quantity })) : [],
    shopFeeCents: booking.shopFeeCents,
    shopTaxCents: booking.shopTaxCents,
    totalAmount: roundChargedTotal(booking),
    status: booking.status,
    cancellationFeeTotal: booking.cancellationFeeTotal,
    cancellationFeeCharged: !!booking.cancellationFeeChargeId,
    paidOffline: booking.paidOffline,
    onAccount: booking.paymentStatus === 'on_account',
    roundRefunded: booking.paymentStatus === 'refunded',
    charges,
    chargedNowCents: chargedNowCents(charges),
    payment,
    timezone: booking.course.timezone,
    // "View my bookings" only for a golfer with an account (a walk-in paying cash usually has none).
    hasAccount: !!booking.golferAccountId,
    createdAt: booking.createdAt,
  });
}
