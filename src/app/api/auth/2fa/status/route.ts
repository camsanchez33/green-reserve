import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const pendingToken = req.cookies.get('gr_2fa_pending')?.value;
  if (!pendingToken) return NextResponse.json({ error: 'No pending login. Please sign in again.' }, { status: 401 });

  const payload = await verifyToken(pendingToken);
  if (!payload || payload.type !== 'pending_2fa') {
    return NextResponse.json({ error: 'No pending login. Please sign in again.' }, { status: 401 });
  }
  const { operatorId } = payload as { operatorId: string };

  const operator = await prisma.courseOperator.findUnique({ where: { id: operatorId }, select: { twoFactorMethod: true, phone: true } });
  if (!operator) return NextResponse.json({ error: 'No pending login. Please sign in again.' }, { status: 401 });

  const method = operator.twoFactorMethod === 'sms' && operator.phone ? 'sms' : 'email';
  return NextResponse.json({ method, phoneLast4: operator.phone ? operator.phone.slice(-4) : null });
}
