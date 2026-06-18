import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const withBookings = searchParams.get('withBookings') === '1';

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId: session.courseId, date },
    orderBy: { time: 'asc' },
    include: withBookings ? { bookings: { where: { status: 'confirmed' }, orderBy: { createdAt: 'asc' } } } : undefined,
  });

  return NextResponse.json(teeTimes);
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const teeTime = await prisma.teeTime.create({
    data: {
      courseId: session.courseId,
      date: body.date, time: body.time, holes: body.holes || 18,
      playersAvailable: Number(body.playersAvailable) || 4, playersBooked: 0,
      greenFee: Number(body.greenFee), cartFee: Number(body.cartFee) || 0,
      walkingAllowed: body.walkingAllowed !== false, status: 'available',
    },
  });
  return NextResponse.json(teeTime);
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, status } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const teeTime = await prisma.teeTime.findFirst({ where: { id, courseId: session.courseId } });
  if (!teeTime) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(await prisma.teeTime.update({ where: { id }, data: { status } }));
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await prisma.teeTime.deleteMany({ where: { id, courseId: session.courseId } });
  return NextResponse.json({ success: true });
}
