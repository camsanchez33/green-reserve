import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';

// Course-scoped golfer portal data (GOLFER_SPEC G5). Isolation guarantee
// comes from filtering every query by THIS course's id — the gr_golfer
// session itself is a global identity, not course-locked, so a golfer with
// bookings at ten courses only ever sees this one course's data here.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getGolferSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, brandColor: true, logoUrl: true, active: true, liveStatus: true, archivedAt: true },
  });
  if (!course || !course.active || course.liveStatus !== 'live' || course.archivedAt) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  const golfer = await prisma.golferAccount.findUnique({
    where: { id: session.golferId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!golfer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().split('T')[0];

  const [upcoming, past, membership] = await Promise.all([
    prisma.booking.findMany({
      where: {
        courseId: course.id,
        golferAccountId: golfer.id,
        status: 'confirmed',
        teeTime: { date: { gte: today } },
      },
      include: { teeTime: { select: { date: true, time: true, holes: true } } },
      orderBy: { teeTime: { date: 'asc' } },
    }),
    prisma.booking.findMany({
      where: {
        courseId: course.id,
        golferAccountId: golfer.id,
        OR: [
          { status: { in: ['completed', 'cancelled'] } },
          { teeTime: { date: { lt: today } } },
        ],
      },
      include: { teeTime: { select: { date: true, time: true, holes: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.courseMembership.findFirst({
      where: { courseId: course.id, golferId: golfer.id, status: 'active' },
      include: { tier: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    course: { name: course.name, slug: course.slug, brandColor: course.brandColor, logoUrl: course.logoUrl },
    golfer: { firstName: golfer.firstName, lastName: golfer.lastName, email: golfer.email },
    upcoming: upcoming.map(b => ({
      id: b.id,
      date: b.teeTime.date,
      time: b.teeTime.time,
      holes: b.teeTime.holes,
      players: b.players,
      totalAmount: b.totalAmount,
      status: b.status,
      checkedInAt: b.checkedInAt,
      checkInToken: b.checkInToken,
    })),
    past: past.map(b => ({
      id: b.id,
      date: b.teeTime.date,
      time: b.teeTime.time,
      players: b.players,
      totalAmount: b.totalAmount,
      status: b.status,
      checkInToken: b.checkInToken,
    })),
    membership: membership ? { tierName: membership.tier?.name ?? membership.membershipType } : null,
  });
}
