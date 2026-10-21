// AW-1 (Cam 2026-10-20): /cam owner devices — approval links, one-time use,
// expiry, revocation, and sessions that end at the database. Run:
//   npx tsx scripts/owner-device-db-test.ts   (needs DATABASE_URL)
import { prisma } from '../src/lib/prisma';
import { startDeviceApproval, deviceForApproval, approveDevice, trustedDevice, sha256, revokeAllOwnerSessions, deviceLabel } from '../src/lib/owner-session';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };
const EMAIL = 'aw1-device-test@t.local';
async function cleanup() { await prisma.adminUser.deleteMany({ where: { email: { in: [EMAIL, 'aw1-other@t.local'] } } }); }

(async () => {
  await cleanup();
  const owner = await prisma.adminUser.create({ data: { email: EMAIL, name: 'Owner', role: 'owner', passwordHash: 'x' } });
  const other = await prisma.adminUser.create({ data: { email: 'aw1-other@t.local', name: 'Other', role: 'owner', passwordHash: 'x' } });
  const ctx = { ip: '1.2.3.4', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1' };

  const a = await startDeviceApproval(owner.id, null, ctx);
  ok('a new device is not trusted until approved', !(await trustedDevice(owner.id, a.deviceToken)));
  ok('only hashes are stored', !!(await prisma.ownerDevice.findUnique({ where: { tokenHash: sha256(a.deviceToken) } })) && !(await prisma.ownerDevice.findFirst({ where: { tokenHash: a.deviceToken } })));
  ok('the device is named for the email', deviceLabel(ctx.userAgent) === 'Safari on iPhone');
  const again = await startDeviceApproval(owner.id, a.deviceToken, ctx);
  ok('signing in again on the same browser reuses the device, with a fresh link', again.deviceToken === a.deviceToken && again.approvalToken !== a.approvalToken && (await prisma.ownerDevice.count({ where: { adminId: owner.id } })) === 1);
  ok('the old link no longer works', !(await deviceForApproval(a.approvalToken)));
  ok('a made-up link does nothing', !(await approveDevice('nope')));
  ok('the link approves', await approveDevice(again.approvalToken));
  ok('…once', !(await approveDevice(again.approvalToken)));
  ok('the device is now trusted for this owner', !!(await trustedDevice(owner.id, a.deviceToken)));
  ok('…and not for any other admin', !(await trustedDevice(other.id, a.deviceToken)));

  // Expired link.
  const b = await startDeviceApproval(owner.id, null, ctx);
  await prisma.ownerDevice.update({ where: { tokenHash: sha256(b.deviceToken) }, data: { approvalExpiresAt: new Date(Date.now() - 1000) } });
  ok('an expired link does nothing', !(await approveDevice(b.approvalToken)) && !(await trustedDevice(owner.id, b.deviceToken)));

  // A revoked device stays revoked, and its browser gets a new device next time.
  const dev = await prisma.ownerDevice.findUniqueOrThrow({ where: { tokenHash: sha256(a.deviceToken) } });
  await prisma.ownerDevice.update({ where: { id: dev.id }, data: { revokedAt: new Date() } });
  ok('a revoked device is not trusted', !(await trustedDevice(owner.id, a.deviceToken)));
  const c = await startDeviceApproval(owner.id, a.deviceToken, ctx);
  ok('…and its browser starts over as a brand-new device', c.deviceToken !== a.deviceToken);

  // Sessions end at the database.
  await prisma.ownerSession.create({ data: { adminId: owner.id, deviceId: dev.id, method: 'totp', expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.ownerSession.create({ data: { adminId: owner.id, method: 'totp', expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.ownerSession.create({ data: { adminId: other.id, method: 'totp', expiresAt: new Date(Date.now() + 3600_000) } });
  await revokeAllOwnerSessions(owner.id);
  ok('sign out everywhere ends every session of this owner', (await prisma.ownerSession.count({ where: { adminId: owner.id, revokedAt: null } })) === 0);
  ok('…and no one else’s', (await prisma.ownerSession.count({ where: { adminId: other.id, revokedAt: null } })) === 1);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('owner-device-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
