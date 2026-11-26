import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/token-hash';
import { signAdminSetPasswordToken } from '@/lib/admin-session';
import { sendAdminTwoFactorCode, sendOwnerDeviceApproval, sendOwnerSignInAlert } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { hasPasskey, authenticationOptions, verifyPasskeySignIn } from '@/lib/owner-passkey';
import { requestContext, deviceTokenFromCookie, trustedDevice, startDeviceApproval, setDeviceCookie, createOwnerSession, deviceLabel, alertTime as when } from '@/lib/owner-session';

// AW-1 (Cam 2026-10-20): the owner's ONLY sign-in, at /cam. Password → an
// approved device (a new one is approved from an emailed link) → a second
// factor → a 4-hour OwnerSession (gr_owner cookie) and an email saying so.
// Every refusal before the password is proved reads the same as a wrong
// password, so this route never confirms that an owner account exists.

/** Arm the authenticator-app step (the password was just proved). */
async function setTotpPending(admin: { id: string; twoFactorCode: string | null; twoFactorCodeExpiry: Date | null }) {
  // Carry a still-live used step onto the pending marker (replay guard).
  const carried = admin.twoFactorCode?.startsWith(TOTP_USED_PREFIX) && admin.twoFactorCodeExpiry && admin.twoFactorCodeExpiry > new Date()
    ? ':' + admin.twoFactorCode.slice(TOTP_USED_PREFIX.length) : '';
  await prisma.adminUser.update({
    where: { id: admin.id },
    // Audit 2026-11-24 M8: the try counter is NOT set back to 0 here. It was, on every right
    // password, so the 5-try limit on the second factor never ran out (lib/login-guard).
    data: { twoFactorCode: TOTP_PENDING + carried, twoFactorCodeExpiry: new Date(Date.now() + 10 * 60 * 1000) },
  });
}



/**
 * M8 review: what a spent pending marker leaves behind — the still-live used authenticator step it
 * carried ("totp-pending:<step>"), so running out of tries never makes a seen code replayable.
 */
function keepUsedStep(marker: string): Record<string, unknown> | undefined {
  if (!marker.startsWith(TOTP_PENDING)) return undefined;
  const carried = marker.slice(TOTP_PENDING.length + 1);
  return carried ? { twoFactorCode: TOTP_USED_PREFIX + carried, twoFactorCodeExpiry: new Date(Date.now() + 2 * TOTP_STEP_SECONDS * 1000) } : undefined;
}

/** Signed in: the session, the cookie, and the alert email (a failed email never blocks the sign-in). */
async function signIn(req: Request, admin: { id: string; email: string; name: string }, deviceId: string, method: string) {
  await securityEvent(req, { kind: 'signin_ok', surface: 'owner', email: admin.email, accountId: admin.id, detail: method });
  const ctx = await requestContext();
  const res = NextResponse.json({ success: true });
  await createOwnerSession(res, { adminId: admin.id, deviceId, method, ip: ctx.ip, userAgent: ctx.userAgent });
  try { await sendOwnerSignInAlert({ email: admin.email, name: admin.name, device: deviceLabel(ctx.userAgent), place: ctx.place, when: when(), method }); }
  catch (err) { console.error(JSON.stringify({ ev: 'owner.signin_alert.fail', adminId: admin.id, error: err instanceof Error ? err.message : String(err) })); }
  return res;
}
import { securityEvent } from '@/lib/security-events';
import { failUnknownLogin, unknownLoginLockedUntil, claimPasswordAttempt, clearPasswordAttempts, dummyPasswordCheck, lockoutMinutes, LOGIN_MAX_ATTEMPTS, claimSecondFactorAttempt, spendSecondFactorIfOut, useSecondFactorCode, mayIssueSecondFactor } from '@/lib/login-guard';
import { totpMatchStep, matchRecoveryCode, looksLikeRecoveryCode, TOTP_PENDING, TOTP_USED_PREFIX, TOTP_STEP_SECONDS } from '@/lib/owner-totp';

function gen6DigitCode(): string {
  return String(randomInt(100000, 999999));
}

