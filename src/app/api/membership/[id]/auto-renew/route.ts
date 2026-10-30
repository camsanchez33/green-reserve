import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { stopAutoRenew } from '@/lib/membership-autorenew';
import { sendAutoRenewOffEmail } from '@/lib/email';

// MEM-RENEW: the golfer turns automatic renewal off from the link in their membership emails —
// the same token-gated dues link (payToken), no login. Off only: turning it on needs the golfer
// to agree to the terms when they pay. The membership runs to its end date.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await rateLimit('membership:autorenew:' + id, 10, 300))) return NextResponse.json({ error: 'Too many attempts — wait a few minutes and try again.' }, { status: 429 });
  const { token } = await req.json().catch(() => ({})) as { token?: unknown };
  const m = await prisma.courseMembership.findUnique({ where: { id }, select: { id: true, payToken: true, autoRenew: true, inviteName: true, inviteEmail: true, expiresAt: true, tier: { select: { name: true } }, course: { select: { name: true } } } });
  if (!m || !m.payToken || typeof token !== 'string' || token !== m.payToken) return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 404 });
  if (!m.autoRenew) return NextResponse.json({ ok: true, alreadyOff: true });
  await stopAutoRenew(m.id);
  if (m.inviteEmail) {
    try { await sendAutoRenewOffEmail({ name: m.inviteName, email: m.inviteEmail, courseName: m.course.name, tierName: m.tier?.name ?? 'membership', endsOn: m.expiresAt }); }
    catch (err) { console.error(JSON.stringify({ ev: 'membership.autorenew.off_email_fail', membershipId: m.id, error: err instanceof Error ? err.message : String(err) })); }
  }
  return NextResponse.json({ ok: true });
}
