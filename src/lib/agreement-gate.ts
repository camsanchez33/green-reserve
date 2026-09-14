// AG-1: the go-live gate. Server only (reads legal/documents/ via
// lib/agreements.ts) — lib/course-timeline.ts is imported by client pages and
// must stay free of fs, so this lives apart from it.
import { prisma } from '@/lib/prisma';
import { currentVersion, signableDocuments, type AgreementDocument } from './agreements';
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

export type AgreementDocStatus = {
  document: AgreementDocument;
  version: string;
  title: string;
  signed: boolean;
  /** the row that satisfies it (current, or an older version still within its window) */
  acceptedAt: Date | null;
  acceptedVersion: string | null;
  legacy: boolean;
};

export type AgreementStatus = {
  documents: AgreementDocStatus[];
  signed: number;
  total: number;
  /** titles still to sign */
  missing: string[];
};

/**
 * AG-2: every signable document (current versions that are not drafts) and
 * whether this course has signed it — the same "current, or older and not
 * yet due for re-acceptance" rule hasAcceptedAgreement applies. Feeds the
 * Getting Started checklist, the admin Records tab and the chase emails.
 */
export async function agreementStatus(courseId: string): Promise<AgreementStatus> {
  const docs = signableDocuments();
  if (docs.length === 0) return { documents: [], signed: 0, total: 0, missing: [] };
  const rows = await prisma.agreementAcceptance.findMany({
    where: { courseId, document: { in: docs.map(d => d.document) } },
    select: { document: true, version: true, acceptedAt: true, legacy: true }, orderBy: { acceptedAt: 'desc' },
  });
  const versions = await prisma.agreementVersion.findMany({
    where: { OR: docs.map(d => ({ document: d.document, version: d.version })) },
    select: { document: true, reacceptBy: true },
  });
  const reacceptBy = new Map(versions.map(v => [v.document, v.reacceptBy]));
  const now = Date.now();
  const documents: AgreementDocStatus[] = docs.map(d => {
    const mine = rows.filter(r => r.document === d.document);
    const current = mine.find(r => r.version === d.version);
    const older = mine[0];
    const due = reacceptBy.get(d.document);
    const olderOk = !!older && (!due || due.getTime() > now);
    const hit = current ?? (olderOk ? older : undefined);
    return {
      document: d.document, version: d.version, title: d.title,
      signed: !!hit, acceptedAt: hit?.acceptedAt ?? null, acceptedVersion: hit?.version ?? null, legacy: hit?.legacy ?? false,
    };
  });
  return {
    documents,
    signed: documents.filter(d => d.signed).length,
    total: documents.length,
    missing: documents.filter(d => !d.signed).map(d => d.title),
  };
}
