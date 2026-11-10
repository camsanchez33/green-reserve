# Security lane: full sweep, 2026-11-10

Scope: money paths, route access (operator and admin), golfer token routes, sign-in doors, headers and packages.
The sweep was read-only and ran against `main` at `cb7a92c`. Nothing in production was touched. Every finding below was traced from a real caller through the helper it calls, and the overseer re-read the cited lines before writing it down.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 7 |
| Low | 6 |
| Unverified | 1 |

---

## High

### H1. The member sign-in link sender has no rate limit and reveals who is a member
- **File:** `src/app/api/member/[courseSlug]/send-code/route.ts:6-65`
- **Exploit:** anyone, without logging in, loops `POST /api/member/<slug>/send-code {email}` against a live course. This does three things:
  - It floods a member's inbox and burns Resend quota. There is no per-IP, per-email or per-course cap, and middleware has none either.
  - It tells members from non-members:
    - A non-member gets 200 after one query (line 40).
    - A member gets 200 only after a JWT is signed and `sendMemberMagicLink` is **awaited** (line 57), so the reply is measurably slower.
    - When the send fails, a member gets a 500 instead.
  - Nothing is logged: the door writes no `securityEvent`.
- **Evidence:** the file imports no `rateLimit`. `if (!membership) return {success:true}` comes before `await sendMemberMagicLink(...)`. Golfer OTP and operator forgot-password were hardened against exactly this; this door was not.
- **Smallest fix:** copy `/api/auth/forgot-password`:
  - Add `rateLimit('member-code:ip:'+ip, 10, 600)` and `rateLimit('member-code:'+courseId+':'+email, 3, 3600)`. Over either cap, return the same `{success:true}`.
  - Put the membership lookup and the send in `after()`, so every caller gets an immediate 200.
  - Call `securityEvent` with kind `rate_limited` and surface `member` when a cap trips.
- Sent to Build at once.

---

## Medium

### M1. Round pay links and receipts can be sent without limit, and `send_receipt` goes to any address
- **File:** `src/app/api/operator/bookings/route.ts:250-325`
- **Exploit:** any staff login with `sheet.checkin` (the Starter preset has it) can repeat `PATCH {action:'send_receipt', via:'sms', to:'<any number>', smsConsent:'verbal'}` on any paid booking at their course. Each call:
  - records a verbal opt-in for that number;
  - sends the consent text, then the receipt text.

  With `via:'email'` and any `to`, the receipt email goes to any address, carrying the booking's `checkInToken` link.

  `send_pay_link` is also unlimited, though it only goes to the booking's own contact details. The cost is Twilio spend plus GreenReserve's A2P 10DLC and sender reputation. No tenant boundary is crossed and no money moves.
- **Evidence:** the route has no `rateLimit` import. The shop and event pay-link paths already cap sends: `shop-sales/route.ts:86-87` and `events/[id]/payments/route.ts:25-26` allow 60 per course per hour and 5 per item per hour.
- **Smallest fix:** before sending in both actions, add `rateLimit('round-link:course:'+courseId, 60, 3600)` and `rateLimit('round-link:booking:'+id, 5, 3600)`.

### M2. The admin course page shows GreenReserve money to logins without the Money area
- **File:** `src/app/api/admin/course-detail/route.ts:21-24, 83`
- **Exploit:** a support employee whose only area is Courses calls `GET /api/admin/course-detail?courseId=X`. The response's `money` comes from `courseMoney()` and contains:
  - GreenReserve's fees, this month and last month;
  - counter fees not collected;
  - up to 50 failed charges, each with the golfer's name, email, amount and decline reason.

  AW-11 puts all of that under Money.
- **Evidence:** the route's only checks are `areaGate(session,'courses')` and `SUPPORT_PLUS`, and `courseMoney(courseId)` then runs unconditionally. `/api/admin/transactions` and `/api/admin/today` both check the Money area.
- **Smallest fix:** `hasArea(session,'money') ? courseMoney(courseId) : null`, and the tab says "needs Money" when it gets null.

### M3. The owner's authenticator can be replaced without a step-up
- **File:** `src/app/api/admin/two-factor/route.ts:27-31, 58-75`
- **Exploit:** someone holding a live owner session (a stolen `gr_owner` cookie, or an unlocked laptop within the 4-hour TTL) calls `start`, then `confirm` with a code from their own secret. That overwrites:
  - `twoFactorSecret`;
  - all recovery codes.

  The owner's real authenticator stops working, the attacker holds the backup factor, and no notice email is sent.
