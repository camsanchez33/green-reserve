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

/**
 * M10 / MONEY-VIEW-1 (Cam 2026-11-26): failed charges are visible only with the
 * Money area. The hourly check's keys for a declined card (lib/admin-checks).
 */
export const FAILED_CHARGE_PROBLEM_PREFIXES = ['failed:', 'holddeclined:'] as const;
export const isFailedChargeProblem = (key: string) => FAILED_CHARGE_PROBLEM_PREFIXES.some(p => key.startsWith(p));

/** `money: false` leaves out the failed-charge problems. Required, so no caller forgets: it comes from the asker's areas. */
export async function listProblems(now: Date, opts: { money: boolean }): Promise<{ open: ProblemView[]; snoozed: ProblemView[]; cleared: ProblemView[] }> {
  const all = await prisma.adminAlert.findMany({
    where: { kind: 'urgent', OR: [{ resolvedAt: null }, { resolvedAt: { gte: new Date(now.getTime() - CLEARED_DAYS * 86_400_000) } }] },
    include: { events: { orderBy: { createdAt: 'desc' }, take: 30 } },
    orderBy: { firstSeenAt: 'asc' },
  });
  const rows = opts.money ? all : all.filter(r => !isFailedChargeProblem(r.key));
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

/** Every problem not yet cleared — the rail's count, the same rows Overview's Needs attention lists
 *  (open and snoozed: snoozing is gone, so one snoozed before then still counts). */
export async function openProblemCount(opts: { money: boolean }): Promise<{ open: number }> {
  // M10 / MONEY-VIEW-1: without Money the declined-card problems are not listed, so they are not counted either.
  const notMoney = opts.money ? {} : { NOT: FAILED_CHARGE_PROBLEM_PREFIXES.map(p => ({ key: { startsWith: p } })) };
  return { open: await prisma.adminAlert.count({ where: { kind: 'urgent', resolvedAt: null, ...notMoney } }) };
}
