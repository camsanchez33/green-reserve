import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner } from '@/lib/admin-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import {
  generateTotpSecret, totpUri, totpQrSvg, totpMatchStep, generateRecoveryCodes,
  signEnrolToken, verifyEnrolToken,
} from '@/lib/owner-totp';

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

async function gate() {
  const session = await resolveAdminSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!requireOwner(session)) return { error: NextResponse.json({ error: 'Owner only, and only from a session that signed in with 2FA — use the owner login.' }, { status: 403 }) };
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

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ success: true, recoveryCodes: codes.plain });
  }

  if (action === 'regenerate') {
    if (!admin.twoFactorSecret) return NextResponse.json({ error: 'Set up the authenticator first.' }, { status: 400 });
    const step = totpMatchStep(String(body.code ?? ''), admin.twoFactorSecret);
    if (step === null) return NextResponse.json({ error: 'Enter a current code from your authenticator to replace the recovery codes.' }, { status: 400 });
    const codes = await generateRecoveryCodes();
    await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorRecoveryCodes: codes.hashes } });
    return NextResponse.json({ success: true, recoveryCodes: codes.plain });
  }

  return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
}
