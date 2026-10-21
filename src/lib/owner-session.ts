// AW-1 (Cam 2026-10-20: "My owner sign in should be /cam and should be
// unbelievably secure"; owner session 4h, risky actions re-confirmed, an email
// on every sign-in, new devices approved by email, its own cookie, and no trace
// of the owner on /admin).
//
// The owner never holds the employees' admin_session cookie. A sign-in at /cam
// creates an OwnerSession row and sets gr_owner — a short JWT that only NAMES
// that row. The row decides: revoked or past expiresAt and the session is over,
// whatever the cookie says. Devices: the browser keeps a random token
// (gr_owner_device, httpOnly); only its SHA-256 is stored, and a device is
// trusted only once the owner approved it from an emailed link. Server only.
import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import type { NextResponse } from 'next/server';
import { prisma } from './prisma';

export const OWNER_COOKIE = 'gr_owner';
export const DEVICE_COOKIE = 'gr_owner_device';
export const OWNER_SESSION_HOURS = 4;
const DEVICE_COOKIE_DAYS = 400;
const APPROVAL_MINUTES = 15;

const rawSecret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
if (!rawSecret) throw new Error('JWT_SECRET is not set — refusing to start');
const secret = new TextEncoder().encode(rawSecret);

/** The time printed in owner alert emails (Cam is on the East Coast). */
export const alertTime = () => new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

const secure = process.env.NODE_ENV === 'production';

/** Where the request came from, for the session row and the sign-in email. */
export async function requestContext(): Promise<{ ip: string; userAgent: string; place: string }> {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || '';
  const city = decodeURIComponent(h.get('x-vercel-ip-city') ?? '');
  const region = h.get('x-vercel-ip-country-region') ?? '';
  const country = h.get('x-vercel-ip-country') ?? '';
  return { ip, userAgent: (h.get('user-agent') ?? '').slice(0, 300), place: [city, region, country].filter(Boolean).join(', ') };
}

/** "Safari on iPhone" from a user agent — for emails and the device list. */
export function deviceLabel(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'A browser';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'an unknown device';
  return `${browser} on ${os}`;
}

// ── Devices ─────────────────────────────────────────────────────────────────

/** This browser's device token, if it has one. */
export async function deviceTokenFromCookie(): Promise<string | null> {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
}

/** The approved, unrevoked device this browser is, for this owner — or null. */
export async function trustedDevice(adminId: string, rawToken: string | null) {
  if (!rawToken) return null;
  const d = await prisma.ownerDevice.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (!d || d.adminId !== adminId || !d.approvedAt || d.revokedAt) return null;
  return d;
}

/**
 * This browser isn't a trusted device: (re)start its approval. Returns the
 * device token to keep in the browser and the one-time approval token for the
 * emailed link (the caller sends the email). Only called after a correct
 * password, so nobody else can make the owner's inbox ring.
 */
export async function startDeviceApproval(adminId: string, rawToken: string | null, ctx: { ip: string; userAgent: string }) {
  const approval = newToken();
  const data = { approvalTokenHash: sha256(approval), approvalExpiresAt: new Date(Date.now() + APPROVAL_MINUTES * 60_000), label: deviceLabel(ctx.userAgent), ip: ctx.ip };
  if (rawToken) {
    const existing = await prisma.ownerDevice.findUnique({ where: { tokenHash: sha256(rawToken) } });
    // A revoked device stays revoked: it gets a brand-new token below.
    if (existing && existing.adminId === adminId && !existing.revokedAt) {
      await prisma.ownerDevice.update({ where: { id: existing.id }, data });
      return { deviceToken: rawToken, approvalToken: approval };
    }
  }
  const deviceToken = newToken();
  await prisma.ownerDevice.create({ data: { adminId, tokenHash: sha256(deviceToken), ...data } });
  return { deviceToken, approvalToken: approval };
}

export function setDeviceCookie(res: NextResponse, deviceToken: string) {
  res.cookies.set(DEVICE_COOKIE, deviceToken, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: DEVICE_COOKIE_DAYS * 86400 });
}

