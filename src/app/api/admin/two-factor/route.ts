import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, stepUpRequired, freshStepUpRequired, type AdminSession } from '@/lib/admin-session';
import { securityEvent } from '@/lib/security-events';
import { sendOwnerTwoFactorChanged } from '@/lib/email';
import { requestContext, deviceLabel, alertTime } from '@/lib/owner-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import {
  generateTotpSecret, totpUri, totpQrSvg, totpMatchStep, generateRecoveryCodes,
  signEnrolToken, verifyEnrolToken,
} from '@/lib/owner-totp';
import { withAudit } from '@/lib/admin-audit';

// OWNER TOTP 2FA — enrolment and recovery codes, on /admin/profile.
//
//   GET                 → { enrolled, enrolledAt, recoveryCodesLeft }
//   POST start          → a fresh secret as an otpauth QR (SVG) + the secret in
//                         text, and a 10-minute enrolment token. Nothing is
//                         stored yet.
//   POST confirm        → { enrolToken, code }: ONE correct code persists the
//                         secret, stamps twoFactorEnrolledAt, and returns the ten
//                         recovery codes — shown exactly once.
//   POST regenerate     → { code }: a current TOTP code invalidates all ten
//                         recovery codes and returns ten new ones.
//
// Owner only, and only from a session that already passed a second factor
// (requireOwner asserts the mfa claim) — a password-only session can never
// set up or reset the second factor.
//
// Audit 2026-11-24 M6: a stolen gr_owner cookie could start and confirm a new
// authenticator, swapping in its own, which then passed every later step-up.
//   - Replacing the app (start, when one is set up) needs a FRESH "Confirm it's
//     you" with the current passkey, app or a recovery code (freshStepUpRequired,
//     used up here). confirm needs the enrolment token only start makes.
//     One exception, so a lost phone never locks the owner out: a session that
//     signed in with a recovery code may move the app within 5 minutes of that
//     sign-in (the code it spent IS the fresh second factor; it may have been
//     the last one, and then nothing is left to confirm with).
//   - A first set-up needs a second factor in the last few minutes
//     (stepUpRequired: the sign-in's emailed code, as there is nothing else yet).
//   - regenerate (new recovery codes) needs a fresh confirm too. It took a bare
//     app code, with no per-session cap, no record of a miss and no replay check,
//     and its new codes then passed the step-up: a way round the gate above.
// Every change is a security event and emails the owner at once.

/** The record and the alert; neither can undo or fail a change already saved. */
async function announce(req: NextRequest, admin: { id: string; email: string; name: string }, change: 'set_up' | 'replaced' | 'recovery_codes') {
  const words = change === 'set_up' ? 'authenticator app set up' : change === 'replaced' ? 'authenticator app replaced' : 'recovery codes replaced';
  await securityEvent(req, { kind: 'second_factor_changed', surface: 'owner', email: admin.email, accountId: admin.id, detail: words });
  try {
    const ctx = await requestContext();
    await sendOwnerTwoFactorChanged({ email: admin.email, name: admin.name, change, device: deviceLabel(ctx.userAgent), when: alertTime() });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'owner.two_factor_alert.fail', adminId: admin.id, error: err instanceof Error ? err.message : String(err) }));
  }
}

/** M6: the check before a new authenticator secret is handed out. Called last, so a refusal spends nothing. */
async function enrolGate(session: AdminSession, replacing: boolean): Promise<NextResponse | null> {
  if (replacing) {
    if (!stepUpRequired(session) && session.ownerSessionId) {
      // Signed in with a recovery code, and a second factor proved in the last 5 minutes.
      const s = await prisma.ownerSession.findUnique({ where: { id: session.ownerSessionId }, select: { method: true } });
      if (s?.method === 'recovery') return null;
    }
    return freshStepUpRequired(session);
  }
  if (!stepUpRequired(session)) return null;
  return NextResponse.json({ error: 'For your safety, set this up within 5 minutes of signing in. Sign in again at /cam, then come straight here.' }, { status: 403 });
}

async function gate() {
  const session = await resolveAdminSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!requireOwner(session)) return { error: NextResponse.json({ error: 'Owner only — sign in again.' }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const g = await gate();
  if ('error' in g) return g.error;
  const admin = await prisma.adminUser.findUnique({ where: { id: g.session.adminId }, select: { twoFactorSecret: true, twoFactorEnrolledAt: true, twoFactorRecoveryCodes: true } });
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    enrolled: !!admin.twoFactorSecret,
    enrolledAt: admin.twoFactorEnrolledAt?.toISOString() ?? null,
    recoveryCodesLeft: admin.twoFactorRecoveryCodes.length,
  });
}

async function twoFactor(req: NextRequest) {
  const g = await gate();
  if ('error' in g) return g.error;
  const ip = clientIp(req);
  const allowed = await rateLimit(`2fa:enrol:${ip}`, 20, 600);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts — try again in a few minutes.' }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const action = String(body.action ?? '');
  const admin = await prisma.adminUser.findUnique({ where: { id: g.session.adminId } });
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'start') {
    const refused = await enrolGate(g.session, !!admin.twoFactorSecret);
    if (refused) return refused;
    const secret = generateTotpSecret();
    const uri = totpUri(admin.email, secret);
    const [qrSvg, enrolToken] = await Promise.all([totpQrSvg(uri), signEnrolToken({ adminId: admin.id, secret })]);
    return NextResponse.json({ qrSvg, secret, uri, enrolToken, replacing: !!admin.twoFactorSecret });
  }

  if (action === 'confirm') {
    const enrol = await verifyEnrolToken(String(body.enrolToken ?? ''));
    if (!enrol || enrol.adminId !== admin.id) return NextResponse.json({ error: 'The setup expired — start again and scan the new code.' }, { status: 400 });
    const step = totpMatchStep(String(body.code ?? ''), enrol.secret);
    if (step === null) return NextResponse.json({ error: 'That code did not match. Check the app’s clock and try the next code.' }, { status: 400 });
    const codes = await generateRecoveryCodes();
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        twoFactorSecret: enrol.secret, twoFactorEnrolledAt: new Date(), twoFactorRecoveryCodes: codes.hashes,
        twoFactorCode: null, twoFactorCodeExpiry: null, twoFactorAttempts: 0,
      },
    });
    await announce(req, admin, admin.twoFactorSecret ? 'replaced' : 'set_up');
    return NextResponse.json({ success: true, recoveryCodes: codes.plain });
  }

  if (action === 'regenerate') {
    if (!admin.twoFactorSecret) return NextResponse.json({ error: 'Set up the authenticator first.' }, { status: 400 });
    // M6 review: a fresh "Confirm it's you" (capped, recorded, replay-guarded in /api/cam/step-up), used up here.
    const refused = await freshStepUpRequired(g.session);
    if (refused) return refused;
    const codes = await generateRecoveryCodes();
    await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorRecoveryCodes: codes.hashes } });
    await announce(req, admin, 'recovery_codes');
    return NextResponse.json({ success: true, recoveryCodes: codes.plain });
  }

  return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
}

// BRAIN-1a: turning on or regenerating two-factor is recorded; starting setup is not.
export const POST = withAudit(twoFactor, body => body.action === 'confirm' || body.action === 'regenerate' ? { action: `two_factor_${String(body.action)}`, targetType: 'admin', targetId: 'self', after: {} } : null);
