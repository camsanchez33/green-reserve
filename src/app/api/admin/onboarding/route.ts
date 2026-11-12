import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, VIEWER_PLUS, SUPPORT_PLUS, MANAGER_PLUS, areaGate } from '@/lib/admin-session';
import { stageEnteredAt, daysSince } from '@/lib/inquiry-status';
import { latestPageDecision } from '@/lib/change-requests';
import { coursePageDecision, getApprovalState } from '@/lib/approval-state';
import { hasSetUp } from '@/lib/operator-setup';
import { courseStatus } from '../courses/directory/status';
import { STAGES, BY_HAND_STAGE, stageName, needOf, isOverdue, compareRows, checklist, inquiryNext, historyLine, OVERDUE_DAYS, type StepFacts } from './plan';

// ADMIN-REDO page 3 — Onboarding (Cam approved the mockup 2026-11-12). READ-ONLY.
// Every course from its first inquiry until it goes live, sorted by what it needs (plan.ts), and one course's
// profile (?key=i:<inquiryId> or c:<courseId>). Nothing here is estimated: days are counted from the stage
// ledger, and every checklist step is a field the product already keeps.
//
// Who sees what (AW-11): the Pipeline area, viewer+ (as GET /api/admin/inquiries).
//   contact, notes   support+ (Golf Courses' rule), else null
//   canNote          manager+ — the note is saved by PATCH /api/admin/inquiries (add_note), which is manager+
//   canBookCall      manager+ — "Book on Cal.com" is that route's calcom_link
//
// ONE HOME PER COURSE: an inquiry whose built course has gone live (or was archived) is not listed; it is on Golf
// Courses. Every course that has never been live is listed: through its open inquiry, or on its own (built by
// hand, or its inquiry was closed) — so no course is ever on neither page.

const ONBOARDING_STATUSES = STAGES.map(s => s[0]) as string[];
const AFTER_SHEET = ['details_submitted', 'building'];

type CourseFacts = {
  id: string; name: string; city: string; state: string; isTest: boolean; createdAt: Date; archivedAt: Date | null;
  active: boolean; liveStatus: string; firstWentLiveAt: Date | null; welcomeEmailSentAt: Date | null;
  stripeAccountActive: boolean; pageDecision: string | null; adminNotes: string;
  operator: { lastLoginAt: Date | null } | null;
};

