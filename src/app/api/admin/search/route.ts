import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, MANAGER_PLUS } from '@/lib/admin-session';

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q || q.length < 1) return NextResponse.json({ results: [] });

  const isSupportPlus = requireRole(session, SUPPORT_PLUS);
  const isManagerPlus = requireRole(session, MANAGER_PLUS);

  const lq = q.toLowerCase();

  const [courses, inquiries, golfers, employees] = await Promise.all([
    prisma.course.findMany({
      where: {
        archivedAt: null,
        OR: [
          { name: { contains: lq, mode: 'insensitive' } },
          { slug: { contains: lq, mode: 'insensitive' } },
          { city: { contains: lq, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, slug: true, city: true, state: true, active: true },
      take: 5,
      orderBy: { name: 'asc' },
    }),
    prisma.courseInquiry.findMany({
      where: {
        OR: [
          { courseName: { contains: lq, mode: 'insensitive' } },
          { contactName: { contains: lq, mode: 'insensitive' } },
          { email: { contains: lq, mode: 'insensitive' } },
        ],
      },
      select: { id: true, courseName: true, contactName: true, status: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
    }),
    isSupportPlus
      ? prisma.golferAccount.findMany({
          where: {
            OR: [
              { email: { contains: lq, mode: 'insensitive' } },
              { firstName: { contains: lq, mode: 'insensitive' } },
              { lastName: { contains: lq, mode: 'insensitive' } },
            ],
          },
          select: { id: true, email: true, firstName: true, lastName: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    isManagerPlus
      ? prisma.adminUser.findMany({
          where: {
            active: true,
            OR: [
              { name: { contains: lq, mode: 'insensitive' } },
              { email: { contains: lq, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, email: true, role: true },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  // Static nav items filtered by role
  const staticNav = [
    { id: 'nav:overview',    label: 'Overview',   href: '/admin',            always: true },
    { id: 'nav:inquiries',   label: 'Inquiries',  href: '/admin/inquiries',  always: true },
    { id: 'nav:courses',     label: 'Courses',    href: '/admin/courses',    always: true },
    { id: 'nav:messages',    label: 'Messages',   href: '/admin/messages',   always: true },
    { id: 'nav:revenue',     label: 'Revenue',    href: '/admin/revenue',    support: true },
    { id: 'nav:golfers',     label: 'Golfers',    href: '/admin/golfers',    support: true },
    { id: 'nav:employees',   label: 'Employees',  href: '/admin/employees',  manager: true },
    { id: 'nav:broadcasts',  label: 'Broadcasts', href: '/admin/broadcasts', always: true },
    { id: 'nav:activity',    label: 'Activity',   href: '/admin/activity',   always: true },
    { id: 'nav:profile',     label: 'My profile', href: '/admin/profile',    always: true },
    { id: 'nav:create',      label: 'Manual build', href: '/admin/create',   manager: true },
  ].filter(n => {
    if (n.always) return true;
    if (n.support && isSupportPlus) return true;
    if (n.manager && isManagerPlus) return true;
    return false;
  }).filter(n => n.label.toLowerCase().includes(lq));

  type ResultItem =
    | { type: 'course'; id: string; label: string; sub: string; href: string }
    | { type: 'inquiry'; id: string; label: string; sub: string; href: string }
    | { type: 'golfer'; id: string; label: string; sub: string; href: string }
    | { type: 'employee'; id: string; label: string; sub: string; href: string }
    | { type: 'nav'; id: string; label: string; sub: string; href: string };

  const results: ResultItem[] = [
    ...courses.map(c => ({
      type: 'course' as const,
      id: c.id,
      label: c.name,
      sub: [c.city, c.state].filter(Boolean).join(', ') + (c.active ? '' : ' · inactive'),
      href: `/admin/courses?courseId=${c.id}`,
    })),
    ...inquiries.map(i => ({
      type: 'inquiry' as const,
      id: i.id,
      label: i.courseName,
      sub: `${i.contactName} · ${i.status}`,
      href: `/admin/inquiries/${i.id}`,
    })),
    ...(Array.isArray(golfers) ? golfers : []).map(g => ({
      type: 'golfer' as const,
      id: g.id,
      label: `${g.firstName} ${g.lastName}`,
      sub: g.email,
      href: `/admin/golfers?id=${g.id}`,
    })),
    ...(Array.isArray(employees) ? employees : []).map(e => ({
      type: 'employee' as const,
      id: e.id,
      label: e.name,
      sub: `${e.role} · ${e.email}`,
      href: '/admin/employees',
    })),
    ...staticNav.map(n => ({
      type: 'nav' as const,
      id: n.id,
      label: n.label,
      sub: 'Go to page',
      href: n.href,
    })),
  ];

  return NextResponse.json({ results });
}
