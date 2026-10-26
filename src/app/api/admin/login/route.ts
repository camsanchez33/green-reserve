import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAdminToken, signAdminSetPasswordToken } from '@/lib/admin-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';
import { securityEvent } from '@/lib/security-events';

// SEC-3: same cost (12) as a real admin password — an unknown email takes as long
// as a known one, so the timing doesn't say whose email has an account.
const DUMMY_HASH = '$2a$12$x9I/Ln7XwBr4.techzuhLufMEVbOz1lhUde8CTW8YVHD9pGubcv7u';

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
  if (!admin || !admin.active) {
    await bcrypt.compare(String(password), DUMMY_HASH);
    await securityEvent(req, { kind: 'signin_failed', surface: 'admin', email, accountId: admin?.id, detail: admin ? 'account turned off' : 'unknown account' });
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (admin.lockoutUntil && admin.lockoutUntil > new Date()) {
    await securityEvent(req, { kind: 'signin_failed', surface: 'admin', email, accountId: admin.id, detail: 'while locked out' });
    return lockoutResponse(admin.lockoutUntil);
  }

  if (!admin.passwordHash)
    return NextResponse.json({ error: 'Account not activated — check your email for a set-password link' }, { status: 401 });

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    const failedLoginAttempts = admin.failedLoginAttempts + 1;
    const lockoutUntil = failedLoginAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await prisma.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts, ...(lockoutUntil ? { lockoutUntil } : {}) } });
    await securityEvent(req, { kind: lockoutUntil ? 'locked_out' : 'signin_failed', surface: 'admin', email, accountId: admin.id, detail: 'wrong password' });
    if (lockoutUntil) return lockoutResponse(lockoutUntil);
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // ── Owner accounts do not sign in here ───────────────────────────────
  // This door has no second factor, so an owner reaching it would receive a
  // session indistinguishable from a 2FA-backed one. Reject AFTER the password
  // check, never before: rejecting on email alone would turn this endpoint
  // into an owner-account oracle. A wrong password still returns the generic
  // 401 above, so the 403 only ever reaches someone who already holds the
  // owner's password. Clear the failure counter first — the password was
  // correct — but do not stamp lastLoginAt, since no login happened.
  // AW-1 (Cam 2026-10-20): /admin is the employees' door and never mentions an
  // owner — the owner's password here reads exactly like a wrong one.
  if (admin.role === 'owner') {
    await securityEvent(req, { kind: 'signin_failed', surface: 'admin', email, accountId: admin.id, detail: 'owner password at the employee door' });
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
