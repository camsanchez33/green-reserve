import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { resolveAdminSession, requireRole, MANAGER_PLUS, areaGate } from '@/lib/admin-session';
import { withAudit } from '@/lib/admin-audit';

// GET deliberately removed (MP-2, ADMIN_V4 V4-2 leak). It returned EVERY
// operator's live verificationToken plus a ready-made /dashboard/verify link —
// to any admin session, with no role gate. It had no caller anywhere in src/.
//
// CORRECTION (MP-2b): MP-2's commit message claimed that link "logs the holder
// in as that operator". It does not. /api/auth/verify sets no cookie and mints
// no session — it flips emailVerified, which is a go-live precondition. So the
// real impact was marking any operator verified (or burning their verification),
// not account takeover. Recorded here because the wrong threat model would make
// a future run mis-rank the remaining setupLink emitters, which grant password
// knowledge rather than a session.

async function verifyOperator(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const noArea = areaGate(session, 'courses');
  if (noArea) return noArea;
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { email: rawEmail } = await req.json();
  const email = String(rawEmail).trim().toLowerCase();
  const op = await prisma.courseOperator.findUnique({ where: { email } });
  if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Generate a fresh token if missing
  const token = op.verificationToken || randomBytes(32).toString('hex');
  await prisma.courseOperator.update({
    where: { email },
    data: { emailVerified: true, onboardingStep: Math.max(op.onboardingStep, 1), verificationToken: token },
  });
  // No setupLink in the response — this call already sets emailVerified, so the
  // operator does not need the link, and returning it would hand the caller a
  // token that can mark operators verified. (Corrected in MP-2c: it does NOT
  // grant a session; see the note at the top of this file.)
  return NextResponse.json({ email, verified: true });
}

// BRAIN-1a: vouching for an operator's email grants access — said with a reason.
export const POST = withAudit(verifyOperator, body => ({ action: 'verify_operator', targetType: 'operator', targetId: String(body.email ?? '') }));
