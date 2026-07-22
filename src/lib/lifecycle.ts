import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

type TxOp = Prisma.PrismaPromise<unknown>;

// LIFECYCLE PARITY LAW (RUN_QUEUE) — a linked pair (CourseInquiry.builtCourseId
// <-> Course) shares one fate. This is the ONLY place that moves a pair
// between archived/live/deleted — /admin/inquiries* and /admin/courses* both
// call these functions instead of mutating lifecycle state themselves.

export const PIPELINE_STATUSES = ['pending', 'in_review', 'details_requested', 'details_submitted', 'building', 'live'];

export interface LifecycleResult {
  ok: boolean;
  error?: string;
  hasHistory?: boolean;
  changed: string[]; // human-readable list of what moved, for confirm-modal blast radius + the reconciliation sweep report
}

export async function archivePair(courseId: string, adminName: string): Promise<LifecycleResult> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, archivedAt: true } });
  if (!course) return { ok: false, error: 'Course not found', changed: [] };
  if (course.archivedAt) return { ok: true, changed: [] }; // idempotent — already archived

  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
  const now = new Date();
  const changed = ['course'];

  const ops: TxOp[] = [
    prisma.course.update({ where: { id: courseId }, data: { archivedAt: now, archivedBy: adminName, active: false, liveStatus: 'draft' } }),
  ];
  if (inquiry && PIPELINE_STATUSES.includes(inquiry.status)) {
    ops.push(
      prisma.inquiryStatusEvent.create({
        data: { inquiryId: inquiry.id, fromStatus: inquiry.status, toStatus: 'archived', trigger: 'system', actorName: `Course archived by ${adminName}` },
      }),
      prisma.courseInquiry.update({ where: { id: inquiry.id }, data: { status: 'archived' } }),
    );
    changed.push('inquiry');
  }
  await prisma.$transaction(ops);
  return { ok: true, changed };
}

export async function restorePair(courseId: string, adminName: string): Promise<LifecycleResult> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, archivedAt: true } });
  if (!course) return { ok: false, error: 'Course not found', changed: [] };
  if (!course.archivedAt) return { ok: true, changed: [] }; // idempotent — already live/not archived

  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
  const changed = ['course'];

  const ops: TxOp[] = [
    prisma.course.update({ where: { id: courseId }, data: { archivedAt: null, archivedBy: null } }),
  ];
  if (inquiry && inquiry.status === 'archived') {
    ops.push(
      prisma.inquiryStatusEvent.create({
        data: { inquiryId: inquiry.id, fromStatus: 'archived', toStatus: 'live', trigger: 'system', actorName: `Course restored by ${adminName}` },
      }),
      prisma.courseInquiry.update({ where: { id: inquiry.id }, data: { status: 'live' } }),
    );
    changed.push('inquiry');
  }
  await prisma.$transaction(ops);
  return { ok: true, changed };
}

// Permanent delete — course side. NO LONGER reachable from the admin UI or
// any API route (DELETION DOCTRINE — courses are archive-only from there);
// kept here only for a deliberate owner-run pre-launch test-data cleanup
// script to import directly. Requires the course already archived (an
// explicit, reversible step first) and a typed name match — trimmed +
// case-insensitive (item 3's fix; this previously compared the raw typed
// string against course.name with no normalization, and callers were
// prompting against a DIFFERENT field — CourseInquiry.courseName — which
// diverges the moment a course is renamed post-build. That's what made
// "name does not match" fire even when the admin typed it correctly).
// The payment-history guard applies to the PAIR: if the course has payment
// history, nothing is deleted (archive is as far as it goes), same reason
// returned regardless of which caller attempted it.
export async function deletePair(courseId: string, confirmName: string, adminName: string): Promise<LifecycleResult> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, operatorId: true, archivedAt: true } });
  if (!course) return { ok: false, error: 'Course not found', changed: [] };
  if (!course.archivedAt) return { ok: false, error: 'Course must be archived before permanent deletion', changed: [] };
  if (!confirmName || confirmName.trim().toLowerCase() !== course.name.trim().toLowerCase()) {
    return { ok: false, error: `Name does not match — expected "${course.name}"`, changed: [] };
  }

  const [bookingCount, paidMemberCount] = await Promise.all([
    prisma.booking.count({ where: { courseId } }),
    prisma.courseMembership.count({ where: { courseId, paymentStatus: { in: ['paid', 'paid_offline'] } } }),
  ]);
  if (bookingCount > 0 || paidMemberCount > 0) {
    return {
      ok: false, hasHistory: true, changed: [],
      error: 'This course has payment history and can only be archived, not permanently deleted.',
    };
  }

  const linked = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId } });
  const changed = ['course'];

  // Operator login only dies if this was their ONLY course (V9 rule: never
  // strand a multi-course operator's login by deleting one of their courses).
  let deleteOperatorId: string | null = null;
  if (course.operatorId) {
    const otherCourses = await prisma.course.count({ where: { operatorId: course.operatorId, id: { not: courseId } } });
    if (otherCourses === 0) deleteOperatorId = course.operatorId;
  }

  const ops: TxOp[] = [];
  if (linked) {
    ops.push(
      prisma.inquiryStatusEvent.create({
        data: { inquiryId: linked.id, fromStatus: linked.status, toStatus: 'archived', trigger: 'system', actorName: `Course permanently deleted by ${adminName}` },
      }),
      prisma.courseInquiry.update({ where: { id: linked.id }, data: { builtCourseId: null, status: 'archived' } }),
    );
    changed.push('inquiry');
  }
  ops.push(
    prisma.booking.deleteMany({ where: { courseId } }),
    prisma.teeTime.deleteMany({ where: { courseId } }),
    prisma.teeSet.deleteMany({ where: { courseId } }),
    prisma.teeTimeSchedule.deleteMany({ where: { courseId } }),
    prisma.blackout.deleteMany({ where: { courseId } }),
    prisma.teeTimeAlert.deleteMany({ where: { courseId } }),
    prisma.courseMembership.deleteMany({ where: { courseId } }),
    prisma.membershipTier.deleteMany({ where: { courseId } }),
    prisma.courseStaff.deleteMany({ where: { courseId } }),
    prisma.course.delete({ where: { id: courseId } }),
  );
  if (deleteOperatorId) {
    ops.push(prisma.courseOperator.delete({ where: { id: deleteOperatorId } }));
    changed.push('operator login');
  }

  await prisma.$transaction(ops);
  return { ok: true, changed };
}