async function loadList(now: Date) {
  const inquiries = await prisma.courseInquiry.findMany({
    where: { status: { in: ONBOARDING_STATUSES } },
    select: {
      id: true, courseName: true, city: true, state: true, status: true, createdAt: true, snoozeUntil: true,
      nextFollowUpAt: true, callInviteSentAt: true, callSkippedReason: true, builtCourseId: true,
      events: { select: { fromStatus: true, toStatus: true, actorName: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      calls: { where: { kind: 'discovery' }, select: { scheduledAt: true, outcome: true, bookedByCourse: true } },
    },
  });
  const builtIds = inquiries.map(i => i.builtCourseId).filter((x): x is string => !!x);
  const courses: CourseFacts[] = await prisma.course.findMany({
    // Courses an open inquiry built, and every course that has never been live (courseStatus decides below).
    where: { OR: [{ id: { in: builtIds } }, { archivedAt: null, firstWentLiveAt: null, welcomeEmailSentAt: null }] },
    select: {
      id: true, name: true, city: true, state: true, isTest: true, createdAt: true, archivedAt: true, active: true, liveStatus: true,
      firstWentLiveAt: true, welcomeEmailSentAt: true, stripeAccountActive: true, pageDecision: true, adminNotes: true,
      operator: { select: { lastLoginAt: true } },
    },
  });
  const onboarding = (c: CourseFacts) => courseStatus(c, null, now) === 'onboarding';
  const byId = new Map(courses.map(c => [c.id, c]));
  const ids = courses.map(c => c.id);
  const [schedules, agreements, linked] = await Promise.all([
    prisma.teeTimeSchedule.groupBy({ by: ['courseId'], where: { courseId: { in: ids } }, _count: { id: true } }),
    prisma.agreementAcceptance.groupBy({ by: ['courseId'], where: { courseId: { in: ids }, document: 'operator_agreement' }, _count: { id: true } }),
    // Any inquiry (open or closed) a never-live course came from — for its Inquiry → link.
    prisma.courseInquiry.findMany({ where: { builtCourseId: { in: ids } }, select: { id: true, builtCourseId: true, status: true }, orderBy: { createdAt: 'desc' } }),
  ]);
  const hasSchedule = new Set(schedules.map(s => s.courseId));
  const signed = new Set(agreements.map(a => a.courseId));
  const facts = (c: CourseFacts | undefined, approved: boolean, infoIn: boolean): StepFacts => ({
    infoIn: infoIn || !!c, built: !!c, schedule: !!c && hasSchedule.has(c.id), approved: !!c && approved,
    // Signed in at least once (operator-setup's hasSetUp): create-course sets emailVerified before any password exists.
    login: !!c?.operator && hasSetUp(c.operator), agreement: !!c && signed.has(c.id), stripe: !!c?.stripeAccountActive, live: false,
  });

  const rows = [];
  const listedCourses = new Set<string>();
  for (const inq of inquiries) {
    const c = inq.builtCourseId ? byId.get(inq.builtCourseId) : undefined;
    if (c && (c.archivedAt || !onboarding(c))) continue; // live (Golf Courses) or archived — not onboarding
    if (c) listedCourses.add(c.id);
    const steps = checklist(facts(c, latestPageDecision(inq.events) === 'approved', AFTER_SHEET.includes(inq.status)));
    const snoozed = !!inq.snoozeUntil && inq.snoozeUntil.getTime() > now.getTime();
    rows.push({
      key: `i:${inq.id}`, inquiryId: inq.id, courseId: c?.id ?? null,
      name: inq.courseName, town: [inq.city, inq.state].filter(Boolean).join(', '), isTest: !!c?.isTest,
      status: inq.status, stage: stageName(inq.status), need: needOf(inq.status),
      daysWaiting: daysSince(stageEnteredAt(inq.status, inq.createdAt, inq.events), now), snoozed,
      next: inquiryNext(inq, now), steps,
    });
  }
  const inquiryOf = new Map<string, string>();
  for (const l of linked) if (l.builtCourseId && !inquiryOf.has(l.builtCourseId)) inquiryOf.set(l.builtCourseId, l.id);
  for (const c of courses) {
    if (listedCourses.has(c.id) || c.archivedAt || !onboarding(c)) continue;
    const inquiryId = inquiryOf.get(c.id) ?? null;
    const approved = inquiryId ? (await getApprovalState(c.id)).status === 'approved' : coursePageDecision(c.pageDecision) === 'approved';
    const steps = checklist(facts(c, approved, true));
    rows.push({
      key: `c:${c.id}`, inquiryId, courseId: c.id,
      name: c.name, town: [c.city, c.state].filter(Boolean).join(', '), isTest: c.isTest,
      status: null, stage: inquiryId ? stageName('building') : BY_HAND_STAGE, need: needOf(null),
      daysWaiting: daysSince(c.createdAt, now), snoozed: false,
      next: steps.todo ?? 'Make the course live', steps,
    });
  }
  rows.sort(compareRows);
  return rows.map(r => ({ ...r, overdue: isOverdue(r) }));
}

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  if (!requireRole(session, VIEWER_PLUS)) return NextResponse.json({ error: "Your login can't open onboarding." }, { status: 403 });
  const support = requireRole(session, SUPPORT_PLUS);
  const manager = requireRole(session, MANAGER_PLUS);
  const now = new Date();
  const rows = await loadList(now);
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ at: now.toISOString(), overdueDays: OVERDUE_DAYS, support, rows });

  const row = rows.find(r => r.key === key);
  if (!row) return NextResponse.json({ error: 'This course is no longer onboarding. If it went live, it is on Golf courses.' }, { status: 404 });
  const [inq, course, agreement] = await Promise.all([
    row.inquiryId ? prisma.courseInquiry.findUnique({
      where: { id: row.inquiryId },
      select: {
        contactName: true, contactTitle: true, email: true, phone: true, source: true, adminNotes: true, createdAt: true, status: true,
        events: { select: { fromStatus: true, toStatus: true, actorName: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
        calls: { where: { kind: 'discovery' }, select: { outcome: true } },
      },
    }) : null,
    row.courseId ? prisma.course.findUnique({ where: { id: row.courseId }, select: { adminNotes: true, createdAt: true, phone: true, operator: { select: { name: true, email: true, phone: true } } } }) : null,
    row.courseId ? prisma.agreementAcceptance.findFirst({ where: { courseId: row.courseId, document: 'operator_agreement' }, orderBy: { acceptedAt: 'desc' }, select: { version: true, acceptedAt: true } }) : null,
  ]);
  const history = inq
    ? [...inq.events.flatMap(e => { const h = historyLine(e, support); return h ? [{ at: e.createdAt.toISOString(), ...h }] : []; }).slice(0, 39),
       { at: inq.createdAt.toISOString(), text: 'Inquiry received', detail: support && inq.source ? `From ${inq.source}` : null }]
    : course ? [{ at: course.createdAt.toISOString(), text: 'Course built by hand', detail: null }] : [];
  // "Book on Cal.com" before the demo: a new or reviewing inquiry with no call talked through yet.
  const beforeDemo = !!inq && (inq.status === 'pending' || inq.status === 'in_review') && !inq.calls.some(c => c.outcome === 'talked');
  return NextResponse.json({
    ...row,
    contact: support ? (inq
      ? { name: inq.contactName, title: inq.contactTitle || null, email: inq.email || null, phone: inq.phone || null }
      : { name: course?.operator?.name ?? null, title: 'Owner', email: course?.operator?.email ?? null, phone: course?.operator?.phone || course?.phone || null }) : null,
    source: inq ? inq.source ?? null : 'Built by hand',
    agreement: agreement ? { version: agreement.version, signedAt: agreement.acceptedAt.toISOString() } : null,
    history,
    notes: support ? (inq ? inq.adminNotes : course?.adminNotes ?? '') : null,
    canNote: manager && !!inq,
    canBookCall: manager && beforeDemo,
  });
}
