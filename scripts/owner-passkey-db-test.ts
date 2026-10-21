// AW-1b: owner passkeys — the rules around the WebAuthn crypto (the browser
// walk proves the crypto itself). Run: npx tsx scripts/owner-passkey-db-test.ts
import { prisma } from '../src/lib/prisma';
import { registrationOptions, authenticationOptions, addPasskey, verifyPasskeySignIn, hasPasskey, relyingParty } from '../src/lib/owner-passkey';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };
const EMAILS = ['aw1b-a@t.local', 'aw1b-b@t.local'];
const cleanup = () => prisma.adminUser.deleteMany({ where: { email: { in: EMAILS } } });

(async () => {
  await cleanup();
  const a = await prisma.adminUser.create({ data: { email: EMAILS[0], name: 'A', role: 'owner', passwordHash: 'x' } });
  const other = await prisma.adminUser.create({ data: { email: EMAILS[1], name: 'B', role: 'owner', passwordHash: 'x' } });
  const fake = { id: 'cred-x', rawId: 'cred-x', type: 'public-key', response: { clientDataJSON: '', authenticatorData: '', signature: '' }, clientExtensionResults: {} } as never;

  ok('the passkey is bound to the configured site, never the request', relyingParty().rpID === new URL(process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app').hostname);
  ok('no passkeys yet', !(await hasPasskey(a.id)));
  const reg = await registrationOptions(a);
  ok('adding one asks for user verification (Face ID / PIN)', reg.authenticatorSelection?.userVerification === 'required');
  ok('a garbage response is refused and nothing is stored', !(await addPasskey(a.id, fake, 'x')).ok && !(await hasPasskey(a.id)));
  ok('…and its challenge is spent (a retry needs a fresh one)', (await prisma.adminUser.findUniqueOrThrow({ where: { id: a.id } })).passkeyChallenge === null);
  ok('no challenge in flight: refused', !(await addPasskey(a.id, fake, 'x')).ok);

  await registrationOptions(a);
  await prisma.adminUser.update({ where: { id: a.id }, data: { passkeyChallengeExpiry: new Date(Date.now() - 1000) } });
  const late = await addPasskey(a.id, fake, 'x');
  ok('an expired challenge is refused with a clear message', !late.ok && /too long/.test(late.ok ? '' : late.error));

  // Sign-in: someone else's passkey, an unknown one, or no challenge never pass.
  const key = await prisma.ownerPasskey.create({ data: { adminId: other.id, credentialId: 'cred-other', publicKey: Buffer.from([1, 2, 3]), name: 'B laptop' } });
  await authenticationOptions(a.id);
  ok('another owner’s passkey can’t sign this owner in', !(await verifyPasskeySignIn(a.id, { ...(fake as object), id: 'cred-other', rawId: 'cred-other' } as never)));
  await authenticationOptions(a.id);
  ok('an unknown passkey can’t either', !(await verifyPasskeySignIn(a.id, fake)));
  const mine = await prisma.ownerPasskey.create({ data: { adminId: a.id, credentialId: 'cred-a', publicKey: Buffer.from([1, 2, 3]), name: 'A laptop' } });
  ok('with no challenge in flight, even the owner’s own passkey id fails', !(await verifyPasskeySignIn(a.id, { ...(fake as object), id: 'cred-a', rawId: 'cred-a' } as never)));
  const opts = await authenticationOptions(a.id);
  ok('sign-in offers only this owner’s passkeys', opts.allowCredentials?.length === 1 && opts.allowCredentials[0].id === 'cred-a');
  ok('a bad signature fails and spends the challenge', !(await verifyPasskeySignIn(a.id, { ...(fake as object), id: 'cred-a', rawId: 'cred-a' } as never)) && (await prisma.adminUser.findUniqueOrThrow({ where: { id: a.id } })).passkeyChallenge === null);
  ok('the stored counter is untouched by a failure', (await prisma.ownerPasskey.findUniqueOrThrow({ where: { id: mine.id } })).counter === BigInt(0));
  void key;

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('owner-passkey-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
