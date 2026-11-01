import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { accountMembers, accountView, creditAccount, moveCharge } from '@/lib/member-account';
import { markStatementPaidOffline, emailStatement } from '@/lib/member-statements';

// MEM-ACCT (Cam 2026-10-30): member accounts. GET ?q= is the counter's picker (who can charge to an
// account, with balance and limit) — for anyone who takes counter payments or sees members.
// GET ?membershipId= is one member's account (members.view). POST credits an amount back, with a
// reason (money.refund — it takes money off what the member owes). Part 2: action 'mark_paid'
// (a statement paid at the shop, cash or check) and 'email_statement', both members.edit like
// dues paid at the shop. This course only.
// Cam 2026-10-31: action 'move_charge' moves a round or shop sale put on the wrong member's account
// to the right one (by chargeId, or the round's bookingId) — sheet.counter_payment, the power that put it on.
export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const membershipId = req.nextUrl.searchParams.get('membershipId');
  if (membershipId) {
    const denied = requirePermission(session, 'members.view');
    if (denied) return denied;
    const v = await accountView(session.courseId, membershipId);
    if (!v) return NextResponse.json({ error: 'That member isn’t on this course.' }, { status: 404 });
    return NextResponse.json(v, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (!can(session, 'sheet.counter_payment') && !can(session, 'members.view')) {
    const denied = requirePermission(session, 'sheet.counter_payment');
    if (denied) return denied;
  }
  const members = await accountMembers(session.courseId, req.nextUrl.searchParams.get('q') ?? '');
  return NextResponse.json({ members }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { membershipId?: unknown; amountCents?: unknown; reason?: unknown; action?: unknown; statementId?: unknown; method?: unknown; chargeId?: unknown; bookingId?: unknown; toMembershipId?: unknown };
  if (b.action === 'move_charge') {
    const d = requirePermission(session, 'sheet.counter_payment');
    if (d) return d;
    const byBooking = typeof b.bookingId === 'string' && b.bookingId ? await prisma.memberCharge.findFirst({ where: { bookingId: b.bookingId, courseId: session.courseId }, select: { id: true } }) : null;
    if (typeof b.bookingId === 'string' && b.bookingId && !byBooking) return NextResponse.json({ error: 'That round isn’t on an account.' }, { status: 404 });
    const r = await moveCharge(session.courseId, byBooking?.id ?? b.chargeId, b.toMembershipId, session.email);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, balanceCents: r.balanceCents });
  }
  if (b.action === 'mark_paid' || b.action === 'email_statement') {
    const d = requirePermission(session, 'members.edit');
    if (d) return d;
    if (typeof b.statementId !== 'string' || !b.statementId) return NextResponse.json({ error: 'Pick a statement.' }, { status: 400 });
    const own = await prisma.memberStatement.findFirst({ where: { id: b.statementId, courseId: session.courseId }, select: { id: true } });
    if (!own) return NextResponse.json({ error: 'That statement isn’t on this course.' }, { status: 404 });
    if (b.action === 'mark_paid') {
      const r = await markStatementPaidOffline(session.courseId, own.id, b.method);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ ok: true });
    }
    try {
      const r = await emailStatement(own.id);
      if (r === 'no_email') return NextResponse.json({ error: 'This member has no email — add one in Edit details.' }, { status: 409 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: `The email couldn’t be sent (${err instanceof Error ? err.message : 'email error'}) — try again.` }, { status: 502 });
    }
  }
  const denied = requirePermission(session, 'money.refund');
  if (denied) return denied;
  if (typeof b.membershipId !== 'string' || !b.membershipId) return NextResponse.json({ error: 'Pick a member.' }, { status: 400 });
  const r = await creditAccount(session.courseId, b.membershipId, b.amountCents, b.reason, session.email, b.chargeId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, balanceCents: r.balanceCents });
}
