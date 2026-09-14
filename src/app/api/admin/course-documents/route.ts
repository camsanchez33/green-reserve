import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS, SUPPORT_PLUS } from '@/lib/admin-session';
import { stripe } from '@/lib/stripe';
import { getApprovalState } from '@/lib/approval-state';
import { getCourseTimeline, latestAgreementAcceptance, logNoteAdded, CURRENT_AGREEMENT_VERSION } from '@/lib/course-timeline';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';
import { agreementStatus } from '@/lib/agreement-gate';
import { listVersions, loadDocument, type AgreementDocument } from '@/lib/agreements';

// A-05 item 5 — Documents tab: auto records (operator agreement acceptance,
// Stripe connected-account agreement date fetched live from Stripe — no
// schema field needed, go-live approval record) + uploaded PDFs + client
// notes, all decoded from the course timeline (course-timeline.ts).
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2c: Stripe ToS acceptance, document URLs and internal client notes.
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { stripeAccountId: true, stripeAccountActive: true } });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [approval, timeline, agreements, acceptanceRows] = await Promise.all([
    getApprovalState(courseId),
    getCourseTimeline(courseId),
    agreementStatus(courseId),
    // AG-2 §3: one row per acceptance — the table replaces the decoded line.
    prisma.agreementAcceptance.findMany({ where: { courseId }, orderBy: { acceptedAt: 'desc' } }),
  ]);
  const titleOf = (document: string, version: string) => {
    try {
      const d = document as AgreementDocument;
      return listVersions(d).includes(version) ? loadDocument(d, version).title : document;
    } catch { return document; }
  };

  let stripeAgreementDate: string | null = null;
  if (course.stripeAccountActive && course.stripeAccountId) {
    try {
      const acct = await stripe.accounts.retrieve(course.stripeAccountId);
      const ts = acct.tos_acceptance?.date;
      stripeAgreementDate = ts ? new Date(ts * 1000).toISOString() : null;
    } catch (e) {
      console.error('Stripe tos_acceptance lookup failed:', e);
    }
  }

  const events = timeline ?? [];
  return NextResponse.json({
    approval: { status: approval.status, approvedAt: approval.approvedAt?.toISOString() ?? null },
    stripeAgreementDate,
    // Real version stamped on golfer bookings (src/lib/terms.ts), not a
    // second parallel constant — no drift between what this shows and what
    // golfers actually agreed to.
    bookingTermsVersion: CURRENT_TERMS_VERSION,
    agreementVersion: CURRENT_AGREEMENT_VERSION,
    agreement: latestAgreementAcceptance(events),
    agreements,
    acceptances: acceptanceRows.map(r => ({
      id: r.id, document: r.document, title: titleOf(r.document, r.version), version: r.version,
      signerName: r.signerName, signerTitle: r.signerTitle, signerEmail: r.signerEmail,
      acceptedAt: r.acceptedAt.toISOString(), ip: r.ip, legacy: r.legacy, pdfUrl: r.pdfUrl,
      authorityAttested: r.authorityAttested, marketingOptOut: r.marketingOptOut,
    })),
    documents: events.filter(e => e.type === 'document_uploaded').map(e => ({ ...(e.data as { name: string; url: string; by: string }), at: e.at })),
    notes: events.filter(e => e.type === 'note_added').map(e => ({ ...(e.data as { text: string; by: string }), at: e.at })),
  });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { courseId, kind, text } = await req.json();
  if (!courseId || kind !== 'note' || !text?.trim()) return NextResponse.json({ error: 'Missing courseId or text' }, { status: 400 });
  const ok = await logNoteAdded(courseId, text.trim(), session.name);
  if (!ok) return NextResponse.json({ error: 'No linked inquiry to log against for this course' }, { status: 400 });
  return NextResponse.json({ success: true });
}
