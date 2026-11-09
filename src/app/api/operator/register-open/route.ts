import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { registerOpenFor, openRegister } from '@/lib/register-open';
import { prisma } from '@/lib/prisma';

// POS-7: opening the register — today's starting cash, locked once confirmed. Reading needs shop.sell (the register
// and Home show whether it's open); opening needs shop.open; changing it after needs shop.open_fix, with a reason.
// The course is always the session's.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'shop.sell'); if (denied) return denied; }
  const r = await registerOpenFor(session.courseId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  // Home asks a course that runs a pro shop (Settings) or sells something (an active item).
  const [course, item] = await Promise.all([
    prisma.course.findUnique({ where: { id: session.courseId }, select: { hasProShop: true } }),
    prisma.shopItem.findFirst({ where: { courseId: session.courseId, active: true }, select: { id: true } }),
  ]);
  const hasShop = !!course?.hasProShop || !!item;
  return NextResponse.json({ ...r.value, hasShop, canOpen: can(session, 'shop.open'), canFix: can(session, 'shop.open_fix') }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { action?: unknown; startingCashCents?: unknown; reason?: unknown };
  const mode = body.action === 'fix' ? 'fix' : 'open';
  { const denied = requirePermission(session, mode === 'fix' ? 'shop.open_fix' : 'shop.open'); if (denied) return denied; }
  const r = await openRegister(session.courseId, { startingCashCents: body.startingCashCents, reason: body.reason }, session.email, mode);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.value);
}
