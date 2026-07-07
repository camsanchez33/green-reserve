import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.operatorId) return NextResponse.json({ error: 'Staff cannot dismiss announcements' }, { status: 403 });

  const { announcementId } = await req.json();
  if (!announcementId) return NextResponse.json({ error: 'announcementId required' }, { status: 400 });

  await prisma.announcementDismissal.upsert({
    where: { announcementId_operatorId: { announcementId, operatorId: session.operatorId } },
    update: {},
    create: { announcementId, operatorId: session.operatorId },
  });

  return NextResponse.json({ success: true });
}
