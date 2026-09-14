// AGREEMENT_SPEC AG-3 — version bumps and re-acceptance. Server only.
//
// A bump = a new Markdown file whose AgreementVersion row carries
// `reacceptBy`. A course is "on an older version" when it has signed some
// earlier version but not the current one. From day 0 it sees a banner; after
// `reacceptBy` the dashboard's configuration writes answer 428
// `agreement_required` until it signs. Courses that never signed anything are
// NOT overdue — they are in onboarding, gated at go-live as before.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentVersion, loadDocument, listVersions } from './agreements';
import { sendAgreementBumpNoticeEmail, sendAgreementBumpAdminSummaryEmail } from './email';

export type ReacceptWindow = { version: string; effectiveAt: Date; reacceptBy: Date; title: string; changeSummary: string };

let cache: { at: number; value: ReacceptWindow | null } | null = null;
const CACHE_MS = 60_000;

/** The current Operator Agreement version's re-acceptance window, if the bump asked for one. Cached a minute per process. */
export async function currentReacceptWindow(now: Date = new Date()): Promise<ReacceptWindow | null> {
  if (cache && now.getTime() - cache.at < CACHE_MS) return cache.value;
  let value: ReacceptWindow | null = null;
  try {
    const version = currentVersion('operator_agreement');
    const row = await prisma.agreementVersion.findUnique({ where: { document_version: { document: 'operator_agreement', version } } });
    if (row?.reacceptBy) {
      const doc = loadDocument('operator_agreement', version);
      value = { version, effectiveAt: row.effectiveAt, reacceptBy: row.reacceptBy, title: doc.title, changeSummary: doc.changeSummary };
    }
  } catch { value = null; }
  cache = { at: now.getTime(), value };
  return value;
}

export type Reacceptance = ReacceptWindow & { overdue: boolean; daysLeft: number };

/** Null unless this course signed an older version and not the current one inside a bump window. */
export async function agreementReacceptance(courseId: string, now: Date = new Date()): Promise<Reacceptance | null> {
  const win = await currentReacceptWindow(now);
  if (!win) return null;
  const rows = await prisma.agreementAcceptance.findMany({ where: { courseId, document: 'operator_agreement' }, select: { version: true } });
  if (rows.length === 0) return null;                       // never signed — onboarding, not a re-acceptance
  if (rows.some(r => r.version === win.version)) return null; // current
  const overdue = win.reacceptBy.getTime() < now.getTime();
  const daysLeft = Math.max(0, Math.ceil((win.reacceptBy.getTime() - now.getTime()) / 86_400_000));
  return { ...win, overdue, daysLeft };
}

export const AGREEMENT_REQUIRED_MESSAGE = 'The Operator Agreement changed and the deadline to sign the new version has passed. Sign it to keep editing your course — bookings and check-ins keep working.';

/** The 428 for configuration writes (spec §3). Null = proceed. */
export async function requireAgreementCurrent(courseId: string): Promise<NextResponse | null> {
  const r = await agreementReacceptance(courseId);
  if (!r || !r.overdue) return null;
  return NextResponse.json({ error: 'agreement_required', message: AGREEMENT_REQUIRED_MESSAGE, version: r.version, reacceptBy: r.reacceptBy.toISOString() }, { status: 428 });
}

/** Per-course due state for the admin courses sheet: null, or the deadline and whether it passed. Batched over a list of ids. */
export async function agreementDueByCourse(courseIds: string[], now: Date = new Date()): Promise<Map<string, { by: Date; overdue: boolean }>> {
  const out = new Map<string, { by: Date; overdue: boolean }>();
  const win = await currentReacceptWindow(now);
  if (!win || courseIds.length === 0) return out;
  const rows = await prisma.agreementAcceptance.findMany({ where: { courseId: { in: courseIds }, document: 'operator_agreement' }, select: { courseId: true, version: true } });
  const byCourse = new Map<string, string[]>();
  for (const r of rows) { if (!byCourse.has(r.courseId)) byCourse.set(r.courseId, []); byCourse.get(r.courseId)!.push(r.version); }
  for (const [id, versions] of byCourse) {
    if (versions.includes(win.version)) continue;
    out.set(id, { by: win.reacceptBy, overdue: win.reacceptBy.getTime() < now.getTime() });
  }
  return out;
}

/** Courses past the deadline — the Overview action queue's rows (spec §4). */
export async function agreementOverdueCourses(now: Date = new Date()): Promise<{ id: string; name: string; operatorName: string; by: Date }[]> {
  const win = await currentReacceptWindow(now);
  if (!win || win.reacceptBy.getTime() >= now.getTime()) return [];
  const courses = await prisma.course.findMany({
    where: { archivedAt: null, agreements: { some: { document: 'operator_agreement' }, none: { document: 'operator_agreement', version: win.version } } },
    select: { id: true, name: true, operator: { select: { name: true } } },
  });
  return courses.map(c => ({ id: c.id, name: c.name, operatorName: c.operator?.name ?? '', by: win.reacceptBy }));
}

/**
 * Day-0 notice (spec §2): for every AgreementVersion with a re-acceptance
 * deadline and no notice yet, email each course that has ever been live (or
 * is) and has an operator; then one summary to hello@; then stamp
 * noticeSentAt. Idempotent — the stamp is written only after the sends.
 */
export async function sendAgreementBumpNotices(now: Date = new Date()): Promise<{ versions: number; notified: number; failed: number }> {
  const pending = await prisma.agreementVersion.findMany({ where: { reacceptBy: { not: null }, noticeSentAt: null } });
  let notified = 0, failed = 0;
  for (const v of pending) {
    const doc = (() => {
      try { return listVersions(v.document as 'operator_agreement').includes(v.version) ? loadDocument(v.document as 'operator_agreement', v.version) : null; } catch { return null; }
    })();
    const title = doc?.title ?? v.document;
    const changeSummary = doc?.changeSummary ?? '';
    const courses = await prisma.course.findMany({
      where: { archivedAt: null, operatorId: { not: null }, OR: [{ active: true }, { welcomeEmailSentAt: { not: null } }] },
      select: { id: true, name: true, operator: { select: { name: true, email: true } }, agreements: { where: { document: v.document, version: v.version }, select: { id: true }, take: 1 } },
    });
    const failures: string[] = [];
    for (const c of courses) {
      if (!c.operator || c.agreements.length > 0) continue; // already on the new version
      try {
        await sendAgreementBumpNoticeEmail({
          operatorName: c.operator.name, operatorEmail: c.operator.email, courseName: c.name,
          title, version: v.version, effectiveAt: v.effectiveAt, reacceptBy: v.reacceptBy as Date, changeSummary,
        });
        notified++;
      } catch (e) { failed++; failures.push(c.name); console.error('agreement bump notice failed for', c.id, e); }
    }
    try {
      await sendAgreementBumpAdminSummaryEmail({ title, version: v.version, reacceptBy: v.reacceptBy as Date, notified, failures });
    } catch (e) { console.error('agreement bump admin summary failed:', e); }
    await prisma.agreementVersion.update({ where: { id: v.id }, data: { noticeSentAt: now } });
    cache = null;
  }
  return { versions: pending.length, notified, failed };
}
