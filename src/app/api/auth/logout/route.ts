import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// Audit 2026-11-24 L12: sign-out revoked nothing on the server, so with the 7-day sliding renewal a
// copied gr_operator cookie lived until the next password change. Signing out now bumps the login's
// sessionVersion, which ends every cookie for that login (this device and any copy). Only a token
// that is still live does it, so an old dead cookie can't sign anyone out; it never fails the sign-out.
export async function POST(req: NextRequest) {
  const token = req.cookies.get('gr_operator')?.value;
  if (token) {
    try {
      const p = (await verifyToken(token)) as { type?: string; operatorId?: unknown; staffId?: unknown; sv?: unknown } | null;
      const sv = typeof p?.sv === 'number' ? p.sv : 0;
      if (p && p.type === 'staff' && typeof p.staffId === 'string') {
        await prisma.courseStaff.updateMany({ where: { id: p.staffId, sessionVersion: sv }, data: { sessionVersion: { increment: 1 } } });
      } else if (p && p.type === 'operator' && typeof p.operatorId === 'string') {
        await prisma.courseOperator.updateMany({ where: { id: p.operatorId, sessionVersion: sv }, data: { sessionVersion: { increment: 1 } } });
      }
    } catch (err) {
      console.error('[logout] server-side revoke failed', err instanceof Error ? err.message : String(err));
    }
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set('gr_operator', '', { maxAge: 0, path: '/' });
  return res;
}
