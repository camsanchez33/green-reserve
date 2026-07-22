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

// Inquiry-initiated delete. UNBUILT inquiries only — DELETION DOCTRINE
// (RUN_QUEUE) means a linked inquiry is archive-only from here on, refused
// outright below rather than cascading into a course delete the way this
// used to.
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

export const ORPHAN_FLAG = '[ORPHAN] No linked inquiry — predates the deletion doctrine, orphaned by a pre-doctrine hard delete.';

export interface OrphanSweepItem {
  kind: 'course' | 'inquiry';
  id: string;
  name: string;
  action: 'deleted' | 'archived' | 'link_cleared' | 'would_delete' | 'would_archive' | 'would_clear_link';
  reason: string;
}

// ORPHAN SWEEP (RUN_QUEUE) — one-time cleanup for ghosts that predate the
// DELETION DOCTRINE (e.g. the Fake Fairways course, whose inquiry was
// deleted before this doctrine existed). Finds every course with no living
// inquiry behind it, and every inquiry pointing at a course that's gone.
// dryRun=true (the default call site is a GET) never mutates anything —
// "print the list" — the caller decides whether to actually run it.
//
// The doctrine's zero-real-history exemption is deliberately narrow: only
// orphan TEST courses with NO bookings and NO paid memberships ever are
// deleted outright, and only because they're orphans in THIS sweep (the
// doctrine still refuses casual deletes everywhere else). Anything with
// real history is archived + flagged, never deleted, no exceptions.
//
// BUG FIX (RUN_QUEUE "orphan banner loops forever"): a course that's already
// been archived + flagged is ACKNOWLEDGED — "no linked inquiry" stays true
// forever (archiving doesn't create one), so without this check the same
// course kept reappearing in `results` on every single run even though
// there was nothing left to do. Acknowledged courses are now excluded from
// the returned (actionable/nagging) list entirely; they're still reachable
// individually via forceDeleteOrphan below for an explicit owner override.
export async function sweepOrphanCourses(adminName: string, dryRun: boolean): Promise<OrphanSweepItem[]> {
  const [allCourses, linkedInquiries] = await Promise.all([
    prisma.course.findMany({ select: { id: true, name: true, archivedAt: true, adminNotes: true, operatorId: true } }),
    prisma.courseInquiry.findMany({ where: { builtCourseId: { not: null } }, select: { id: true, courseName: true, status: true, builtCourseId: true } }),
  ]);

  const linkedCourseIds = new Set(linkedInquiries.map(i => i.builtCourseId as string));
  const courseIds = new Set(allCourses.map(c => c.id));

  const orphanCourses = allCourses.filter(c => !linkedCourseIds.has(c.id));
  const deadPointerInquiries = linkedInquiries.filter(i => i.builtCourseId && !courseIds.has(i.builtCourseId));

  const results: OrphanSweepItem[] = [];

  for (const c of orphanCourses) {
    // Already acknowledged (archived + flagged by a prior run) — nothing
    // left to do passively. Stop reporting it; forceDeleteOrphan is the
    // only way to go further from here, and that's an explicit owner click.
    if (c.archivedAt && c.adminNotes.includes('[ORPHAN]')) continue;

    const [bookingCount, paidMemberCount] = await Promise.all([
      prisma.booking.count({ where: { courseId: c.id } }),
      prisma.courseMembership.count({ where: { courseId: c.id, paymentStatus: { in: ['paid', 'paid_offline'] } } }),
    ]);
    const hasHistory = bookingCount > 0 || paidMemberCount > 0;

    if (!hasHistory) {
      if (!dryRun) await hardDeleteCourseRows(c.id, c.operatorId);
      results.push({ kind: 'course', id: c.id, name: c.name, action: dryRun ? 'would_delete' : 'deleted', reason: 'orphan course, no linked inquiry, zero payment/booking history — one-time sweep cleanup' });
      continue;
    }

    if (!dryRun) {
      await prisma.course.update({
        where: { id: c.id },
        data: {
          archivedAt: c.archivedAt ?? new Date(),
          archivedBy: c.archivedAt ? undefined : `${adminName} (orphan sweep)`,
          active: false,
          liveStatus: 'draft',
          adminNotes: c.adminNotes ? `${c.adminNotes}\n${ORPHAN_FLAG}` : ORPHAN_FLAG,
        },
      });
    }
    results.push({ kind: 'course', id: c.id, name: c.name, action: dryRun ? 'would_archive' : 'archived', reason: 'orphan course with real history — archived + flagged, never deleted' });
  }

  for (const i of deadPointerInquiries) {
    if (!dryRun) {
      await prisma.$transaction([
        prisma.inquiryStatusEvent.create({
          data: { inquiryId: i.id, fromStatus: i.status, toStatus: 'archived', trigger: 'system', actorName: `${adminName} (orphan sweep — linked course no longer exists)` },
        }),
        prisma.courseInquiry.update({ where: { id: i.id }, data: { builtCourseId: null, status: 'archived' } }),
      ]);
    }
    results.push({ kind: 'inquiry', id: i.id, name: i.courseName, action: dryRun ? 'would_clear_link' : 'link_cleared', reason: 'pointed at a course that no longer exists — link cleared, inquiry archived' });
  }

  return results;
}

