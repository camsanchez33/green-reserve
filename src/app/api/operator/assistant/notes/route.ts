import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { readNote } from '@/lib/assistant/settings';
import { actorFor, addNote } from '@/lib/assistant/save';

// ASSIST-1: add a note for the course's assistant. Course-written text: the assistant reads it as data.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'settings.edit'); if (denied) return denied;
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock;
  const input = readNote(await req.json().catch(() => null));
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const out = await addNote(session.courseId, input.data, await actorFor(session));
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 409 });
  return NextResponse.json({ note: out.note }, { status: 201 });
}
