// BRAIN-2a (Cam 2026-10-22): the Problems page. Every problem the hourly check
// finds (lib/admin-checks.ts writes AdminAlert rows) as a work list: open ones
// first (unowned before owned, oldest first), then snoozed, then what cleared
// in the last 30 days — each with who is on it and its history.
//
// A problem is never closed by hand: it clears when the check stops seeing it
// (the charge went through, Stripe connected). People claim it, assign it,
// note what they did, or snooze it for a while with a reason.
import { prisma } from './prisma';

export const SNOOZE_DAYS = [1, 3, 7, 14] as const;
const CLEARED_DAYS = 30;

export type ProblemView = {
  id: string; title: string; detail: string; href: string;
  courseId: string | null; courseName: string | null;
  openedAt: string; clearedAt: string | null;
  ownerId: string | null; ownerName: string;
  snoozedUntil: string | null; snoozeReason: string;
  state: 'open' | 'snoozed' | 'cleared';
  history: { at: string; kind: string; who: string; text: string }[];
};

export async function listProblems(now = new Date()): Promise<{ open: ProblemView[]; snoozed: ProblemView[]; cleared: ProblemView[] }> {
  const rows = await prisma.adminAlert.findMany({
    where: { kind: 'urgent', OR: [{ resolvedAt: null }, { resolvedAt: { gte: new Date(now.getTime() - CLEARED_DAYS * 86_400_000) } }] },
    include: { events: { orderBy: { createdAt: 'desc' }, take: 30 } },
    orderBy: { firstSeenAt: 'asc' },
  });
  const ids = [...new Set(rows.map(r => r.courseId).filter((x): x is string => !!x))];
  const names = new Map((ids.length ? await prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map(c => [c.id, c.name]));
  const views = rows.map((r): ProblemView => {
    const snoozed = !r.resolvedAt && r.snoozedUntil && r.snoozedUntil > now;
    return {
      id: r.id, title: r.title, detail: r.detail, href: r.href,
      courseId: r.courseId, courseName: r.courseId ? names.get(r.courseId) ?? null : null,
      openedAt: r.firstSeenAt.toISOString(), clearedAt: r.resolvedAt?.toISOString() ?? null,
      ownerId: r.ownerId, ownerName: r.ownerName,
      snoozedUntil: snoozed ? r.snoozedUntil!.toISOString() : null, snoozeReason: snoozed ? r.snoozeReason : '',
      state: r.resolvedAt ? 'cleared' : snoozed ? 'snoozed' : 'open',
      history: r.events.map(e => ({ at: e.createdAt.toISOString(), kind: e.kind, who: e.actorName, text: e.text })),
    };
  });
  const open = views.filter(v => v.state === 'open').sort((a, b) => Number(!!a.ownerId) - Number(!!b.ownerId) || a.openedAt.localeCompare(b.openedAt));
  return {
    open,
    snoozed: views.filter(v => v.state === 'snoozed'),
    cleared: views.filter(v => v.state === 'cleared').sort((a, b) => (b.clearedAt ?? '').localeCompare(a.clearedAt ?? '')),
  };
}

/** Open, not snoozed — the number Today and the rail show. */
export async function openProblemCount(now = new Date()): Promise<{ open: number; unowned: number }> {
  const where = { kind: 'urgent', resolvedAt: null, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
  const [open, unowned] = await Promise.all([
    prisma.adminAlert.count({ where }),
    prisma.adminAlert.count({ where: { ...where, ownerId: null } }),
  ]);
  return { open, unowned };
}
