import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { sendOperatorPasswordResetEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const { email: rawEmail } = await req.json();
  if (!rawEmail) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const operator = await prisma.courseOperator.findUnique({ where: { email } });

  // Always return success even if no account exists — don't let this endpoint
  // be used to check which emails are registered.
  if (!operator) {
    return NextResponse.json({ success: true });
  }

  const resetToken = randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.courseOperator.update({
    where: { id: operator.id },
    data: { resetToken, resetTokenExpiry },
  });

  const resetLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/reset-password?token=${resetToken}`;

  try {
    await sendOperatorPasswordResetEmail({
      operatorName: operator.name,
      operatorEmail: operator.email,
      resetLink,
    });
  } catch (err) {
    console.error('Password reset email failed:', err);
    return NextResponse.json({ error: 'Could not send reset email. Try again shortly.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
