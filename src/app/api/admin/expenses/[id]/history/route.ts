import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError } from '@/lib/admin-session';
import { expenseHistory } from '@/lib/expense-history';

// ADMIN-REDO Expenses (Cam 2026-11-12): what happened to one expense, newest first, read
// from the audit log (expense_add / expense_edit). OWNER only, like every expense route.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const { id } = await params;
  const rows = await prisma.adminAuditLog.findMany({
    where: { targetType: 'expense', targetId: id, action: { in: ['expense_add', 'expense_edit'] } },
    select: { action: true, actorName: true, before: true, after: true, createdAt: true },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
  return NextResponse.json({ history: expenseHistory(rows) });
}
