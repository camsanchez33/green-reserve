import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const courseId = session.courseId;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const [bookings, teeTimes] = await Promise.all([
    prisma.booking.findMany({
      where: { courseId, status: 'confirmed', createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, totalAmount: true, greenFeeTotal: true, players: true },
    }),
    prisma.teeTime.findMany({
      where: { courseId, date: { gte: thirtyDaysAgoStr } },
      select: { date: true, playersAvailable: true, playersBooked: true, status: true, greenFee: true },
    }),
  ]);

  // Revenue by day (last 30)
  const revenueByDay: Record<string, { revenue: number; bookings: number; players: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    revenueByDay[key] = { revenue: 0, bookings: 0, players: 0 };
  }
  bookings.forEach(b => {
    const key = b.createdAt.toISOString().split('T')[0];
    if (revenueByDay[key]) {
      revenueByDay[key].revenue += b.greenFeeTotal / 100;
      revenueByDay[key].bookings += 1;
      revenueByDay[key].players += b.players;
    }
  });

  // Utilization by day of week
  const utilizationByDow: Record<number, { slots: number; booked: number }> = { 0:{slots:0,booked:0},1:{slots:0,booked:0},2:{slots:0,booked:0},3:{slots:0,booked:0},4:{slots:0,booked:0},5:{slots:0,booked:0},6:{slots:0,booked:0} };
  teeTimes.forEach(tt => {
    const dow = new Date(tt.date + 'T12:00:00').getDay();
    utilizationByDow[dow].slots += tt.playersAvailable;
    utilizationByDow[dow].booked += tt.playersBooked;
  });

  const totalRevenue = bookings.reduce((s, b) => s + b.greenFeeTotal / 100, 0);
  const totalBookings = bookings.length;
  const totalPlayers = bookings.reduce((s, b) => s + b.players, 0);
  const totalSlots = teeTimes.reduce((s, t) => s + t.playersAvailable, 0);
  const totalBooked = teeTimes.reduce((s, t) => s + t.playersBooked, 0);
  const utilization = totalSlots > 0 ? Math.round((totalBooked / totalSlots) * 100) : 0;

  return NextResponse.json({
    summary: { totalRevenue, totalBookings, totalPlayers, utilization },
    revenueByDay: Object.entries(revenueByDay).map(([date, data]) => ({ date, ...data })),
    utilizationByDow: Object.entries(utilizationByDow).map(([dow, data]) => ({
      dow: parseInt(dow),
      label: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parseInt(dow)],
      pct: data.slots > 0 ? Math.round((data.booked / data.slots) * 100) : 0,
    })),
  });
}
