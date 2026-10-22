import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, OWNER_ONLY, MANAGER_PLUS, ownerGateError, stepUpRequired } from '@/lib/admin-session';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { needReason, reasonOf, auditAdmin, changedFields } from '@/lib/admin-audit';

const VALID_ROLES = ['owner', 'manager', 'support', 'viewer'];

function safeRole(r: unknown): string {
  return VALID_ROLES.includes(String(r)) ? String(r) : 'manager';
}

function genTempPassword(): string {
  return randomBytes(8).toString('hex'); // 16 hex chars
}

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2: the employee roster is org structure — who exists, their roles, who
  // is deactivated. Manager-plus, not any session.
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, email: true, name: true, role: true,
      active: true, mustChangePassword: true, lastLoginAt: true, createdAt: true,
    },
  });

  return NextResponse.json(admins);
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2 fix-now #8 — see broadcasts: raw role check skipped the mfa assertion.
  if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const su = stepUpRequired(session); if (su) return su;

  const body = await req.json();
  const { email: rawEmail, name, role } = body;
  if (!rawEmail || !name) return NextResponse.json({ error: 'email and name required' }, { status: 400 });
  const nr = needReason('employee_create', body); if (nr) return nr;
  const email = String(rawEmail).trim().toLowerCase();

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: 'Email already exists' }, { status: 409 });

  const tempPassword = genTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const created = await prisma.adminUser.create({
    data: {
      email,
      name: String(name).trim(),
      passwordHash,
      role: safeRole(role),
      active: true,
      mustChangePassword: true,
    },
  });

  await auditAdmin(session, { action: 'employee_create', targetType: 'admin', targetId: created.id, after: { email: created.email, name: created.name, role: created.role }, reason: reasonOf(body) });
  return NextResponse.json({ success: true, tempPassword });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2 fix-now #8 — see broadcasts: raw role check skipped the mfa assertion.
  if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const su = stepUpRequired(session); if (su) return su;

  const body = await req.json();
  const { id, action, role, active } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (id === session.adminId) return NextResponse.json({ error: 'Cannot modify your own account here' }, { status: 400 });
  // BRAIN-1a: every change to someone's access is said with a reason.
  const auditAction = action === 'reset_password' ? 'employee_reset_password'
    : role !== undefined ? 'employee_role'
    : active === false ? 'employee_deactivate' : 'employee_reactivate';
  const nr = needReason(auditAction, body); if (nr) return nr;

  // Owner resets someone else's password — cannot reset another owner's password
  if (action === 'reset_password') {
    const target = await prisma.adminUser.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === 'owner') {
      return NextResponse.json({ error: 'Owner passwords cannot be reset by other owners. The owner must change their own password via the Change password form or use Forgot password.' }, { status: 403 });
    }
    const tempPassword = genTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await prisma.adminUser.update({
      where: { id },
      // MP-2b: MP-2 cleared the lockout on the forgot-password path and left
      // this one — an owner resetting a locked-out employee still handed them a
      // password that answered "Too many attempts". Same bug, other door.
      data: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockoutUntil: null },
    });
    await auditAdmin(session, { action: auditAction, targetType: 'admin', targetId: id, reason: reasonOf(body) });
    return NextResponse.json({ success: true, tempPassword });
  }

  const data: Record<string, unknown> = {};
  if (role !== undefined) data.role = safeRole(role);
  if (active !== undefined) data.active = Boolean(active);

  const prior = await prisma.adminUser.findUnique({ where: { id }, select: { role: true, active: true } });
  if (!prior) return NextResponse.json({ error: 'That employee no longer exists — refresh the page.' }, { status: 404 });
  const updated = await prisma.adminUser.update({ where: { id }, data });
  const diff = changedFields(prior, { role: updated.role, active: updated.active });
  await auditAdmin(session, { action: auditAction, targetType: 'admin', targetId: id, ...diff, reason: reasonOf(body) });
  return NextResponse.json({ success: true, id: updated.id, role: updated.role, active: updated.active });
}
