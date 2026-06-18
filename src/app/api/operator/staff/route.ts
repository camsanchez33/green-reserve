import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const staff = await prisma.courseStaff.findMany({
    where: { courseId: session.courseId },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(staff);
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, email, role } = await req.json();
  if (!name || !email) return NextResponse.json({ error: 'Name and email required' }, { status: 400 });

  const existing = await prisma.courseStaff.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });

  const tempPassword = randomBytes(6).toString('hex');
  const hashed = await bcrypt.hash(tempPassword, 12);
  const staff = await prisma.courseStaff.create({
    data: { courseId: session.courseId, email, name, password: hashed, role: role || 'staff' },
  });
  return NextResponse.json({ success: true, id: staff.id, tempPassword });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, active } = await req.json();
  const staff = await prisma.courseStaff.findUnique({ where: { id } });
  if (!staff || staff.courseId !== session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.courseStaff.update({ where: { id }, data: { active } });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  const staff = await prisma.courseStaff.findUnique({ where: { id } });
  if (!staff || staff.courseId !== session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.courseStaff.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
