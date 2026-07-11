import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';
import { sendOperatorVerifyEmail } from '@/lib/email';
import { randomBytes } from 'crypto';
import { rateLimit } from '@/lib/rate-limit';

// Real verification email for operators who have a session but aren't yet
// emailVerified (e.g. logged in with a temp password without clicking the
// original setup link). Never verifies in-app — only re-sends the real link.
export async function POST() {
  const session = await getOperatorSession();
  if (!session || session.kind !== 'operator') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const operator = await prisma.courseOperator.findUnique({ where: { id: session.operatorId } });
  if (!operator) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (operator.emailVerified) return NextResponse.json({ success: true, alreadyVerified: true });

  const allowed = await rateLimit(`resend-verify:${operator.id}`, 1, 60);
  if (!allowed) return NextResponse.json({ error: 'Please wait a bit before requesting another link.' }, { status: 429 });

  const token = operator.verificationToken || randomBytes(32).toString('hex');
  if (!operator.verificationToken) {
    await prisma.courseOperator.update({ where: { id: operator.id }, data: { verificationToken: token } });
  }

  const setupLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/verify?token=${token}`;
  try {
    await sendOperatorVerifyEmail({ operatorName: operator.name, operatorEmail: operator.email, verifyLink: setupLink });
  } catch (err) {
    console.error('Failed to send operator verify email:', err);
    return NextResponse.json({ error: 'Could not send the email. Try again shortly.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
