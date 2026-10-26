import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAdminToken, signAdminSetPasswordToken } from '@/lib/admin-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';
import { securityEvent } from '@/lib/security-events';
import { failUnknownLogin, unknownLoginLockedUntil } from '@/lib/login-guard';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function lockoutResponse(lockoutUntil: Date) {
  const minutes = Math.ceil((lockoutUntil.getTime() - Date.now()) / 60000);
  return NextResponse.json({ error: `Too many attempts, try again in ${minutes} minute${minutes === 1 ? '' : 's'}` }, { status: 429 });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const allowed = await rateLimit(`login:admin:${ip}`, 20, 600);
  if (!allowed) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'admin', detail: 'sign-in' });
    return NextResponse.json({ error: 'Too many attempts from your network, try again in a few minutes.' }, { status: 429 });
  }

  const { email: rawEmail, password } = await req.json();
  if (!rawEmail || !password)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  // SEC-3 audit: no usable employee account here — none, turned off, never
  // activated, or the owner's (who signs in at /cam only, AW-1) — answers and
  // locks exactly like a real one (lib/login-guard), so nothing here says
  // whether the email exists. The owner's own lockout is never touched from
  // this door, so nobody can lock the owner out of /cam by guessing here.
  if (!admin || !admin.active || !admin.passwordHash || admin.role === 'owner') {
    const detail = !admin ? 'unknown account' : !admin.active ? 'account turned off' : admin.role === 'owner' ? 'owner account at the employee door' : 'account never activated';
    const locked = await unknownLoginLockedUntil('admin', email);
    if (locked) {
      await securityEvent(req, { kind: 'signin_failed', surface: 'admin', email, accountId: admin?.id, detail: `${detail}, while locked out` });
      return lockoutResponse(locked);
    }
    const lock = await failUnknownLogin('admin', email, password);
    await securityEvent(req, { kind: lock ? 'locked_out' : 'signin_failed', surface: 'admin', email, accountId: admin?.id, detail });
    if (lock) return lockoutResponse(lock);
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (admin.lockoutUntil && admin.lockoutUntil > new Date()) {
    await securityEvent(req, { kind: 'signin_failed', surface: 'admin', email, accountId: admin.id, detail: 'while locked out' });
    return lockoutResponse(admin.lockoutUntil);
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    const failedLoginAttempts = admin.failedLoginAttempts + 1;
    const lockoutUntil = failedLoginAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await prisma.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts, ...(lockoutUntil ? { lockoutUntil } : {}) } });
    await securityEvent(req, { kind: lockoutUntil ? 'locked_out' : 'signin_failed', surface: 'admin', email, accountId: admin.id, detail: 'wrong password' });
    if (lockoutUntil) return lockoutResponse(lockoutUntil);
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  await prisma.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts: 0, lockoutUntil: null, lastLoginAt: new Date() } });
  await securityEvent(req, { kind: 'signin_ok', surface: 'admin', email, accountId: admin.id });

  if (admin.mustChangePassword) {
    const token = await signAdminSetPasswordToken({ adminId: admin.id, email: admin.email });
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        setPasswordToken: token,
        setPasswordTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return NextResponse.json({ mustChangePassword: true, setPasswordToken: token });
  }

  const token = await signAdminToken({
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });

  const res = NextResponse.json({ success: true, role: admin.role, name: admin.name });
  res.cookies.set('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 12,
    path: '/',
  });
  return res;
}
