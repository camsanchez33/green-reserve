// Team routes' shared gate (Cam 2026-11-17). Who works here and what each person
// may do is the course OWNER's alone (STAFF_POLICY_SPEC A2): a staff login gets
// 403 on every method, whatever keys it holds. Writes also need the current
// course agreement (AG-3 §3), like Settings → Staff did.
import { NextResponse } from 'next/server';
import { requireAgreementCurrent } from './agreement-required';
import { resolveDashboardSession, STAFF_FORBIDDEN } from './session';
import type { TeamCtx, TeamResult } from './team';

export async function teamOwner(req: Request, opts: { write: boolean }): Promise<{ ctx: TeamCtx } | { error: NextResponse }> {
  const session = await resolveDashboardSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.isStaff || !session.operatorId) return { error: NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 }) };
  if (opts.write) {
    const blocked = await requireAgreementCurrent(session.courseId);
    if (blocked) return { error: blocked };
  }
  return { ctx: { courseId: session.courseId, operatorId: session.operatorId, req } };
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => ({}));
  return b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {};
}

/** A lib result as a response: { success: true, ...data } or { error } with its status. */
export function teamResponse(r: TeamResult<Record<string, unknown>>): NextResponse {
  if (!r.ok) {
    const { ok: _ok, status, ...rest } = r;
    void _ok;
    return NextResponse.json(rest, { status });
  }
  const { ok: _ok2, ...data } = r;
  void _ok2;
  return NextResponse.json({ success: true, ...data });
}
