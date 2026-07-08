import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const ip = clientIp(req);
  const ok = await rateLimit('manage:players:' + ip, 10, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json() as { token?: string; newPlayers?: number };
  const { token, newPlayers } = body;

  if (!token || !newPlayers || !Number.isInteger(newPlayers) || newPlayers < 1 || newPlayers > 4) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true, checkInToken: true, teeTimeId: true, players: true,
          status: true, cartSelected: true, rangeBallsTotal: true,
          greenFeeTotal: true, cartFeeTotal: true,
        },
      });

      if (!booking || booking.checkInToken !== token) throw Object.assign(new Error(), { code: 'INVALID' });
      if (booking.status !== 'confirmed') throw Object.assign(new Error(), { code: 'NOT_CONFIRMED' });
      if (booking.players === newPlayers) throw Object.assign(new Error(), { code: 'SAME' });

      const slot = await tx.teeTime.findUnique({
        where: { id: booking.teeTimeId },
        select: { playersBooked: true, playersAvailable: true },
      });
      if (!slot) throw Object.assign(new Error(), { code: 'NOT_FOUND' });

      // Effective capacity: total - already booked (excluding this booking's own seats)
      const otherBooked = slot.playersBooked - booking.players;
      const maxPlayers = slot.playersAvailable - otherBooked;
      if (newPlayers > maxPlayers) {
        throw Object.assign(new Error(), { code: 'FULL', max: maxPlayers });
      }

      // Recompute fees at the same per-player rate as the original booking
      const perPlayerGreen = booking.players > 0 ? booking.greenFeeTotal / booking.players : 0;
      const perPlayerCart = (booking.cartSelected && booking.players > 0) ? booking.cartFeeTotal / booking.players : 0;
      const perPlayerAccess = 150;

      const greenFeeTotal = Math.round(perPlayerGreen * newPlayers);
      const cartFeeTotal = Math.round(perPlayerCart * newPlayers);
      const accessFeeTotal = perPlayerAccess * newPlayers;
      const totalAmount = greenFeeTotal + cartFeeTotal + Math.round(booking.rangeBallsTotal) + accessFeeTotal;

      await tx.booking.update({
        where: { id: bookingId },
        data: { players: newPlayers, greenFeeTotal, cartFeeTotal, accessFeeTotal, totalAmount },
      });

      const playersDelta = newPlayers - booking.players;
      const newPlayersBooked = slot.playersBooked + playersDelta;
      await tx.teeTime.update({
        where: { id: booking.teeTimeId },
        data: {
          playersBooked: newPlayersBooked,
          status: newPlayersBooked >= slot.playersAvailable ? 'full' : 'available',
        },
      });

      return { players: newPlayers, greenFeeTotal, cartFeeTotal, accessFeeTotal, rangeBallsTotal: Math.round(booking.rangeBallsTotal), totalAmount };
    }, { isolationLevel: 'Serializable' });

    return NextResponse.json(result);
  } catch (err) {
    const e = err as { code?: string; max?: number };
    if (e.code === 'INVALID') return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
    if (e.code === 'NOT_CONFIRMED') return NextResponse.json({ error: 'This booking cannot be modified' }, { status: 409 });
    if (e.code === 'SAME') return NextResponse.json({ error: 'Party size is already set to that' }, { status: 409 });
    if (e.code === 'FULL') return NextResponse.json({ error: `Only ${e.max} spot${e.max === 1 ? '' : 's'} available for this tee time` }, { status: 409 });
    if ((err as { code?: string }).code === 'P2034') {
      return NextResponse.json({ error: 'Conflict — please try again' }, { status: 409 });
    }
    console.error(JSON.stringify({ ev: 'manage.players.fail', bookingId, error: (err as Error).message }));
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
