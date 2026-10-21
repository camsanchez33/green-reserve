import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAdminSetPasswordToken } from '@/lib/admin-session';
import { sendAdminTwoFactorCode, sendOwnerDeviceApproval, sendOwnerSignInAlert } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { hasPasskey, authenticationOptions, verifyPasskeySignIn } from '@/lib/owner-passkey';
import { requestContext, deviceTokenFromCookie, trustedDevice, startDeviceApproval, setDeviceCookie, createOwnerSession, deviceLabel } from '@/lib/owner-session';

// AW-1 (Cam 2026-10-20): the owner's ONLY sign-in, at /cam. Password → an
// approved device (a new one is approved from an emailed link) → a second
// factor → a 4-hour OwnerSession (gr_owner cookie) and an email saying so.
// Every refusal before the password is proved reads the same as a wrong
// password, so this route never confirms that an owner account exists.

// Same cost (12) as real admin passwords, so an unknown email takes as long as a real one.
/** Arm the authenticator-app step (the password was just proved). */
async function setTotpPending(admin: { id: string; twoFactorCode: string | null; twoFactorCodeExpiry: Date | null }) {
  // Carry a still-live used step onto the pending marker (replay guard).
  const carried = admin.twoFactorCode?.startsWith(TOTP_USED_PREFIX) && admin.twoFactorCodeExpiry && admin.twoFactorCodeExpiry > new Date()
    ? ':' + admin.twoFactorCode.slice(TOTP_USED_PREFIX.length) : '';
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { twoFactorCode: TOTP_PENDING + carried, twoFactorCodeExpiry: new Date(Date.now() + 10 * 60 * 1000), twoFactorAttempts: 0 },
  });
}

const DUMMY_HASH = '$2a$12$x9I/Ln7XwBr4.techzuhLufMEVbOz1lhUde8CTW8YVHD9pGubcv7u';

const when = () => new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';

/** Signed in: the session, the cookie, and the alert email (a failed email never blocks the sign-in). */
async function signIn(admin: { id: string; email: string; name: string }, deviceId: string, method: string) {
  const ctx = await requestContext();
  const res = NextResponse.json({ success: true });
  await createOwnerSession(res, { adminId: admin.id, deviceId, method, ip: ctx.ip, userAgent: ctx.userAgent });
  try { await sendOwnerSignInAlert({ email: admin.email, name: admin.name, device: deviceLabel(ctx.userAgent), place: ctx.place, when: when(), method }); }
  catch (err) { console.error(JSON.stringify({ ev: 'owner.signin_alert.fail', adminId: admin.id, error: err instanceof Error ? err.message : String(err) })); }
  return res;
}
import { totpMatchStep, matchRecoveryCode, looksLikeRecoveryCode, TOTP_PENDING, TOTP_USED_PREFIX, TOTP_STEP_SECONDS } from '@/lib/owner-totp';

const MAX_2FA_ATTEMPTS = 5;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function gen6DigitCode(): string {
  return String(randomInt(100000, 999999));
}

