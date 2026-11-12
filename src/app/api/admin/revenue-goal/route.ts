import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError, stepUpRequired } from '@/lib/admin-session';
import { auditAdmin } from '@/lib/admin-audit';
import { goalMonthOk } from '@/lib/revenue-period';

// ADMIN-REDO Revenue goal (Cam via Build 2026-11-12): the owner's revenue target for a platform
// month. OWNER only, with a fresh second factor (step-up), audited. A month that has ended can't be
// changed. Body { month: 'YYYY-MM', cents: number | null } — null clears it.
const MAX_CENTS = 2_000_000_000; // the column is a 32-bit INTEGER; $20M a month is a typo past it

export async function PUT(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const stepUp = stepUpRequired(session);
  if (stepUp) return stepUp;

  const body = await req.json().catch(() => null) as { month?: unknown; cents?: unknown } | null;
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.month !== 'string' || !('cents' in body)) {
    return NextResponse.json({ error: "Send { month: 'YYYY-MM', cents } — cents a whole number, or null to clear it." }, { status: 400 });
  }
  const month = body.month;
  const ok = goalMonthOk(month, new Date());
  if (ok === 'bad') return NextResponse.json({ error: "The month must look like '2026-11'." }, { status: 400 });
  if (ok === 'past') return NextResponse.json({ error: 'That month has ended — its goal can’t be changed.', code: 'past' }, { status: 400 });
  const raw = body.cents;
  let cents: number | null;
  if (raw === null) cents = null;
  else if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0 && raw <= MAX_CENTS) cents = raw;
  else return NextResponse.json({ error: 'The goal must be a whole number of cents above zero, or null to clear it.' }, { status: 400 });

  const before = await prisma.adminMonthGoal.findUnique({ where: { month }, select: { cents: true } });
  const goal = await prisma.adminMonthGoal.upsert({
    where: { month },
    create: { month, cents, setById: session.adminId },
    update: { cents, setById: session.adminId },
  });
  await auditAdmin(session, { action: 'revenue_goal', targetType: 'revenue_goal', targetId: month, before: { cents: before?.cents ?? null }, after: { cents } });
  return NextResponse.json({ month: goal.month, targetCents: goal.cents });
}
