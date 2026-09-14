// AGREEMENT_SPEC AG-2 — the signing service. Server only.
//
//   recordSigning()          the rows (one transaction), legal name, timeline
//   deliverAgreementPdfs()   PDFs → private Blob → pdfUrl, then the email
//   retryMissingAgreementPdfs()  the hourly cron's courtesy-copy retry
//
// The row IS the record. A PDF that fails to render never undoes a signing;
// it is logged and retried, and the admin Records tab shows the row either way.
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { loadDocument, signableDocuments, type AgreementDocument, type LoadedDocument } from './agreements';
import { agreementStatus } from './agreement-gate';
import { logAgreementAccepted } from './course-timeline';
import { renderAgreementPdf } from './agreement-pdf';
import { sendSignedAgreementsEmail } from './email';

export type SignInput = {
  courseId: string;
  signerEmail: string;
  ip: string;
  userAgent: string;
  legalName: string;
  signerName: string;
  signerTitle: string;
  /** which documents the signer ticked — keyed by document id */
  accept: Partial<Record<AgreementDocument, boolean>>;
  /** cheap evidence of presentation — keyed by document id */
  scrolledToEnd: Partial<Record<AgreementDocument, boolean>>;
  authorityAttested: boolean;
  marketingOptOut: boolean;
};

export type SignResult = {
  ok: true;
  signed: { id: string; document: AgreementDocument; version: string }[];
  /** already on file at the current version — no duplicate row written */
  alreadyCurrent: AgreementDocument[];
} | { ok: false; status: number; error: string };

const DOC_LABEL: Record<AgreementDocument, string> = {
  operator_agreement: 'the Operator Agreement',
  brand_license: 'the Brand License',
  accuracy_attestation: 'the Accuracy Attestation',
};

export async function recordSigning(input: SignInput): Promise<SignResult> {
  const legalName = input.legalName.trim().slice(0, 200);
  const signerName = input.signerName.trim().slice(0, 120);
  const signerTitle = input.signerTitle.trim().slice(0, 120);
  if (legalName.length < 2) return { ok: false, status: 400, error: 'Enter the course’s legal name.' };
  if (signerName.length < 2) return { ok: false, status: 400, error: 'Enter your name.' };
  if (signerTitle.length < 2) return { ok: false, status: 400, error: 'Enter your title.' };

  const docs = signableDocuments();
  if (docs.length === 0) return { ok: false, status: 503, error: 'No agreements are ready to sign right now. Contact hello@greenreserve.app.' };
  const status = await agreementStatus(input.courseId);
  const alreadyCurrent = status.documents.filter(d => d.signed).map(d => d.document);
  const toSign = docs.filter(d => !alreadyCurrent.includes(d.document));

  for (const d of toSign) {
    if (input.accept[d.document] !== true) return { ok: false, status: 400, error: `Tick ${DOC_LABEL[d.document]} to continue.` };
    if (input.scrolledToEnd[d.document] !== true) return { ok: false, status: 400, error: `Read ${DOC_LABEL[d.document]} to the end before signing.` };
  }
  if (toSign.some(d => d.document === 'operator_agreement') && !input.authorityAttested) {
    return { ok: false, status: 400, error: 'Confirm that you are authorized to sign on behalf of the course.' };
  }

  if (toSign.length === 0) {
    // Re-signing when everything is current is a no-op with a friendly
    // message, never a duplicate row. The legal name still updates.
    await prisma.course.update({ where: { id: input.courseId }, data: { legalName } });
    return { ok: true, signed: [], alreadyCurrent };
  }

  const rows = await prisma.$transaction(async tx => {
    const created: { id: string; document: AgreementDocument; version: string }[] = [];
    for (const d of toSign) {
      const row = await tx.agreementAcceptance.create({
        data: {
          courseId: input.courseId, document: d.document, version: d.version, textHash: d.hash,
          signerName, signerTitle, signerEmail: input.signerEmail,
          authorityAttested: d.document === 'operator_agreement' ? input.authorityAttested : false,
          marketingOptOut: d.document === 'brand_license' ? input.marketingOptOut : false,
          ip: input.ip.slice(0, 64), userAgent: input.userAgent.slice(0, 300),
        },
        select: { id: true, document: true, version: true },
      });
      created.push({ id: row.id, document: row.document as AgreementDocument, version: row.version });
    }
    await tx.course.update({ where: { id: input.courseId }, data: { legalName } });
    return created;
  });

  // The timeline line stays as history for the admin Documents tab.
  const oa = rows.find(r => r.document === 'operator_agreement');
  if (oa) await logAgreementAccepted(input.courseId, input.signerEmail, oa.version);

  return { ok: true, signed: rows, alreadyCurrent };
}

