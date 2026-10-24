import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { startRoundOnReader, roundReaderStatus, cancelRoundOnReader } from '@/lib/reader-rounds';
import { simulateReaderTap } from '@/lib/card-reader';

// POS-3 R3b: a group's round paid on the course's card reader (lib/reader-rounds).
// Taking a card for a round is "Check groups in" (sheet.checkin), as at the tee
// sheet; starting a card payment needs a current agreement, as a pay link does.
// The course is always the session's.

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'sheet.checkin');
  if (denied) return { res: denied };
  return { session, actor: { type: 'staff' as const, id: session.staffId ?? session.operatorId } };
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const agreementBlock = await requireAgreementCurrent(g.session.courseId); // AG-3 §3: card payments
  if (agreementBlock) return agreementBlock;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : '';
  const readerId = typeof body.readerId === 'string' ? body.readerId : '';
  if (!bookingId || !readerId) return NextResponse.json({ error: 'Pick a group and a card reader.' }, { status: 400 });
  const r = await startRoundOnReader(g.session.courseId, bookingId, readerId, g.actor);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.value);
}

export async function PATCH(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : '';
  if (!bookingId) return NextResponse.json({ error: 'Missing group.' }, { status: 400 });
  if (body.action === 'simulate') {
    const r = await simulateReaderTap(g.session.courseId, typeof body.readerId === 'string' ? body.readerId : '', body.card === 'declined' ? 'declined' : 'ok');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ tapped: true });
  }
  if (body.action !== 'status' && body.action !== 'cancel') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const r = body.action === 'status' ? await roundReaderStatus(g.session.courseId, bookingId, g.actor) : await cancelRoundOnReader(g.session.courseId, bookingId, g.actor);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.value);
}
