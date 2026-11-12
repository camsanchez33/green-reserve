import { NextRequest, NextResponse } from 'next/server';
import { todayIn, isPastIn } from '@/lib/course-time';
import { livePlayers, timeSpots } from '@/lib/day-fill';
import { setSeatsClosed } from '@/lib/tee-time-seats';
import { prisma } from '@/lib/prisma';
import { dollarsToCentsOr0 } from '@/lib/money';
import { teeTimeToWire } from '@/lib/schedule-wire';
import { resolveDashboardSession, can, requirePermission } from '@/lib/session';
import { setTeeTimeBlocked } from '@/lib/schedule-service';
import { closeFreeTime, setStaffOnly, deleteRefusal } from '@/lib/tee-time-close';
import { golferKey } from '@/lib/golfer-key';
import { bookingWindowHours, holdsAtCutoff, chargesOnLateCancel } from '@/lib/cancel-policy';
import { teeTimeInstant } from '@/lib/booking-events';

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  // VIEWS-1 (Cam 2026-11-03): the tee sheet's Calendar view — players booked of spots
  // offered for each day of one month, blocked times left out. This course only.
  const month = searchParams.get('month');
  if (month !== null) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Pick a month as YYYY-MM.' }, { status: 400 });
    // ACC-1: players booked of spots by the one rule the tee sheet, Home and Analytics use (lib/day-fill) — live
    // players from the bookings; a blocked time counts only for a group already on it.
    const rows = await prisma.teeTime.findMany({
      where: { courseId: session.courseId, date: { gte: `${month}-01`, lte: `${month}-31` } },
      select: { date: true, status: true, playersAvailable: true, bookings: { where: { status: { not: 'cancelled' } }, select: { status: true, players: true } } },
    });
    const byDate = new Map<string, { date: string; times: number; spots: number; booked: number }>();
    const forSale = new Set<string>(); // days with a time golfers can book (CAL-2's "every time blocked" reads it)
    for (const t of rows) {
      const n = livePlayers(t.bookings);
      if (t.status === 'blocked' && n === 0) continue;
      const d = byDate.get(t.date) ?? { date: t.date, times: 0, spots: 0, booked: 0 };
      d.times += 1; d.spots += timeSpots(t, n); d.booked += n;
      if (t.status !== 'blocked') forSale.add(t.date);
      byDate.set(t.date, d);
    }
    const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    // CAL-2: why a day has nothing golfers can book — every time blocked, no schedule that weekday, or
    // past the public booking window (lib/calendar-days.ts words it). This course only.
    const [course, schedules, blocked] = await Promise.all([
      prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true, publicAdvanceDays: true } }),
      prisma.teeTimeSchedule.findMany({ where: { courseId: session.courseId, active: true }, select: { daysOfWeek: true } }),
      prisma.teeTime.groupBy({ by: ['date'], where: { courseId: session.courseId, date: { gte: `${month}-01`, lte: `${month}-31` }, status: 'blocked' } }),
    ]);
    const open = forSale;
    const openWeekdays = schedules.some(s => s.daysOfWeek.length === 0) ? [0, 1, 2, 3, 4, 5, 6] : [...new Set(schedules.flatMap(s => s.daysOfWeek))].sort();
    const info = {
      today: todayIn(course?.timezone),
      publicDays: course?.publicAdvanceDays ?? 7,
      openWeekdays,
      blockedDates: blocked.map(b => b.date).filter(d => !open.has(d)),
    };
    return NextResponse.json({ month, days, info });
  }
  // SD-3: the default day is the course's today, not the server's.
  let date = searchParams.get('date') || '';
  if (!date) {
    const c = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } });
    date = todayIn(c?.timezone);
  }
  const withBookings = searchParams.get('withBookings') === '1';
  const courseRow = withBookings ? await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true, cancellationHours: true } }) : null;

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId: session.courseId, date },
    orderBy: { time: 'asc' },
    // Review (security, LOW): this was an `include` — whole Booking rows, with
    // each golfer's checkInToken (a bearer credential that charges their card)
    // and Stripe ids, on every staff terminal. The sheet renders these fields.
    include: {
      // L2: the product label rides along so the sheet can say "North + South · 18h".
      product: { select: { label: true, nineIds: true } },
      // W2-9: the event holding a blocked time, so the sheet can name it.
      event: { select: { id: true, name: true } },
      ...(withBookings ? { bookings: {
      where: { status: { in: ['confirmed', 'completed'] } }, orderBy: { createdAt: 'asc' },
      select: { id: true, golferName: true, golferEmail: true, golferPhone: true, golferAccountId: true, players: true, createdAt: true, status: true, paymentStatus: true, totalAmount: true, accessFeeTotal: true, checkInFailReason: true, source: true, noShowAt: true, paidOffline: true, checkedInPlayers: true, stripePaymentMethodId: true, cancellationFeeTotal: true, roundPaymentIntentId: true,
        // PARTIAL-1: the group a booking was split off, so the card shows it inside that group.
        splitFromId: true,
        // Tee audit 18: what a cancel now would do with the late fee — the confirm says it exactly.
        cancellationHoursAtBooking: true, lateFeeTimingAtBooking: true,
        // RES-1: residents in the group, and whether it is on a member rate.
        residentPlayers: true, appliedRate: true,
        // Part of a group checking in is priced on the sheet as the server charges it (lib/member-rates partyFees).
        greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, residentRateCents: true, memberRateCents: true, memberCartCents: true,
        // CART-3: who rides and the range-ball buckets, for checkout's Riding and Range balls rows.
        cartSelected: true, cartRiders: true, cartUnitCents: true, rangeBallsSize: true,
        // CART-4: the cart numbers the group took (the row, the card, the ticket and the starter's sheet).
        cartNumbers: true,
        // POS-1a: pro-shop items added to the round, for the panel.
        shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, shopLockedAt: true, shopItems: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, unitPriceCents: true, quantity: true } } },
    } } : {}),
    },
  });

  // SP-A: contact details only with "See golfer email and phone".
  // SP-B: the card's id never leaves the server — the sheet only needs to know
  // whether there is one (no card → offer "Send pay link").
  const contact = can(session, 'sheet.golfer_contact');
  type Row = { golferEmail: string; golferPhone: string; stripePaymentMethodId?: string; roundPaymentIntentId?: string; shopLockedAt?: Date | null };
  // Golfer record (dead end 25): each group's latest staff notes — on the golfer, or on this booking.
  const all = teeTimes.flatMap(t => ((t as { bookings?: (Row & { id: string; golferAccountId?: string | null })[] }).bookings ?? []));
  const keyOf = new Map(all.map(b => [b.id, golferKey(b)]));
  const keys = [...new Set([...keyOf.values()].filter((k): k is string => !!k))];
  const noteRows = all.length ? await prisma.golferNote.findMany({
    where: { courseId: session.courseId, OR: [{ golferKey: { in: keys }, bookingId: null }, { bookingId: { in: all.map(b => b.id) } }] },
    orderBy: { createdAt: 'desc' }, take: 500, select: { golferKey: true, bookingId: true, body: true },
  }) : [];
  // MEM-ACCT: whose account a round went on, for the time's card.
  const onAccount = all.length ? await prisma.memberCharge.findMany({
    where: { courseId: session.courseId, bookingId: { in: all.map(b => b.id) } },
    select: { bookingId: true, membership: { select: { inviteName: true, golfer: { select: { firstName: true, lastName: true } } } } },
  }) : [];
  const accountOf = new Map(onAccount.map(c => [c.bookingId, (c.membership.golfer ? `${c.membership.golfer.firstName} ${c.membership.golfer.lastName}`.trim() : '') || c.membership.inviteName]));
  const notesFor = (id: string) => {
    const k = keyOf.get(id);
    return noteRows.filter(n => n.bookingId === id || (!n.bookingId && k && n.golferKey === k)).slice(0, 3).map(n => n.body);
  };
  // TEES-1 (Cam 2026-11-04, "side by side"): the tee each time starts from — its round's first nine. With a
  // front and a back nine they are the 1st and 10th tee; with more nines, the nine's own name. A time with
  // no round starts on the first nine. The sheet puts two or more tees on a day side by side.
  const nines = await prisma.nine.findMany({ where: { courseId: session.courseId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true } });
  const teeIndex = (t: { product?: { nineIds: string[] } | null }) => Math.max(0, nines.findIndex(n => n.id === t.product?.nineIds?.[0]));
  const teeOf = (t: { product?: { nineIds: string[] } | null }) => {
    if (!nines.length) return null;
    const i = teeIndex(t);
    return nines.length === 2 ? (i === 0 ? '1st tee' : '10th tee') : nines[i].name;
  };
  return NextResponse.json(teeTimes.map(t0 => {
    const t = { ...t0, tee: teeOf(t0), teeRank: teeIndex(t0) };
    const bookings = (t as { bookings?: (Row & { id: string; golferAccountId?: string | null })[] }).bookings;
    if (!bookings) return t;
    const teeAt = courseRow ? teeTimeInstant(courseRow.timezone, t.date, t.time) : null;
    // Mirrors lib/cancel-booking.ts: when a cancel starts taking the late fee — a fee not yet charged and a
    // policy that charges on a late cancel or holds at the cutoff. The instant, not a yes/no, so the sheet
    // decides at the moment staff tap Cancel (a sheet open across the cutoff stays right). null = never.
    const lateFeeFrom = (b: Row & { paymentStatus?: string; cancellationFeeTotal?: number; cancellationHoursAtBooking?: number | null; lateFeeTimingAtBooking?: string | null }) =>
      courseRow && teeAt && (b.cancellationFeeTotal ?? 0) > 0 && b.paymentStatus !== 'cancellation_fee_charged' && (chargesOnLateCancel(b) || holdsAtCutoff(b))
        ? new Date(teeAt.getTime() - bookingWindowHours(b, courseRow) * 3600_000).toISOString() : null;
    return { ...t, bookings: bookings.map(({ stripePaymentMethodId, roundPaymentIntentId, shopLockedAt, golferAccountId: _acct, cancellationHoursAtBooking: _h, lateFeeTimingAtBooking: _t, ...b }: Row & { id: string; golferAccountId?: string | null; cancellationHoursAtBooking?: number | null; lateFeeTimingAtBooking?: string | null; paymentStatus?: string; cancellationFeeTotal?: number }) => ({ ...b, lateFeeFrom: lateFeeFrom({ ...b, cancellationHoursAtBooking: _h, lateFeeTimingAtBooking: _t }), hasCard: !!stripePaymentMethodId, roundPaid: !!roundPaymentIntentId, shopLocked: !!shopLockedAt, hasPhone: b.golferPhone.replace(/\D/g, '').length >= 10, notes: notesFor(b.id), accountName: accountOf.get(b.id) ?? '', ...(contact ? {} : { golferEmail: '', golferPhone: '' }) })) };
  }));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'sheet.edit_times'); // SP-A
  if (denied) return denied;

  const body = await req.json();
  // SD-11: these were written raw — "garbage" dates made rows nothing renders.
  const date = String(body.date ?? '');
  const time = String(body.time ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00'))) return NextResponse.json({ error: 'Date must be YYYY-MM-DD.' }, { status: 400 });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NextResponse.json({ error: 'Time must be HH:MM (24-hour).' }, { status: 400 });
  const players = Number(body.playersAvailable) || 4;
  if (players < 1 || players > 8) return NextResponse.json({ error: 'Players must be between 1 and 8.' }, { status: 400 });

  // SD-11: staff can open a walk-in slot (that is the job) but never price it.
  // The price comes from the course's own schedule for that day; the body's
  // fee fields are ignored for staff.
  let greenFeeCents = dollarsToCentsOr0(body.greenFee);
  let cartFeeCents = dollarsToCentsOr0(body.cartFee);
  // ADDTIME-1 (Cam 2026-11-06, "the day's real prices"): the new time copies a time on the same day — its
  // prices (member, resident, senior, junior too), cart, walking, round and holes. Only this course's.
  const copyId = typeof body.copyFrom === 'string' ? body.copyFrom : '';
  const src = copyId ? await prisma.teeTime.findFirst({ where: { id: copyId, courseId: session.courseId, date },
    select: { greenFeeCents: true, cartFeeCents: true, memberRateCents: true, residentRateCents: true, seniorRateCents: true, juniorRateCents: true, walkingAllowed: true, tierName: true, holes: true, productId: true } }) : null;
  if (copyId && !src) return NextResponse.json({ error: 'The time to copy prices from is gone — refresh the sheet and try again.' }, { status: 409 });
  const ownFees = !session.isStaff && body.greenFee != null && body.cartFee != null;
  if (src && (session.isStaff || !ownFees)) {
    greenFeeCents = src.greenFeeCents; cartFeeCents = src.cartFeeCents;
  } else if (session.isStaff) {
    const dow = new Date(date + 'T12:00:00').getDay();
    const weekend = dow === 0 || dow === 6;
    const schedules = await prisma.teeTimeSchedule.findMany({ where: { courseId: session.courseId, active: true }, orderBy: { createdAt: 'desc' } });
    const sched = schedules.find(x => x.daysOfWeek.length === 0 || x.daysOfWeek.includes(dow)) ?? schedules[0];
    if (!sched) return NextResponse.json({ error: 'No schedule to price this time from — ask the course operator to add one.' }, { status: 409 });
    greenFeeCents = weekend ? sched.greenFeeWeekendCents : sched.greenFeeWeekdayCents;
    cartFeeCents = sched.cartFeeCents;
  } else if (greenFeeCents < 0 || greenFeeCents > 100000 || cartFeeCents < 0 || cartFeeCents > 50000) {
    return NextResponse.json({ error: 'Fees must be between $0 and $1,000 (green) / $500 (cart).' }, { status: 400 });
  }

  // AUDIT-1: one row per slot (unique index TeeTime_slot_key) — a second 7:00 would double that tee.
  const productId = src?.productId ?? null;
  const clash = await prisma.teeTime.findFirst({ where: { courseId: session.courseId, date, time, productId }, select: { id: true } });
  if (clash) return NextResponse.json({ error: `There's already a ${time} tee time that day.` }, { status: 409 });
  let teeTime;
  try {
    teeTime = await prisma.teeTime.create({
      data: {
        courseId: session.courseId,
        date, time, holes: src && (src.productId || !ownFees) ? src.holes : Number(body.holes) === 9 ? 9 : 18, // a round keeps its own holes
        playersAvailable: players, playersBooked: 0,
        // MP-3 B2c: the form sends dollars; the columns are cents.
        greenFeeCents, cartFeeCents,
        walkingAllowed: src && !ownFees ? src.walkingAllowed : body.walkingAllowed !== false, status: 'available',
        ...(src ? { productId, tierName: src.tierName, memberRateCents: src.memberRateCents, residentRateCents: src.residentRateCents, seniorRateCents: src.seniorRateCents, juniorRateCents: src.juniorRateCents } : {}),
        staffOnly: body.staffOnly === true,
      },
    });
  } catch (err) {
    // Two adds of the same time at once: the second meets the unique index.
    if ((err as { code?: string })?.code === 'P2002') return NextResponse.json({ error: `There's already a ${time} tee time that day.` }, { status: 409 });
    throw err;
  }
  return NextResponse.json(teeTimeToWire(teeTime));
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'sheet.block'); // SP-A
  if (denied) return denied;

  const { id, status, staffOnly, seatsClosed } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  // SEATS-1 (Cam 2026-11-08): close open seats one at a time, or all of them; reopen the same way. Booked groups
  // are never touched: a seat can only close while it is open (the write re-checks who's booked).
  if (seatsClosed !== undefined && status === undefined && staffOnly === undefined) {
    const r = await setSeatsClosed(session.courseId, String(id), seatsClosed);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  }
  // ADDTIME-1: open a time online, or keep it for staff. Same permission as blocking (who can sell it).
  // TT-CLOSE (Cam 2026-11-12): hiding a time online is refused while a group is booked on it (lib/tee-time-close).
  if (typeof staffOnly === 'boolean' && status === undefined) {
    const r = await setStaffOnly(session.courseId, String(id), staffOnly);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, staffOnly });
  }
  // MP-5d: this used to write whatever `status` string arrived. The only two
  // states a person can put a slot into are open and blocked; anything else
  // is the engine's to set. Goes through the same service the admin uses.
  if (status !== 'blocked' && status !== 'available') {
    return NextResponse.json({ error: 'status must be "blocked" or "available"' }, { status: 400 });
  }
  // W2-9 (Cam 2026-10-22): a time an event holds isn't unblocked here — the event
  // decides how much of the course it uses, so the time goes back on sale by changing the event.
  if (status === 'available') {
    const held = await prisma.teeTime.findFirst({ where: { id, courseId: session.courseId, eventId: { not: null } }, select: { event: { select: { name: true } } } });
    if (held?.event) return NextResponse.json({ error: `Held for ${held.event.name}. To sell this time, change the event on the Events tab.` }, { status: 409 });
  }
  // TT-CLOSE (Cam 2026-11-12): closing a time is refused while a group is booked on it — one conditional write.
  if (status === 'blocked') {
    const r = await closeFreeTime(session.courseId, String(id));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  }
  const row = await setTeeTimeBlocked(id, status === 'blocked', { scopeCourseId: session.courseId });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'sheet.edit_times'); // SP-A
  if (denied) return denied;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  // SD-10: Booking.teeTimeId is ON DELETE RESTRICT, so deleting a booked slot
  // threw P2003 → an unhandled 500 the dashboard swallowed. Say it instead.
  // AN-1: a tee time that has already gone off is history — an unfilled slot
  // is exactly what Analytics counts as lost revenue, so it can't be deleted.
  const slot = await prisma.teeTime.findFirst({ where: { id, courseId: session.courseId }, select: { date: true, time: true, course: { select: { timezone: true } }, event: { select: { name: true } } } });
  if (slot?.event) return NextResponse.json({ error: `Held for ${slot.event.name}. To free this time, change the event on the Events tab.` }, { status: 409 });
  if (slot && isPastIn(slot.course.timezone, slot.date, slot.time)) {
    return NextResponse.json({ error: 'That tee time has already gone off — past tee times stay on the sheet so your reports stay accurate.' }, { status: 409 });
  }
  // TT-CLOSE: a booked time names who is on it (and no longer suggests closing it — that is refused too).
  const refused = await deleteRefusal(session.courseId, String(id));
  if (refused) return NextResponse.json({ error: refused }, { status: 409 });
  // Cam 2026-11-06: a cancelled booking still points at its time (and may carry a kept fee) — the time is history, not deletable.
  if (await prisma.booking.count({ where: { teeTimeId: id, courseId: session.courseId } }) > 0) {
    return NextResponse.json({ error: 'This tee time has cancelled bookings on record, so it stays on the sheet. Close it instead.' }, { status: 409 });
  }
  const r = await prisma.teeTime.deleteMany({ where: { id, courseId: session.courseId } });
  if (r.count === 0) return NextResponse.json({ error: 'That tee time no longer exists.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
