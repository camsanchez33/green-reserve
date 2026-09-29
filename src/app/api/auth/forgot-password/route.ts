import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { sendOperatorPasswordResetEmail } from '@/lib/email';
import { signStaffResetToken } from '@/lib/auth';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';

// RV-1 (review 2026-09-29): this had no rate limit, so anyone could loop a
// victim's address and flood their inbox; and a known email whose send failed
// answered 500 while an unknown one answered 200 — an account oracle. Now:
// capped per IP and per email, and every lookup + send happens in after(), so
// the response is the same, in status and in timing, whether or not an account
// exists. The cost: a failed send is logged, not shown — the person sees the
// usual "check your email" and can simply ask again.
const SUCCESS = () => NextResponse.json({ success: true });

async function sendReset(email: string) {
  const operator = await prisma.courseOperator.findUnique({ where: { email } });
  if (operator) {
    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.courseOperator.update({ where: { id: operator.id }, data: { resetToken, resetTokenExpiry } });
    await sendOperatorPasswordResetEmail({
      operatorName: operator.name,
      operatorEmail: operator.email,
      resetLink: `${process.env.NEXT_PUBLIC_URL}/dashboard/reset-password?token=${resetToken}`,
    });
    return;
  }
  // SD-9c: tee-sheet staff log in on the same form, so they reset here too.
  const staff = await prisma.courseStaff.findUnique({ where: { email } });
  if (staff?.active) {
    await sendOperatorPasswordResetEmail({
      operatorName: staff.name,
      operatorEmail: staff.email,
      resetLink: `${process.env.NEXT_PUBLIC_URL}/dashboard/reset-password?token=${encodeURIComponent(await signStaffResetToken(staff))}`,
    });
  }
}

export async function POST(req: NextRequest) {
  let rawEmail: unknown;
  try { ({ email: rawEmail } = await req.json()); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!rawEmail || typeof rawEmail !== 'string') return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  const email = rawEmail.trim().toLowerCase();

  // Per connection: says nothing about any account, so it may say no.
  if (!(await rateLimit(`pwreset:ip:${evidentiaryIp(req)}`, 10, 3600))) {
    return NextResponse.json({ error: 'Too many reset requests from this connection — try again in an hour.' }, { status: 429 });
  }
  // Per address: over the cap, answer exactly as if we sent — a different
  // answer here would itself reveal that the address was being targeted.
  if (!(await rateLimit(`pwreset:email:${email}`, 3, 3600))) return SUCCESS();

  after(sendReset(email).catch(err => console.error('Password reset email failed:', err)));
  return SUCCESS();
}
