import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { normalizePermissions, presetFor, PRESETS, type PresetKey } from '@/lib/staff-permissions';
import { resolveMemberPermissions } from '@/lib/team-access';
import { removePerson, setAccess, setActive } from '@/lib/team';
import { securityEvent } from '@/lib/security-events';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// Team (Cam 2026-11-17): the Team page (/api/operator/team/**) replaces this.
// Until Settings → Staff & permissions is retired, its changes go through the
// same lib/team functions, so they are audited the same way and respect roles.
//
// SP-A: Settings → Staff & permissions. Owner only, every method — who works
// here and what each person may do is never a staff decision (STAFF_POLICY_SPEC
// A2 "never grantable"). Every permission change writes a StaffPermissionChange
// row, so the screen can say who changed what and when.

async function ownerSession() {
  const session = await resolveDashboardSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  if (session.isStaff) return { error: NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 }) } as const;
  return { session } as const;
}

const PRESET_KEYS = new Set<string>(PRESETS.map(p => p.key));

/** Permissions from a body: a preset, or an explicit list. Null = neither given. */
function permissionsFrom(body: { preset?: unknown; permissions?: unknown }) {
  if (Array.isArray(body.permissions)) {
    const keys = normalizePermissions(body.permissions.filter((k): k is string => typeof k === 'string'));
    return { keys, preset: presetFor(keys) };
  }
  if (typeof body.preset === 'string' && PRESET_KEYS.has(body.preset)) {
    const keys = normalizePermissions(PRESETS.find(p => p.key === body.preset)!.keys);
    return { keys, preset: body.preset as PresetKey };
  }
  return null;
}

export async function GET() {
  const r = await ownerSession(); if ('error' in r) return r.error;
  const { session } = r;
  const staff = await prisma.courseStaff.findMany({
    where: { courseId: session.courseId, removedAt: null },
    select: {
      id: true, courseId: true, name: true, email: true, active: true, createdAt: true, permissions: true, preset: true, permissionsSetAt: true,
      roleId: true, grantKeys: true, revokeKeys: true, courseRole: { select: { courseId: true, permissions: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const changes = staff.length
    ? await prisma.staffPermissionChange.findMany({ where: { courseId: session.courseId, staffId: { in: staff.map(s => s.id) } }, orderBy: { createdAt: 'desc' } })
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

export async function POST(req: NextRequest) {
  const r = await ownerSession(); if ('error' in r) return r.error;
  const { session } = r;
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
  if (!name || !email) return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'That email doesn’t look right.' }, { status: 400 });

  const existing = await prisma.courseStaff.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });

  // New staff default to Front desk (STAFF_POLICY_SPEC A3).
  const perms = permissionsFrom(body) ?? permissionsFrom({ preset: 'front_desk' })!;
  const tempPassword = randomBytes(6).toString('hex');
  const hashed = await bcrypt.hash(tempPassword, 12);
  const staff = await prisma.courseStaff.create({
    data: { courseId: session.courseId, email, name, password: hashed, role: 'staff', permissions: perms.keys, preset: perms.preset, permissionsSetAt: new Date() },
  });
  await prisma.staffPermissionChange.create({ data: { courseId: session.courseId, staffId: staff.id, changedBy: session.operatorId!, before: [], after: perms.keys } });
  const owner = await prisma.courseOperator.findUnique({ where: { id: session.operatorId! }, select: { name: true } });
  await prisma.teamChange.create({ data: { courseId: session.courseId, actorId: session.operatorId!, actorName: owner?.name ?? '', action: 'invite', targetType: 'person', targetId: staff.id, targetName: name, detail: 'added in Settings with a temporary password', after: perms.keys, affected: 1 } });
  await securityEvent(req, { kind: 'access_changed', surface: 'course', email, accountId: staff.id, detail: 'staff login added in Settings' });
  return NextResponse.json({ success: true, id: staff.id, tempPassword });
}

// PATCH { id, active } — disable / re-enable (takes effect on their next request).
// PATCH { id, preset } or { id, permissions } — what this person may do. For
// someone with a Team role, stored as their own overrides on that role.
export async function PATCH(req: NextRequest) {
  const r = await ownerSession(); if ('error' in r) return r.error;
  const { session } = r;
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const body = await req.json().catch(() => ({}));
  const ctx = { courseId: session.courseId, operatorId: session.operatorId!, req };
  const perms = permissionsFrom(body);
  if (!perms && typeof body.active !== 'boolean') return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  let permissions: string[] | undefined;
  if (perms) {
    const a = await setAccess(ctx, body.id, { permissions: perms.keys });
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
    permissions = a.permissions;
  }
  if (typeof body.active === 'boolean') {
    const a = await setActive(ctx, body.id, body.active);
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  }
  if (!permissions) {
    const row = await prisma.courseStaff.findUnique({ where: { id: String(body.id) }, select: { courseId: true, permissions: true, permissionsSetAt: true, roleId: true, grantKeys: true, revokeKeys: true, courseRole: { select: { courseId: true, permissions: true } } } });
    permissions = row ? resolveMemberPermissions(row) : [];
  }
  return NextResponse.json({ success: true, permissions, preset: perms ? presetFor(normalizePermissions(permissions)) : undefined });
}

// DELETE — Team's Remove: off the list, signed out, history kept under their name.
export async function DELETE(req: NextRequest) {
  const r = await ownerSession(); if ('error' in r) return r.error;
  const { session } = r;
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const { id } = await req.json().catch(() => ({}));
  const a = await removePerson({ courseId: session.courseId, operatorId: session.operatorId!, req }, id);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  return NextResponse.json({ success: true });
}
