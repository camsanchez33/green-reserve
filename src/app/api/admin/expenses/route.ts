import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError } from '@/lib/admin-session';
import { isExpenseCategory, isExpenseCadence } from '@/lib/expenses';
import { auditAdmin } from '@/lib/admin-audit';

const MAX_CENTS = 2_000_000_000; // the column is a 32-bit INTEGER; anything above is a typo (as the budget route)

// EXPENSE TRACKER (RUN_QUEUE) — GreenReserve's own fixed operating costs.
// OWNER-only end to end: these are the company's private books, not per-course
// data any manager/support needs. All routes 403 non-owners before any read.
export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) {
    return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  }
  const [expenses, budget] = await Promise.all([
    prisma.expense.findMany({ orderBy: [{ endedAt: 'asc' }, { startedAt: 'desc' }] }),
    prisma.expenseBudget.findUnique({ where: { id: 'monthly' } }),
  ]);
  // ADMIN-REDO: the standing monthly budget; null cents = none set.
  return NextResponse.json({ expenses, budget: { cents: budget?.cents ?? null, setAt: budget?.cents != null ? budget.setAt.toISOString() : null } });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) {
    return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  }

  const raw: unknown = await req.json().catch(() => null);
  // A JSON body that isn't an object (null, a number, a list) is a bad request, not a 500.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NextResponse.json({ error: 'Send the expense as a JSON object.' }, { status: 400 });
  const body = raw as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const amountCents = Math.round(Number(body.amountCents));
  const category = body.category ?? 'other';
  const cadence = body.cadence ?? 'monthly';

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) return NextResponse.json({ error: 'Amount must be a positive number, at most $20,000,000' }, { status: 400 });
  if (!isExpenseCategory(category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  if (!isExpenseCadence(cadence)) return NextResponse.json({ error: 'Invalid cadence' }, { status: 400 });

  const startedAt = body.startedAt ? new Date(body.startedAt as string) : new Date();
  if (isNaN(startedAt.getTime())) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });

  const expense = await prisma.expense.create({
    data: { name, amountCents, category, cadence, startedAt },
  });
  await auditAdmin(session, { action: 'expense_add', targetType: 'expense', targetId: expense.id, after: { name, amountCents, category, cadence } });
  return NextResponse.json({ expense });
}
