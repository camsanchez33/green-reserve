import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError } from '@/lib/admin-session';
import { isExpenseCategory, isExpenseCadence } from '@/lib/expenses';

// EXPENSE TRACKER (RUN_QUEUE) — GreenReserve's own fixed operating costs.
// OWNER-only end to end: these are the company's private books, not per-course
// data any manager/support needs. All routes 403 non-owners before any read.
export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) {
    return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  }
  const expenses = await prisma.expense.findMany({ orderBy: [{ endedAt: 'asc' }, { startedAt: 'desc' }] });
  return NextResponse.json({ expenses });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) {
    return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const amountCents = Math.round(Number(body.amountCents));
  const category = body.category ?? 'other';
  const cadence = body.cadence ?? 'monthly';

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!Number.isFinite(amountCents) || amountCents <= 0) return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
  if (!isExpenseCategory(category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  if (!isExpenseCadence(cadence)) return NextResponse.json({ error: 'Invalid cadence' }, { status: 400 });

  const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();
  if (isNaN(startedAt.getTime())) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });

  const expense = await prisma.expense.create({
    data: { name, amountCents, category, cadence, startedAt },
  });
  return NextResponse.json({ expense });
}