function lockoutResponse(lockoutUntil: Date) {
  const minutes = lockoutMinutes(lockoutUntil);
  return NextResponse.json({ error: `Too many attempts, try again in ${minutes} minute${minutes === 1 ? '' : 's'}` }, { status: 429 });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await req.json();

  // ── Step 2a (AW-1b): a passkey ───────────────────────────────────────
  if (body.step === 'passkey') {
    const allowed = await rateLimit(`2fa:admin:${ip}`, 10, 300);
    if (!allowed) {
      await securityEvent(req, { kind: 'rate_limited', surface: 'owner', detail: 'second factor' });
      return NextResponse.json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 });
    }
    const email = String(body.email ?? '').trim().toLowerCase();
    const admin = email ? await prisma.adminUser.findUnique({ where: { email } }) : null;
    const startOver = () => NextResponse.json({ error: 'No sign-in in progress — please start over.' }, { status: 400 });
    if (!admin || admin.role !== 'owner' || !admin.active) return startOver();
    const device = await trustedDevice(admin.id, await deviceTokenFromCookie());
    if (!device) return startOver();
    // Only right after the password step (a challenge from adding a passkey can't sign anyone in).
    if (!admin.twoFactorCode?.startsWith(TOTP_PENDING) || !admin.twoFactorCodeExpiry || admin.twoFactorCodeExpiry < new Date()) return startOver();
    // Audit 2026-11-24 M8: the try is claimed before the check, against this pending marker (lib/login-guard).
    const marker = admin.twoFactorCode;
    if (!(await claimSecondFactorAttempt('admin', admin.id, marker))) {
      const out = await spendSecondFactorIfOut('admin', admin.id, { keep: keepUsedStep(marker) });
      await securityEvent(req, { kind: 'second_factor_failed', surface: 'owner', email, accountId: admin.id, detail: out ? 'passkey, no tries left' : 'passkey, sign-in step no longer current' });
      if (!out) return startOver();
      await prisma.adminUser.update({ where: { id: admin.id }, data: { passkeyChallenge: null, passkeyChallengeExpiry: null } });
      return NextResponse.json({ error: 'Too many incorrect attempts. Please start over.' }, { status: 400 });
    }
    if (!(await verifyPasskeySignIn(admin.id, body.response))) {
      const clear = await spendSecondFactorIfOut('admin', admin.id, { storedCode: marker, keep: keepUsedStep(marker) });
      await securityEvent(req, { kind: 'second_factor_failed', surface: 'owner', email, accountId: admin.id, detail: 'passkey' });
      return NextResponse.json({ error: clear ? 'Too many incorrect attempts. Please start over.' : 'That passkey didn’t check out — start over and try again, or use your authenticator app.' }, { status: 400 });
    }
    // The backup step is no longer needed: clear its pending marker — but keep a
    // still-live used authenticator step it carried, so that code can't be replayed.
    const carried = marker.slice(TOTP_PENDING.length + 1);
    const used = await useSecondFactorCode('admin', admin.id, marker, {
      ...(carried ? { twoFactorCode: TOTP_USED_PREFIX + carried, twoFactorCodeExpiry: new Date(Date.now() + 2 * TOTP_STEP_SECONDS * 1000) } : { twoFactorCode: null, twoFactorCodeExpiry: null }),
      lastLoginAt: new Date(),
    });
    if (!used) {
      await securityEvent(req, { kind: 'second_factor_failed', surface: 'owner', email, accountId: admin.id, detail: 'passkey, sign-in step already used' });
      return startOver();
    }
    return signIn(req, admin, device.id, 'passkey');
  }

  // ── Step 2: verify 2FA code ──────────────────────────────────────────
  if (body.step === 'verify') {
    const allowed = await rateLimit(`2fa:admin:${ip}`, 10, 300);
    if (!allowed) {
      await securityEvent(req, { kind: 'rate_limited', surface: 'owner', detail: 'second factor' });
      return NextResponse.json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 });
    }

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

    // Audit 2026-11-24 M8: the try is claimed before the compare, against this exact code or
    // pending marker, and only while tries remain (lib/login-guard).
    const storedCode = admin.twoFactorCode;
    if (admin.twoFactorSecret && !storedCode.startsWith(TOTP_PENDING)) return startOver();
    if (!(await claimSecondFactorAttempt('admin', admin.id, storedCode))) {
      const out = await spendSecondFactorIfOut('admin', admin.id, { keep: keepUsedStep(storedCode) });
      await securityEvent(req, { kind: 'second_factor_failed', surface: 'owner', email, accountId: admin.id, detail: out ? 'no tries left' : 'sign-in step no longer current' });
      if (!out) return startOver();
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
        const clear = await spendSecondFactorIfOut('admin', admin.id, { storedCode, keep: keepUsedStep(storedCode) });
        await securityEvent(req, { kind: 'second_factor_failed', surface: 'owner', email, accountId: admin.id, detail: method === 'recovery' ? 'recovery code' : 'authenticator code' });
        return NextResponse.json({ error: clear ? 'Too many incorrect attempts. Please start over.' : 'Incorrect code' }, { status: 400 });
      }
      // Used up once: two requests with one code (or one recovery code) can't both sign in.
      if (!(await useSecondFactorCode('admin', admin.id, storedCode, { ...data, lastLoginAt: new Date() }))) {
        await securityEvent(req, { kind: 'second_factor_failed', surface: 'owner', email, accountId: admin.id, detail: `${method === 'recovery' ? 'recovery code' : 'authenticator code'}, already used` });
        return startOver();
      }
      return signIn(req, admin, device.id, method);
    }

    const valid = await bcrypt.compare(String(code).trim(), storedCode);
    if (!valid) {
      const clearCode = await spendSecondFactorIfOut('admin', admin.id, { storedCode });
      await securityEvent(req, { kind: 'second_factor_failed', surface: 'owner', email, accountId: admin.id, detail: 'emailed code' });
      return NextResponse.json({ error: clearCode ? 'Too many incorrect attempts. Please start over.' : 'Incorrect code' }, { status: 400 });
    }

    if (!(await useSecondFactorCode('admin', admin.id, storedCode, { twoFactorCode: null, twoFactorCodeExpiry: null, lastLoginAt: new Date() }))) {
      await securityEvent(req, { kind: 'second_factor_failed', surface: 'owner', email, accountId: admin.id, detail: 'emailed code, already used' });
      return startOver();
    }

    // The only path that has seen a second factor makes the owner session.
    return signIn(req, admin, device.id, 'email');
  }

  // ── Step 1: verify password, send 2FA code ───────────────────────────
  const allowed = await rateLimit(`login:admin:${ip}`, 20, 600);
  if (!allowed) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'owner', detail: 'sign-in' });
    return NextResponse.json({ error: 'Too many attempts from your network, try again in a few minutes.' }, { status: 429 });
  }

  const { email: rawEmail, password } = body;
  if (!rawEmail || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || admin.role !== 'owner' || !admin.active || !admin.passwordHash) {
    // SEC-3 audit: same work, same answer and the same lockout as the real
    // owner (lib/login-guard), so nothing here says whose email it is — and an
    // employee's own lockout is never touched from this door.
    const detail = !admin ? 'unknown account' : admin.role !== 'owner' ? 'employee account at the owner door' : !admin.active ? 'account turned off' : 'account never activated';
    const locked = await unknownLoginLockedUntil('owner', email);
    if (locked) {
      await securityEvent(req, { kind: 'signin_failed', surface: 'owner', email, accountId: admin?.id, detail: `${detail}, while locked out` });
      return lockoutResponse(locked);
    }
    const lock = await failUnknownLogin('owner', email, String(password));
    await securityEvent(req, { kind: lock ? 'locked_out' : 'signin_failed', surface: 'owner', email, accountId: admin?.id, detail });
    if (lock) return lockoutResponse(lock);
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (admin.lockoutUntil && admin.lockoutUntil > new Date()) {
    await securityEvent(req, { kind: 'signin_failed', surface: 'owner', email, accountId: admin.id, detail: 'while locked out' });
    return lockoutResponse(admin.lockoutUntil);
  }

  // Audit 2026-11-24 M3: the try is claimed atomically before the compare (lib/login-guard).
  const claim = await claimPasswordAttempt('admin', admin.id);
  if (!claim.claimed) {
    await dummyPasswordCheck(String(password));
    await securityEvent(req, { kind: 'signin_failed', surface: 'owner', email, accountId: admin.id, detail: 'while locked out' });
    return lockoutResponse(claim.lockoutUntil);
  }
  const valid = await bcrypt.compare(String(password), admin.passwordHash);
  if (!valid) {
    const lockoutUntil = claim.attempts >= LOGIN_MAX_ATTEMPTS ? claim.lockoutUntil : null;
    await securityEvent(req, { kind: lockoutUntil ? 'locked_out' : 'signin_failed', surface: 'owner', email, accountId: admin.id, detail: 'wrong password' });
    if (lockoutUntil) return lockoutResponse(lockoutUntil);
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await clearPasswordAttempts('admin', admin.id);

  // A device the owner hasn't approved: email the approval link and stop here.
  // Only after the password is proved, so nobody else can make the inbox ring.
  const rawDevice = await deviceTokenFromCookie();
  if (!(await trustedDevice(admin.id, rawDevice))) {
    const ctx = await requestContext();
    const { deviceToken, approvalToken } = await startDeviceApproval(admin.id, rawDevice, ctx);
    await securityEvent(req, { kind: 'new_device', surface: 'owner', email, accountId: admin.id, detail: 'right password on a device not yet approved — approval emailed' });
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
      data: { setPasswordToken: hashToken(token) /* M9: only the hash is stored */, setPasswordTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    return NextResponse.json({ mustChangePassword: true, setPasswordToken: token });
  }

  // Audit 2026-11-24 M8: each right password arms a fresh second-factor step, so they are capped per
  // account. Only someone with the right password on an approved device reaches this.
  if (!(await mayIssueSecondFactor('admin', admin.id))) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'owner', email, accountId: admin.id, detail: 'second-factor steps per account' });
    return NextResponse.json({ error: 'Too many sign-ins started for this account in the last hour. Try again later.' }, { status: 429 });
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
    data: { twoFactorCode: hashedCode, twoFactorCodeExpiry: expiry },
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
