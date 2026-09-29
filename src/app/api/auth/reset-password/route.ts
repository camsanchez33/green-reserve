import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { validatePasswordStrength } from '@/lib/password';
import { sendPasswordChangedNotification } from '@/lib/email';
import { verifyStaffResetToken } from '@/lib/auth';

// SD-9c: an operator's reset token is 64 hex chars stored in a column; a staff
// member's is a signed JWT (see lib/auth.ts signStaffResetToken).
const isStaffToken = (t: string) => t.split('.').length === 3;

async function staffFromToken(token: string) {
  const staffId = await verifyStaffResetToken(token, async id =>
    (await prisma.courseStaff.findUnique({ where: { id }, select: { password: true } }))?.password ?? null);
  if (!staffId) return null;
  const staff = await prisma.courseStaff.findUnique({ where: { id: staffId } });
  return staff?.active ? staff : null;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  if (isStaffToken(token)) {
    const staff = await staffFromToken(token);
    if (!staff) return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
    return NextResponse.json({ valid: true, email: staff.email });
  }

  const operator = await prisma.courseOperator.findUnique({ where: { resetToken: token } });
  if (!operator || !operator.resetTokenExpiry || operator.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  return NextResponse.json({ valid: true, email: operator.email });
}

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const passwordError = validatePasswordStrength(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  if (isStaffToken(token)) {
    const staff = await staffFromToken(token);
    if (!staff) return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
    // The new hash changes the fingerprint, which kills this link. Clearing the
    // lockout lets a staff member who locked themselves out back in at once.
    // NOT done, and cannot be without a schema change: signing out their other
    // sessions — CourseStaff has no sessionVersion (operators do).
    // RV-2: conditional on the hash the link was issued against, so two
    // simultaneous submits of one link cannot both land — the loser matches
    // zero rows and is told the link is spent.
    const { count } = await prisma.courseStaff.updateMany({
      where: { id: staff.id, password: staff.password },
      data: { password: await bcrypt.hash(password, 12), failedLoginAttempts: 0, lockoutUntil: null },
    });
    if (count === 0) return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
    after(sendPasswordChangedNotification({ operatorName: staff.name, operatorEmail: staff.email })
      .catch(err => console.error('Password-changed notification failed:', err)));
    return NextResponse.json({ success: true });
  }

  const operator = await prisma.courseOperator.findUnique({ where: { resetToken: token } });
  if (!operator || !operator.resetTokenExpiry || operator.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.courseOperator.update({
    where: { id: operator.id },
    // SD-5: a reset signs every existing session out.
    data: { password: hashed, resetToken: null, resetTokenExpiry: null, sessionVersion: { increment: 1 } },
  });

  after(sendPasswordChangedNotification({ operatorName: operator.name, operatorEmail: operator.email })
    .catch(err => console.error('Password-changed notification failed:', err)));

  return NextResponse.json({ success: true });
}