- **Evidence:** `gate()` only calls `requireOwner`. `confirm` writes `twoFactorSecret: enrol.secret` even when one already exists (`start` returns `replacing: true`). Adding or removing a passkey and removing a device all call `stepUpRequired`.
- **Smallest fix:** in `confirm`, and in `start` for the UX, when a secret already exists, call `stepUpRequired(session)`. Then send the notice email that `announce()` sends for passkeys.

### M4. Admin forgot-password reveals admin and owner emails, and caps only per IP
- **File:** `src/app/api/admin/forgot-password/route.ts:16-43`
- **Exploit:** an unauthenticated caller tells a real account from an unknown one. Two auditors found this independently.
  - An unknown or inactive email gets an instant 200.
  - A real admin email, the owner's included (role is not checked), gets a JWT sign, a DB write and an awaited email send. When the send fails, it gets a 500.

  This breaks SEC-3 ("no sign-in says whether an email has an account") and "/admin … never mentions [the owner]". The only cap is 5 per 15 minutes per IP, so an admin's inbox can be flooded from rotating IPs. The owner's password can also be reset from the employee door; device approval and the second factor at /cam still hold. The door writes no `securityEvent`.
- **Smallest fix:** copy `/api/auth/forgot-password`:
  - always return `SUCCESS()`;
  - do the lookup and the send in `after()`;
  - add `rateLimit('admin-pwreset:email:'+email, 3, 3600)`;
  - treat `role==='owner'` like an unknown email at this door.

### M5. The 2FA attempt counter can be raced
- **Files:**
  - `src/app/api/auth/2fa/verify/route.ts:31-52`
  - the same pattern in `src/app/api/cam/login/route.ts:122-168`
- **Exploit:** someone who already has an operator's password sends many parallel verify requests. Each one:
  1. reads `twoFactorAttempts`;
  2. runs bcrypt;
  3. writes `attempts+1` with a plain `update`.

  Writes are lost, so far more than 5 guesses land against one 6-digit code. The only other limit is 10 per 5 minutes per IP, and that keys on `clientIp` (see U1). For /cam the attacker also needs an approved device cookie.
- **Evidence:** the check `twoFactorAttempts >= MAX` runs before `bcrypt.compare`, and the result is written with `update({ data: { twoFactorAttempts: attempts }})`.
- **Smallest fix:** take the attempt atomically before comparing: `updateMany({ where:{ id, twoFactorAttempts:{ lt: MAX }, twoFactorCode: stored }, data:{ twoFactorAttempts:{ increment:1 } } })`, and refuse when `count===0`. Also add a per-account cap on issuing codes at login.

### M6. Reset and set-password tokens are stored in plaintext
- **Files:**
  - `src/app/api/auth/forgot-password/route.ts:20-22`
  - `src/app/api/auth/reset-password/route.ts:88,122`
  - `src/app/api/admin/forgot-password/route.ts:26-32`
  - `src/app/api/admin/set-password/route.ts:32`
- **Exploit:** anyone who can read the database gets usable reset links. That includes a backup, a Neon branch, a logged query or an export. With them they can take over:
  - any operator account with an unexpired token: 1 hour, or 7 days for setup links, which also sign the owner in;
  - any admin account: 24 hours.

  Owner device-approval tokens, by contrast, are stored as sha256 (`owner-session.ts:76`).
- **Smallest fix:**
  - Store `sha256(token)` and look up by the hash.
  - Make admin set-password a conditional `updateMany` on that hash, so two submits can't both land.

### M7. A staff password reset does not sign out existing staff sessions
- **File:** `src/app/api/auth/reset-password/route.ts:105-115`
- **Exploit:** someone who stole a staff `gr_operator` cookie keeps the 7-day sliding session after the staff member resets their password. Operators get `sessionVersion: {increment:1}`; staff get nothing, and the code comment admits it.
- **Smallest fix:**
  - an additive migration adding `CourseStaff.sessionVersion`;
  - put the version in the staff token;
  - check it in `resolveDashboardSession`.

---

## Low

