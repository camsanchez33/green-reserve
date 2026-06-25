import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { issueTwoFactorCode } from '@/lib/two-factor';

export async function POST(req: NextRequest) {
  const pendingToken = req.cookies.get('gr_2fa_pending')?.value;
  if (!pendingToken) return NextResponse.json({ error: 'No pending login. Please sign in again.' }, { status: 401 });

  const payload = await verifyToken(pendingToken);
  if (!payload || payload.type !== 'pending_2fa') {
    return NextResponse.json({ error: 'No pending login. Please sign in again.' }, { status: 401 });
  }
  const { operatorId } = payload as { operatorId: string };

  const operator = await prisma.courseOperator.findUnique({ where: { id: operatorId } });
  if (!operator) return NextResponse.json({ error: 'No pending login. Please sign in again.' }, { status: 401 });

  const requestedMethod = req.nextUrl.searchParams.get('method') === 'sms' ? 'sms' : 'email';
  if (requestedMethod === 'sms' && !operator.phone) {
    return NextResponse.json({ error: 'No phone number on file for this account.' }, { status: 400 });
  }

  try {
    const { method, phoneLast4 } = await issueTwoFactorCode(operator, requestedMethod);
    return NextResponse.json({ success: true, method, phoneLast4 });
  } catch (err) {
    console.error('2FA code resend failed:', err);
    return NextResponse.json({ error: 'Could not send verification code. Try again shortly.' }, { status: 500 });
  }
}
