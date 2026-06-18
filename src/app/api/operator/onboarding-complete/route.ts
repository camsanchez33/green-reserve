import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';

export async function POST() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.courseOperator.update({
    where: { id: session.operatorId },
    data: { onboardingStep: 3 },
  });
  return NextResponse.json({ success: true });
}
