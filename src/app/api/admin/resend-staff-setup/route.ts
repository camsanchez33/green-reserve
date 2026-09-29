import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { Resend } from 'resend';

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { staffId } = await req.json();
  if (!staffId) return NextResponse.json({ error: 'Missing staffId' }, { status: 400 });

  const staff = await prisma.courseStaff.findUnique({
    where: { id: staffId },
    include: { course: { select: { name: true } } },
  });
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const loginUrl = `${process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app'}/dashboard/login`;

  // Awaited, and Resend's returned error checked: fired-and-forgotten this died
  // when the function froze, and Resend never throws — so the admin was told
  // "sent" either way (CLAUDE.md gotchas 6 and 7).
  const r = await resend.emails.send({
    from: 'GreenReserve <hello@greenreserve.app>',
    replyTo: 'thegreenreserve@outlook.com',
    to: staff.email,
    subject: `Your GreenReserve staff login — ${staff.course?.name ?? ''}`,
    html: `<p>Hi ${staff.name},</p><p>Here is your dashboard login link:</p><p><a href="${loginUrl}">${loginUrl}</a></p><p>Your login email: <strong>${staff.email}</strong></p><p>If you&apos;ve forgotten your password, use the reset link on the login page.</p>`,
  }).catch(err => ({ data: null, error: { message: err instanceof Error ? err.message : String(err) } }));
  if (r.error) {
    console.error('Staff setup email failed:', r.error);
    return NextResponse.json({ error: `The login email did not send (${r.error.message}). Check the address and try again.` }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
