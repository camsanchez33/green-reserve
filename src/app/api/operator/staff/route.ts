import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { presetFor } from '@/lib/staff-permissions';
import { resolveMemberPermissions } from '@/lib/team-access';
import { removePerson, setAccess, setActive, updateDetails } from '@/lib/team';
import { jsonBody, teamOwner, teamResponse } from '@/lib/team-route';

// Team (Cam 2026-11-17): a person on the course's team. Owner only, every
// method (lib/team-route): who works here and what each person may do is never
// a staff decision (STAFF_POLICY_SPEC A2). The Team page reads GET /api/operator/team.
// Everything goes through lib/team, which writes the audit log (TeamChange),
// StaffPermissionChange per person whose keys change, and securityEvent when
// sign-in is affected.

// ── The old list (GET), owner only. Its old Add (POST) is gone (audit 2026-11-24 L9); PATCH and DELETE
// are Team's.

/** The old screen's list: the old shape, people removed on Team left out. */
export async function GET(req: NextRequest) {
  const g = await teamOwner(req, { write: false }); if ('error' in g) return g.error;
  const { courseId } = g.ctx;
  const staff = await prisma.courseStaff.findMany({
    where: { courseId, removedAt: null },
    select: {
      id: true, courseId: true, name: true, email: true, active: true, createdAt: true, permissions: true, preset: true, permissionsSetAt: true,
      roleId: true, grantKeys: true, revokeKeys: true, courseRole: { select: { courseId: true, permissions: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const changes = staff.length
    ? await prisma.staffPermissionChange.findMany({ where: { courseId, staffId: { in: staff.map(s => s.id) } }, orderBy: { createdAt: 'desc' }, distinct: ['staffId'] })
    : [];
  const changerIds = [...new Set(changes.map(c => c.changedBy))];
  const changers = changerIds.length ? await prisma.courseOperator.findMany({ where: { id: { in: changerIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(changers.map(c => [c.id, c.name]));
  return NextResponse.json(staff.map(s => {
    const permissions = resolveMemberPermissions(s);
    const last = changes.find(c => c.staffId === s.id);
    return {
      id: s.id, name: s.name, email: s.email, active: s.active, createdAt: s.createdAt,
      permissions,
      // "legacy" = created before SP-A and never edited: today's powers minus the two that move money.
      preset: s.roleId ? presetFor(permissions) : s.permissionsSetAt ? (s.preset || presetFor(permissions)) : 'legacy',
      lastChange: last ? { at: last.createdAt, by: nameOf.get(last.changedBy) ?? 'The course owner' } : null,
    };
  }));
}

// Audit 2026-11-24 L9: the old screen's Add (POST, a temporary password shown once) is gone. Nothing
// calls it since Team's Invite (POST /staff/invite, lib/team.ts invitePerson) replaced it, and it had no
// cap, so a course login could use it to test which emails are logins anywhere on the platform.

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
