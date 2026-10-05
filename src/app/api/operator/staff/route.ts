import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { normalizePermissions, presetFor, PRESETS, resolveStaffPermissions, type PresetKey } from '@/lib/staff-permissions';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

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
    where: { courseId: session.courseId },
    select: { id: true, name: true, email: true, active: true, createdAt: true, permissions: true, preset: true, permissionsSetAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const changes = staff.length
    ? await prisma.staffPermissionChange.findMany({ where: { courseId: session.courseId, staffId: { in: staff.map(s => s.id) } }, orderBy: { createdAt: 'desc' } })
    : [];
  const changerIds = [...new Set(changes.map(c => c.changedBy))];
  const changers = changerIds.length ? await prisma.courseOperator.findMany({ where: { id: { in: changerIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(changers.map(c => [c.id, c.name]));
  return NextResponse.json(staff.map(s => {
    const permissions = resolveStaffPermissions(s);
    const last = changes.find(c => c.staffId === s.id);
    return {
      id: s.id, name: s.name, email: s.email, active: s.active, createdAt: s.createdAt,
      permissions,
      // "legacy" = created before SP-A and never edited: today's powers minus the two that move money.
      preset: s.permissionsSetAt ? (s.preset || presetFor(permissions)) : 'legacy',
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
  return NextResponse.json({ success: true, id: staff.id, tempPassword });
}

// PATCH { id, active } — disable / re-enable (takes effect on their next request).
// PATCH { id, preset } or { id, permissions } — what this person may do.
export async function PATCH(req: NextRequest) {
  const r = await ownerSession(); if ('error' in r) return r.error;
  const { session } = r;
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const body = await req.json().catch(() => ({}));
  const staff = typeof body.id === 'string' ? await prisma.courseStaff.findUnique({ where: { id: body.id } }) : null;
  if (!staff || staff.courseId !== session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const perms = permissionsFrom(body);
  if (!perms && typeof body.active !== 'boolean') return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  const before = resolveStaffPermissions(staff);
  await prisma.courseStaff.update({
    where: { id: staff.id },
    data: {
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
      ...(perms ? { permissions: perms.keys, preset: perms.preset, permissionsSetAt: new Date() } : {}),
    },
  });
  if (perms && before.join(',') !== perms.keys.join(',')) {
    await prisma.staffPermissionChange.create({ data: { courseId: session.courseId, staffId: staff.id, changedBy: session.operatorId!, before, after: perms.keys } });
  }
  return NextResponse.json({ success: true, permissions: perms?.keys ?? before, preset: perms?.preset });
}

export async function DELETE(req: NextRequest) {
  const r = await ownerSession(); if ('error' in r) return r.error;
  const { session } = r;
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const { id } = await req.json().catch(() => ({}));
  const staff = typeof id === 'string' ? await prisma.courseStaff.findUnique({ where: { id } }) : null;
  if (!staff || staff.courseId !== session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.courseStaff.delete({ where: { id: staff.id } });
  return NextResponse.json({ success: true });
}
