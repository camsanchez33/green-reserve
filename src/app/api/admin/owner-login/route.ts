import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAdminToken, signAdminSetPasswordToken } from '@/lib/admin-session';
import { sendAdminTwoFactorCode } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { cookies } from 'next/headers';

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

    const token = await signAdminToken({ adminId: admin.id, email: admin.email, name: admin.name, role: admin.role });
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

  const code = gen6DigitCode();
  const hashedCode = await bcrypt.hash(code, 10);
  const expiry = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { twoFactorCode: hashedCode, twoFactorCodeExpiry: expiry, twoFactorAttempts: 0 },
  });

  await sendAdminTwoFactorCode({ email: admin.email, name: admin.name, code });

  return NextResponse.json({ requires2FA: true });
}
