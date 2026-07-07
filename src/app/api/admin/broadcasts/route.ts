import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';
import { sendAnnouncementEmail } from '@/lib/email';

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { dismissals: true } } },
  });

  // Look up sender names in one query
  const adminIds = [...new Set(announcements.map(a => a.sentById))];
  const admins = adminIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })
    : [];
  const adminMap = new Map(admins.map(a => [a.id, a.name]));

  const result = announcements.map(a => ({
    id: a.id,
    title: a.title,
    body: a.body,
    emailSent: a.emailSent,
    sentByName: adminMap.get(a.sentById) ?? 'Admin',
    createdAt: a.createdAt,
    dismissalCount: a._count.dismissals,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, body, sendEmail } = await req.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'Title and body are required' }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: { title: title.trim(), body: body.trim(), sentById: session.adminId },
  });

  let emailSent = false;
  let emailError = '';
  let emailCount = 0;

  if (sendEmail) {
    const operators = await prisma.courseOperator.findMany({
      where: { course: { active: true } },
      select: { email: true, name: true },
    });

    for (const op of operators) {
      try {
        await sendAnnouncementEmail({ operatorName: op.name, operatorEmail: op.email, title: title.trim(), body: body.trim() });
        emailCount++;
      } catch (e) {
        console.error('Announcement email failed for', op.email, e);
      }
    }

    emailSent = true;
    await prisma.announcement.update({ where: { id: announcement.id }, data: { emailSent: true } });
  }

  return NextResponse.json({ id: announcement.id, emailSent, emailCount, emailError });
}
