import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, signAdminToken } from '@/lib/admin-session';
import { securityEvent } from '@/lib/security-events';
import { changePasswordTryAllowed, CHANGE_PASSWORD_LIMITED } from '@/lib/password-change-guard';
import bcrypt from 'bcryptjs';
import { auditAdmin } from '@/lib/admin-audit';
import { passwordChanged } from '@/lib/admin-password';

async function changePassword(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { currentPassword, newPassword } = ((await req.json().catch(() => null)) ?? {}) as { currentPassword?: unknown; newPassword?: unknown };
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword)
    return NextResponse.json({ error: 'currentPassword and newPassword required' }, { status: 400 });
  if (String(newPassword).length < 8)
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });

  const admin = await prisma.adminUser.findUnique({ where: { id: session.adminId } });
  if (!admin) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const surface = admin.role === 'owner' ? 'owner' : 'admin';
  // Audit 2026-11-24 M4: counted before the compare, so a stolen session can't guess the current password.
  if (!(await changePasswordTryAllowed('admin', admin.id))) {
    await securityEvent(req, { kind: 'rate_limited', surface, email: admin.email, accountId: admin.id, detail: 'change password' });
    return NextResponse.json({ error: CHANGE_PASSWORD_LIMITED }, { status: 429 });
  }
  const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!valid) {
    await securityEvent(req, { kind: 'signin_failed', surface, email: admin.email, accountId: admin.id, detail: 'change password, wrong current password' });
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
  }

  const passwordHash = await bcrypt.hash(String(newPassword), 12);
  // Audit 2026-11-24 M5: every other session ends with the old password, in the SAME write as the new
  // password (a failure can't leave the new password with the old cookies live). An employee's cookies die
  // by sessionVersion and this one is re-issued with the new version and its original end (no renewal);
  // the owner's other OwnerSession rows are revoked and this one is kept.
  const { sessionVersion: sv } = await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  if (session.ownerSessionId) {
    await prisma.ownerSession.updateMany({ where: { adminId: admin.id, revokedAt: null, id: { not: session.ownerSessionId } }, data: { revokedAt: new Date() } });
  }
  await passwordChanged(req, admin, 'changed on My profile');
  // BRAIN-1a: recorded (the password itself never is). Written here with the session in hand: withAudit
  // re-reads the session after the handler, and by then the old cookie is dead by design.
  await auditAdmin(session, { action: 'password_change', targetType: 'admin', targetId: 'self', after: {} });

  const res = NextResponse.json({ success: true, signedOutElsewhere: true });
  // Without the old token's end there is no safe end to keep, so no new cookie: they sign in again.
  if (!session.ownerSessionId && session.exp) {
    const token = await signAdminToken({ adminId: session.adminId, email: session.email, name: session.name, role: session.role, mfa: session.mfa, sv }, session.exp);
    const maxAge = Math.max(0, session.exp - Math.floor(Date.now() / 1000));
    res.cookies.set('admin_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge, path: '/' });
  }
  return res;
}

// Recorded inside the handler (see auditAdmin above), so not wrapped in withAudit.
export const POST = changePassword;
