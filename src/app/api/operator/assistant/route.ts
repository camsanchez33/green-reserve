import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { readAssistantSettings, readSettingsPatch, unknownLineFor } from '@/lib/assistant/settings';
import { getCourseBrief } from '@/lib/assistant/brief';
import { golferQuestionsToday } from '@/lib/assistant/caps';
import { actorFor, listNotes, saveAssistantSettings } from '@/lib/assistant/save';

// ASSIST-1 (Cam 2026-11-24): Settings → Assistant. settings.edit like the rest of Settings; the course is always the
// signed-in session's, never one named in the request. Every change is written to CourseSettingChange.
//
// GET   → { settings, unknownLineDefault, notes, knows: { staff, golfer }, golferToday }
// PATCH → { staffOn?, golferOn?, tone?, golferTopics?, unknownLine?, golferDailyLimit? } → the same shape as GET

export const dynamic = 'force-dynamic';

async function payload(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { name: true, phone: true, proShopPhone: true, timezone: true, assistantStaffOn: true, assistantGolferOn: true, assistantTone: true, assistantGolferTopics: true, assistantUnknownLine: true, assistantGolferDailyLimit: true },
  });
  if (!course) return null;
  const settings = readAssistantSettings(course);
  const [notes, staff, golfer, golferToday] = await Promise.all([
    listNotes(courseId),
    getCourseBrief(courseId, 'staff'),
    getCourseBrief(courseId, 'golfer'),
    golferQuestionsToday(courseId, course.timezone),
  ]);
  const knows = (b: typeof staff) => (b ? { sections: b.sections, builtAt: b.builtAt.toISOString() } : null);
  return {
    settings,
    unknownLineDefault: unknownLineFor({ unknownLine: '' }, course),
    notes,
    knows: { staff: knows(staff), golfer: knows(golfer) },
    golferToday,
  };
}

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'settings.edit'); if (denied) return denied;
  const out = await payload(session.courseId);
  if (!out) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'settings.edit'); if (denied) return denied;
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock;
  const input = readSettingsPatch(await req.json().catch(() => null));
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const saved = await saveAssistantSettings(session.courseId, input.data, await actorFor(session));
  if (!saved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const out = await payload(session.courseId);
  if (!out) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(out);
}
