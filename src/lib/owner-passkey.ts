// AW-1b (Cam 2026-10-21: the owner's second factor is a passkey — Face ID,
// Touch ID or a security key — with the authenticator app and recovery codes
// as backup; owner email codes are off once a passkey exists). WebAuthn
// through @simplewebauthn/server. Only public keys are stored. One challenge
// is in flight per owner (AdminUser.passkeyChallenge), good for 5 minutes and
// used once — consumed atomically, so a replayed response can't use it again.
// Server only.
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON, type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { prisma } from './prisma';

const CHALLENGE_MS = 5 * 60_000;

/** The site passkeys are bound to — fixed config, never the request's Host. */
export function relyingParty() {
  const base = new URL(process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app');
  return { rpID: base.hostname, origin: base.origin, rpName: 'GreenReserve' };
}

const transportsOf = (t: string[]) => t as AuthenticatorTransportFuture[];

async function setChallenge(adminId: string, challenge: string) {
  await prisma.adminUser.update({ where: { id: adminId }, data: { passkeyChallenge: challenge, passkeyChallengeExpiry: new Date(Date.now() + CHALLENGE_MS) } });
}

/** Take the challenge in flight, once. Null when there is none or it expired. */
async function consumeChallenge(adminId: string): Promise<string | null> {
  const a = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { passkeyChallenge: true, passkeyChallengeExpiry: true } });
  if (!a?.passkeyChallenge || !a.passkeyChallengeExpiry || a.passkeyChallengeExpiry < new Date()) return null;
  const n = await prisma.adminUser.updateMany({ where: { id: adminId, passkeyChallenge: a.passkeyChallenge }, data: { passkeyChallenge: null, passkeyChallengeExpiry: null } });
  return n.count === 1 ? a.passkeyChallenge : null;
}

export async function hasPasskey(adminId: string): Promise<boolean> {
  return (await prisma.ownerPasskey.count({ where: { adminId } })) > 0;
}

// ── Adding a passkey (from My profile, inside an owner session) ──────────────

export async function registrationOptions(admin: { id: string; email: string; name: string }) {
  const { rpID, rpName } = relyingParty();
  const existing = await prisma.ownerPasskey.findMany({ where: { adminId: admin.id }, select: { credentialId: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName, rpID,
    userName: admin.email, userDisplayName: admin.name,
    userID: new TextEncoder().encode(admin.id),
    attestationType: 'none',
    excludeCredentials: existing.map(p => ({ id: p.credentialId, transports: transportsOf(p.transports) })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await setChallenge(admin.id, options.challenge);
  return options;
}

export async function addPasskey(adminId: string, response: RegistrationResponseJSON, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const expectedChallenge = await consumeChallenge(adminId);
  if (!expectedChallenge) return { ok: false, error: 'That took too long — try adding the passkey again.' };
  const { rpID, origin } = relyingParty();
  let verified;
  try {
    verified = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'owner.passkey.register_fail', adminId, error: err instanceof Error ? err.message : String(err) }));
    return { ok: false, error: 'That passkey couldn’t be checked — try again.' };
  }
  if (!verified.verified || !verified.registrationInfo) return { ok: false, error: 'That passkey couldn’t be checked — try again.' };
  const c = verified.registrationInfo.credential;
  if (await prisma.ownerPasskey.findUnique({ where: { credentialId: c.id } })) return { ok: false, error: 'That passkey is already added.' };
  await prisma.ownerPasskey.create({ data: {
    adminId, credentialId: c.id, publicKey: Buffer.from(c.publicKey), counter: BigInt(c.counter),
    transports: c.transports ?? [], name: name.trim().slice(0, 60) || 'Passkey',
  } });
  return { ok: true };
}

// ── Signing in at /cam ───────────────────────────────────────────────────────

export async function authenticationOptions(adminId: string) {
  const { rpID } = relyingParty();
  const keys = await prisma.ownerPasskey.findMany({ where: { adminId }, select: { credentialId: true, transports: true } });
  const options = await generateAuthenticationOptions({
    rpID, userVerification: 'required',
    allowCredentials: keys.map(p => ({ id: p.credentialId, transports: transportsOf(p.transports) })),
  });
  await setChallenge(adminId, options.challenge);
  return options;
}

/** True when this response proves one of this owner's passkeys, now. Never throws. */
export async function verifyPasskeySignIn(adminId: string, response: AuthenticationResponseJSON): Promise<boolean> {
  const key = typeof response?.id === 'string' ? await prisma.ownerPasskey.findUnique({ where: { credentialId: response.id } }) : null;
  const expectedChallenge = await consumeChallenge(adminId);
  if (!key || key.adminId !== adminId || !expectedChallenge) return false;
  const { rpID, origin } = relyingParty();
  try {
    const v = await verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter), transports: transportsOf(key.transports) },
    });
    if (!v.verified) return false;
    await prisma.ownerPasskey.update({ where: { id: key.id }, data: { counter: BigInt(v.authenticationInfo.newCounter), lastUsedAt: new Date() } });
    return true;
  } catch (err) {
    console.error(JSON.stringify({ ev: 'owner.passkey.signin_fail', adminId, error: err instanceof Error ? err.message : String(err) }));
    return false;
  }
}
