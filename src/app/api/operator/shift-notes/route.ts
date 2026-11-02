// DASH-D Home (Cam 2026-11-01, "shift handoff note"): a note the closing shift leaves for
// the next one — cart 14 is tagged out, a rangefinder under the counter. Anyone who can
// see the tee sheet reads, writes and clears them (sheet.view, held by every login).
// POST writes one; PATCH { id } marks it done. Notes are never edited or deleted.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { openShiftNotes, SHIFT_NOTE_MAX } from '@/lib/home-board';

async function who(s: { staffId: string | null; operatorId: string | null }) {
  if (s.staffId) return { id: s.staffId, name: (await prisma.courseStaff.findUnique({ where: { id: s.staffId }, select: { name: true } }))?.name ?? '' };
  return { id: s.operatorId ?? '', name: (await prisma.courseOperator.findUnique({ where: { id: s.operatorId ?? '' }, select: { name: true } }))?.name ?? '' };
}

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  return NextResponse.json({ notes: await openShiftNotes(session.courseId) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  const body = await req.json().catch(() => null) as { body?: unknown } | null;
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!text) return NextResponse.json({ error: 'Write the note first.' }, { status: 400 });
  if (text.length > SHIFT_NOTE_MAX) return NextResponse.json({ error: `Keep the note to ${SHIFT_NOTE_MAX} characters — it is ${text.length}.` }, { status: 400 });
  const me = await who(session);
  await prisma.shiftNote.create({ data: { courseId: session.courseId, body: text, authorId: me.id, authorName: me.name } });
  return NextResponse.json({ notes: await openShiftNotes(session.courseId) });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  const body = await req.json().catch(() => null) as { id?: unknown } | null;
  if (typeof body?.id !== 'string') return NextResponse.json({ error: 'Which note?' }, { status: 400 });
  const me = await who(session);
  // Scoped to the session's course: another course's note id changes nothing.
  const r = await prisma.shiftNote.updateMany({ where: { id: body.id, courseId: session.courseId, doneAt: null }, data: { doneAt: new Date(), doneBy: me.name || me.id } });
  if (r.count === 0) return NextResponse.json({ error: 'That note was already cleared — refresh to see the latest.' }, { status: 409 });
  return NextResponse.json({ notes: await openShiftNotes(session.courseId) });
}
