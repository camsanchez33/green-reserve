import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Staff don't have an operator profile — return a synthetic payload that
  // satisfies the dashboard's emailVerified / onboardingStep checks so staff
  // sessions are never bounced to /dashboard/verify or /dashboard/onboarding.
  if (session.isStaff) {
    return NextResponse.json({ email: session.email, emailVerified: true, onboardingStep: 3 });
  }

  const operator = await prisma.courseOperator.findUnique({
    where: { id: session.operatorId! },
    select: { id: true, email: true, name: true, emailVerified: true, onboardingStep: true },
  });
  return NextResponse.json(operator);
}

export async function PATCH() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Staff cannot modify operator profile/onboarding state.
  if (session.isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const op = await prisma.courseOperator.findUnique({ where: { id: session.operatorId! } });
  if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.courseOperator.update({
    where: { id: session.operatorId! },
    data: { onboardingStep: Math.max(op.onboardingStep, 2) },
  });
  return NextResponse.json({ onboardingStep: updated.onboardingStep });
}
