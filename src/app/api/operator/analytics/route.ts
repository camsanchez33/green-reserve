import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

// SD-4: money truth for the operator's Analytics tab.
//
// Before: revenue selected `status: 'confirmed'` by createdAt. A round
// vanished from the chart the moment the golfer was checked in (status →
// 'completed'), while an unpaid booking for next week counted as revenue the
// day it was made. Utilization had no date bound and no status filter, so it
// included the eight generated future days and blocked slots.
//
// Now: revenue is COMPLETED rounds (checked in and paid) placed on their PLAY
// date — the same basis as the Payments page's "collected". Bookings and
// players follow the same rule. Utilization covers the last 30 days up to
// today, open slots only. "Upcoming" is reported separately so the pipeline
// stays visible without being counted as money.

function dayStr(d: Date) { return d.toISOString().split('T')[0]; }

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const courseId = session.courseId;
  const now = new Date();
  const todayStr = dayStr(now);
  const thirtyDaysAgoStr = dayStr(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));

  const [completed, upcoming, teeTimes] = await Promise.all([
    prisma.booking.findMany({
      where: { courseId, status: 'completed', paymentStatus: 'paid', teeTime: { date: { gte: thirtyDaysAgoStr, lte: todayStr } } },
      select: { totalAmount: true, greenFeeTotal: true, cartFeeTotal: true, players: true, teeTime: { select: { date: true } } },
    }),
    prisma.booking.aggregate({
      where: { courseId, status: 'confirmed', teeTime: { date: { gte: todayStr } } },
      _sum: { greenFeeTotal: true, cartFeeTotal: true, players: true }, _count: { id: true },
    }),
    prisma.teeTime.findMany({
      where: { courseId, date: { gte: thirtyDaysAgoStr, lte: todayStr }, status: { not: 'blocked' } },
      select: { date: true, playersAvailable: true, playersBooked: true },
    }),
  ]);

  // Revenue by PLAY day (last 30, today last)
  const revenueByDay: Record<string, { revenue: number; bookings: number; players: number }> = {};
  for (let i = 29; i >= 0; i--) {
    revenueByDay[dayStr(new Date(now.getTime() - i * 24 * 60 * 60 * 1000))] = { revenue: 0, bookings: 0, players: 0 };
  }
  for (const b of completed) {
    const day = revenueByDay[b.teeTime.date];
    if (!day) continue;
    // Green + cart fee — the money that lands with the course. The $1.50/player
    // access fee is GreenReserve's, not theirs.
    day.revenue += (b.greenFeeTotal + b.cartFeeTotal) / 100;
    day.bookings += 1;
    day.players += b.players;
  }

  // Utilization by day of week — open slots in the window, filled by standing bookings
  const utilizationByDow: Record<number, { slots: number; booked: number }> = { 0:{slots:0,booked:0},1:{slots:0,booked:0},2:{slots:0,booked:0},3:{slots:0,booked:0},4:{slots:0,booked:0},5:{slots:0,booked:0},6:{slots:0,booked:0} };
  for (const tt of teeTimes) {
    const dow = new Date(tt.date + 'T12:00:00').getDay();
    utilizationByDow[dow].slots += tt.playersAvailable;
    utilizationByDow[dow].booked += Math.min(tt.playersBooked, tt.playersAvailable);
  }

  const totalRevenue = completed.reduce((s, b) => s + (b.greenFeeTotal + b.cartFeeTotal) / 100, 0);
  const totalPlayers = completed.reduce((s, b) => s + b.players, 0);
  const totalSlots = teeTimes.reduce((s, t) => s + t.playersAvailable, 0);
  const totalBooked = teeTimes.reduce((s, t) => s + Math.min(t.playersBooked, t.playersAvailable), 0);
  const utilization = totalSlots > 0 ? Math.min(100, Math.round((totalBooked / totalSlots) * 100)) : 0;

  return NextResponse.json({
    basis: 'Completed rounds (checked in and paid), by play date, last 30 days.',
    summary: {
      totalRevenue, totalBookings: completed.length, totalPlayers, utilization,
      // The pipeline — standing bookings from today onward. Shown, never added to revenue.
      upcomingBookings: upcoming._count.id,
      upcomingPlayers: upcoming._sum.players ?? 0,
      upcomingRevenue: ((upcoming._sum.greenFeeTotal ?? 0) + (upcoming._sum.cartFeeTotal ?? 0)) / 100,
    },
    revenueByDay: Object.entries(revenueByDay).map(([date, data]) => ({ date, ...data })),
    utilizationByDow: Object.entries(utilizationByDow).map(([dow, data]) => ({
      dow: parseInt(dow),
      label: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parseInt(dow)],
      pct: data.slots > 0 ? Math.min(100, Math.round((data.booked / data.slots) * 100)) : 0,
    })),
  });
}