### L1. Four operator routes trust the bare JWT and skip the `sessionVersion` check
- **Files:**
  - `src/app/api/operator/my-courses/route.ts:11`
  - `active-course/route.ts:10`
  - `onboarding-complete/route.ts:6`
  - `change-password/route.ts:9`
- **Exploit:** a cookie issued before a password change still reads the course list and still writes `onboardingStep` and the switcher cookie. `change-password` still needs the current password. The sliding refresh in `getOperatorSession` keeps reissuing the stale token.
- **Smallest fix:** use `resolveDashboardSession()`, refusing staff, or one shared helper that checks `sv`.

### L2. `scripts/admin-areas-test.ts` can't catch most missing-gate mistakes
- **File:** `scripts/admin-areas-test.ts:32-35`
- **The gap:** the test only checks that the text `areaGate(` appears somewhere in the file. It would pass all of these:
  - a new verb added without a gate;
  - the wrong area passed (M2 passed);
  - an ignored return value;
  - a bare second handler beside an owner-only one.
- **Smallest fix:** check each handler's body, and pin the expected area per route prefix (revenue, transactions and disputes → `money`).

### L3. Some owner actions that move money don't require a step-up
- **Files:**
  - `src/app/api/admin/golfers/route.ts:247` (cancel)
  - `src/app/api/admin/tee-sheet/route.ts:52` (`cancel_booking`)
  - `src/app/api/admin/course-detail/route.ts:207` (offline with `cancelBookings`)
- **The gap:** refund and retry-charge require a step-up; these three don't. For employees the manager gate still holds. This is Cam's call (see the questions below).

### L4. Some doors refuse without writing a `securityEvent`
- **Where:**
  - golfer OTP request when its rate limit trips (`golfer/auth/otp/request/route.ts:24`);
  - operator 2FA when it refuses at max attempts (`auth/2fa/verify/route.ts:36-38`);
  - admin set-password on a bad or used token;
  - `inquiries/signin-code` and `signin-verify` (no events at all);
  - member verify when the course doesn't match or the membership is inactive (`member/[courseSlug]/verify/route.ts:99,108`).
- **Smallest fix:** call `securityEvent` with kind `rate_limited` or `signin_failed` at each refusal.

### L5. A login with only `shop.sell` can void a cash sale
- **File:** `src/app/api/operator/shop-sales/route.ts` (`void_cash`)
- **The gap:** taking cash on a sale needs `sheet.counter_payment`, but voiding a paid cash sale needs only the route's `shop.sell` gate. A cashier with only `shop.sell` can void a cash sale someone else rang up, before the drawer is counted. That lowers the expected cash by the sale's total, so the same amount can leave the drawer without a gap at close-out.
  - Voiding is limited to the same day, before a close-out, and to sales with no green fees (`voidCashSale`).
  - This follows Cam's 2026-10-29 rule ("anyone with the shop permission").
- **Smallest fix (if Cam wants it):** require `sheet.counter_payment` for `void_cash`, the power that takes the cash.

### L6. npm audit: 5 moderate advisories in production dependencies
- `npm audit --omit=dev` reports 5 moderate advisories and no high or critical ones:
  - `glob` and `minimatch`, under `@sentry/bundler-plugins` and `@sentry/nextjs`/`@sentry/node` up to 11.10.0.
  - They are build-time path and ReDoS issues, and `security.yml` stays green.
- **Smallest fix:** take the Sentry bump when Dependabot offers it.

---

## Unverified

### U1. Per-IP rate limits key on the left-most `X-Forwarded-For` value
- **File:** `src/lib/rate-limit.ts:61-64`
- **The concern:** `clientIp()` returns `x-forwarded-for.split(',')[0]`. The repo's own `evidentiaryIp` comment calls that hop client-writable. Most per-IP caps use `clientIp()`:
  - operator and admin login;
  - 2FA verify and resend;
  - check-in, manage and receipt;
  - shop, event and statement pay;
  - golfer OTP;
  - admin forgot-password.

  If Vercel passes a client-supplied left-most hop through, rotating the header bypasses every one of these caps. Per-account, per-booking and per-sale caps still hold.
- **Not confirmed because:** checking it means sending a forged header to production, which this lane must not do.
- **Fix if it is confirmed:** have `clientIp` use the same platform header `evidentiaryIp` prefers.

