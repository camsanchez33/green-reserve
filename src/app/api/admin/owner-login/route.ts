import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAdminToken, signAdminSetPasswordToken } from '@/lib/admin-session';
import { sendAdminTwoFactorCode } from '@/lib/email';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { cookies } from 'next/headers';

function gen6DigitCode(): string {
  return String(randomInt(100000, 999999));
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // ── Step 2: verify 2FA code ──────────────────────────────────────────
  if (body.step === 'verify') {
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
    if (admin.twoFactorCode !== String(code).trim()) {
      return NextResponse.json({ error: 'Incorrect code' }, { status: 400 });
    }

    // Clear 2FA code, update lastLoginAt
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { twoFactorCode: null, twoFactorCodeExpiry: null, lastLoginAt: new Date() },
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
  const { email: rawEmail, password } = body;
  if (!rawEmail || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || admin.role !== 'owner') {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (!admin.active) return NextResponse.json({ error: 'Account inactive' }, { status: 403 });

  const valid = await bcrypt.compare(String(password), admin.passwordHash);
  if (!valid) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

  // mustChangePassword gate — redirect to set-password first
  if (admin.mustChangePassword) {
    const token = await signAdminSetPasswordToken({ adminId: admin.id, email: admin.email });
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { setPasswordToken: token, setPasswordTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    return NextResponse.json({ mustChangePassword: true, setPasswordToken: token });
  }

  const code = gen6DigitCode();
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { twoFactorCode: code, twoFactorCodeExpiry: expiry },
  });

  await sendAdminTwoFactorCode({ email: admin.email, name: admin.name, code });

  return NextResponse.json({ requires2FA: true });
}
