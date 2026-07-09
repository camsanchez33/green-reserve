import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const courseId = searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const fromStr = searchParams.get('from') || '';
  const toStr = searchParams.get('to') || '';
  const search = (searchParams.get('search') || '').toLowerCase().trim();

  const fromDate = fromStr ? new Date(fromStr + 'T00:00:00.000Z') : undefined;
  const toDate = toStr ? new Date(toStr + 'T23:59:59.999Z') : undefined;
  const dateFilter = {
    ...(fromDate ? { gte: fromDate } : {}),
    ...(toDate ? { lte: toDate } : {}),
  };

  const [bookings, memberPayments] = await Promise.all([
    prisma.booking.findMany({
      where: {
        courseId,
        ...(fromDate || toDate ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true, golferName: true, golferEmail: true, players: true,
        totalAmount: true, accessFeeTotal: true, cancellationFeeTotal: true,
        paymentStatus: true, status: true, createdAt: true,
        teeTime: { select: { date: true, time: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.courseMembership.findMany({
      where: {
        courseId,
        paymentStatus: { in: ['paid', 'paid_offline'] },
        ...(fromDate || toDate ? { lastPaidAt: dateFilter } : {}),
      },
      select: {
        id: true, inviteName: true, inviteEmail: true, lastPaidAt: true,
        golfer: { select: { firstName: true, lastName: true, email: true } },
        tier: { select: { name: true, annualFee: true } },
      },
      orderBy: { lastPaidAt: 'desc' },
    }),
  ]);

  function bookingStatus(b: { status: string; paymentStatus: string; cancellationFeeTotal: number }) {
    if (b.status === 'cancelled') return b.cancellationFeeTotal > 0 ? 'fee_charged' : 'cancelled';
    if (b.status === 'completed') return 'completed';
    if (b.paymentStatus === 'manual') return 'manual';
    return 'card_saved';
  }

  const allItems = [
    ...bookings.map(b => ({
      id: b.id,
      type: 'booking' as const,
      golferName: b.golferName,
      golferEmail: b.golferEmail,
      amount: b.cancellationFeeTotal > 0 && b.status === 'cancelled' ? b.cancellationFeeTotal / 100 : b.totalAmount / 100,
      platformFee: b.accessFeeTotal / 100,
      status: bookingStatus(b),
      date: b.teeTime.date,
      detail: b.cancellationFeeTotal > 0 && b.status === 'cancelled'
        ? `Late-cancel fee · ${b.teeTime.date} at ${b.teeTime.time}`
        : `${b.teeTime.date} at ${b.teeTime.time} · ${b.players}p`,
    })),
    ...memberPayments.map(p => {
      const name = p.golfer ? `${p.golfer.firstName} ${p.golfer.lastName}` : (p.inviteName || '—');
      const email = p.golfer?.email || p.inviteEmail || '';
      return {
        id: `pay_${p.id}`,
        type: 'membership_payment' as const,
        golferName: name,
        golferEmail: email,
        amount: p.tier?.annualFee ?? 0,
        platformFee: 0,
        status: 'paid',
        date: (p.lastPaidAt ?? new Date()).toISOString(),
        detail: p.tier?.name ? `Dues — ${p.tier.name}` : 'Membership dues',
      };
    }),
  ]
    .filter(item =>
      !search ||
      item.golferName.toLowerCase().includes(search) ||
      item.golferEmail.toLowerCase().includes(search)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = allItems.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = allItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return NextResponse.json({ items, total, page, pages });
}
