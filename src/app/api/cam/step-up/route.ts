import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner } from '@/lib/admin-session';
import { rateLimit } from '@/lib/rate-limit';
import { markStepUp } from '@/lib/owner-session';
import { hasPasskey, authenticationOptions, verifyPasskeySignIn } from '@/lib/owner-passkey';
import { totpMatchStep, matchRecoveryCode, looksLikeRecoveryCode, TOTP_USED_PREFIX, TOTP_STEP_SECONDS } from '@/lib/owner-totp';

// AW-1c (Cam 2026-10-21: risky actions re-confirmed with the passkey): "Confirm
// it's you" inside a signed-in owner session. GET says which factors this owner
// has (and arms a passkey prompt); POST proves one — the passkey, an
// authenticator code (a code already used is refused), or a recovery code
// (used up) — and marks the session as just confirmed.

async function gate() {
  const session = await resolveAdminSession();
  if (!session || !requireOwner(session) || !session.ownerSessionId) return { res: NextResponse.json({ error: 'Sign in again.' }, { status: 401 }) };
  return { session, sessionId: session.ownerSessionId };
}

export async function GET() {
  const g = await gate();
  if ('res' in g) return g.res;
  const admin = await prisma.adminUser.findUnique({ where: { id: g.session.adminId }, select: { twoFactorSecret: true } });
  const passkey = (await hasPasskey(g.session.adminId)) ? await authenticationOptions(g.session.adminId) : null;
  return NextResponse.json({ passkey, code: !!admin?.twoFactorSecret });
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  if (!(await rateLimit(`cam:step-up:${g.sessionId}`, 6, 300))) return NextResponse.json({ error: 'Too many tries — wait a few minutes.' }, { status: 429 });
  const body = await req.json().catch(() => ({})) as { response?: unknown; code?: unknown };
  const adminId = g.session.adminId;

  if (body.response && typeof body.response === 'object') {
    if (!(await verifyPasskeySignIn(adminId, body.response as Parameters<typeof verifyPasskeySignIn>[1]))) {
      return NextResponse.json({ error: 'That passkey didn’t check out — try again, or use your authenticator code.' }, { status: 400 });
    }
  } else if (typeof body.code === 'string') {
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { twoFactorSecret: true, twoFactorRecoveryCodes: true, twoFactorCode: true, twoFactorCodeExpiry: true } });
    if (!admin?.twoFactorSecret) return NextResponse.json({ error: 'Set up the authenticator app on My profile first.' }, { status: 400 });
    const raw = body.code.trim();
    if (looksLikeRecoveryCode(raw)) {
      const idx = await matchRecoveryCode(raw, admin.twoFactorRecoveryCodes);
      if (idx < 0) return NextResponse.json({ error: 'That recovery code didn’t match.' }, { status: 400 });
      await prisma.adminUser.update({ where: { id: adminId }, data: { twoFactorRecoveryCodes: admin.twoFactorRecoveryCodes.filter((_, i) => i !== idx) } });
    } else {
      const step = totpMatchStep(raw, admin.twoFactorSecret);
      const usedLive = admin.twoFactorCode?.startsWith(TOTP_USED_PREFIX) && admin.twoFactorCodeExpiry && admin.twoFactorCodeExpiry > new Date() ? admin.twoFactorCode.slice(TOTP_USED_PREFIX.length) : '';
      if (step === null || String(step) === usedLive) return NextResponse.json({ error: 'That code didn’t match — wait for the next one and try again.' }, { status: 400 });
      // Mark the step used so the same code can't confirm twice.
      await prisma.adminUser.update({ where: { id: adminId }, data: { twoFactorCode: TOTP_USED_PREFIX + step, twoFactorCodeExpiry: new Date(Date.now() + 2 * TOTP_STEP_SECONDS * 1000) } });
    }
  } else {
    return NextResponse.json({ error: 'Use your passkey or enter a code.' }, { status: 400 });
  }
  await markStepUp(g.sessionId);
  return NextResponse.json({ confirmed: true });
}
