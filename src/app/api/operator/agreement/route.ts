import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { logAgreementAccepted } from '@/lib/course-timeline';
import { latestOperatorAgreement } from '@/lib/agreement-gate';
import { loadDocument } from '@/lib/agreements';
import { clientIp } from '@/lib/rate-limit';

// A-05 item 5a — Operator Agreement clickwrap, an extension of the existing
// first-login onboarding flow (dashboard/onboarding). GET answers "has this
// course accepted?" from the signed AgreementAcceptance rows (the timeline line
// only for acceptances from before them) — lib/agreement-gate.ts.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ agreement: await latestOperatorAgreement(session.courseId) });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  // AG-1: the acceptance is a row — document, version, hash of the exact
  // text, who, from where. AG-2 adds signer name/title, authority, the PDF.
  const doc = loadDocument('operator_agreement');
  await prisma.agreementAcceptance.create({
    data: {
      courseId: session.courseId, document: 'operator_agreement', version: doc.version, textHash: doc.hash,
      signerName: '', signerTitle: '', signerEmail: session.email,
      ip: clientIp(req), userAgent: (req.headers.get('user-agent') ?? '').slice(0, 300),
    },
  });
  // The timeline line stays as history for the admin Documents tab.
  const ok = await logAgreementAccepted(session.courseId, session.email, doc.version);
  if (!ok) return NextResponse.json({ error: 'Could not record acceptance' }, { status: 400 });
  return NextResponse.json({ success: true, version: doc.version });
}
