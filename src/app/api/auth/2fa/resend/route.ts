import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { issueTwoFactorCode } from '@/lib/two-factor';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { securityEvent } from '@/lib/security-events';

// Cam 2026-10-27: resend had no limit, so anyone with an owner's password could
// flood their inbox or phone with codes. 5 a sign-in every 10 minutes, 20 an address.
const PER_LOGIN = 5;
const PER_IP = 20;
const WINDOW_S = 600;

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

  const [loginOk, ipOk] = await Promise.all([
    rateLimit(`2fa-resend:op:${operator.id}`, PER_LOGIN, WINDOW_S),
    rateLimit(`2fa-resend:ip:${clientIp(req)}`, PER_IP, WINDOW_S),
  ]);
  if (!loginOk || !ipOk) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'course', email: operator.email, accountId: operator.id, detail: 'resend sign-in code' });
    return NextResponse.json({ error: 'Too many new codes asked for. Wait 10 minutes, then try again — or use the last code we sent.' }, { status: 429 });
  }

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
