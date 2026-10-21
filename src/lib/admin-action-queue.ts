// AW-4 (Cam 2026-10-21): "Needs you now" on the admin Today page. The rows and
// their rules are the old Overview action queue (the retired api/admin/stats, MP-4d / MP-7a
// / CS-1 / AG-3), moved here unchanged so Today and anything after it read ONE
// derivation. Money first (red), then everything stalled (amber), oldest first.
import { prisma } from './prisma';
import { ACTIVE_STATUSES } from './inquiry-status';
import { threadSignal } from './thread-signal';
import { buildInquiryQueueRows } from './inquiry-action-queue';
import { buildCourseCheckInRows } from './course-action-queue';
import { agreementOverdueCourses } from './agreement-required';
import { FAILED_CHARGE_WHERE } from './money-problems';

export type QueueItem = { id: string; label: string; ageDays: number };
export type ActionRow = {
  id: string; who: string; why: string; doThis: string; ageDays: number;
  actionLabel: string; href: string; amount?: string; count?: number; items?: QueueItem[];
  fire?: { kind: 'resend_preview' | 'resend_sheet' | 'send_nudge'; inquiryId?: string; courseId?: string };
  severity: 'bad' | 'warn';
};

const days = (now: Date, d: Date) => Math.floor((now.getTime() - d.getTime()) / 86_400_000);