---

## Checked and clean
- **Money paths (traced by the overseer):**
  - **check-in charge (`checkin-booking.ts`):**
    - the idempotency key is booking + card, with `-after-<pi>` once the round is refunded;
    - a Stripe search runs first, so a lost reply is never charged twice;
    - the charge is ledgered.
  - **cutoff hold (`cutoff-hold.ts`):** the booking is read again before the charge, the result is recorded only by a conditional update, and a race is refunded.
  - **reader rounds:** the claim is a conditional `updateMany`, a duplicate is refunded in full, and both sides are ledgered.
  - **register cash (`ringUpCash` → `settleAtCounter`).**
  - **shop refunds:** the amount is capped at items minus what was already refunded, the cap is checked again under a conditional increment, and cash refunds are ledgered.
  - **staff round refund:** capped at the course's share, and keyed on what was already refunded.
  - **dues paid at the course:** ledgered.
  - **CART-3 checkout extras:** priced on the server and refused once the round is paid.
  - `scripts/money-ledger-test.ts` passes against a local database.
- **Register-closed gate:**
  - **tee sheet:** take cash / paid offline, split + cash, and a walk-in paying cash;
  - **register:** `paid_cash` and putting a sale on the reader;
  - **refunds:** a cash refund of a register sale;
  - **reader:** rounds on the reader.

  `void_cash` is not gated but cannot run after a close-out.
- **Operator routes (all 83 files):**
  - Every verb and every `action` branch has its session check and `requirePermission`.
  - Ids are scoped to the session's course in the route or its helper (`findFirst({id, courseId})`, or a check of `courseId`).
  - CODEMAP's "NONE FOUND" for `round-packs` and `shop-items` is a scanner miss: both use a local `writeGate()` with `shop.catalog` and an agreement check.
- **Admin routes (all 66 files):**
  - Every handler is session-gated.
  - Owner-only routes require the owner role plus the mfa claim, and step-up where CLAUDE.md says so (data reset, test-course reset, employees).
  - Areas match the catalog, apart from M2.
  - No password hash, 2FA secret, recovery code or reset token goes out in a response.
  - Admin refunds are recomputed and capped on the server.
- **Golfer token routes:**
  - Check-in, receipt, manage (cancel, swap, players), shop, event, statement and dues pay links all match the token to the row named in the URL.
  - Tokens are UUIDs, and paid endpoints are rate-limited per row.
  - Split bookings never copy `checkInToken`.
  - `/call/[token]` checks the token's format and expiry.
- **Sign-in doors:**
  - Operator login, admin login and /cam give the same answer and take the same time for unknown accounts (`login-guard`).
  - Golfer OTP uses an HMAC and `timingSafeEqual`, with attempts capped.
  - The owner's device approval is stored as sha256 and is single-use.
  - TOTP has a replay guard.
  - `scripts/security-events-db-test.ts` passes.
- **Headers:** `scripts/security-headers-test.ts` passes.

## Not checked
- The internals of `inquiries` `handleAction` (`build_course`, `mark_live`) beyond the role gate.
- `performCancellation` internals.
- `fillTestCourse`.
- `course-plan.ts` `planRounds`/`compilePlan`.
- `performCheckIn`'s staff-typed card path (`externalPaymentMethodId`).
- Token expiry on `/api/preview/[courseId]*` and on `inquiries/details|upload`.
- Whether `resolveAdminSession` invalidates employee JWTs after a password change.
- Concurrent partial refunds on the admin side (Stripe caps the total at the charge; the ledger outcome was not traced).
- The real `X-Forwarded-For` behaviour on Vercel (U1).
- An unescaped `staff.name` in the HTML of resend-staff-setup's email (Low, not traced further).

## Notes
- This lane ran three security-auditor sub-agents at once, launched before Build's two-at-a-time rule arrived. Nothing more was launched after it.

## Questions for Cam
Answer these through Build.
1. Should voiding a cash sale need `sheet.counter_payment` (L5)?
2. Should the owner's cancel and offline actions require a step-up, as refund does (L3)?
3. Are these permission choices intended?
   - `members.edit` alone can change tier prices and dues.
   - Marking dues paid needs `members.edit`, not `sheet.counter_payment`.
   - `settings.edit` staff can switch member and resident pricing off.
