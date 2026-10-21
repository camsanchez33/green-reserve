import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, stepUpRequired } from '@/lib/admin-session';
import { deviceLabel } from '@/lib/owner-session';

// AW-1c: the devices approved for the owner sign-in, on My profile. Removing
// one ends every session it holds at once (ownerSessionFromCookie refuses a
// revoked device) and the next sign-in from it needs approval again. Removing
// is a risky action: it needs a confirmation from the last few minutes.

async function gate() {
  const session = await resolveAdminSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!requireOwner(session)) return { error: NextResponse.json({ error: 'Owner only — sign in again.' }, { status: 403 }) };
  return { session };
}

async function list(adminId: string, currentDeviceId: string | null | undefined) {
  const rows = await prisma.ownerDevice.findMany({
    where: { adminId, approvedAt: { not: null }, revokedAt: null },
    orderBy: { approvedAt: 'asc' },
    select: { id: true, label: true, approvedAt: true, lastUsedAt: true, sessions: { orderBy: { createdAt: 'desc' }, take: 1, select: { userAgent: true } } },
  });
  return rows.map(d => ({
    id: d.id,
    name: d.label || deviceLabel(d.sessions[0]?.userAgent ?? ''),
    approvedAt: d.approvedAt,
    lastUsedAt: d.lastUsedAt,
    current: d.id === currentDeviceId,
  }));
}

export async function GET() {
  const g = await gate();
  if ('error' in g) return g.error;
  return NextResponse.json({ devices: await list(g.session.adminId, g.session.ownerDeviceId) });
}

export async function DELETE(req: NextRequest) {
  const g = await gate();
  if ('error' in g) return g.error;
  const su = stepUpRequired(g.session); if (su) return su;
  const body = await req.json().catch(() => ({})) as { id?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  const now = new Date();
  const n = await prisma.ownerDevice.updateMany({ where: { id, adminId: g.session.adminId, revokedAt: null }, data: { revokedAt: now } });
  if (!n.count) return NextResponse.json({ error: 'That device isn’t on your account.' }, { status: 404 });
  await prisma.ownerSession.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: now } });
  return NextResponse.json({ devices: await list(g.session.adminId, g.session.ownerDeviceId), signedOut: id === g.session.ownerDeviceId });
}