// Every acknowledged orphan course (already archived + flagged by a prior
// sweep) — informational only, never auto-surfaced as a "problem," but
// still individually reachable for forceDeleteOrphan below.
export async function listAcknowledgedOrphans(): Promise<{ id: string; name: string; archivedAt: string }[]> {
  const [allCourses, linkedInquiries] = await Promise.all([
    prisma.course.findMany({ where: { archivedAt: { not: null } }, select: { id: true, name: true, archivedAt: true, adminNotes: true } }),
    prisma.courseInquiry.findMany({ where: { builtCourseId: { not: null } }, select: { builtCourseId: true } }),
  ]);
  const linkedCourseIds = new Set(linkedInquiries.map(i => i.builtCourseId as string));
  return allCourses
    .filter(c => !linkedCourseIds.has(c.id) && c.adminNotes.includes('[ORPHAN]'))
    .map(c => ({ id: c.id, name: c.name, archivedAt: (c.archivedAt as Date).toISOString() }));
}

async function hardDeleteCourseRows(courseId: string, operatorId: string | null): Promise<void> {
  const ops: TxOp[] = [
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
  ];
  // Same V9 rule deletePair uses: only drop the operator login if this was
  // their sole course — never strand a multi-course operator.
  if (operatorId) {
    const otherCourses = await prisma.course.count({ where: { operatorId, id: { not: courseId } } });
    if (otherCourses === 0) ops.push(prisma.courseOperator.delete({ where: { id: operatorId } }));
  }
  await prisma.$transaction(ops);
}

export interface ForceDeleteResult {
  ok: boolean;
  error?: string;
  deleted?: { courseId: string; name: string; bookings: number; paidMemberships: number; staff: number; operatorDeleted: boolean };
}

// Owner-authorized override (RUN_QUEUE "orphan banner loops forever" —
// Cam's DaisyLinks exception): hard-deletes ONE SPECIFIC orphan course
// regardless of real history. Deliberately narrow — this is NOT a general
// "delete any course" escape hatch: it only ever operates on a course that
// is CURRENTLY an orphan (no linked inquiry, verified fresh here, not
// trusted from the caller), gated by a typed name confirm. A course with a
// real inquiry link is refused unconditionally — the doctrine's protection
// for real courses is untouched by this.
export async function forceDeleteOrphan(courseId: string, confirmName: string, adminName: string): Promise<ForceDeleteResult> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, operatorId: true } });
  if (!course) return { ok: false, error: 'Course not found' };

  const linked = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId }, select: { id: true } });
  if (linked) return { ok: false, error: 'This course has a linked inquiry — it is not an orphan, the doctrine protects it. Archive instead.' };

  if (!confirmName || confirmName.trim().toLowerCase() !== course.name.trim().toLowerCase()) {
    return { ok: false, error: `Name does not match — expected "${course.name}"` };
  }

  const [bookings, paidMemberships, staff] = await Promise.all([
    prisma.booking.count({ where: { courseId } }),
    prisma.courseMembership.count({ where: { courseId, paymentStatus: { in: ['paid', 'paid_offline'] } } }),
    prisma.courseStaff.count({ where: { courseId } }),
  ]);

  let operatorDeleted = false;
  if (course.operatorId) {
    const otherCourses = await prisma.course.count({ where: { operatorId: course.operatorId, id: { not: courseId } } });
    operatorDeleted = otherCourses === 0;
  }

  await hardDeleteCourseRows(courseId, course.operatorId);

  console.log(`[force-delete-orphan] ${adminName} permanently deleted "${course.name}" (${courseId}): ${bookings} booking(s), ${paidMemberships} paid membership(s), ${staff} staff row(s)${operatorDeleted ? ', operator login' : ''}.`);

  return { ok: true, deleted: { courseId, name: course.name, bookings, paidMemberships, staff, operatorDeleted } };
}
