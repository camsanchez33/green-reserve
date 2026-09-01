import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS, SUPPORT_PLUS } from '@/lib/admin-session';
import { claimTeeTime, TeeTimeClaimError } from '@/lib/claim-tee-time';
import { performCancellation } from '@/lib/cancel-booking';

// GET /api/admin/tee-sheet?courseId=X&date=Y
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2c: returns golferName/Email/Phone + totalAmount for any course; PATCH/POST here are already MANAGER_PLUS.
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const courseId = req.nextUrl.searchParams.get('courseId');
  const date = req.nextUrl.searchParams.get('date');
  if (!courseId || !date) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId, date },
    orderBy: { time: 'asc' },
    include: {
      bookings: {
        where: { status: 'confirmed' },
        select: { id: true, golferName: true, golferEmail: true, golferPhone: true, players: true, totalAmount: true, paymentStatus: true, createdAt: true },
      },
    },
  });

  return NextResponse.json(teeTimes);
}

// PATCH — block/unblock or cancel booking
export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();

  if (body.action === 'cancel_booking') {
    // MP-1 fix-now #4: this used to flip status and adjust the slot counts
    // inline — a second cancellation implementation that sent no golfer email,
    // fired no tee-time alerts, and had no already-cancelled guard, so two
    // clicks decremented playersBooked twice and overbooked the slot. The
    // vetted service does all of it; there is exactly one cancellation path.
    const result = await performCancellation(body.bookingId);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, feeCharged: result.feeCharged });
  }

  if (body.action === 'block' || body.action === 'unblock') {
    await prisma.teeTime.update({
      where: { id: body.teeTimeId },
      data: { status: body.action === 'block' ? 'blocked' : 'available' },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// POST — manually add a booking (admin tee-sheet)
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { teeTimeId, golferName, golferEmail, golferPhone, players } = await req.json();
  if (!teeTimeId || !golferName || !golferEmail || !players) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const teeTime = await prisma.teeTime.findUnique({ where: { id: teeTimeId } });
  if (!teeTime) return NextResponse.json({ error: 'Tee time not found' }, { status: 404 });

  // MP-3 B2c: rates are cents; the x100 is gone.
  const greenFeeTotal = teeTime.greenFeeCents * players;
  const cartFeeTotal = teeTime.cartFeeCents * players;
  const accessFeeTotal = 150 * players;
  const totalAmount = greenFeeTotal + cartFeeTotal + accessFeeTotal;

  try {
    const claimed = await claimTeeTime({
      teeTimeId,
      courseId: teeTime.courseId,
      golferName,
      golferEmail,
      golferPhone: golferPhone || '',
      players,
      appliedRate: 'standard',
      greenFeeTotal,
      cartFeeTotal,
      accessFeeTotal,
      totalAmount,
      paymentStatus: 'manual',
      status: 'confirmed',
    });
    return NextResponse.json({ success: true, bookingId: claimed.id });
  } catch (err) {
    if (err instanceof TeeTimeClaimError) {
      if (err.code === 'NOT_FOUND') return NextResponse.json({ error: 'Tee time not found' }, { status: 404 });
      if (err.code === 'FULL' || err.code === 'CONFLICT') return NextResponse.json({ error: 'That time just filled up.' }, { status: 409 });
      if (err.code === 'SPOTS') return NextResponse.json({ error: `Only ${err.spotsLeft} spot${err.spotsLeft === 1 ? '' : 's'} left.` }, { status: 409 });
      if (err.code === 'BLOCKED') return NextResponse.json({ error: 'This tee time is blocked.' }, { status: 409 });
    }
    console.error('Admin manual booking error:', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