// Inquiry-initiated delete. Unlinked inquiries (never built, or the course
// side was already deleted) just delete the row — small blast radius, no
// typed confirm required by this function (the caller's modal matches the
// UI to the blast radius). A LINKED inquiry routes through the exact same
// deletePair the courses tab uses — archiving first if needed — so a
// "delete inquiry" click can never leave an orphaned live course behind.
export async function deleteInquiryOrPair(inquiryId: string, confirmName: string | null, adminName: string): Promise<LifecycleResult> {
  const inquiry = await prisma.courseInquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) return { ok: false, error: 'Inquiry not found', changed: [] };

  // DELETION DOCTRINE (RUN_QUEUE) — anything that ever became a course is
  // never permanently deleted, from the courses surface OR from here. A
  // built inquiry (builtCourseId ever set, even if the course row is now
  // stale/orphaned — that's the ORPHAN SWEEP's job, not a casual delete
  // click's) can only be archived. Enforced here at the API/lib level, not
  // just by hiding the button — the same guarantee the courses tab's
  // archive-course route now provides for course-side deletion.
  if (inquiry.builtCourseId) {
    return { ok: false, error: 'This inquiry became a course — courses are archived, never deleted. Archive it instead.', changed: [] };
  }

  // Typed-confirm, same as every other permanent delete (item 3's fix):
  // trimmed + case-insensitive, compared against THIS row's own courseName
  // (no cross-entity divergence risk since there's no linked Course here).
  const typed = (confirmName ?? '').trim().toLowerCase();
  const expected = inquiry.courseName.trim().toLowerCase();
  if (typed !== expected) {
    return { ok: false, error: `Name does not match — expected "${inquiry.courseName}"`, changed: [] };
  }

  await prisma.courseInquiry.delete({ where: { id: inquiryId } });
  return { ok: true, changed: ['inquiry'] };
}

// One-time reconciliation sweep (RUN_QUEUE item 6.6) — finds existing
// mismatched pairs (archived course + non-archived inquiry, or vice versa)
// and brings them into parity. Returns exactly what it changed so a run can
// print the list rather than silently rewriting history.
export async function reconcileLifecyclePairs(adminName: string): Promise<{ id: string; courseId: string; action: string }[]> {
  const pairs = await prisma.courseInquiry.findMany({
    where: { builtCourseId: { not: null } },
    select: { id: true, courseName: true, status: true, builtCourseId: true },
  });
  const courseIds = pairs.map(p => p.builtCourseId as string);
  const courses = await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, archivedAt: true } });
  const courseById = new Map(courses.map(c => [c.id, c]));

  const report: { id: string; courseId: string; action: string }[] = [];
  for (const pair of pairs) {
    const course = courseById.get(pair.builtCourseId as string);
    if (!course) continue; // orphaned builtCourseId — not this sweep's job, would need manual review
    const courseArchived = !!course.archivedAt;
    const inquiryArchived = pair.status === 'archived';
    if (courseArchived && !inquiryArchived && PIPELINE_STATUSES.includes(pair.status)) {
      await prisma.$transaction([
        prisma.inquiryStatusEvent.create({
          data: { inquiryId: pair.id, fromStatus: pair.status, toStatus: 'archived', trigger: 'system', actorName: `Reconciled by ${adminName} (course was archived, inquiry wasn't)` },
        }),
        prisma.courseInquiry.update({ where: { id: pair.id }, data: { status: 'archived' } }),
      ]);
      report.push({ id: pair.id, courseId: pair.builtCourseId as string, action: `inquiry "${pair.courseName}" archived to match its already-archived course` });
    } else if (!courseArchived && inquiryArchived) {
      await prisma.$transaction([
        prisma.inquiryStatusEvent.create({
          data: { inquiryId: pair.id, fromStatus: 'archived', toStatus: 'live', trigger: 'system', actorName: `Reconciled by ${adminName} (inquiry was archived, course wasn't)` },
        }),
        prisma.courseInquiry.update({ where: { id: pair.id }, data: { status: 'live' } }),
      ]);
      report.push({ id: pair.id, courseId: pair.builtCourseId as string, action: `inquiry "${pair.courseName}" restored to live to match its non-archived course` });
    }
  }
  return report;
}
