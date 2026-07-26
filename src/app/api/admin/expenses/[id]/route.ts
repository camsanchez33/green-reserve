import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, OWNER_ONLY } from '@/lib/admin-session';
import { isExpenseCategory, isExpenseCadence } from '@/lib/expenses';

// EXPENSE TRACKER (RUN_QUEUE) — edit/end/delete a single fixed cost. Owner-only.
// Ending an expense (setting endedAt) is the non-destructive way to stop a cost
// counting going forward while keeping its history in prior-period P&Ls; delete
// is for a mistaken entry.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, OWNER_ONLY)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    data.name = name;
  }
  if (body.amountCents !== undefined) {
    const amountCents = Math.round(Number(body.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0) return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    data.amountCents = amountCents;
  }
  if (body.category !== undefined) {
    if (!isExpenseCategory(body.category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    data.category = body.category;
  }
  if (body.cadence !== undefined) {
    if (!isExpenseCadence(body.cadence)) return NextResponse.json({ error: 'Invalid cadence' }, { status: 400 });
    data.cadence = body.cadence;
  }
  if (body.startedAt !== undefined) {
    const d = new Date(body.startedAt);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
    data.startedAt = d;
  }
  if (body.endedAt !== undefined) {
    if (body.endedAt === null || body.endedAt === '') {
      data.endedAt = null;
    } else {
      const d = new Date(body.endedAt);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid end date' }, { status: 400 });
      data.endedAt = d;
    }
  }

  const expense = await prisma.expense.update({ where: { id }, data });
  return NextResponse.json({ expense });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, OWNER_ONLY)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  await prisma.expense.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
