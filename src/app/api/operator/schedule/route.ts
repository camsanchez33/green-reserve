import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scheduleMoneyFromWire, scheduleMoneyForCreate, scheduleToWire } from '@/lib/schedule-wire';
import { resolveDashboardSession } from '@/lib/session';
import { generateTeeTimes } from '@/lib/tee-sheet-engine';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(
    await prisma.teeTimeSchedule.findMany({
      where: { courseId: session.courseId },
      orderBy: { createdAt: 'asc' },
    })
  );
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const schedule = await prisma.teeTimeSchedule.create({
    data: {
      courseId: session.courseId,
      tierName: body.tierName || 'standard',
      daysOfWeek: body.daysOfWeek ?? [],
      startTime: body.startTime,
      endTime: body.endTime,
      intervalMinutes: Number(body.intervalMinutes) || 8,
      holes: Number(body.holes) || 18,
      // MP-3 B2d: the schedule editor sends dollars; the columns are cents.
      ...scheduleMoneyForCreate(body),
      walkingAllowed: body.walkingAllowed !== false,
    },
  });

  // Generate next 8 days immediately
  const today = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    await generateTeeTimes(session.courseId, d.toISOString().split('T')[0]);
  }

  return NextResponse.json(scheduleToWire(schedule));
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Verify ownership
  const existing = await prisma.teeTimeSchedule.findFirst({ where: { id, courseId: session.courseId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.teeTimeSchedule.update({
    where: { id },
    data: {
      active: data.active !== undefined ? data.active : existing.active,
      tierName: data.tierName ?? existing.tierName,
      daysOfWeek: data.daysOfWeek ?? existing.daysOfWeek,
      startTime: data.startTime ?? existing.startTime,
      endTime: data.endTime ?? existing.endTime,
      intervalMinutes: data.intervalMinutes !== undefined ? Number(data.intervalMinutes) : existing.intervalMinutes,
      holes: data.holes !== undefined ? Number(data.holes) : existing.holes,
      // Only the money keys actually present in the body are converted; the
      // rest keep their existing cents values.
      ...scheduleMoneyFromWire(data),
      walkingAllowed: data.walkingAllowed !== undefined ? data.walkingAllowed : existing.walkingAllowed,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await prisma.teeTimeSchedule.deleteMany({ where: { id, courseId: session.courseId } });
  return NextResponse.json({ success: true });
}