/** Render one acceptance's PDF and store it privately; returns the Blob URL. */
async function renderAndStore(acceptanceId: string): Promise<string | null> {
  const row = await prisma.agreementAcceptance.findUnique({ where: { id: acceptanceId }, include: { course: { select: { name: true, legalName: true } } } });
  if (!row) return null;
  let doc: LoadedDocument;
  try { doc = loadDocument(row.document as AgreementDocument, row.version); } catch { return null; }
  if (doc.hash !== row.textHash && row.textHash) {
    // The file on disk is not the text that was signed — never render a
    // different text under a signature. Leave pdfUrl empty; the row stands.
    console.error(`agreement pdf: hash mismatch for ${acceptanceId} (${row.document} ${row.version})`);
    return null;
  }
  const pdf = await renderAgreementPdf(doc, {
    courseName: row.course.name, legalName: row.course.legalName,
    signerName: row.signerName, signerTitle: row.signerTitle, signerEmail: row.signerEmail,
    acceptedAt: row.acceptedAt, ip: row.ip, acceptanceId: row.id,
    authorityAttested: row.authorityAttested, marketingOptOut: row.marketingOptOut, legacy: row.legacy,
  });
  const blob = await put(`agreements/${row.courseId}/${row.document}-${row.version}-${row.id}.pdf`, pdf, {
    access: 'private', contentType: 'application/pdf', addRandomSuffix: false,
  });
  await prisma.agreementAcceptance.update({ where: { id: row.id }, data: { pdfUrl: blob.url } });
  return blob.url;
}

/**
 * The courtesy copies: PDFs to Blob, then one email to the operator with the
 * PDFs attached and a copy to hello@. Any failure is logged, never thrown —
 * the caller has already answered the signer.
 */
export async function deliverAgreementPdfs(courseId: string, acceptanceIds: string[]): Promise<void> {
  if (acceptanceIds.length === 0) return;
  const attachments: { filename: string; content: Buffer }[] = [];
  const summary: { title: string; version: string }[] = [];
  const pending: string[] = [];
  for (const id of acceptanceIds) {
    const row = await prisma.agreementAcceptance.findUnique({ where: { id }, select: { document: true, version: true, textHash: true } });
    if (!row) continue;
    let title = row.document;
    try { title = loadDocument(row.document as AgreementDocument, row.version).title; } catch { /* keep id */ }
    summary.push({ title, version: row.version });
    try {
      const url = await renderAndStore(id);
      if (!url) { pending.push(title); continue; }
      // Re-render for the attachment rather than round-tripping the blob.
      const doc = loadDocument(row.document as AgreementDocument, row.version);
      const full = await prisma.agreementAcceptance.findUnique({ where: { id }, include: { course: { select: { name: true, legalName: true } } } });
      if (!full) continue;
      const pdf = await renderAgreementPdf(doc, {
        courseName: full.course.name, legalName: full.course.legalName,
        signerName: full.signerName, signerTitle: full.signerTitle, signerEmail: full.signerEmail,
        acceptedAt: full.acceptedAt, ip: full.ip, acceptanceId: full.id,
        authorityAttested: full.authorityAttested, marketingOptOut: full.marketingOptOut, legacy: full.legacy,
      });
      attachments.push({ filename: `${title.replace(/[^A-Za-z0-9]+/g, '-')}-v${row.version}.pdf`, content: pdf });
    } catch (e) {
      console.error(`agreement pdf: render/store failed for ${id}:`, e);
      pending.push(title);
    }
  }
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true, legalName: true, operator: { select: { name: true, email: true } } } });
  if (!course?.operator) return;
  const first = await prisma.agreementAcceptance.findFirst({ where: { id: { in: acceptanceIds } }, select: { signerName: true, signerEmail: true, acceptedAt: true } });
  try {
    await sendSignedAgreementsEmail({
      operatorName: course.operator.name, operatorEmail: course.operator.email,
      courseName: course.name, legalName: course.legalName,
      signerName: first?.signerName ?? '', signerEmail: first?.signerEmail ?? course.operator.email,
      acceptedAt: first?.acceptedAt ?? new Date(),
      documents: summary, pending, attachments,
    });
  } catch (e) {
    console.error('agreement pdf: signed-agreements email failed:', e);
  }
}

/** Hourly: acceptances still without a PDF (render failed, or Blob was down) get another go. */
export async function retryMissingAgreementPdfs(limit = 10): Promise<{ tried: number; stored: number }> {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
  const rows = await prisma.agreementAcceptance.findMany({
    where: { pdfUrl: null, legacy: false, acceptedAt: { lt: twoMinutesAgo } },
    select: { id: true }, orderBy: { acceptedAt: 'asc' }, take: limit,
  });
  let stored = 0;
  for (const r of rows) {
    try { if (await renderAndStore(r.id)) stored++; } catch (e) { console.error(`agreement pdf retry failed for ${r.id}:`, e); }
  }
  return { tried: rows.length, stored };
}
