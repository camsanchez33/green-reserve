import { NextRequest, NextResponse, after } from 'next/server';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, areaGate } from '@/lib/admin-session';
import { auditAdmin } from '@/lib/admin-audit';
import { adminReply, messageText } from '@/lib/support-chats';

// SUPPORT: GreenReserve replies in a course chat. Support+ in Messages, audited (support_reply). The course gets
// the reply email as before (at most once an hour per course), sent after the response.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const noArea = areaGate(session, 'messages'); if (noArea) return noArea;
  const { id } = await params;
  const raw: unknown = await req.json().catch(() => null);
  const t = messageText(raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).text : undefined);
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 });
  const r = await adminReply(id, { adminId: session.adminId, name: session.name }, t.text);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await auditAdmin(session, { action: 'support_reply', targetType: 'course', targetId: r.courseId, after: { chatId: id, messageId: r.message.id } });
  if (r.email) after(r.email);
  return NextResponse.json({ message: r.message });
}
