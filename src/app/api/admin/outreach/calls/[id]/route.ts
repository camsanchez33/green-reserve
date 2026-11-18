// Inquiries data (Cam 2026-11-17): one call.
//   GET   the prep card (time, length, how, Join and Cal.com reschedule/cancel links, who is on it, key facts),
//         the agenda from inquiry-call.ts AGENDA with a note per item, and the outcome.
//   POST  { action: 'save_notes', agendaNotes?: { [agendaKey]: string }, notes? }
//         { action: 'log', result: 'said_yes'|'follow_up'|'not_now'|'no_answer', followUpAt?, recheckAt?, nextStep?,
//           agendaNotes?, notes?, email? } — said_yes hands the course to Onboarding, not_now closes it.
// Pipeline area; GET viewer+, POST manager+ (log audited; note autosaves are not worth a row each).
import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, areaGate } from '@/lib/admin-session';
import { callDetail, saveCallNotes, logOutreachCall } from '@/lib/outreach-server';
import { auditAdmin } from '@/lib/admin-audit';
import { signedOut, outreachRole, viewerOf, failRes, readJson } from '../../gate';

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
  const call = await callDetail(id, g.viewer);
  if (!call) return NextResponse.json({ error: 'That call is not on the list.' }, { status: 404 });
  return NextResponse.json(call);
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
  if (!body) return NextResponse.json({ error: 'Send what to save.' }, { status: 400 });
  if (action === 'save_notes') {
    const r = await saveCallNotes(id, body);
    if (!r.ok) return failRes(r);
    return NextResponse.json({ success: true, savedAt: r.savedAt });
  }
  if (action === 'log') {
    const r = await logOutreachCall(id, body, g.session.name || 'Admin');
    if (!r.ok) return failRes(r);
    await auditAdmin(g.session, { action: 'outreach_call_log', targetType: 'call', targetId: id, after: { result: r.result, handoff: r.handoff } });
    return NextResponse.json({ success: true, result: r.result, handoff: r.handoff });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
