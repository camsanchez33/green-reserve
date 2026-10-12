// @brain agreement-publishing
// AG-3 — publishing an agreement version: one AgreementVersion row per
// (document, version) on disk. Shared by Admin → System's Publish button
// (Cam 2026-10-12: "build the admin button") and scripts/seed-agreement-versions.ts,
// so both apply the same gate and the same dates.
//
// Publishing from the running site has one advantage over the script: the
// file is on this deployment's disk, so the `hourly` cron's day-0 notice
// (sendAgreementBumpNotices) always finds the title and change summary.
// Server only.
import { prisma } from './prisma';
import { DOCUMENT_DIR, listVersions, loadDocument, seedGateError, type AgreementDocument, type LoadedDocument } from './agreements';

const DAY_MS = 86_400_000;
export const REACCEPT_WINDOW_DAYS = 30;

/** The row a version gets when published at `now`: a re-acceptance bump takes
 *  effect NOW with a 30-day window, whatever the file's effectiveAt says. */
export function publishDates(doc: Pick<LoadedDocument, 'reacceptRequired' | 'effectiveAt'>, now: Date): { effectiveAt: Date; reacceptBy: Date | null } {
  const effectiveAt = doc.reacceptRequired ? now : new Date(doc.effectiveAt + 'T00:00:00.000Z');
  return { effectiveAt, reacceptBy: doc.reacceptRequired ? new Date(effectiveAt.getTime() + REACCEPT_WINDOW_DAYS * DAY_MS) : null };
}

export type VersionRow = {
  document: AgreementDocument; version: string; title: string; current: boolean;
  reacceptRequired: boolean; counselReviewed: string; counselWaived: string; changeSummary: string;
  /** Why it cannot be published, or '' (the seed gate). */
  blocked: string;
  published: null | { effectiveAt: string; reacceptBy: string | null; noticeSentAt: string | null; hashMatches: boolean };
};

/** Every version on disk, newest first per document, with its published row if any. */
export async function agreementVersionsOverview(): Promise<VersionRow[]> {
  const rows = await prisma.agreementVersion.findMany();
  const out: VersionRow[] = [];
  for (const document of Object.keys(DOCUMENT_DIR) as AgreementDocument[]) {
    listVersions(document).forEach((version, i) => {
      const doc = loadDocument(document, version);
      const row = rows.find(r => r.document === document && r.version === version);
      out.push({
        document, version, title: doc.title, current: i === 0,
        reacceptRequired: doc.reacceptRequired, counselReviewed: doc.counselReviewed, counselWaived: doc.counselWaived,
        changeSummary: doc.changeSummary,
        blocked: seedGateError(doc) ?? '',
        published: row ? {
          effectiveAt: row.effectiveAt.toISOString(), reacceptBy: row.reacceptBy?.toISOString() ?? null,
          noticeSentAt: row.noticeSentAt?.toISOString() ?? null, hashMatches: row.textHash === doc.hash,
        } : null,
      });
    });
  }
  return out;
}

export type PublishResult =
  | { ok: true; created: true; effectiveAt: Date; reacceptBy: Date | null; waived: boolean }
  | { ok: true; created: false }
  | { ok: false; status: number; error: string };

/** Publish one version. Idempotent: an already-published version with the same
 *  text is `created: false`; one whose file changed since is refused (versions
 *  are immutable — bump instead). */
export async function publishAgreementVersion(document: string, version: string, now: Date = new Date()): Promise<PublishResult> {
  if (!(document in DOCUMENT_DIR)) return { ok: false, status: 400, error: 'Unknown document.' };
  const d = document as AgreementDocument;
  if (!listVersions(d).includes(version)) return { ok: false, status: 404, error: `No ${version} file for that document on this deployment. Merge it and wait for the deploy, then try again.` };
  const doc = loadDocument(d, version);
  const existing = await prisma.agreementVersion.findUnique({ where: { document_version: { document: d, version } } });
  if (existing) {
    if (existing.textHash !== doc.hash) {
      return { ok: false, status: 409, error: `${version} was published with different text. Versions are immutable — add a new version instead of editing this one.` };
    }
    return { ok: true, created: false };
  }
  const gate = seedGateError(doc);
  if (gate) return { ok: false, status: 409, error: gate };
  const { effectiveAt, reacceptBy } = publishDates(doc, now);
  try {
    await prisma.agreementVersion.create({ data: { document: d, version, textHash: doc.hash, effectiveAt, reacceptBy } });
  } catch (e) {
    // Two publishes at once: the unique (document, version) lets one through.
    if ((e as { code?: string }).code === 'P2002') return { ok: true, created: false };
    throw e;
  }
  return { ok: true, created: true, effectiveAt, reacceptBy, waived: doc.reacceptRequired && !doc.counselReviewed };
}
