import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';

// GET deliberately removed (MP-2, ADMIN_V4 V4-2 leak). It returned EVERY
// operator's live verificationToken plus a ready-made /dashboard/verify link —
// to any admin session, with no role gate. That link logs the holder in as that
// operator, so a viewer-role employee could take over every course account on
// the platform. It had no caller anywhere in src/.

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  // credential that logs in as them.
  return NextResponse.json({ email, verified: true });
}
