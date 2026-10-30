import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { parseGolferKey, golferKey } from '@/lib/golfer-key';
import { golferRecord } from '@/lib/golfer-record';

// The golfer record (Cam 2026-10-29). Everything is this course's only.
//  GET     the record — anyone on the tee sheet; money with money.payments, email and
//          phone with sheet.golfer_contact.
//  POST    { action: 'note', body, bookingId? } — anyone on the tee sheet adds a note.
//          { action: 'delete_note', noteId } — its writer, or the owner.
//          { action: 'block', reason } / { action: 'unblock' } — the owner only.
type Params = { params: Promise<{ key: string }> };

async function gate(params: Params['params']) {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'sheet.view');
  if (denied) return { res: denied };
  // A key carries an email or phone, so links from the sheet open the record by a booking
  // (b:<bookingId>) and the server works out who the golfer is — never shown to a login
  // without sheet.golfer_contact.
  const raw = decodeURIComponent((await params).key);
  let key: string | null = null;
  if (raw.startsWith('b:')) {
    const b = await prisma.booking.findFirst({ where: { id: raw.slice(2), courseId: session.courseId }, select: { golferEmail: true, golferPhone: true, golferAccountId: true } });
    key = b ? golferKey(b) : null;
    if (!key) return { res: NextResponse.json({ error: b ? 'This booking has no email or phone, so there is no record to show.' : 'That booking isn’t on your course.' }, { status: b ? 409 : 404 }) };
  } else key = parseGolferKey(raw);
  if (!key) return { res: NextResponse.json({ error: 'That golfer link isn’t right.' }, { status: 400 }) };
  return { session, key };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const g = await gate(params);
  if ('res' in g) return g.res;
  const r = await golferRecord(g.session.courseId, g.key, { money: can(g.session, 'money.payments'), contact: can(g.session, 'sheet.golfer_contact') });
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const contact = can(g.session, 'sheet.golfer_contact');
  // The key spells out an email or phone: only for logins that may see them.
  const { key: _key, ...rest } = r;
  return NextResponse.json({ ...rest, ...(contact ? { key: r.key } : {}), canBlock: !g.session.isStaff }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const g = await gate(params);
  if ('res' in g) return g.res;
  const { session, key } = g;
  const body = await req.json().catch(() => ({})) as { action?: string; body?: unknown; bookingId?: unknown; noteId?: unknown; reason?: unknown };
  const who = session.email;

  if (body.action === 'note') {
    const text = String(body.body ?? '').trim().slice(0, 1000);
    if (!text) return NextResponse.json({ error: 'Write the note first.' }, { status: 400 });
    let bookingId: string | null = null;
    if (body.bookingId) {
      // A booking note belongs to one of this course's bookings.
      const b = await prisma.booking.findFirst({ where: { id: String(body.bookingId), courseId: session.courseId }, select: { id: true } });
      if (!b) return NextResponse.json({ error: 'That booking isn’t on your course.' }, { status: 404 });
      bookingId = b.id;
    }
    const n = await prisma.golferNote.create({ data: { courseId: session.courseId, golferKey: key, bookingId, body: text, createdBy: who } });
    return NextResponse.json({ note: { id: n.id, body: n.body, bookingId: n.bookingId, createdBy: n.createdBy, createdAt: n.createdAt.toISOString() } });
  }
  if (body.action === 'delete_note') {
    const n = await prisma.golferNote.findFirst({ where: { id: String(body.noteId ?? ''), courseId: session.courseId, golferKey: key } });
    if (!n) return NextResponse.json({ error: 'That note is gone — refresh.' }, { status: 404 });
    if (session.isStaff && n.createdBy !== who) return NextResponse.json({ error: 'Only the person who wrote a note, or the owner, can delete it.' }, { status: 403 });
    await prisma.golferNote.delete({ where: { id: n.id } });
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'block' || body.action === 'unblock') {
    // Cam 2026-10-29: blocking a golfer from booking online is the owner's call.
    if (session.isStaff) return NextResponse.json({ error: 'Only the course owner can stop a golfer booking online.' }, { status: 403 });
    if (body.action === 'unblock') {
      await prisma.golferBlock.deleteMany({ where: { courseId: session.courseId, golferKey: key } });
      return NextResponse.json({ ok: true });
    }
    const reason = String(body.reason ?? '').trim().slice(0, 300);
    if (!reason) return NextResponse.json({ error: 'Add the reason — it’s kept with the block.' }, { status: 400 });
    await prisma.golferBlock.upsert({
      where: { courseId_golferKey: { courseId: session.courseId, golferKey: key } },
      create: { courseId: session.courseId, golferKey: key, reason, blockedBy: who },
      update: { reason, blockedBy: who, blockedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