function lockoutResponse(lockoutUntil: Date) {
  const minutes = Math.ceil((lockoutUntil.getTime() - Date.now()) / 60000);
  return NextResponse.json({ error: `Too many attempts, try again in ${minutes} minute${minutes === 1 ? '' : 's'}` }, { status: 429 });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await req.json();

  // ── Step 2a (AW-1b): a passkey ───────────────────────────────────────
  if (body.step === 'passkey') {
    const allowed = await rateLimit(`2fa:admin:${ip}`, 10, 300);
    if (!allowed) return NextResponse.json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 });
    const email = String(body.email ?? '').trim().toLowerCase();
    const admin = email ? await prisma.adminUser.findUnique({ where: { email } }) : null;
    const startOver = () => NextResponse.json({ error: 'No sign-in in progress — please start over.' }, { status: 400 });
    if (!admin || admin.role !== 'owner' || !admin.active) return startOver();
    const device = await trustedDevice(admin.id, await deviceTokenFromCookie());
    if (!device) return startOver();
    // Only right after the password step (a challenge from adding a passkey can't sign anyone in).
    if (!admin.twoFactorCode?.startsWith(TOTP_PENDING) || !admin.twoFactorCodeExpiry || admin.twoFactorCodeExpiry < new Date()) return startOver();
    if (admin.twoFactorAttempts >= MAX_2FA_ATTEMPTS) {
      await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorCode: null, twoFactorCodeExpiry: null, twoFactorAttempts: 0, passkeyChallenge: null, passkeyChallengeExpiry: null } });
      return NextResponse.json({ error: 'Too many incorrect attempts. Please start over.' }, { status: 400 });
    }
    if (!(await verifyPasskeySignIn(admin.id, body.response))) {
      const attempts = admin.twoFactorAttempts + 1;
      const clear = attempts >= MAX_2FA_ATTEMPTS;
      await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorAttempts: clear ? 0 : attempts, ...(clear ? { twoFactorCode: null, twoFactorCodeExpiry: null } : {}) } });
      return NextResponse.json({ error: clear ? 'Too many incorrect attempts. Please start over.' : 'That passkey didn’t check out — start over and try again, or use your authenticator app.' }, { status: 400 });
    }
    // The backup step is no longer needed: clear its pending marker.
    await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorCode: null, twoFactorCodeExpiry: null, twoFactorAttempts: 0, lastLoginAt: new Date() } });
    return signIn(admin, device.id, 'passkey');
  }

  // ── Step 2: verify 2FA code ──────────────────────────────────────────
  if (body.step === 'verify') {
    const allowed = await rateLimit(`2fa:admin:${ip}`, 10, 300);
    if (!allowed) return NextResponse.json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 });

    const { email: rawEmail, code } = body;
    if (!rawEmail || !code) return NextResponse.json({ error: 'email and code required' }, { status: 400 });
    const email = String(rawEmail).trim().toLowerCase();

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    // No account, no approved device, or no sign-in in progress all read the
    // SAME — this step takes no password, so it must never say whose email it is.
    const startOver = () => NextResponse.json({ error: 'No sign-in in progress — please start over.' }, { status: 400 });
    if (!admin || admin.role !== 'owner' || !admin.active) return startOver();
    // The second factor only counts on an approved device (checked again here, not only at step 1).
    const device = await trustedDevice(admin.id, await deviceTokenFromCookie());
    if (!device) return startOver();
    if (!admin.twoFactorCode || !admin.twoFactorCodeExpiry) return startOver();
    if (admin.twoFactorCodeExpiry < new Date()) {
      return NextResponse.json({ error: 'Code expired — please start over' }, { status: 400 });
    }

    if (admin.twoFactorAttempts >= MAX_2FA_ATTEMPTS) {
      await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorCode: null, twoFactorCodeExpiry: null, twoFactorAttempts: 0 } });
      return NextResponse.json({ error: 'Too many incorrect attempts. Please start over.' }, { status: 400 });
    }

    // OWNER TOTP 2FA: once enrolled, the second factor is the authenticator
    // app (or a single-use recovery code). The pending marker written at step
    // 1 proves the password was just verified; the used marker rejects a
    // replayed code inside its step. Same attempt counter and lockout as the
    // email path below, which stays untouched for an un-enrolled owner.
    if (admin.twoFactorSecret) {
      // Only the PENDING marker (written when the password was just verified)
      // admits a second factor. The used-step marker written after a success
      // does not — a recovery code alone must never open a session (review).
      if (!admin.twoFactorCode.startsWith(TOTP_PENDING)) return startOver();
      // A step used by the previous login rides along on the pending marker
      // ("totp-pending:<step>") so the same code cannot be replayed into a
      // fresh login inside its window.
      const carriedStep = admin.twoFactorCode.slice(TOTP_PENDING.length + 1);
      const raw = String(code).trim();
      let ok = false;
      let method = 'totp';
      let data: Record<string, unknown> = {};
      if (looksLikeRecoveryCode(raw)) {
        method = 'recovery';
        const idx = await matchRecoveryCode(raw, admin.twoFactorRecoveryCodes);
        if (idx >= 0) {
          ok = true;
          data = { twoFactorRecoveryCodes: admin.twoFactorRecoveryCodes.filter((_, i) => i !== idx), twoFactorCode: null, twoFactorCodeExpiry: null };
        }
      } else {
        const step = totpMatchStep(raw, admin.twoFactorSecret);
        if (step !== null && String(step) !== carriedStep) {
          ok = true;
          // Keep the used-step marker for two steps so the same code cannot be replayed.
          data = { twoFactorCode: TOTP_USED_PREFIX + step, twoFactorCodeExpiry: new Date(Date.now() + 2 * TOTP_STEP_SECONDS * 1000) };
        }
      }
      if (!ok) {
        const attempts = admin.twoFactorAttempts + 1;
        const clear = attempts >= MAX_2FA_ATTEMPTS;
        await prisma.adminUser.update({
          where: { id: admin.id },
          data: { twoFactorAttempts: clear ? 0 : attempts, ...(clear ? { twoFactorCode: null, twoFactorCodeExpiry: null } : {}) },
        });
        return NextResponse.json({ error: clear ? 'Too many incorrect attempts. Please start over.' : 'Incorrect code' }, { status: 400 });
      }
      await prisma.adminUser.update({ where: { id: admin.id }, data: { ...data, twoFactorAttempts: 0, lastLoginAt: new Date() } });
      return signIn(admin, device.id, method);
    }

    const valid = await bcrypt.compare(String(code).trim(), admin.twoFactorCode);
    if (!valid) {
      const attempts = admin.twoFactorAttempts + 1;
      const clearCode = attempts >= MAX_2FA_ATTEMPTS;
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          twoFactorAttempts: clearCode ? 0 : attempts,
          ...(clearCode ? { twoFactorCode: null, twoFactorCodeExpiry: null } : {}),
        },
      });
      return NextResponse.json({ error: clearCode ? 'Too many incorrect attempts. Please start over.' : 'Incorrect code' }, { status: 400 });
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { twoFactorCode: null, twoFactorCodeExpiry: null, twoFactorAttempts: 0, lastLoginAt: new Date() },
    });

    // The only path that has seen a second factor makes the owner session.
    return signIn(admin, device.id, 'email');
  }

  // ── Step 1: verify password, send 2FA code ───────────────────────────
  const allowed = await rateLimit(`login:admin:${ip}`, 20, 600);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts from your network, try again in a few minutes.' }, { status: 429 });

  const { email: rawEmail, password } = body;
  if (!rawEmail || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || admin.role !== 'owner' || !admin.active) {
    // Same work as a real check, so the answer's timing doesn't say whose email it is.
    await bcrypt.compare(String(password), DUMMY_HASH);
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (admin.lockoutUntil && admin.lockoutUntil > new Date()) return lockoutResponse(admin.lockoutUntil);

  // Same guard as /api/admin/login:31 — bcrypt.compare throws on a null hash,
  // so an owner row created but never activated would 500 instead of getting
  // the actionable "not activated" message.
  if (!admin.passwordHash)
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

  const valid = await bcrypt.compare(String(password), admin.passwordHash);
  if (!valid) {
    const failedLoginAttempts = admin.failedLoginAttempts + 1;
    const lockoutUntil = failedLoginAttempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await prisma.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts, ...(lockoutUntil ? { lockoutUntil } : {}) } });
    if (lockoutUntil) return lockoutResponse(lockoutUntil);
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await prisma.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts: 0, lockoutUntil: null } });

  // A device the owner hasn't approved: email the approval link and stop here.
  // Only after the password is proved, so nobody else can make the inbox ring.
  const rawDevice = await deviceTokenFromCookie();
  if (!(await trustedDevice(admin.id, rawDevice))) {
    const ctx = await requestContext();
    const { deviceToken, approvalToken } = await startDeviceApproval(admin.id, rawDevice, ctx);
    // Never built from the request's Host: the link carries the approval token.
    const origin = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
    let res: NextResponse;
    try {
      await sendOwnerDeviceApproval({ email: admin.email, name: admin.name, approvalUrl: `${origin}/cam/approve?token=${approvalToken}`, device: deviceLabel(ctx.userAgent), place: ctx.place, when: when() });
      res = NextResponse.json({ needsDeviceApproval: true });
    } catch (err) {
      console.error(JSON.stringify({ ev: 'owner.device_approval_email.fail', adminId: admin.id, error: err instanceof Error ? err.message : String(err) }));
      res = NextResponse.json({ error: 'Your password was right, but the device-approval email did not send. Wait a minute and try again.' }, { status: 502 });
    }
    // The browser keeps its device token either way, so a retry re-sends for the SAME device.
    setDeviceCookie(res, deviceToken);
    return res;
  }

  if (admin.mustChangePassword) {
    const token = await signAdminSetPasswordToken({ adminId: admin.id, email: admin.email });
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { setPasswordToken: token, setPasswordTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    return NextResponse.json({ mustChangePassword: true, setPasswordToken: token });
  }

  // AW-1b: a passkey is the second factor once one exists. The authenticator
  // app stays ready as the backup (its pending marker is set below too), and
  // an owner with a passkey never gets an emailed code.
  if (await hasPasskey(admin.id)) {
    // The pending marker is also the proof, checked by the passkey step, that
    // the password was just verified here.
    await setTotpPending(admin);
    const options = await authenticationOptions(admin.id);
    return NextResponse.json({ requires2FA: true, method: 'passkey', options, backup: admin.twoFactorSecret ? 'totp' : null });
  }

  // OWNER TOTP 2FA: enrolled → no email; the app has the code. The pending
  // marker is what the verify step checks for.
  if (admin.twoFactorSecret) {
    await setTotpPending(admin);
    return NextResponse.json({ requires2FA: true, method: 'totp' });
  }

  const code = gen6DigitCode();
  const hashedCode = await bcrypt.hash(code, 10);
  const expiry = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { twoFactorCode: hashedCode, twoFactorCodeExpiry: expiry, twoFactorAttempts: 0 },
  });

  // Review fix: this send now throws on a Resend rejection (getResend), and an
  // uncaught throw reached the page as a non-JSON 500 → "Network error".
  try {
    await sendAdminTwoFactorCode({ email: admin.email, name: admin.name, code });
  } catch (err) {
    console.error('Admin 2FA code email failed:', err);
    return NextResponse.json({ error: 'Your password was right, but the sign-in code email did not send. Wait a minute and sign in again.' }, { status: 502 });
  }

  return NextResponse.json({ requires2FA: true, method: 'email' });
}
