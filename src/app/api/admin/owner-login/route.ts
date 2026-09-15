import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAdminToken, signAdminSetPasswordToken } from '@/lib/admin-session';
import { sendAdminTwoFactorCode } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { cookies } from 'next/headers';
import { totpMatchStep, matchRecoveryCode, looksLikeRecoveryCode, TOTP_PENDING, TOTP_USED_PREFIX, TOTP_STEP_SECONDS } from '@/lib/owner-totp';

const MAX_2FA_ATTEMPTS = 5;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function gen6DigitCode(): string {
  return String(randomInt(100000, 999999));
}

function lockoutResponse(lockoutUntil: Date) {
  const minutes = Math.ceil((lockoutUntil.getTime() - Date.now()) / 60000);
  return NextResponse.json({ error: `Too many attempts, try again in ${minutes} minute${minutes === 1 ? '' : 's'}` }, { status: 429 });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await req.json();

  // ── Step 2: verify 2FA code ──────────────────────────────────────────
  if (body.step === 'verify') {
    const allowed = await rateLimit(`2fa:admin:${ip}`, 10, 300);
    if (!allowed) return NextResponse.json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 });

    const { email: rawEmail, code } = body;
    if (!rawEmail || !code) return NextResponse.json({ error: 'email and code required' }, { status: 400 });
    const email = String(rawEmail).trim().toLowerCase();

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || admin.role !== 'owner' || !admin.active) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }
    if (!admin.twoFactorCode || !admin.twoFactorCodeExpiry) {
      return NextResponse.json({ error: 'No pending verification — please start over' }, { status: 400 });
    }
    if (admin.twoFactorCodeExpiry < new Date()) {
      return NextResponse.json({ error: 'Code expired — please start over' }, { status: 400 });
    }

    if (admin.twoFactorAttempts >= MAX_2FA_ATTEMPTS) {
      await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorCode: null, twoFactorCodeExpiry: null, twoFactorAttempts: 0 } });
      return NextResponse.json({ error: 'Too many incorrect attempts. Please start over.' }, { status: 400 });
    }

    // OWNER TOTP 2FA: once enrolled, the second factor is the authenticator
    // app (or a single-use recovery code). The pending marker written at step
    // 1 proves the password was just verified; the used marker rejects a
    // replayed code inside its step. Same attempt counter and lockout as the
    // email path below, which stays untouched for an un-enrolled owner.
    if (admin.twoFactorSecret) {
      if (!admin.twoFactorCode.startsWith('totp')) {
        return NextResponse.json({ error: 'No pending verification — please start over' }, { status: 400 });
      }
      const raw = String(code).trim();
      let ok = false;
      let data: Record<string, unknown> = {};
      if (looksLikeRecoveryCode(raw)) {
        const idx = await matchRecoveryCode(raw, admin.twoFactorRecoveryCodes);
        if (idx >= 0) {
          ok = true;
          data = { twoFactorRecoveryCodes: admin.twoFactorRecoveryCodes.filter((_, i) => i !== idx), twoFactorCode: null, twoFactorCodeExpiry: null };
        }
      } else {
        const step = totpMatchStep(raw, admin.twoFactorSecret);
        if (step !== null && admin.twoFactorCode !== TOTP_USED_PREFIX + step) {
          ok = true;
          // Keep the used-step marker for two steps so the same code cannot be replayed.
          data = { twoFactorCode: TOTP_USED_PREFIX + step, twoFactorCodeExpiry: new Date(Date.now() + 2 * TOTP_STEP_SECONDS * 1000) };
        }
      }
      if (!ok) {
        const attempts = admin.twoFactorAttempts + 1;
        const clear = attempts >= MAX_2FA_ATTEMPTS;
        await prisma.adminUser.update({
          where: { id: admin.id },
          data: { twoFactorAttempts: clear ? 0 : attempts, ...(clear ? { twoFactorCode: null, twoFactorCodeExpiry: null } : {}) },
        });
        return NextResponse.json({ error: clear ? 'Too many incorrect attempts. Please start over.' : 'Incorrect code' }, { status: 400 });
      }
      await prisma.adminUser.update({ where: { id: admin.id }, data: { ...data, twoFactorAttempts: 0, lastLoginAt: new Date() } });
      const token = await signAdminToken({ adminId: admin.id, email: admin.email, name: admin.name, role: admin.role, mfa: true });
      const cookieStore = await cookies();
      cookieStore.set('admin_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12 });
      return NextResponse.json({ success: true });
    }

    const valid = await bcrypt.compare(String(code).trim(), admin.twoFactorCode);
    if (!valid) {
      const attempts = admin.twoFactorAttempts + 1;
      const clearCode = attempts >= MAX_2FA_ATTEMPTS;
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          twoFactorAttempts: clearCode ? 0 : attempts,
          ...(clearCode ? { twoFactorCode: null, twoFactorCodeExpiry: null } : {}),
        },
      });
      return NextResponse.json({ error: clearCode ? 'Too many incorrect attempts. Please start over.' : 'Incorrect code' }, { status: 400 });
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { twoFactorCode: null, twoFactorCodeExpiry: null, twoFactorAttempts: 0, lastLoginAt: new Date() },
    });

    // mfa: true is set HERE and nowhere else — this is the only code path in
    // the app that has seen a second factor. Owner-only gates assert it.
    const token = await signAdminToken({ adminId: admin.id, email: admin.email, name: admin.name, role: admin.role, mfa: true });
    const cookieStore = await cookies();
    cookieStore.set('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    });

    return NextResponse.json({ success: true });
  }

  // ── Step 1: verify password, send 2FA code ───────────────────────────
  const allowed = await rateLimit(`login:admin:${ip}`, 20, 600);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts from your network, try again in a few minutes.' }, { status: 429 });

  const { email: rawEmail, password } = body;
  if (!rawEmail || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || admin.role !== 'owner') {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (!admin.active) return NextResponse.json({ error: 'Account inactive' }, { status: 403 });
  if (admin.lockoutUntil && admin.lockoutUntil > new Date()) return lockoutResponse(admin.lockoutUntil);

  // Same guard as /api/admin/login:31 — bcrypt.compare throws on a null hash,
  // so an owner row created but never activated would 500 instead of getting
  // the actionable "not activated" message.
  if (!admin.passwordHash)
    return NextResponse.json({ error: 'Account not activated — check your email for a set-password link' }, { status: 401 });

  const valid = await bcrypt.compare(String(password), admin.passwordHash);
  if (!valid) {
    const failedLoginAttempts = admin.failedLoginAttempts + 1;
    const lockoutUntil = failedLoginAttempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await prisma.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts, ...(lockoutUntil ? { lockoutUntil } : {}) } });
    if (lockoutUntil) return lockoutResponse(lockoutUntil);
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await prisma.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts: 0, lockoutUntil: null } });

  if (admin.mustChangePassword) {
    const token = await signAdminSetPasswordToken({ adminId: admin.id, email: admin.email });
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { setPasswordToken: token, setPasswordTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    return NextResponse.json({ mustChangePassword: true, setPasswordToken: token });
  }

  // OWNER TOTP 2FA: enrolled → no email; the app has the code. The pending
  // marker is what the verify step checks for.
  if (admin.twoFactorSecret) {
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { twoFactorCode: TOTP_PENDING, twoFactorCodeExpiry: new Date(Date.now() + 10 * 60 * 1000), twoFactorAttempts: 0 },
    });
    return NextResponse.json({ requires2FA: true, method: 'totp' });
  }

  const code = gen6DigitCode();
  const hashedCode = await bcrypt.hash(code, 10);
  const expiry = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { twoFactorCode: hashedCode, twoFactorCodeExpiry: expiry, twoFactorAttempts: 0 },
  });

  await sendAdminTwoFactorCode({ email: admin.email, name: admin.name, code });

  return NextResponse.json({ requires2FA: true, method: 'email' });
}
