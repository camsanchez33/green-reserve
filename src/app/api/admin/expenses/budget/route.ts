import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError, stepUpRequired } from '@/lib/admin-session';
import { auditAdmin } from '@/lib/admin-audit';

// ADMIN-REDO Expenses (Cam 2026-11-12): the one standing monthly expense budget. OWNER only
// (the company's private books, like every expense route), with a fresh second factor
// (step-up), and audited. Body { cents: number | null } — null clears it.
const MAX_CENTS = 2_000_000_000; // $20M a month: anything above is a typo (the column is a 32-bit INTEGER)

export async function PUT(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const stepUp = stepUpRequired(session);
  if (stepUp) return stepUp;

  const body = await req.json().catch(() => null) as { cents?: unknown } | null;
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('cents' in body)) return NextResponse.json({ error: 'Send { cents } — a whole number of cents, or null to clear it.' }, { status: 400 });
  const raw = body.cents;
  let cents: number | null;
  if (raw === null) cents = null;
  else if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0 && raw <= MAX_CENTS) cents = raw;
  else return NextResponse.json({ error: 'The budget must be a whole number of cents above zero, or null to clear it.' }, { status: 400 });

  const before = await prisma.expenseBudget.findUnique({ where: { id: 'monthly' } });
  const budget = await prisma.expenseBudget.upsert({
    where: { id: 'monthly' },
    create: { id: 'monthly', cents, setAt: new Date(), setBy: session.name || '' },
    update: { cents, setAt: new Date(), setBy: session.name || '' },
  });
  await auditAdmin(session, { action: 'expense_budget', targetType: 'expense_budget', targetId: 'monthly', before: { cents: before?.cents ?? null }, after: { cents } });
  // Same shape as GET: no budget means no date.
  return NextResponse.json({ budget: { cents: budget.cents, setAt: budget.cents != null ? budget.setAt.toISOString() : null } });
}
