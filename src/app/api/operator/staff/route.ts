import { NextRequest, NextResponse } from 'next/server';
import { removePerson, setAccess, setActive, updateDetails } from '@/lib/team';
import { jsonBody, teamOwner, teamResponse } from '@/lib/team-route';

// Team (Cam 2026-11-17): a person on the course's team. Owner only, every
// method (lib/team-route): who works here and what each person may do is never
// a staff decision (STAFF_POLICY_SPEC A2). Read the team with GET /api/operator/team.
// Everything goes through lib/team, which writes the audit log (TeamChange),
// StaffPermissionChange per person whose keys change, and securityEvent when
// sign-in is affected.

// Adding someone is an invite now (POST /api/operator/staff/invite): a welcome
// email with a set-your-password link. A temporary password is never made or shown.
export async function POST(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return NextResponse.json({ error: 'Invite people from Team. They get an email to set their own password.' }, { status: 410 });
}

// PATCH { id, roleId?, permissions? | areas?, active?, name?, phone? }
//   roleId moves them to that role (their own changes are cleared unless permissions/areas come too);
//   permissions is the WHOLE set they should have — stored as their own changes against their role;
//   active false = Disable (listed, signed out), true = turn back on.
export async function PATCH(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  const body = await jsonBody(req);
  const access = 'roleId' in body || 'permissions' in body || 'areas' in body;
  const details = 'name' in body || 'phone' in body;
  const hasActive = 'active' in body;
  if (!access && !details && !hasActive) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  if (hasActive && typeof body.active !== 'boolean') return NextResponse.json({ error: 'active must be true or false.' }, { status: 400 });
  let permissions: unknown;
  if (details) { const r = await updateDetails(g.ctx, body.id, body); if (!r.ok) return teamResponse(r); }
  if (access) { const r = await setAccess(g.ctx, body.id, body); if (!r.ok) return teamResponse(r); permissions = r.permissions; }
  if (hasActive) { const r = await setActive(g.ctx, body.id, body.active as boolean); if (!r.ok) return teamResponse(r); }
  return NextResponse.json({ success: true, ...(permissions ? { permissions } : {}) });
}

// DELETE { id } — Remove: off the list and signed out for good; their past check-ins, sales and notes keep their name.
export async function DELETE(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await removePerson(g.ctx, (await jsonBody(req)).id));
}
