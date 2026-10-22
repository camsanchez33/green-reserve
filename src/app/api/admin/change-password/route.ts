import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';
import bcrypt from 'bcryptjs';
import { withAudit } from '@/lib/admin-audit';

async function changePassword(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword)
    return NextResponse.json({ error: 'currentPassword and newPassword required' }, { status: 400 });
  if (String(newPassword).length < 8)
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });

  const admin = await prisma.adminUser.findUnique({ where: { id: session.adminId } });
  if (!admin) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const valid = await bcrypt.compare(String(currentPassword), admin.passwordHash);
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });

  const passwordHash = await bcrypt.hash(String(newPassword), 12);
  await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash } });

  return NextResponse.json({ success: true });
}

// BRAIN-1a: recorded (the password itself never is).
export const POST = withAudit(changePassword, () => ({ action: 'password_change', targetType: 'admin', targetId: 'self', after: {} }));
