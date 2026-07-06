import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, signAdminSetPasswordToken } from '@/lib/admin-session';
import { sendAdminSetPasswordEmail } from '@/lib/email';

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
      setPasswordToken: true,
    },
  });

  return NextResponse.json(admins.map(a => ({
    ...a,
    passwordSet: !!a.setPasswordToken === false,
  })));
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email: rawEmail, name, role } = await req.json();
  if (!rawEmail || !name) return NextResponse.json({ error: 'email and name required' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: 'Email already exists' }, { status: 409 });

  const admin = await prisma.adminUser.create({
    data: {
      email,
      name: String(name).trim(),
      passwordHash: '',
      role: role === 'owner' ? 'owner' : 'staff',
      active: true,
    },
  });

  const token = await signAdminSetPasswordToken({ adminId: admin.id, email: admin.email });
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      setPasswordToken: token,
      setPasswordTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const link = `${baseUrl}/admin/set-password?token=${token}`;
  await sendAdminSetPasswordEmail({ name: admin.name, email: admin.email, setPasswordLink: link });

  return NextResponse.json({ success: true, adminId: admin.id });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id, role, active } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (id === session.adminId) return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (role !== undefined) data.role = role === 'owner' ? 'owner' : 'staff';
  if (active !== undefined) data.active = Boolean(active);

  const updated = await prisma.adminUser.update({ where: { id }, data });
  return NextResponse.json({ success: true, id: updated.id, role: updated.role, active: updated.active });
}
