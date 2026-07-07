import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const courseId = url.searchParams.get('courseId') || '';
  const fromStr = url.searchParams.get('from') || '';
  const toStr = url.searchParams.get('to') || '';

  const now = new Date();
  const fromDate = fromStr ? new Date(fromStr + 'T00:00:00.000Z') : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const toDate = toStr ? new Date(toStr + 'T23:59:59.999Z') : now;

  const cFilter = courseId ? { courseId } : {};

  const [bookings, cancellations, memberships, memberPayments, allCourses] = await Promise.all([
    prisma.booking.findMany({
      where: { status: { in: ['confirmed', 'completed'] }, createdAt: { gte: fromDate, lte: toDate }, ...cFilter },
      select: {
        id: true, createdAt: true, golferName: true, golferEmail: true,
        players: true, totalAmount: true, accessFeeTotal: true,
        course: { select: { name: true } },
        teeTime: { select: { date: true, time: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        status: 'cancelled', ...cFilter,
        OR: [
          { cancelledAt: { gte: fromDate, lte: toDate } },
          { cancelledAt: null, createdAt: { gte: fromDate, lte: toDate } },
        ],
      },
      select: {
        id: true, createdAt: true, cancelledAt: true, golferName: true, golferEmail: true,
        players: true, cancellationFeeTotal: true,
        course: { select: { name: true } },
        teeTime: { select: { date: true, time: true } },
      },
    }),
    prisma.courseMembership.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate }, ...cFilter },
      select: {
        id: true, createdAt: true, inviteName: true, inviteEmail: true,
        tier: { select: { name: true } },
        golfer: { select: { firstName: true, lastName: true, email: true } },
        course: { select: { name: true } },
      },
    }),
    prisma.courseMembership.findMany({
      where: { paymentStatus: { in: ['paid', 'paid_offline'] }, lastPaidAt: { gte: fromDate, lte: toDate }, ...cFilter },
      select: {
        id: true, lastPaidAt: true, inviteName: true, inviteEmail: true,
        tier: { select: { name: true, annualFee: true } },
        golfer: { select: { firstName: true, lastName: true, email: true } },
        course: { select: { name: true } },
      },
    }),
    prisma.course.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  const events = [
    ...bookings.map(b => ({
      type: 'booking' as const,
      id: b.id,
      timestamp: b.createdAt.toISOString(),
      courseName: b.course.name,
      golferName: b.golferName,
      golferEmail: b.golferEmail,
      players: b.players,
      totalAmount: b.totalAmount / 100,
      accessFeeTotal: b.accessFeeTotal / 100,
      teeDate: b.teeTime.date,
      teeTime: b.teeTime.time,
    })),
    ...cancellations.map(c => ({
      type: 'cancellation' as const,
      id: c.id,
      timestamp: (c.cancelledAt ?? c.createdAt).toISOString(),
      courseName: c.course.name,
      golferName: c.golferName,
      golferEmail: c.golferEmail,
      players: c.players,
      cancellationFeeTotal: c.cancellationFeeTotal / 100,
      teeDate: c.teeTime.date,
      teeTime: c.teeTime.time,
    })),
    ...memberships.map(m => ({
      type: 'membership' as const,
      id: m.id,
      timestamp: m.createdAt.toISOString(),
      courseName: m.course.name,
      memberName: m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}` : (m.inviteName || '—'),
      memberEmail: m.golfer?.email || m.inviteEmail || '',
      tierName: m.tier?.name ?? null,
    })),
    ...memberPayments.map(p => ({
      type: 'membership_payment' as const,
      id: `pay_${p.id}`,
      timestamp: (p.lastPaidAt ?? new Date()).toISOString(),
      courseName: p.course.name,
      memberName: p.golfer ? `${p.golfer.firstName} ${p.golfer.lastName}` : (p.inviteName || '—'),
      memberEmail: p.golfer?.email || p.inviteEmail || '',
      tierName: p.tier?.name ?? null,
      amount: p.tier?.annualFee ?? 0,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const total = events.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = events.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return NextResponse.json({ items, total, page, pages, courses: allCourses });
}
