import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-key');
  if (!secret || secret !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const count = await prisma.adminUser.count();
  if (count > 0)
    return NextResponse.json({ error: 'Admin accounts already exist — use the employees page' }, { status: 409 });

  const { email, name, password } = await req.json();
  if (!email || !name || !password)
    return NextResponse.json({ error: 'email, name, and password required' }, { status: 400 });

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.adminUser.create({
    data: {
      email: String(email).trim().toLowerCase(),
      name: String(name).trim(),
      passwordHash,
      role: 'owner',
      active: true,
    },
  });

  return NextResponse.json({ success: true, adminId: admin.id, email: admin.email });
}
