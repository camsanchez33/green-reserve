import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { openCourseChat, addCourseMessage, courseSender, messageText, ANNOUNCEMENTS_CHAT_ID } from '@/lib/support-chats';

// SUPPORT: one of the course's chats. messages.use, and only this course's chats (404 otherwise).
//   GET   → { chat, messages } — opening it marks our replies in it read (announcements: seen by this owner)
//   POST  { body } → { message } — the course writes in the chat ('greenreserve' can't be replied to)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'messages.use'); if (denied) return denied;
  const { id } = await params;
  const out = await openCourseChat(session.courseId, id, session.operatorId);
  if (!out) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  return NextResponse.json(out);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'messages.use'); if (denied) return denied;
  const { id } = await params;
  if (id === ANNOUNCEMENTS_CHAT_ID) return NextResponse.json({ error: 'Announcements can’t be replied to — start a new message instead.' }, { status: 400 });
  const raw: unknown = await req.json().catch(() => null);
  const t = messageText(raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).body : undefined);
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 });
  const message = await addCourseMessage(session.courseId, id, await courseSender(session), t.text);
  if (!message) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  return NextResponse.json({ message });
}
