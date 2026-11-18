import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { securityEvent } from '@/lib/security-events';
import { normalizePermissions, presetFor, PRESETS } from '@/lib/staff-permissions';
import { resolveMemberPermissions } from '@/lib/team-access';
import { removePerson, setAccess, setActive, updateDetails } from '@/lib/team';
import { jsonBody, teamOwner, teamResponse } from '@/lib/team-route';

// Team (Cam 2026-11-17): a person on the course's team. Owner only, every
// method (lib/team-route): who works here and what each person may do is never
// a staff decision (STAFF_POLICY_SPEC A2). The Team page reads GET /api/operator/team.
// Everything goes through lib/team, which writes the audit log (TeamChange),
// StaffPermissionChange per person whose keys change, and securityEvent when
// sign-in is affected.

// ── Kept for Settings → Staff & permissions (StaffPermissions.tsx) until the Team
// page (#460) replaces it; delete GET and POST with that component. Owner only.

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

const PRESET_KEYS = new Set<string>(PRESETS.map(p => p.key));

/**
 * The old screen's Add: a temporary password shown once to the owner, as before
 * Team. Now audited (TeamChange, securityEvent). Team's Invite (POST /staff/invite)
 * replaces it and never makes a temporary password.
 */
export async function POST(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  const { ctx } = g;
  const body = await jsonBody(req);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
  if (!name || !email) return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'That email doesn’t look right.' }, { status: 400 });
  if (await prisma.courseStaff.findUnique({ where: { email } })) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  // New staff default to Front desk (STAFF_POLICY_SPEC A3).
  const keys = Array.isArray(body.permissions)
    ? normalizePermissions(body.permissions.filter((k): k is string => typeof k === 'string'))
    : normalizePermissions(PRESETS.find(p => p.key === (typeof body.preset === 'string' && PRESET_KEYS.has(body.preset) ? body.preset : 'front_desk'))!.keys);
  const tempPassword = randomBytes(6).toString('hex');
  const owner = await prisma.courseOperator.findUnique({ where: { id: ctx.operatorId }, select: { name: true } });
  let staffId: string;
  try {
    staffId = await prisma.$transaction(async tx => {
      const staff = await tx.courseStaff.create({
        data: { courseId: ctx.courseId, email, name, password: await bcrypt.hash(tempPassword, 12), role: 'staff', permissions: keys, preset: presetFor(keys), permissionsSetAt: new Date(), passwordSetAt: new Date() },
      });
      await tx.staffPermissionChange.create({ data: { courseId: ctx.courseId, staffId: staff.id, changedBy: ctx.operatorId, before: [], after: keys } });
      await tx.teamChange.create({ data: { courseId: ctx.courseId, actorId: ctx.operatorId, actorName: owner?.name ?? '', action: 'invite', targetType: 'person', targetId: staff.id, targetName: name, detail: 'added in Settings with a temporary password', after: keys, affected: 1 } });
      return staff.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    throw e;
  }
  await securityEvent(req, { kind: 'access_changed', surface: 'course', email, accountId: staffId, detail: 'staff login added in Settings' });
  return NextResponse.json({ success: true, id: staffId, tempPassword });
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
