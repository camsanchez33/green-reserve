import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, MANAGER_PLUS, areaGate } from '@/lib/admin-session';
import { auditAdmin } from '@/lib/admin-audit';
import { listProblems, SNOOZE_DAYS } from '@/lib/problems';

// BRAIN-2a: the Problems page. GET: open, snoozed, cleared (support+ — they
// name golfers and money). PATCH { id, action }:
//   claim                       support+  you take it
//   assign { adminId | null }   manager+  give it to someone (or no one)
//   note { text }               support+  what was done
//   snooze { days, reason }     manager+  hide it for 1/3/7/14 days, saying why
//   unsnooze                    manager+
// Every action is in the problem's history and the audit record. Nothing here
// clears a problem: only the hourly check does, when it stops seeing it.

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const noArea = areaGate(session, 'problems');
  if (noArea) return noArea;
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Problems are for support and above.' }, { status: 403 });
  const [problems, admins] = await Promise.all([
    listProblems(),
    prisma.adminUser.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return NextResponse.json({ ...problems, admins, canManage: requireRole(session, MANAGER_PLUS), me: session.adminId, snoozeDays: SNOOZE_DAYS });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const noArea = areaGate(session, 'problems');
  if (noArea) return noArea;
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Problems are for support and above.' }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { id?: unknown; action?: unknown; adminId?: unknown; text?: unknown; days?: unknown; reason?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  const alert = id ? await prisma.adminAlert.findUnique({ where: { id } }) : null;
  if (!alert || alert.kind !== 'urgent') return NextResponse.json({ error: 'That problem no longer exists — refresh the page.' }, { status: 404 });
  const manager = requireRole(session, MANAGER_PLUS);
  const now = new Date();
  const event = (kind: string, text = '') => prisma.adminAlertEvent.create({ data: { alertId: id, kind, actorName: session.name, text: text.slice(0, 2000), createdAt: now } });
  const audit = (action: string, after: Record<string, unknown>) => auditAdmin(session, { action, targetType: 'problem', targetId: id, courseId: alert.courseId, after: { problem: alert.title, ...after } });

  switch (body.action) {
    case 'claim': {
      if (alert.resolvedAt) return NextResponse.json({ error: 'This problem already cleared.' }, { status: 409 });
      // Taking one someone else has is a reassignment: manager+.
      if (alert.ownerId && alert.ownerId !== session.adminId && !manager) return NextResponse.json({ error: `${alert.ownerName || 'Someone'} has this one. A manager can reassign it.` }, { status: 403 });
      await prisma.adminAlert.update({ where: { id }, data: { ownerId: session.adminId, ownerName: session.name } });
      await event('claimed');
      await audit('problem_claim', {});
      break;
    }
    case 'assign': {
      if (!manager) return NextResponse.json({ error: 'Assigning a problem to someone else needs manager access.' }, { status: 403 });
      if (alert.resolvedAt) return NextResponse.json({ error: 'This problem already cleared.' }, { status: 409 });
      const to = typeof body.adminId === 'string' && body.adminId ? await prisma.adminUser.findFirst({ where: { id: body.adminId, active: true }, select: { id: true, name: true } }) : null;
      if (body.adminId && !to) return NextResponse.json({ error: 'That person isn’t an active employee.' }, { status: 400 });
      await prisma.adminAlert.update({ where: { id }, data: { ownerId: to?.id ?? null, ownerName: to?.name ?? '' } });
      await event('assigned', to ? `to ${to.name}` : 'to no one');
      await audit('problem_assign', { owner: to?.name ?? null });
      break;
    }
    case 'note': {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return NextResponse.json({ error: 'Write what was done first.' }, { status: 400 });
      if (alert.resolvedAt) return NextResponse.json({ error: 'This problem already cleared.' }, { status: 409 });
      await event('note', text);
      await audit('problem_note', { text: text.slice(0, 500) });
      break;
    }
    case 'snooze': {
      if (!manager) return NextResponse.json({ error: 'Snoozing a problem needs manager access.' }, { status: 403 });
      const days = Number(body.days);
      if (!(SNOOZE_DAYS as readonly number[]).includes(days)) return NextResponse.json({ error: `Snooze for ${SNOOZE_DAYS.join(', ')} days.` }, { status: 400 });
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length < 4) return NextResponse.json({ error: 'Say why it can wait.' }, { status: 400 });
      if (alert.resolvedAt) return NextResponse.json({ error: 'This problem already cleared.' }, { status: 409 });
      const until = new Date(now.getTime() + days * 86_400_000);
      await prisma.adminAlert.update({ where: { id }, data: { snoozedUntil: until, snoozeReason: reason.slice(0, 300) } });
      await event('snoozed', `${days} day${days === 1 ? '' : 's'}: ${reason}`);
      await audit('problem_snooze', { days, reason });
      break;
    }
    case 'unsnooze': {
      if (!manager) return NextResponse.json({ error: 'Needs manager access.' }, { status: 403 });
      await prisma.adminAlert.update({ where: { id }, data: { snoozedUntil: null, snoozeReason: '' } });
      await event('unsnoozed');
      await audit('problem_unsnooze', {});
      break;
    }
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
