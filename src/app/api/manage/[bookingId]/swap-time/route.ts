import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const ip = clientIp(req);
  const ok = await rateLimit('manage:swap:' + ip, 10, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json() as { token?: string; newTeeTimeId?: string };
  const { token, newTeeTimeId } = body;

  if (!token || !newTeeTimeId) {
    return NextResponse.json({ error: 'Missing token or newTeeTimeId' }, { status: 400 });
  }

  // Atomic: claim new slot + release old slot + update booking, all in one transaction.
  // SERIALIZABLE prevents a race where two concurrent swaps both read "available" then double-book.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true, checkInToken: true, teeTimeId: true, players: true,
          cartSelected: true, rangeBallsTotal: true, accessFeeTotal: true,
          status: true,
        },
      });

      if (!booking || booking.checkInToken !== token) throw Object.assign(new Error('invalid'), { code: 'INVALID' });
      if (booking.status !== 'confirmed') throw Object.assign(new Error('not_confirmed'), { code: 'NOT_CONFIRMED' });
      if (booking.teeTimeId === newTeeTimeId) throw Object.assign(new Error('same_slot'), { code: 'SAME' });

      const newSlot = await tx.teeTime.findUnique({
        where: { id: newTeeTimeId },
        select: { id: true, courseId: true, date: true, time: true, holes: true, status: true, playersBooked: true, playersAvailable: true, greenFee: true, cartFee: true },
      });
      const oldSlot = await tx.teeTime.findUnique({
        where: { id: booking.teeTimeId },
        select: { id: true, courseId: true, playersBooked: true, playersAvailable: true },
      });

      if (!newSlot || !oldSlot) throw Object.assign(new Error('slot_not_found'), { code: 'NOT_FOUND' });
      // Must be same course
      if (newSlot.courseId !== oldSlot.courseId) throw Object.assign(new Error('wrong_course'), { code: 'WRONG_COURSE' });
      if (newSlot.status === 'blocked') throw Object.assign(new Error('blocked'), { code: 'BLOCKED' });

      const spotsLeft = newSlot.playersAvailable - newSlot.playersBooked;
      if (spotsLeft < booking.players) throw Object.assign(new Error('full'), { code: 'FULL', spotsLeft });

      // Recompute fees based on new slot rates
      const players = booking.players;
      const greenFeeTotal = Math.round(newSlot.greenFee * players);
      const cartFeeTotal = booking.cartSelected ? Math.round(newSlot.cartFee * players) : 0;
      const accessFeeTotal = 150 * players;
      const totalAmount = greenFeeTotal + cartFeeTotal + Math.round(booking.rangeBallsTotal) + accessFeeTotal;

      // Update booking with new tee time + recomputed fees
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          teeTimeId: newTeeTimeId,
          greenFeeTotal,
          cartFeeTotal,
          accessFeeTotal,
          totalAmount,
        },
      });

      // Release the old slot
      const oldNewBooked = Math.max(0, oldSlot.playersBooked - players);
      await tx.teeTime.update({
        where: { id: oldSlot.id },
        data: {
          playersBooked: oldNewBooked,
          status: 'available',
        },
      });

      // Claim the new slot
      const newBooked = newSlot.playersBooked + players;
      await tx.teeTime.update({
        where: { id: newSlot.id },
        data: {
          playersBooked: newBooked,
          status: newBooked >= newSlot.playersAvailable ? 'full' : 'available',
        },
      });

      return {
        newTeeTimeId,
        date: newSlot.date,
        time: newSlot.time,
        holes: newSlot.holes,
        players,
        greenFeeTotal,
        cartFeeTotal,
        rangeBallsTotal: Math.round(booking.rangeBallsTotal),
        accessFeeTotal,
        totalAmount,
      };
    }, { isolationLevel: 'Serializable' });

    return NextResponse.json(result);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'INVALID') return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
    if (e.code === 'NOT_CONFIRMED') return NextResponse.json({ error: 'This booking cannot be modified' }, { status: 409 });
    if (e.code === 'SAME') return NextResponse.json({ error: 'That is your current tee time' }, { status: 409 });
    if (e.code === 'BLOCKED' || e.code === 'NOT_FOUND') return NextResponse.json({ error: 'That tee time is no longer available' }, { status: 409 });
    if (e.code === 'FULL') return NextResponse.json({ error: 'That tee time just filled up. Please pick another.' }, { status: 409 });
    if (e.code === 'WRONG_COURSE') return NextResponse.json({ error: 'Tee time belongs to a different course' }, { status: 400 });
    // PostgreSQL serialization failure
    if ((err as { code?: string }).code === 'P2034') {
      return NextResponse.json({ error: 'Conflict — that slot was just taken. Please try another.' }, { status: 409 });
    }
    console.error(JSON.stringify({ ev: 'manage.swap.fail', bookingId, error: e.message }));
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
