import { NextResponse } from 'next/server';
import { resolveAdminSession } from '@/lib/admin-session';
import { effectiveAreas } from '@/lib/admin-areas';

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    adminId: session.adminId,
    email: session.email,
    name: session.name,
    role: session.role,
    // AW-11: the areas this login can open (the owner and never-set logins: all).
    areas: effectiveAreas(session.role, session.areas ?? null),
  });
}
