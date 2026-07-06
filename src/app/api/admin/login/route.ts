import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAdminToken } from '@/lib/admin-session';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const { email: rawEmail, password } = await req.json();
  if (!rawEmail || !password)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !admin.active)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  // passwordHash is empty string until the user completes set-password
  if (!admin.passwordHash)
    return NextResponse.json({ error: 'Account not activated — check your email for a set-password link' }, { status: 401 });

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

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
