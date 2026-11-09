import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { daySummary, closeDay, recentCloses, drawerBase } from '@/lib/register-close';
import { registerOpenFor } from '@/lib/register-open';

// POS-3 R4: the end-of-day close-out. Seeing the day's money and counting the
// drawer is "Close out the register" (shop.close). The course is always the session's.

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'shop.close');
  if (denied) return { res: denied };
  return { session };
}

export async function GET(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const day = new URL(req.url).searchParams.get('day') ?? undefined;
  const s = await daySummary(g.session.courseId, day || undefined);
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: s.status });
  // POS-7: the day's locked starting cash, when the register was opened.
  const opened = await registerOpenFor(g.session.courseId, s.value.day);
  // DRAWER-1: the drawer this close-out counts against (a reopened session counts only what came in since).
  const base = await drawerBase(g.session.courseId, s.value.day);
  return NextResponse.json({ summary: s.value, recent: await recentCloses(g.session.courseId), opened: opened.ok ? opened.value.current : null, status: opened.ok ? opened.value.status : null, base });
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const r = await closeDay(g.session.courseId, { day: body.day, openingFloatCents: body.openingFloatCents, countedCashCents: body.countedCashCents, leaveInCents: body.leaveInCents, note: body.note }, g.session.email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ close: r.value });
}
