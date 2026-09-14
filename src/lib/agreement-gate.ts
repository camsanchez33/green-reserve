// AG-1: the go-live gate. Server only (reads legal/documents/ via
// lib/agreements.ts) — lib/course-timeline.ts is imported by client pages and
// must stay free of fs, so this lives apart from it.
import { prisma } from '@/lib/prisma';
import { currentVersion } from './agreements';
import { getCourseTimeline, latestAgreementAcceptance } from './course-timeline';

/**
 * A course passes when it holds an AgreementAcceptance row for the CURRENT
 * operator-agreement version, or a row for an older version whose
 * AgreementVersion.reacceptBy is null (no re-acceptance asked) or still in the
 * future. Until scripts/migrate-agreement-lines.ts has run, a legacy timeline
 * line still counts — that is what those rows are made from. A course with no
 * record of any kind returns false; nothing is ever assumed.
 */
export async function hasAcceptedAgreement(courseId: string): Promise<boolean> {
  let current = '';
  try { current = currentVersion('operator_agreement'); } catch { /* no docs on disk — legacy path below */ }
  const rows = await prisma.agreementAcceptance.findMany({
    where: { courseId, document: 'operator_agreement' },
    select: { version: true }, orderBy: { acceptedAt: 'desc' },
  });
  if (rows.length) {
    if (!current || rows.some(r => r.version === current)) return true;
    const currentRow = await prisma.agreementVersion.findUnique({ where: { document_version: { document: 'operator_agreement', version: current } }, select: { reacceptBy: true } });
    if (!currentRow || !currentRow.reacceptBy || currentRow.reacceptBy.getTime() > Date.now()) return true;
    return false;
  }
  const events = await getCourseTimeline(courseId);
  if (!events) return false;
  return !!latestAgreementAcceptance(events);
}
