import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 400 });

  const operator = await prisma.courseOperator.findFirst({
    where: { verificationToken: token },
  });

  if (!operator) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  if (operator.emailVerified) {
    // MP-2c: MP-2b cleared the token only on FIRST verification, so every
    // already-verified operator kept a live one — and the resend/preview paths
    // mint fresh tokens on verified operators, which were never burned at all.
    // Re-visiting a used link is also a normal thing to do, so this stays a
    // success rather than "Verification failed".
    if (operator.verificationToken) {
      await prisma.courseOperator.update({ where: { id: operator.id }, data: { verificationToken: null } });
    }
    return NextResponse.json({ success: true, alreadyVerified: true });
  }

  await prisma.courseOperator.update({
    where: { id: operator.id },
    // MP-2b (ADMIN_V4 V4-2, the sub-fix MP-2 missed): burn the token on use.
    // It was left in place after verifying, so it stayed valid forever and was
    // never rotated — a long-lived credential sitting in an email, in server
    // logs, and in anything that had ever read the operator row.
    data: { emailVerified: true, onboardingStep: 1, verificationToken: null },
  });

  return NextResponse.json({ success: true });
}