/** The device an approval link is for, while the link is still good. */
export async function deviceForApproval(approvalToken: string) {
  if (!approvalToken) return null;
  const d = await prisma.ownerDevice.findUnique({ where: { approvalTokenHash: sha256(approvalToken) } });
  if (!d || d.revokedAt || !d.approvalExpiresAt || d.approvalExpiresAt < new Date()) return null;
  return d;
}

/** Approve it: the link works once. */
export async function approveDevice(approvalToken: string): Promise<boolean> {
  const d = await deviceForApproval(approvalToken);
  if (!d) return false;
  const n = await prisma.ownerDevice.updateMany({
    where: { id: d.id, approvalTokenHash: sha256(approvalToken), revokedAt: null },
    data: { approvedAt: new Date(), approvalTokenHash: null, approvalExpiresAt: null },
  });
  return n.count === 1;
}

// ── Sessions ────────────────────────────────────────────────────────────────

/** The gr_owner cookie value: it only names the session row (exported for the isolation test). */
export async function signOwnerToken(sid: string, adminId: string, expiresAt: Date) {
  return new SignJWT({ type: 'owner_session', sid, adminId })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime(Math.floor(expiresAt.getTime() / 1000)).sign(secret);
}

/** Sign the owner in: a session row and the gr_owner cookie on `res`. */
export async function createOwnerSession(res: NextResponse, a: { adminId: string; deviceId: string; method: string; ip: string; userAgent: string }) {
  const expiresAt = new Date(Date.now() + OWNER_SESSION_HOURS * 3600_000);
  // Signing in proved a second factor just now — that counts as the first "confirm it's you" (AW-1c).
  const s = await prisma.ownerSession.create({ data: { adminId: a.adminId, deviceId: a.deviceId, method: a.method, ip: a.ip, userAgent: a.userAgent, expiresAt, stepUpAt: new Date() } });
  await prisma.ownerDevice.update({ where: { id: a.deviceId }, data: { lastUsedAt: new Date() } });
  const token = await signOwnerToken(s.id, a.adminId, expiresAt);
  // lax, not strict: an emailed link to /admin must arrive signed in. Admin writes are JSON
  // POSTs (a cross-site form can't send those), and the session itself is a revocable row.
  res.cookies.set(OWNER_COOKIE, token, { httpOnly: true, secure, sameSite: 'lax', path: '/', expires: expiresAt });
  return s;
}

/** The live owner session this request carries, or null. Never throws on a bad cookie. */
export async function ownerSessionFromCookie() {
  const token = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!token) return null;
  let claims: { type?: string; sid?: string; adminId?: string };
  try { claims = (await jwtVerify(token, secret)).payload as typeof claims; } catch { return null; }
  if (claims.type !== 'owner_session' || !claims.sid || !claims.adminId) return null;
  const s = await prisma.ownerSession.findUnique({
    where: { id: claims.sid },
    include: { admin: { select: { id: true, email: true, name: true, role: true, active: true } }, device: { select: { revokedAt: true } } },
  });
  if (!s || s.adminId !== claims.adminId || s.revokedAt || s.expiresAt <= new Date()) return null;
  // A revoked device ends its sessions too; a demoted or deactivated owner is out at once.
  if (s.device?.revokedAt || !s.admin.active || s.admin.role !== 'owner') return null;
  return s;
}

/** AW-1c: how recently a second factor must have been proved for a risky action. */
export const STEP_UP_MINUTES = 5;

export async function markStepUp(sessionId: string) {
  await prisma.ownerSession.update({ where: { id: sessionId }, data: { stepUpAt: new Date() } });
}

export async function revokeOwnerSession(id: string) {
  await prisma.ownerSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** "Sign out everywhere": every live owner session for this admin. */
export async function revokeAllOwnerSessions(adminId: string) {
  await prisma.ownerSession.updateMany({ where: { adminId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export function clearOwnerCookie(res: NextResponse) {
  res.cookies.set(OWNER_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
}
