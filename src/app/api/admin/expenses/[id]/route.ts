import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError } from '@/lib/admin-session';
import { isExpenseCategory, isExpenseCadence } from '@/lib/expenses';

const MAX_CENTS = 2_000_000_000; // the column is a 32-bit INTEGER; anything above is a typo (as the budget route)
import { needReason, reasonOf, auditAdmin, changedFields, bodyWithReason } from '@/lib/admin-audit';

// EXPENSE TRACKER (RUN_QUEUE) — edit/end/delete a single fixed cost. Owner-only.
// Ending an expense (setting endedAt) is the non-destructive way to stop a cost
// counting going forward while keeping its history in prior-period P&Ls; delete
// is for a mistaken entry.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) {
    return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });

  const raw: unknown = await req.json().catch(() => null);
  // A JSON body that isn't an object (null, a number, a list) is a bad request, not a 500.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NextResponse.json({ error: 'Send the expense as a JSON object.' }, { status: 400 });
  const body = raw as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    data.name = name;
  }
  if (body.amountCents !== undefined) {
    const amountCents = Math.round(Number(body.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) return NextResponse.json({ error: 'Amount must be a positive number, at most $20,000,000' }, { status: 400 });
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
    const d = new Date(body.startedAt as string);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
    data.startedAt = d;
  }
  // Ended = an end date that has passed.
  const endedAlready = !!existing.endedAt && existing.endedAt.getTime() <= Date.now();
  if (body.endedAt !== undefined) {
    if (body.endedAt === null || body.endedAt === '') {
      // ADMIN-REDO (Cam via Build 2026-11-12): an ended expense stays ended, so the months it was
      // stopped stay at $0. Starting it again is a new expense from today. An end still in the
      // future is only scheduled: it can be cleared or moved.
      if (endedAlready) return NextResponse.json({ error: 'This expense has ended. To start paying it again, add it as a new expense from today.', code: 'ended' }, { status: 400 });
      data.endedAt = null;
    } else {
      const d = new Date(body.endedAt as string);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid end date' }, { status: 400 });
      // Ended stays ended: the end can be corrected earlier, never moved later (that would bring
      // stopped months back into the costs).
      if (endedAlready && d.getTime() > existing.endedAt!.getTime()) return NextResponse.json({ error: 'This expense has ended. Its end date can only move earlier — to start paying it again, add it as a new expense from today.', code: 'ended' }, { status: 400 });
      data.endedAt = d;
    }
  }

  // Nothing to change (an empty object, or only unknown fields): say so, don't write an empty edit to the audit log.
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const expense = await prisma.expense.update({ where: { id }, data });
  const pick = (e: Record<string, unknown>) => Object.fromEntries(Object.keys(data).map(k => [k, e[k]]));
  await auditAdmin(session, { action: 'expense_edit', targetType: 'expense', targetId: id, ...changedFields(pick(existing), pick(expense)) });
  return NextResponse.json({ expense });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) {
    return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  const body = await bodyWithReason(req);
  const nr = needReason('expense_delete', body); if (nr) return nr;
  await prisma.expense.delete({ where: { id } });
  await auditAdmin(session, { action: 'expense_delete', targetType: 'expense', targetId: id, before: { name: existing.name, amountCents: existing.amountCents, cadence: existing.cadence }, reason: reasonOf(body) });
  return NextResponse.json({ success: true });
}
