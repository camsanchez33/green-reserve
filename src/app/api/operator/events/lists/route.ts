import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { courseLists, addOwnItem, editOwnItem, removeOwnItem } from '@/lib/event-lists';

// Events lists (Cam 2026-11-17): the pick lists in event setup — what's
// included, checklist steps, common sign-up questions, kinds of event. GET
// returns the built-in items and the course's own; POST adds one of its own,
// PATCH changes one, DELETE removes one. Built-in items are never changed.
// Needs "Run events"; writes also need the current agreement (AG-3 §3).

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'events.manage');
  if (denied) return { res: denied };
  return { session };
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  const g = await gate();
  if ('res' in g) return g.res;
  return NextResponse.json(await courseLists(g.session.courseId));
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const courseId = g.session.courseId;
  const agreementBlock = await requireAgreementCurrent(courseId); if (agreementBlock) return agreementBlock;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const r = await addOwnItem(courseId, body);
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ item: r.value, ...(await courseLists(courseId)) });
}

export async function PATCH(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const courseId = g.session.courseId;
  const agreementBlock = await requireAgreementCurrent(courseId); if (agreementBlock) return agreementBlock;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const r = await editOwnItem(courseId, String(body.id ?? ''), body);
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ item: r.value, ...(await courseLists(courseId)) });
}

export async function DELETE(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const courseId = g.session.courseId;
  const agreementBlock = await requireAgreementCurrent(courseId); if (agreementBlock) return agreementBlock;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const r = await removeOwnItem(courseId, id);
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json(await courseLists(courseId));
}
