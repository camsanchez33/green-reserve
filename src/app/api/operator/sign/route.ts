import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { signableDocuments, type AgreementDocument } from '@/lib/agreements';
import { agreementStatus } from '@/lib/agreement-gate';
import { recordSigning, deliverAgreementPdfs } from '@/lib/agreement-sign';
import { agreementReacceptance } from '@/lib/agreement-required';
import { evidentiaryIp } from '@/lib/rate-limit';

// AGREEMENT_SPEC AG-2 §1 — the signing step.
//
//   GET  → what to present: every signable document (title, version, short
//          version, full HTML, hash), which are already on file, the legal
//          name and signer prefills.
//   POST → one request signs everything that is not yet current: validates
//          name/title/legal name/scroll evidence/ticks, writes the rows in one
//          transaction with IP + user agent, then renders the PDFs and sends
//          the courtesy copies after the response (the row is the record).
//
// Staff sessions are refused. Re-signing when already current is a no-op
// with a friendly message, never a duplicate row.

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // The dashboard checklist only needs the count — no document HTML.
  if (req.nextUrl.searchParams.get('status') === '1') {
    const [st, re] = await Promise.all([agreementStatus(session.courseId), agreementReacceptance(session.courseId)]);
    return NextResponse.json({
      status: { signed: st.signed, total: st.total, missing: st.missing },
      // AG-3: the banner / modal state, null when nothing is due.
      reaccept: re ? { ...re, effectiveAt: re.effectiveAt.toISOString(), reacceptBy: re.reacceptBy.toISOString() } : null,
    });
  }
  const [course, status] = await Promise.all([
    prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true, legalName: true, operator: { select: { name: true } } } }),
    agreementStatus(session.courseId),
  ]);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  const docs = signableDocuments();
  return NextResponse.json({
    courseName: course.name,
    legalName: course.legalName || '',
    signerName: course.operator?.name ?? '',
    signerEmail: session.email,
    isStaff: session.isStaff,
    status: { signed: status.signed, total: status.total, missing: status.missing },
    documents: docs.map(d => {
      const st = status.documents.find(x => x.document === d.document);
      return {
        document: d.document, version: d.version, title: d.title, effectiveAt: d.effectiveAt,
        summary: d.summary, html: d.html, hash: d.hash,
        signed: st?.signed ?? false, acceptedAt: st?.acceptedAt?.toISOString() ?? null, acceptedVersion: st?.acceptedVersion ?? null,
      };
    }),
  });
}

const DOCS: AgreementDocument[] = ['operator_agreement', 'brand_license', 'accuracy_attestation'];
const pick = (v: unknown): Partial<Record<AgreementDocument, boolean>> => {
  const out: Partial<Record<AgreementDocument, boolean>> = {};
  if (v && typeof v === 'object') for (const k of DOCS) out[k] = (v as Record<string, unknown>)[k] === true;
  return out;
};

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const result = await recordSigning({
    courseId: session.courseId,
    signerEmail: session.email,
    ip: evidentiaryIp(req),
    userAgent: req.headers.get('user-agent') ?? '',
    legalName: String(body.legalName ?? ''),
    signerName: String(body.signerName ?? ''),
    signerTitle: String(body.signerTitle ?? ''),
    accept: pick(body.accept),
    scrolledToEnd: pick(body.scrolledToEnd),
    authorityAttested: body.authorityAttested === true,
    marketingOptOut: body.marketingOptOut === true,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  if (result.signed.length > 0) {
    const ids = result.signed.map(r => r.id);
    const courseId = session.courseId;
    // The courtesy copies happen after the response — the signer is not kept
    // waiting on a PDF renderer and an email provider.
    after(async () => { await deliverAgreementPdfs(courseId, ids); });
  }
  return NextResponse.json({
    success: true,
    signed: result.signed.map(r => r.document),
    alreadyCurrent: result.alreadyCurrent,
    message: result.signed.length === 0 ? 'Everything is already signed and on file — nothing new to sign.' : undefined,
  });
}
