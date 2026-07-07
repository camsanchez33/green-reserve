import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';
import { Resend } from 'resend';

export async function POST(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staffId } = await req.json();
  if (!staffId) return NextResponse.json({ error: 'Missing staffId' }, { status: 400 });

  const staff = await prisma.courseStaff.findUnique({
    where: { id: staffId },
    include: { course: { select: { name: true } } },
  });
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const loginUrl = `${process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app'}/dashboard/login`;

  await resend.emails.send({
    from: 'GreenReserve <hello@greenreserve.app>',
    to: staff.email,
    subject: `Your GreenReserve staff login — ${staff.course?.name ?? ''}`,
    html: `<p>Hi ${staff.name},</p><p>Here is your dashboard login link:</p><p><a href="${loginUrl}">${loginUrl}</a></p><p>Your login email: <strong>${staff.email}</strong></p><p>If you&apos;ve forgotten your password, use the reset link on the login page.</p>`,
  });

  return NextResponse.json({ success: true });
}
