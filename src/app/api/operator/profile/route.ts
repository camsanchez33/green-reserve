import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';

export async function GET() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const operator = await prisma.courseOperator.findUnique({
    where: { id: session.operatorId },
    select: { id: true, email: true, name: true, emailVerified: true, onboardingStep: true },
  });
  return NextResponse.json(operator);
}

export async function PATCH() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const op = await prisma.courseOperator.findUnique({ where: { id: session.operatorId } });
  if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.courseOperator.update({
    where: { id: session.operatorId },
    data: { onboardingStep: Math.max(op.onboardingStep, 2) },
  });
  return NextResponse.json({ onboardingStep: updated.onboardingStep });
}
