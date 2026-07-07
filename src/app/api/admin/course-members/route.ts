import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const [tiers, members] = await Promise.all([
    prisma.membershipTier.findMany({
      where: { courseId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { memberships: { where: { status: 'active' } } } } },
    }),
    prisma.courseMembership.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, inviteName: true, inviteEmail: true, status: true,
        paymentStatus: true, expiresAt: true, createdAt: true,
        tier: { select: { name: true } },
        golfer: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
  ]);

  return NextResponse.json({
    tiers: tiers.map(t => ({
      id: t.id, name: t.name, annualFee: t.annualFee,
      active: t.active, memberCount: t._count.memberships,
    })),
    members: members.map(m => ({
      id: m.id,
      golfer: m.golfer,
      inviteName: m.inviteName,
      inviteEmail: m.inviteEmail,
      tierName: m.tier?.name ?? null,
      status: m.status,
      paymentStatus: m.paymentStatus,
      expiresAt: m.expiresAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
