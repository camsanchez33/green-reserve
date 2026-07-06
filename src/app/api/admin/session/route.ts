import { NextResponse } from 'next/server';
import { resolveAdminSession } from '@/lib/admin-session';

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    adminId: session.adminId,
    email: session.email,
    name: session.name,
    role: session.role,
  });
}
