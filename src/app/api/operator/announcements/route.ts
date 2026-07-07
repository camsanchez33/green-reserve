import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only operators (not staff) have dismissals tracked
  if (!session.operatorId) return NextResponse.json(null);

  const announcement = await prisma.announcement.findFirst({
    orderBy: { createdAt: 'desc' },
    where: { dismissals: { none: { operatorId: session.operatorId } } },
    select: { id: true, title: true, body: true, createdAt: true },
  });

  return NextResponse.json(announcement ?? null);
}
