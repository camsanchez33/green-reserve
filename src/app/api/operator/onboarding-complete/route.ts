import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { liveOperatorSession } from '@/lib/session';

export async function POST() {
  const session = await liveOperatorSession(); // audit 2026-11-24 L1: a killed cookie (old sessionVersion) is refused
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.kind !== 'operator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.courseOperator.update({
    where: { id: session.operatorId },
    data: { onboardingStep: 3 },
  });
  return NextResponse.json({ success: true });
}
