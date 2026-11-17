// Inquiries data (Cam 2026-11-17): one course in outreach.
//   GET    the course page: facts, contacts (decision maker first), Email 1–3, calls, touches, notes, history.
//   PATCH  { facts } — edit the course facts (only the keys sent change).
//   POST   { action: 'said_yes', email? }            hand it to Onboarding (lead → in_review)
//          { action: 'not_now', recheckAt?, note? }  close it as Not now, with a recheck date
// Snooze, notes, logging a touch and the Cal.com link stay on PATCH /api/admin/inquiries (snooze, add_note,
// add_touch, calcom_link), which all work on a course in outreach.
// Pipeline area; GET viewer+ (emails and phones support+), writes manager+, each audited.
import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, areaGate } from '@/lib/admin-session';
import { outreachCourse, updateFacts, saidYes, notNow } from '@/lib/outreach-server';
import { auditAdmin } from '@/lib/admin-audit';
import { signedOut, outreachRole, viewerOf, failRes, readJson } from '../gate';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, false);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  const { id } = await params;
  const course = await outreachCourse(id, g.viewer);
  if (!course) return NextResponse.json({ error: 'That course is not on the list any more.' }, { status: 404 });
  return NextResponse.json(course);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, true);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  const { id } = await params;
  const body = await readJson(req);
  if (!body || !body.facts || typeof body.facts !== 'object') return NextResponse.json({ error: 'Send the facts to change.' }, { status: 400 });
  const r = await updateFacts(id, body.facts as Record<string, unknown>);
  if (!r.ok) return failRes(r);
  await auditAdmin(g.session, { action: 'outreach_facts_edit', targetType: 'inquiry', targetId: id, before: r.before, after: r.after });
  return NextResponse.json({ success: true, facts: r.facts });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, true);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  const { id } = await params;
  const body = await readJson(req);
  const action = String(body?.action ?? '');
  if (action === 'said_yes') {
    const r = await saidYes(id, g.session.name || 'Admin', body?.email);
    if (!r.ok) return failRes(r);
    await auditAdmin(g.session, { action: 'outreach_said_yes', targetType: 'inquiry', targetId: id, after: { status: r.status } });
    return NextResponse.json({ success: true, status: r.status, onboarding: `/admin/onboarding?key=i:${id}` });
  }
  if (action === 'not_now') {
    const r = await notNow(id, g.session.name || 'Admin', body?.recheckAt, body?.note);
    if (!r.ok) return failRes(r);
    await auditAdmin(g.session, { action: 'outreach_not_now', targetType: 'inquiry', targetId: id, after: { status: r.status, recheckAt: r.recheckAt } });
    return NextResponse.json({ success: true, status: r.status, recheckAt: r.recheckAt });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
