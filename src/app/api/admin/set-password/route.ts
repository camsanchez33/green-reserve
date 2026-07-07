import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSetPasswordToken } from '@/lib/admin-session';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password)
    return NextResponse.json({ error: 'token and password required' }, { status: 400 });
  if (String(password).length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const payload = await verifyAdminSetPasswordToken(token);
  if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });

  const admin = await prisma.adminUser.findUnique({ where: { id: payload.adminId } });
  if (!admin) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Single-use: token stored in DB must match
  if (admin.setPasswordToken !== token)
    return NextResponse.json({ error: 'Token already used or invalid' }, { status: 400 });

  const now = new Date();
  if (admin.setPasswordTokenExpiry && admin.setPasswordTokenExpiry < now)
    return NextResponse.json({ error: 'Token expired' }, { status: 400 });

  const passwordHash = await bcrypt.hash(String(password), 12);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      setPasswordToken: null,
      setPasswordTokenExpiry: null,
      mustChangePassword: false,
      active: true,
    },
  });

  return NextResponse.json({ success: true });
}
