import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, MANAGER_PLUS } from '@/lib/admin-session';

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2: the palette searches courses, inquiries and golfers in one query —
  // it must not be a way around the per-page role gates.
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q || q.length < 1) return NextResponse.json({ results: [] });

  const isSupportPlus = requireRole(session, SUPPORT_PLUS);
  const isManagerPlus = requireRole(session, MANAGER_PLUS);

  const lq = q.toLowerCase();
  const digits = q.replace(/\D/g, '');

  // AW-3: a booking id pasted from an email or a check-in link (whole, or the first 8+ characters).
  const idLike = /^[a-z0-9]{8,40}$/i.test(q) ? q.toLowerCase() : '';

  const [courses, inquiries, golfers, guests, employees, groups, threads, bookings] = await Promise.all([
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
              ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
            ],
          },
          select: { id: true, email: true, firstName: true, lastName: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    // MP-6d: guest bookings (no account) — most support calls are about these.
    isSupportPlus
      ? prisma.booking.findMany({
          where: {
            golferAccountId: null,
            OR: [
              { golferEmail: { contains: lq, mode: 'insensitive' } },
              { golferName: { contains: lq, mode: 'insensitive' } },
              ...(digits.length >= 4 ? [{ golferPhone: { contains: digits } }] : []),
            ],
          },
          select: { golferName: true, golferEmail: true, course: { select: { name: true } }, teeTime: { select: { date: true } } },
          take: 8,
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
    prisma.courseGroup.findMany({
      where: { OR: [{ name: { contains: lq, mode: 'insensitive' } }, { slug: { contains: lq, mode: 'insensitive' } }] },
      select: { id: true, name: true, slug: true, _count: { select: { courses: true } } },
      take: 3,
    }),
    // AW-3: a word from a conversation with a course finds the conversation.
    lq.length >= 3
      ? prisma.messageThread.findMany({
          where: { messages: { some: { body: { contains: lq, mode: 'insensitive' } } } },
          select: { courseId: true, course: { select: { name: true } }, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 3,
        })
      : Promise.resolve([]),
    idLike
      ? prisma.booking.findMany({
          where: { id: { startsWith: idLike } },
          select: { id: true, golferName: true, golferEmail: true, golferAccountId: true, status: true, course: { select: { name: true } }, teeTime: { select: { date: true, time: true } } },
          take: 3,
        })
      : Promise.resolve([]),
  ]);

  // Static nav items filtered by role
  const staticNav = [
    { id: 'nav:overview',    label: 'Today',         href: '/admin',            always: true },
    { id: 'nav:goals',       label: 'Goals',         href: '/admin/goals',      support: true },
    { id: 'nav:inquiries',   label: 'Inquiries',     href: '/admin/inquiries',  always: true },
    { id: 'nav:courses',     label: 'Courses',       href: '/admin/courses',    always: true },
    { id: 'nav:groups',      label: 'Course groups', href: '/admin/groups',     always: true },
    { id: 'nav:messages',    label: 'Messages',      href: '/admin/messages',   always: true },
    { id: 'nav:revenue',     label: 'Money',         href: '/admin/revenue',    support: true },
    { id: 'nav:golfers',     label: 'Golfer lookup', href: '/admin/golfers',    support: true },
    { id: 'nav:employees',   label: 'Employees',     href: '/admin/employees',  manager: true },
    { id: 'nav:broadcasts',  label: 'Announcements', href: '/admin/announcements', support: true },
    { id: 'nav:system',      label: 'Health',        href: '/admin/system',     manager: true },
    { id: 'nav:activity',    label: 'Activity',      href: '/admin/activity',   always: true },
    { id: 'nav:profile',     label: 'My profile',    href: '/admin/profile',    always: true },
    { id: 'nav:create',      label: 'Manual build',  href: '/admin/create',     manager: true },
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
    | { type: 'guest'; id: string; label: string; sub: string; href: string }
    | { type: 'employee'; id: string; label: string; sub: string; href: string }
    | { type: 'group'; id: string; label: string; sub: string; href: string }
    | { type: 'thread'; id: string; label: string; sub: string; href: string }
    | { type: 'booking'; id: string; label: string; sub: string; href: string }
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
    // one row per guest email, not per booking
    ...[...new Map((Array.isArray(guests) ? guests : []).map(g => [g.golferEmail.toLowerCase(), g])).values()].map(g => ({
      type: 'guest' as const,
      id: g.golferEmail.toLowerCase(),
      label: g.golferName,
      sub: `${g.golferEmail} · guest · last ${g.course.name} ${g.teeTime.date}`,
      href: `/admin/golfers?guest=${encodeURIComponent(g.golferEmail.toLowerCase())}`,
    })),
    ...(Array.isArray(employees) ? employees : []).map(e => ({
      type: 'employee' as const,
      id: e.id,
      label: e.name,
      sub: `${e.role} · ${e.email}`,
      href: '/admin/employees',
    })),
    ...bookings.map(b => ({
      type: 'booking' as const,
      id: `booking:${b.id}`,
      label: `${b.golferName} · ${b.course.name}`,
      sub: `${b.teeTime.date} ${b.teeTime.time} · ${b.status}`,
      href: b.golferAccountId ? `/admin/golfers?id=${b.golferAccountId}` : `/admin/golfers?guest=${encodeURIComponent(b.golferEmail.toLowerCase())}`,
    })),
    ...groups.map(g => ({
      type: 'group' as const,
      id: `group:${g.id}`,
      label: g.name,
      sub: `${g._count.courses} course${g._count.courses === 1 ? '' : 's'} · /g/${g.slug}`,
      href: '/admin/groups',
    })),
    ...(Array.isArray(threads) ? threads : []).map(t => ({
      type: 'thread' as const,
      id: `thread:${t.courseId}`,
      label: `Messages with ${t.course.name}`,
      sub: 'Mentions your search',
      href: `/admin/messages?courseId=${t.courseId}`,
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
