import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { CHECKIN_AGENDA, nextCheckInAfterTalk } from '@/lib/course-checkin';
import { fmtCallTime } from '@/lib/inquiry-call';
import { logCheckInCall } from '@/lib/course-timeline';

// COURSES_SHEET_SPEC CS-1 §3 — check-in calls with a live course. Courses
// have no action-style route today (course-detail PATCH takes fields), so the
// call actions live here, shaped like the inquiry call actions in
// api/admin/inquiries: POST { courseId, action, ...payload }.
//
//   schedule_checkin   { scheduledAt, durationMin?, direction?, phone?, agenda?, agendaExtra? }
//   reschedule_checkin { callId, scheduledAt, durationMin?, direction?, phone? }
//   log_checkin        { callId, outcome: 'talked' | 'no_answer', answers?, notes?, nextCheckInAt? }
//   set_next_checkin   { at }   — bare date, no call ("GM said call in November")

const parseDate = (v: unknown): Date | null => {
  const d = typeof v === 'string' || v instanceof Date ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const adminName = session.name || 'Admin';

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const courseId = String(body.courseId ?? '');
  const action = String(body.action ?? '');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, phone: true, archivedAt: true, nextCheckInAt: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  if (action === 'schedule_checkin') {
    if (course.archivedAt) return NextResponse.json({ error: 'This course is archived — restore it before scheduling a check-in.' }, { status: 409 });
    const scheduledAt = parseDate(body.scheduledAt);
    if (!scheduledAt) return NextResponse.json({ error: 'Pick a date and time for the check-in.' }, { status: 400 });
    const durationMin = Math.max(5, Math.min(240, Number(body.durationMin) || 30));
    const direction = body.direction === 'they_call' ? 'they_call' : 'we_call';
    const agenda = Array.isArray(body.agenda)
      ? (body.agenda as unknown[]).filter((k): k is string => typeof k === 'string' && CHECKIN_AGENDA.some(a => a.key === k))
      : CHECKIN_AGENDA.map(a => a.key);
    const call = await prisma.call.create({
      data: {
        kind: 'checkin', courseId, scheduledAt, durationMin, direction,
        phone: String(body.phone ?? course.phone ?? '').slice(0, 40),
        agendaJson: JSON.stringify(agenda), agendaExtra: String(body.agendaExtra ?? '').slice(0, 2000),
        createdBy: adminName,
      },
    });
    await prisma.course.update({ where: { id: courseId }, data: { nextCheckInAt: scheduledAt } });
    await logCheckInCall(courseId, `Check-in call scheduled for ${fmtCallTime(scheduledAt)}`, adminName);
    return NextResponse.json({ success: true, call });
  }

  if (action === 'reschedule_checkin') {
    const call = await prisma.call.findUnique({ where: { id: String(body.callId ?? '') } });
    if (!call || call.courseId !== courseId || call.kind !== 'checkin') return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    const scheduledAt = parseDate(body.scheduledAt);
    if (!scheduledAt) return NextResponse.json({ error: 'Pick a date and time for the check-in.' }, { status: 400 });
    const updated = await prisma.call.update({
      where: { id: call.id },
      data: {
        scheduledAt, outcome: 'scheduled',
        durationMin: body.durationMin != null ? Math.max(5, Math.min(240, Number(body.durationMin) || call.durationMin)) : call.durationMin,
        direction: body.direction === 'they_call' ? 'they_call' : body.direction === 'we_call' ? 'we_call' : call.direction,
        phone: body.phone != null ? String(body.phone).slice(0, 40) : call.phone,
      },
    });
    await prisma.course.update({ where: { id: courseId }, data: { nextCheckInAt: scheduledAt } });
    await logCheckInCall(courseId, `Check-in call moved to ${fmtCallTime(scheduledAt)}`, adminName);
    return NextResponse.json({ success: true, call: updated });
  }

  if (action === 'log_checkin') {
    const call = await prisma.call.findUnique({ where: { id: String(body.callId ?? '') } });
    if (!call || call.courseId !== courseId || call.kind !== 'checkin') return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    const outcome = String(body.outcome ?? '');
    if (!['talked', 'no_answer'].includes(outcome)) return NextResponse.json({ error: 'Outcome must be talked or no_answer.' }, { status: 400 });
    const answersIn = body.answers && typeof body.answers === 'object' ? body.answers as Record<string, unknown> : {};
    const answers: Record<string, string> = {};
    for (const a of CHECKIN_AGENDA) { const v = answersIn[a.key]; if (typeof v === 'string' && v.trim()) answers[a.key] = v.trim().slice(0, 4000); }
    const now = new Date();
    const updated = await prisma.call.update({
      where: { id: call.id },
      data: { outcome, answersJson: JSON.stringify(answers), notes: String(body.notes ?? '').slice(0, 8000), completedAt: now },
    });
    let nextCheckInAt: Date | null = course.nextCheckInAt;
    if (outcome === 'talked') {
      // The next one: the date given, else 90 days out.
      nextCheckInAt = parseDate(body.nextCheckInAt) ?? nextCheckInAfterTalk(now);
      await prisma.course.update({ where: { id: courseId }, data: { nextCheckInAt } });
      await logCheckInCall(courseId, `Check-in call logged — talked · next ${fmtCallTime(nextCheckInAt)}`, adminName);
    } else {
      // No answer leaves the date where it was; the UI offers a reschedule.
      await logCheckInCall(courseId, 'Check-in call logged — no answer', adminName);
    }
    return NextResponse.json({ success: true, call: updated, nextCheckInAt });
  }

  if (action === 'set_next_checkin') {
    const at = parseDate(body.at);
    if (!at) return NextResponse.json({ error: 'Pick a date for the next check-in.' }, { status: 400 });
    await prisma.course.update({ where: { id: courseId }, data: { nextCheckInAt: at } });
    await logCheckInCall(courseId, `Next check-in set to ${fmtCallTime(at)}`, adminName);
    return NextResponse.json({ success: true, nextCheckInAt: at });
  }

  return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
}