/** Every row that needs a person, red first. Callers gate it (support+, as before). */
export async function buildActionQueue(now = new Date()): Promise<{ rows: ActionRow[]; redCount: number; amberCount: number }> {
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
  const [failedCharges, noStripe, draftsAmber, draftsAmberCount, threads, activePipeline, activeCourses, overdueAgreements] = await Promise.all([
    prisma.booking.findMany({
      where: FAILED_CHARGE_WHERE,
      select: { id: true, courseId: true, golferName: true, totalAmount: true, createdAt: true, course: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    }),
    prisma.course.findMany({ where: { active: true, stripeAccountActive: false, archivedAt: null }, select: { id: true, name: true }, take: 20 }),
    prisma.course.findMany({ where: { active: false, archivedAt: null, createdAt: { lt: twoDaysAgo } }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 20 }),
    prisma.course.count({ where: { active: false, archivedAt: null, createdAt: { lt: twoDaysAgo } } }),
    prisma.messageThread.findMany({
      where: { closedAt: null }, // MP-7b: a closed conversation is not unanswered
      select: { id: true, courseId: true, course: { select: { name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 6, select: { senderType: true, senderName: true, createdAt: true, isBroadcast: true } } },
      take: 200, orderBy: { updatedAt: 'desc' },
    }),
    prisma.courseInquiry.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: {
        id: true, courseName: true, status: true, createdAt: true,
        snoozeUntil: true, nextFollowUpAt: true, callInviteSentAt: true,
        calls: { select: { scheduledAt: true, outcome: true }, where: { kind: 'discovery' } },
        events: { select: { fromStatus: true, toStatus: true, actorName: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.course.findMany({ where: { active: true, archivedAt: null }, select: { id: true, name: true, createdAt: true, stripeAccountActive: true, liveStatus: true, welcomeEmailSentAt: true, firstWentLiveAt: true, archivedAt: true, nextCheckInAt: true, operator: { select: { name: true } }, calls: { where: { kind: 'checkin', outcome: 'scheduled' }, select: { kind: true, scheduledAt: true, outcome: true } } } }),
    agreementOverdueCourses(now),
  ]);

  // Failed charges grouped per course — at many courses an ungrouped list is unusable.
  const failedByCourse = new Map<string, { courseName: string; items: { id: string; golferName: string; amount: number; ageDays: number }[] }>();
  for (const b of failedCharges) {
    if (!failedByCourse.has(b.courseId)) failedByCourse.set(b.courseId, { courseName: b.course.name, items: [] });
    failedByCourse.get(b.courseId)!.items.push({ id: b.id, golferName: b.golferName, amount: b.totalAmount / 100, ageDays: days(now, b.createdAt) });
  }
  const red: ActionRow[] = [
    ...Array.from(failedByCourse.entries()).map(([courseId, g]): ActionRow => {
      const total = g.items.reduce((s, i) => s + i.amount, 0);
      const oldest = Math.max(...g.items.map(i => i.ageDays));
      return {
        id: `fc-${courseId}`, who: g.courseName, severity: 'bad',
        why: `${g.items.length} failed charge${g.items.length === 1 ? '' : 's'} · $${total.toFixed(2)}`,
        doThis: 'Card on file is failing at check-in — contact the golfer(s) to update payment, then retry from Revenue.',
        ageDays: oldest, actionLabel: 'Review', href: '/admin/revenue', count: g.items.length,
        items: g.items.length > 1 ? g.items.map(i => ({ id: i.id, label: `${i.golferName} — $${i.amount.toFixed(2)}`, ageDays: i.ageDays })) : undefined,
      };
    }),
    ...noStripe.map((c): ActionRow => ({
      id: `ns-${c.id}`, who: c.name, severity: 'bad',
      why: 'Live but can’t take payments — Stripe incomplete',
      doThis: 'Operator hasn’t finished connecting their bank account — check their Setup tab and follow up if they’re stuck.',
      ageDays: 0, actionLabel: 'Fix Stripe', href: `/admin/courses?courseId=${c.id}&tab=overview`,
    })),
  ];
  const redCount = failedByCourse.size + noStripe.length;

  // MP-4d: one row per inquiry, from the same derivation the Inquiries list uses.
  const pipelineRows: ActionRow[] = buildInquiryQueueRows(activePipeline, now).map(r => ({ ...r, severity: 'warn' }));
  const draftRows: ActionRow[] = draftsAmber.map(c => ({
    id: `dr-${c.id}`, who: c.name, severity: 'warn', why: 'Draft not yet live',
    doThis: 'Course was built but setup was never finished — complete it and go live from its Overview tab.',
    ageDays: days(now, c.createdAt), actionLabel: 'Review', href: `/admin/courses?courseId=${c.id}&tab=overview`,
  }));
  // MP-7a: lib/thread-signal is THE derivation — Messages sorts from the same function.
  const threadRows: ActionRow[] = threads
    .map(t => ({ t, signal: threadSignal(t.messages, now), last: t.messages.find(m => !m.isBroadcast) }))
    .filter(x => x.signal.overdue && x.last)
    .map(({ t, signal, last }) => ({
      id: `msg-${t.id}`, who: t.course.name, severity: 'warn' as const,
      why: `Message from ${last!.senderName}, unanswered`,
      doThis: 'They’re waiting on a reply — send a quick nudge or a full response.',
      ageDays: signal.ageDays, actionLabel: 'Reply', href: `/admin/messages?courseId=${t.courseId}`,
      fire: { kind: 'send_nudge' as const, courseId: t.courseId },
    }));
  // CS-1 §4: check-in calls due — never a second row for a course already red.
  const alreadyRed = new Set<string>([...noStripe.map(c => c.id), ...failedByCourse.keys()]);
  const checkInRows: ActionRow[] = buildCourseCheckInRows(activeCourses, now).filter(r => !alreadyRed.has(r.id.slice(3))).map(r => ({ ...r, severity: 'warn' }));
  // AG-3 §4: one row per course past its re-acceptance deadline.
  const agreementRows: ActionRow[] = overdueAgreements.map(c => ({
    id: `ag-${c.id}`, who: c.name, severity: 'warn',
    why: `Operator Agreement re-acceptance overdue since ${c.by.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    doThis: `Call ${c.operatorName || 'the operator'} — their course settings are read-only until they sign the new version from their dashboard.`,
    ageDays: Math.max(0, days(now, c.by)), actionLabel: 'Open', href: `/admin/courses/${c.id}`,
  }));
  const amber = [...pipelineRows, ...draftRows, ...threadRows, ...checkInRows, ...agreementRows].sort((a, b) => b.ageDays - a.ageDays);
  const amberCount = pipelineRows.length + draftsAmberCount + threadRows.length + checkInRows.length + agreementRows.length;

  return { rows: [...red.sort((a, b) => b.ageDays - a.ageDays), ...amber], redCount, amberCount };
}
