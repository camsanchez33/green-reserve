import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, stepUpRequired } from '@/lib/admin-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { registrationOptions, addPasskey } from '@/lib/owner-passkey';
import { sendOwnerPasskeyChanged } from '@/lib/email';
import { requestContext, deviceLabel, alertTime } from '@/lib/owner-session';
import { withAudit } from '@/lib/admin-audit';

/** The alert never blocks the change it reports; a failure is logged. */
async function announce(admin: { id: string; email: string; name: string }, change: 'added' | 'removed', passkey: string) {
  const ctx = await requestContext();
  try { await sendOwnerPasskeyChanged({ email: admin.email, name: admin.name, change, passkey: passkey || 'Passkey', device: deviceLabel(ctx.userAgent), when: alertTime() }); }
  catch (err) { console.error(JSON.stringify({ ev: 'owner.passkey_alert.fail', adminId: admin.id, error: err instanceof Error ? err.message : String(err) })); }
}

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

async function postPasskey(req: NextRequest) {
  const g = await gate();
  if ('error' in g) return g.error;
  if (!(await rateLimit(`passkey:add:${clientIp(req)}`, 20, 600))) return NextResponse.json({ error: 'Too many tries — wait a few minutes.' }, { status: 429 });
  const body = await req.json().catch(() => ({})) as { action?: unknown; response?: unknown; name?: unknown };
  const admin = await prisma.adminUser.findUnique({ where: { id: g.session.adminId }, select: { id: true, email: true, name: true, twoFactorSecret: true } });
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!admin.twoFactorSecret) return NextResponse.json({ error: 'Set up the authenticator app first — it’s the backup if you lose the device your passkey is on.' }, { status: 400 });
  // Confirmed before the passkey prompt starts: confirming with a passkey arms
  // its own challenge, which would replace the one this prompt is answering.
  if (body.action === 'options') {
    const su = stepUpRequired(g.session); if (su) return su;
    return NextResponse.json(await registrationOptions(admin));
  }
  if (body.action === 'add') {
    const su = stepUpRequired(g.session); if (su) return su;
    if (!body.response || typeof body.response !== 'object') return NextResponse.json({ error: 'Nothing came back from the passkey — try again.' }, { status: 400 });
    const r = await addPasskey(admin.id, body.response as Parameters<typeof addPasskey>[1], typeof body.name === 'string' ? body.name : '');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    await announce(admin, 'added', r.name);
    return NextResponse.json({ passkeys: await list(admin.id) });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

async function removePasskey(req: NextRequest) {
  const g = await gate();
  if ('error' in g) return g.error;
  const su = stepUpRequired(g.session); if (su) return su;
  const body = await req.json().catch(() => ({})) as { id?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  const pk = await prisma.ownerPasskey.findFirst({ where: { id, adminId: g.session.adminId }, select: { name: true } });
  const n = await prisma.ownerPasskey.deleteMany({ where: { id, adminId: g.session.adminId } });
  if (!pk || !n.count) return NextResponse.json({ error: 'That passkey isn’t on your account.' }, { status: 404 });
  await announce({ id: g.session.adminId, email: g.session.email, name: g.session.name }, 'removed', pk.name);
  return NextResponse.json({ passkeys: await list(g.session.adminId) });
}

// BRAIN-1a: adding a passkey is recorded (the credential never is).
export const POST = withAudit(postPasskey, body => body.action === 'add' ? { action: 'passkey_add', targetType: 'admin', targetId: 'self', after: { name: String(body.name ?? '') } } : null);

export const DELETE = withAudit(removePasskey, body => ({ action: 'passkey_remove', targetType: 'passkey', targetId: String(body.id ?? ''), after: {} }));
