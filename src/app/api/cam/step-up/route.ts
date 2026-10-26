import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner } from '@/lib/admin-session';
import { rateLimit } from '@/lib/rate-limit';
import { markStepUp } from '@/lib/owner-session';
import { securityEvent } from '@/lib/security-events';
import { hasPasskey, authenticationOptions, verifyPasskeySignIn } from '@/lib/owner-passkey';
import { totpMatchStep, matchRecoveryCode, looksLikeRecoveryCode, TOTP_USED_PREFIX, TOTP_PENDING, TOTP_STEP_SECONDS } from '@/lib/owner-totp';

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
  if (!(await rateLimit(`cam:step-up:${g.sessionId}`, 6, 300))) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'owner', accountId: g.session.adminId, detail: 'confirm it’s you' });
    return NextResponse.json({ error: 'Too many tries — wait a few minutes.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({})) as { response?: unknown; code?: unknown };
  const adminId = g.session.adminId;

  if (body.response && typeof body.response === 'object') {
    if (!(await verifyPasskeySignIn(adminId, body.response as Parameters<typeof verifyPasskeySignIn>[1]))) {
      await securityEvent(req, { kind: 'step_up_failed', surface: 'owner', accountId: adminId, detail: 'passkey' });
      return NextResponse.json({ error: 'That passkey didn’t check out — try again, or use your authenticator code.' }, { status: 400 });
    }
  } else if (typeof body.code === 'string') {
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { twoFactorSecret: true, twoFactorRecoveryCodes: true, twoFactorCode: true, twoFactorCodeExpiry: true } });
    if (!admin?.twoFactorSecret) return NextResponse.json({ error: 'Set up the authenticator app on My profile first.' }, { status: 400 });
    const raw = body.code.trim();
    if (looksLikeRecoveryCode(raw)) {
      const idx = await matchRecoveryCode(raw, admin.twoFactorRecoveryCodes);
      if (idx < 0) {
        await securityEvent(req, { kind: 'step_up_failed', surface: 'owner', accountId: adminId, detail: 'recovery code' });
        return NextResponse.json({ error: 'That recovery code didn’t match.' }, { status: 400 });
      }
      await prisma.adminUser.update({ where: { id: adminId }, data: { twoFactorRecoveryCodes: admin.twoFactorRecoveryCodes.filter((_, i) => i !== idx) } });
    } else {
      const step = totpMatchStep(raw, admin.twoFactorSecret);
      // The last used step lives on either marker: 'totp-used:<step>', or carried
      // on a sign-in in flight as 'totp-pending:<step>' (login's setTotpPending).
      const live = !!admin.twoFactorCode && !!admin.twoFactorCodeExpiry && admin.twoFactorCodeExpiry > new Date();
      const pending = live && admin.twoFactorCode!.startsWith(TOTP_PENDING);
      const usedLive = !live ? ''
        : admin.twoFactorCode!.startsWith(TOTP_USED_PREFIX) ? admin.twoFactorCode!.slice(TOTP_USED_PREFIX.length)
        : pending ? admin.twoFactorCode!.slice(TOTP_PENDING.length + 1) : '';
      if (step === null || String(step) === usedLive) {
        await securityEvent(req, { kind: 'step_up_failed', surface: 'owner', accountId: adminId, detail: step === null ? 'authenticator code' : 'authenticator code already used' });
        return NextResponse.json({ error: 'That code didn’t match — wait for the next one and try again.' }, { status: 400 });
      }
      // Mark the step used so the same code can't confirm twice. A sign-in in
      // flight on another device keeps its pending marker, carrying this step.
      await prisma.adminUser.update({ where: { id: adminId }, data: pending
        ? { twoFactorCode: `${TOTP_PENDING}:${step}` }
        : { twoFactorCode: TOTP_USED_PREFIX + step, twoFactorCodeExpiry: new Date(Date.now() + 2 * TOTP_STEP_SECONDS * 1000) } });
    }
  } else {
    return NextResponse.json({ error: 'Use your passkey or enter a code.' }, { status: 400 });
  }
  await markStepUp(g.sessionId);
  return NextResponse.json({ confirmed: true });
}
