import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, areaGate } from '@/lib/admin-session';
import { adminThreads } from '@/lib/support-chats';

// SUPPORT (Cam 2026-11-12, ADMIN_REDO_SPEC "Admin Course support"): every course's chats, newest activity first.
// Support+ in the Messages area, like /api/admin/messages. ?q= matches course name, subject or any message.
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const noArea = areaGate(session, 'messages'); if (noArea) return noArea;
  return NextResponse.json({ threads: await adminThreads(req.nextUrl.searchParams.get('q') ?? '') });
}
