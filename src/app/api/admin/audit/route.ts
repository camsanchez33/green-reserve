import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError } from '@/lib/admin-session';
import { auditLabel } from '@/lib/admin-audit';

// BRAIN-1a (Cam 2026-10-22): the owner reads every admin action — filter by
// person, action or course; newest first, 50 a page. Owner only: it names
// golfers, money and who on the team did what.
const PAGE = 50;

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const adminId = sp.get('admin') || undefined;
  const action = sp.get('action') || undefined;
  const courseId = sp.get('course') || undefined;
  const before = sp.get('before');
  const beforeAt = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined;

  const [rows, admins] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where: { adminId, action, courseId, ...(beforeAt ? { createdAt: { lt: beforeAt } } : {}) },
      orderBy: { createdAt: 'desc' }, take: PAGE + 1,
      include: { admin: { select: { name: true } } },
    }),
    prisma.adminUser.findMany({ select: { id: true, name: true, role: true, active: true }, orderBy: { name: 'asc' } }),
  ]);
  const page = rows.slice(0, PAGE);
  const courseIds = [...new Set(page.map(r => r.courseId).filter((x): x is string => !!x))];
  const courses = courseIds.length ? await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true } }) : [];
  const courseName = new Map(courses.map(c => [c.id, c.name]));

  return NextResponse.json({
    entries: page.map(r => ({
      id: r.id, at: r.createdAt.toISOString(),
      who: r.actorName || r.admin.name, adminId: r.adminId,
      // A golfer view's detail is the golfer's name, already in the label ("Viewed golfer <name>").
      action: r.action, label: auditLabel(r.action, r.detail),
      targetType: r.targetType, targetId: r.targetId,
      courseId: r.courseId, courseName: r.courseId ? courseName.get(r.courseId) ?? null : null,
      reason: r.reason, detail: r.action === 'golfer_view' ? '' : r.detail, before: r.before, after: r.after,
    })),
    next: rows.length > PAGE ? page[page.length - 1].createdAt.toISOString() : null,
    admins,
  });
}
