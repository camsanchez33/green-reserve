import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { getGolferSession } from '@/lib/auth';
import { changePartySize } from '@/lib/change-party';

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const golferSession = await getGolferSession();
  const ip = clientIp(req);
  const ok = await rateLimit('manage:players:' + ip, 10, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json() as { token?: string; newPlayers?: number; termsAccepted?: boolean };
  const { token, newPlayers, termsAccepted } = body;

  if (!newPlayers || !Number.isInteger(newPlayers) || newPlayers < 1 || newPlayers > 4 || (!golferSession && !token)) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
  }
  if (termsAccepted !== true) {
    return NextResponse.json({ error: 'You must agree to the Terms of Service to change this booking.' }, { status: 400 });
  }

  try {
    const { feeRefundError, ...view } = await changePartySize(bookingId, newPlayers, { by: 'golfer', golferId: golferSession?.golferId, token });
    return NextResponse.json(feeRefundError ? { ...view, feeRefundError } : view);
  } catch (err) {
    const e = err as { code?: string; max?: number; msg?: string };
    if (e.code === 'INVALID') return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
    if (e.code === 'NOT_CONFIRMED') return NextResponse.json({ error: 'This booking cannot be modified' }, { status: 409 });
    if (e.code === 'PAID') return NextResponse.json({ error: 'This round has already been paid. Ask the course to change the party size.' }, { status: 409 });
    if (e.code === 'STARTED') return NextResponse.json({ error: 'This tee time has started. Call the course to change the party size.' }, { status: 409 });
    if (e.code === 'CUTOFF') return NextResponse.json({ error: 'The free-change window for this booking has closed. Call the course to change the party size.' }, { status: 409 });
    if (e.code === 'SIZE') return NextResponse.json({ error: e.msg }, { status: 400 });
    if (e.code === 'SAME') return NextResponse.json({ error: 'Party size is already set to that' }, { status: 409 });
    if (e.code === 'FULL') return NextResponse.json({ error: `Only ${e.max} spot${e.max === 1 ? '' : 's'} available for this tee time` }, { status: 409 });
    if ((err as { code?: string }).code === 'P2034') {
      return NextResponse.json({ error: 'Conflict — please try again' }, { status: 409 });
    }
    console.error(JSON.stringify({ ev: 'manage.players.fail', bookingId, error: (err as Error).message }));
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
