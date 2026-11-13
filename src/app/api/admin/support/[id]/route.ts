import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, areaGate } from '@/lib/admin-session';
import { openAdminChat } from '@/lib/support-chats';

// SUPPORT: one course chat for GreenReserve. Support+ in Messages. Opening it marks the course's messages read.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const noArea = areaGate(session, 'messages'); if (noArea) return noArea;
  const { id } = await params;
  const chat = await openAdminChat(id);
  if (!chat) return NextResponse.json({ error: 'That conversation no longer exists — refresh the list.' }, { status: 404 });
  return NextResponse.json(chat);
}
