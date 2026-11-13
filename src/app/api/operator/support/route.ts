import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { courseChats, startCourseChat, courseSender, messageText } from '@/lib/support-chats';

// SUPPORT (Cam 2026-11-12, ADMIN_REDO_SPEC "Course dashboard Support"): the course's chats with GreenReserve.
// Same gate as /api/operator/messages (messages.use). lib/support-chats has the rules.
//   GET   → { chats }, newest activity first (the announcements chat from GreenReserve among them)
//   POST  { body } → { chat } — a new chat; its subject is the first line of the message
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'messages.use'); if (denied) return denied;
  return NextResponse.json({ chats: await courseChats(session.courseId, session.operatorId) });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'messages.use'); if (denied) return denied;
  const raw: unknown = await req.json().catch(() => null);
  const t = messageText(raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).body : undefined);
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 });
  const chat = await startCourseChat(session.courseId, await courseSender(session), t.text);
  if (!chat) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  return NextResponse.json({ chat });
}
