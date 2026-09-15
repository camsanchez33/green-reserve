// OWNER TOTP 2FA (RUN_QUEUE) — the authenticator-app second factor for the
// owner account. Server only.
//
// Decision (Cam, 2026-08-26): TOTP over SMS. Holding the owner inbox is no
// longer enough to take the platform; SIM swap is not in the picture at all.
// While `twoFactorSecret` is null the email-code path in api/admin/owner-login
// stays exactly as it was — enrolment is what makes TOTP mandatory, so the
// migration can deploy before Cam enrols without locking him out.
import { authenticator } from 'otplib';
import { toString as qrToString } from 'qrcode';
import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

export const TOTP_ISSUER = 'GreenReserve';
/** Accept the adjacent step (±30s) for clock skew — one step, no wider. */
export const TOTP_WINDOW = 1;
export const TOTP_STEP_SECONDS = 30;
export const RECOVERY_CODE_COUNT = 10;

authenticator.options = { window: TOTP_WINDOW, step: TOTP_STEP_SECONDS };

const rawSecret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
if (!rawSecret) throw new Error('JWT_SECRET is not set — refusing to sign 2FA enrolment tokens in production');
const jwtSecret = new TextEncoder().encode(rawSecret);

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function totpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, TOTP_ISSUER, secret);
}

export async function totpQrSvg(uri: string): Promise<string> {
  return qrToString(uri, { type: 'svg', margin: 1, width: 200 });
}

/** The 30-second step a code matched, or null. `window` steps either side are accepted. */
export function totpMatchStep(token: string, secret: string, now: number = Date.now()): number | null {
  const clean = String(token).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const delta = authenticator.checkDelta(clean, secret);
  if (delta === null) return null;
  return Math.floor(now / 1000 / TOTP_STEP_SECONDS) + delta;
}

/** Ten single-use recovery codes: `xxxx-xxxx`, unambiguous alphabet. Returns the plain codes and their bcrypt hashes. */
export async function generateRecoveryCodes(): Promise<{ plain: string[]; hashes: string[] }> {
  const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
  const plain: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    let c = '';
    for (let k = 0; k < 8; k++) c += ALPHABET[randomInt(0, ALPHABET.length)];
    plain.push(`${c.slice(0, 4)}-${c.slice(4)}`);
  }
  const hashes = await Promise.all(plain.map(c => bcrypt.hash(c, 10)));
  return { plain, hashes };
}

export function normalizeRecoveryCode(input: string): string {
  return String(input).trim().toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');
}

export function looksLikeRecoveryCode(input: string): boolean {
  return /^[a-z0-9]{4}-[a-z0-9]{4}$/.test(normalizeRecoveryCode(input));
}

/** Index of the matching hash, or -1. The caller removes it — single use. */
export async function matchRecoveryCode(input: string, hashes: string[]): Promise<number> {
  const code = normalizeRecoveryCode(input);
  if (!looksLikeRecoveryCode(code)) return -1;
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(code, hashes[i])) return i;
  }
  return -1;
}

// ── enrolment token ──────────────────────────────────────────────────────
// The secret is never persisted on display. It rides in a short-lived signed
// token until ONE correct code proves the app has it; only then is it stored.
export async function signEnrolToken(payload: { adminId: string; secret: string }): Promise<string> {
  return new SignJWT({ ...payload, type: 'totp_enrol', nonce: randomBytes(8).toString('hex') })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(jwtSecret);
}

export async function verifyEnrolToken(token: string): Promise<{ adminId: string; secret: string } | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret);
    if (payload.type !== 'totp_enrol' || typeof payload.adminId !== 'string' || typeof payload.secret !== 'string') return null;
    return { adminId: payload.adminId, secret: payload.secret };
  } catch { return null; }
}

/** Markers kept in the existing twoFactorCode column while the TOTP path is in use. */
export const TOTP_PENDING = 'totp-pending';
export const TOTP_USED_PREFIX = 'totp-used:';
