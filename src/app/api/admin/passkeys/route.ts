import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner } from '@/lib/admin-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { registrationOptions, addPasskey } from '@/lib/owner-passkey';

// AW-1b: the owner's passkeys, on My profile. Adding one needs the
// authenticator app set up first, so a lost phone or laptop can never lock
// the owner out (the app and its recovery codes are the backup). Owner only.

async function gate() {
  const session = await resolveAdminSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!requireOwner(session)) return { error: NextResponse.json({ error: 'Owner only — sign in again.' }, { status: 403 }) };
  return { session };
}

const list = (adminId: string) => prisma.ownerPasskey.findMany({
  where: { adminId }, orderBy: { createdAt: 'asc' },
  select: { id: true, name: true, createdAt: true, lastUsedAt: true },
});

export async function GET() {
  const g = await gate();
  if ('error' in g) return g.error;
  const admin = await prisma.adminUser.findUnique({ where: { id: g.session.adminId }, select: { twoFactorSecret: true } });
  return NextResponse.json({ passkeys: await list(g.session.adminId), appSetUp: !!admin?.twoFactorSecret });
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if ('error' in g) return g.error;
  if (!(await rateLimit(`passkey:add:${clientIp(req)}`, 20, 600))) return NextResponse.json({ error: 'Too many tries — wait a few minutes.' }, { status: 429 });
  const body = await req.json().catch(() => ({})) as { action?: unknown; response?: unknown; name?: unknown };
  const admin = await prisma.adminUser.findUnique({ where: { id: g.session.adminId }, select: { id: true, email: true, name: true, twoFactorSecret: true } });
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!admin.twoFactorSecret) return NextResponse.json({ error: 'Set up the authenticator app first — it’s the backup if you lose the device your passkey is on.' }, { status: 400 });
  if (body.action === 'options') return NextResponse.json(await registrationOptions(admin));
  if (body.action === 'add') {
    if (!body.response || typeof body.response !== 'object') return NextResponse.json({ error: 'Nothing came back from the passkey — try again.' }, { status: 400 });
    const r = await addPasskey(admin.id, body.response as Parameters<typeof addPasskey>[1], typeof body.name === 'string' ? body.name : '');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ passkeys: await list(admin.id) });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const g = await gate();
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => ({})) as { id?: unknown };
  const n = await prisma.ownerPasskey.deleteMany({ where: { id: typeof body.id === 'string' ? body.id : '', adminId: g.session.adminId } });
  if (!n.count) return NextResponse.json({ error: 'That passkey isn’t on your account.' }, { status: 404 });
  return NextResponse.json({ passkeys: await list(g.session.adminId) });
}
