import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { accountMembers, accountView, creditAccount } from '@/lib/member-account';

// MEM-ACCT (Cam 2026-10-30): member accounts. GET ?q= is the counter's picker (who can charge to an
// account, with balance and limit) — for anyone who takes counter payments or sees members.
// GET ?membershipId= is one member's account (members.view). POST credits an amount back, with a
// reason (money.refund — it takes money off what the member owes). This course only.
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
  const denied = requirePermission(session, 'money.refund');
  if (denied) return denied;
  const b = await req.json().catch(() => ({})) as { membershipId?: unknown; amountCents?: unknown; reason?: unknown };
  if (typeof b.membershipId !== 'string' || !b.membershipId) return NextResponse.json({ error: 'Pick a member.' }, { status: 400 });
  const r = await creditAccount(session.courseId, b.membershipId, b.amountCents, b.reason, session.email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, balanceCents: r.balanceCents });
}
