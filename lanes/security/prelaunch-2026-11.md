# Security lane: pre-launch audit, 2026-11-16

Scope: the full pre-launch audit Cam asked for. It covers sign-in and sessions, course separation, money, inputs and output, secrets and config, and dependencies.
The audit was read-only and ran against `main` at `8139943`. Nothing in production was touched, and no secrets or customer data were read.
Three `security-auditor` sweeps ran in parallel (sign-in, money, course separation). The lane ran the inputs, config and dependency checks itself. The lane re-read the cited lines itself for H1, M1, M2 and M3 before writing them down. The rest are the auditors' traces, with file:line given so Build can check them.
The previous sweep is `2026-11-10-full-sweep.md`; its item ids are given in brackets where an item carries over. `cb7a92c` is no longer an ancestor of `HEAD` because history was grafted at `c678bb0`, so a "fixed" item means the current code is correct, not that a commit was traced.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 10 |
| Low | 9 |
| Unverified | 2 |

Fixed since 2026-11-10: H1 (member send-code door). It now has per-connection and per-course-and-email caps, answers every caller the same way through `after()`, and writes a `securityEvent` when a cap trips (`src/app/api/member/[courseSlug]/send-code/route.ts:163-173`).

---

## High

### H1. Any course can pull any golfer's name and phone number from their GreenReserve account, by email, in bulk and silently
- **Files:**
  - `src/lib/member-import.ts:25,36,46-49`, reached through `src/app/api/operator/members/import/route.ts:15`;
  - `src/app/api/operator/members/route.ts:116-175` (the single-add POST);
  - the GET on the same route.
- **Exploit:** a course owner, or a staff login with `members.edit`, at course A uploads a CSV of email addresses with no name column.
  - `importMembers` looks up `golferAccount` for every email.
  - A row with no account is skipped with the reason "No name, and no GreenReserve account to take it from". The skip list therefore says who has an account.
  - Every row that does have an account becomes an active membership with the golfer linked. `inviteName` is copied from the golfer's first and last name, and `invitePhone` from the golfer's phone.
  - `GET /api/operator/members` then returns the name, email and phone.
  - Nobody is emailed, so the golfer never knows. The rows have no charges or ledger moves, so they can then be deleted without a trace.
  - Scale: a 1 MB file holds roughly 30k emails, and the cap is 20 imports an hour per course.
  - The single-add POST with `payFirst:true` on a tier with dues is just as silent, because `waiting` is true and no welcome email goes out. Its 201 response includes `golfer {firstName,lastName,email,phone}`.
- **Result:** course A gets the contact details of golfers who only ever booked at course B. That crosses the tenant boundary for golfer personal data.
- **Smallest fix:**
  - When adding or importing a member, never link an existing account and never copy anything from it.
  - Create the row as an invite only: `golferId: null`, `inviteAccepted: false`, and name and phone exactly as the course typed them.
  - Require a name on every import row.
  - `getGolferMembership` already matches an invite to the golfer's OTP-verified email, so member pricing still works once the golfer signs in.

---

## Medium

### M1. Cancelling a booking ignores the charge lock, so a cancel during check-in can charge the round and a hold fee
- **Files:**
  - `src/lib/cancel-booking.ts:162-235`, where the guard is only `status:'confirmed'` at `:225-226`, and the losing branch at `:251-273`;
  - `src/lib/checkin-booking.ts:489-501`, an unconditional `booking.update`.
- **Exploit:** staff are typing a card at check-in, or the golfer is paying on the pay link. At the same moment, the golfer cancels through `/api/bookings/cancel`, or a second staff screen cancels.
  - `performCancellation` never checks `shopLockedAt`, `readerStartedAt` or `notBeingCharged()`, so its `updateMany` succeeds.
  - Past the cutoff, it charges the hold or late fee under a key that differs from the check-in key. It may also charge the $1.50 per player separately.
  - Check-in's final write then sets the booking to `completed` and `paid` with no condition.
  - The golfer pays the round plus the fee, and nothing ever refunds the fee.
  - The slot's `playersBooked` is decremented for a group that played, and round-pack rounds can be given back.
  - A second case: when the round was already paid while still confirmed (the lost-reply recovery at `checkin-booking.ts:381`), a cancel that loses the race has already refunded the round. Its losing branch only undoes the late fee, so the booking stays completed and paid with its money returned.
- **Evidence:** cutoff-hold, counter-pay, reader-rounds and change-party all refuse while `notBeingCharged()` is false. `cancel-booking.ts` has no reference to it.
- **Smallest fix:**
  - In `performCancellation`, return `BEING_CHARGED` (409) before any Stripe call when `shopLockedAt` is live or `readerStartedAt` is set, and add `...notBeingCharged()` to the cancelling `updateMany`.
  - Make check-in's final write an `updateMany` where `{id, status:'confirmed'}`, plus `shopLockedAt: lockStamp` when it took the lock. On a miss, refund the charge it just took, as cutoff-hold does.

### M2. Operator and admin login reveal which emails have accounts when the password is not a string
- **Files:**
  - `src/app/api/auth/login/route.ts:54` (operator) and `:89` (staff);
  - `src/app/api/admin/login/route.ts:26,54`.
- **Exploit:** anyone, signed out, sends `POST {"email":"x@y.com","password":123}`.
  - A real, unlocked account reaches `bcrypt.compare(123, hash)`, which throws ("Illegal arguments"), so the reply is a 500.
  - An unknown email goes through `failUnknownLogin`, which calls `String(password)`, so the reply is a 401.
  - That is a clean account oracle, against SEC-3 and the CLAUDE.md rule that no sign-in reveals whether an email has an account. The probe writes no `securityEvent` and doesn't count toward lockout.
  - `/cam` is not affected, because it already uses `String(password)`.
- **Smallest fix:** at the top of both routes, `if (typeof email !== 'string' || typeof password !== 'string') return 400`, sent before any lookup.

### M3. Admin employee sessions survive a password change, a reset and the owner's temporary-password reset (up to 12h)
- **Files:**
  - `src/lib/admin-session.ts:107-111` (`signAdminToken`);
  - `src/lib/admin-session.ts:166-183` (`resolveAdminSession`, which selects only `active, role, areas, areasSetAt`).
- **Exploit:** someone holding a stolen `admin_session` cookie keeps working after any of these:
  - the employee changes their password;
  - the employee completes Forgot password;
  - the owner issues a temporary password (`admin/employees/route.ts:120`), which is the owner's "this account is compromised" move.

  This was a "not checked" item last sweep.
- **Evidence:** `AdminUser.sessionVersion` exists in the schema, but nothing in `src/` reads or writes it.
- **Smallest fix:**
  - Put `sv: admin.sessionVersion` in the token at admin login.
  - Select `sessionVersion` in `resolveAdminSession` and refuse when it doesn't match.
  - Increment it in the three password writers.
  - No migration is needed.

### M4. The owner's authenticator can be replaced without a step-up, which defeats every step-up gate (was M3)
- **File:** `src/app/api/admin/two-factor/route.ts:27-32` (gate) and `:66-80` (confirm).
- **Exploit:** someone with a live `gr_owner` cookie (inside its 4h) does this:
  - calls `start`, then `confirm` with a code from their own secret;
  - this overwrites `twoFactorSecret` and every recovery code, and no alert is sent;
  - they then pass `/api/cam/step-up` with codes from the new secret.

  That clears every `stepUpRequired` gate: passkeys, devices, data reset, employees and refunds.
- **Smallest fix:**
  - When a secret is already set, require `stepUpRequired(session)` in `start`, `confirm` and `regenerate`.
  - Send an alert, as the passkey `announce()` does.

### M5. Admin forgot-password reveals admin and owner emails, and is capped only per IP (was M4)
- **File:** `src/app/api/admin/forgot-password/route.ts:7-44`, where the early return is at `:20-22`.
- **Exploit:** a real email, the owner's included, costs a JWT sign, a DB write and an awaited send, and returns a 500 when the send fails. An unknown email gets an instant 200. The only cap is 5 per 15 minutes per IP, and no `securityEvent` is written.
- **Smallest fix:** copy `/api/auth/forgot-password`:
  - always answer success;
  - move the lookup and the send into `after()`;
  - add `rateLimit('admin-pwreset:email:'+email,3,3600)`;
  - treat `role==='owner'` as an unknown email.

### M6. The 2FA attempt counter can be raced, and /cam resets it on every correct password (was M5)
- **Files:**
  - `src/app/api/auth/2fa/verify/route.ts:36-56`;
  - `src/app/api/cam/login/route.ts:24,76-86,122-125,160-186,296`.
- **Exploit:** someone who has the password sends verify requests in parallel. Each one reads `twoFactorAttempts`, compares, then writes `attempts+1` with a plain `update`, so increments are lost.
  - On `/cam`, every correct password sets `twoFactorAttempts: 0`. Re-entering the password buys 5 more guesses, bounded only by the per-IP login cap (see U1).
  - Operator login issues a fresh code on every correct password with no per-account cap.
- **Smallest fix:**
  - Take each attempt atomically before comparing: `updateMany({where:{id, twoFactorAttempts:{lt:MAX}}, data:{twoFactorAttempts:{increment:1}}})`, and refuse when `count===0`.
  - Don't reset the counter at the `/cam` password step.
  - Add `rateLimit('2fa-issue:'+operatorId,5,600)` at operator login.

### M7. Reset, setup and set-password tokens are stored in plaintext (was M6)
- **Files:**
  - `src/app/api/auth/forgot-password/route.ts:20-22`;
  - `src/lib/operator-setup.ts:21-25`;
  - `src/app/api/auth/reset-password/route.ts:31,65`;
  - `src/app/api/admin/forgot-password/route.ts:26-32`;
  - `src/app/api/admin/login/route.ts:69-75`;
  - `src/app/api/cam/login/route.ts:265-269`;
  - `src/app/api/admin/set-password/route.ts:33`.
- **Exploit:** anyone who can read the database (a backup, a Neon branch, a logged query) gets working links:
  - an operator setup link lasts 7 days and signs an email-2FA owner in without a code;
  - an admin set-password link lasts 24h.

  Admin set-password also writes with a plain `update` after a read-then-compare, so two submits of one token can both land.
- **Smallest fix:**
  - Store `sha256(token)` and look it up by that hash.
  - In admin set-password, write with `updateMany({where:{id, setPasswordToken: hash}})` and check `count`.

### M8. A staff password reset doesn't sign out existing staff sessions (was M7)
- **Files:**
  - `src/app/api/auth/reset-password/route.ts:45-63`;
  - `src/lib/auth.ts:28-34,98-113`.
- **Exploit:** a stolen staff `gr_operator` cookie survives the staff member's reset. The 7-day sliding refresh keeps reissuing it for as long as the staff row stays active.
- **Smallest fix:**
  - Add `CourseStaff.sessionVersion Int @default(0)` in an additive migration.
  - Put it in `signStaffToken`, check it in `resolveDashboardSession`, and increment it on reset.

### M9. GreenReserve fees and failed charges are shown to admin logins without the Money area (was M2, now wider)
- **Files:**
  - `src/app/api/admin/course-detail/route.ts:83,202`;
  - `src/app/api/admin/today/route.ts:32,40-43`, with `src/lib/admin-today.ts:187-188` and `src/lib/admin-action-queue.ts:69-73`;
  - `src/app/api/admin/courses/route.ts:23,126,235`;
  - `src/lib/admin-ask.ts:95,120`.
- **Exploit:** a support employee whose only area is Courses can see:
  - **course-detail:** `courseMoney()`, which includes failed charges with the golfer's name, email, amount and decline reason;
  - **`/api/admin/today`:** each course's `feesThisMonth`, plus queue rows reading "<golfer> — $<amount>" for failed charges. No page calls this route any more, but it is still live;
  - **`/api/admin/courses`:** `revenue30d`;
  - **Admin Ask (`bookings_by_course`):** `feesCollected`.

  AW-11 puts all of this under Money.
- **Smallest fix:**
  - Gate each place on `hasArea(session,'money')`: null out `money`, `revenue30d` and `feesCollected` without it.
  - Delete `/api/admin/today`, or filter its rows with the overview's `rowArea`.

### M10. Round pay links and receipts can be sent without limit, and `send_receipt` goes to any address (was M1)
- **File:** `src/app/api/operator/bookings/route.ts:250-329`.
- **Exploit:** a staff login with `sheet.checkin` can repeat `send_receipt` with any `to` and `smsConsent:'verbal'`. Each call records an opt-in for that number, then sends the consent text and the receipt. The cost is Twilio spend and A2P sender reputation. `send_pay_link` is also unlimited.
- **Smallest fix:** `rateLimit('round-link:course:'+courseId,60,3600)` and `rateLimit('round-link:booking:'+id,5,3600)` before both sends.

---

## Low

### L1. Some operator routes skip the `sessionVersion` check, and one of them reissues a session without 2FA (was L1, now five routes)
- **Files:**
  - `src/app/api/operator/my-courses/route.ts:11`;
  - `src/app/api/operator/active-course/route.ts:10`;
  - `src/app/api/operator/onboarding-complete/route.ts:6`;
  - `src/app/api/operator/change-password/route.ts:9,35`;
  - `src/app/api/auth/resend-verification/route.ts:12`.
- **Exploit:** all five call `getOperatorSession()`, so they accept a cookie that a reset killed and reissue it with the old `sv`. An attacker who later learns the current password can then call `change-password` with the stale cookie. That returns a fully valid `gr_operator` without any 2FA and signs the real owner out.
- **Smallest fix:** add a shared `requireLiveOperator()` that does the `sv` check from `resolveDashboardSession`, and use it in all five.

### L2. Some sign-in doors refuse or admit without a `securityEvent` (was L4, partly fixed)
- **Doors with no `signin_ok`:**
  - golfer OTP verify (`src/app/api/golfer/auth/otp/verify/route.ts:116`);
  - golfer accept-invite (`:67`);
  - the member link (`src/app/api/member/[courseSlug]/verify/route.ts:49`).
- **Refusals with no event:**
  - golfer OTP request (`:24-26`);
  - 2FA verify (`:36-39`);
  - admin set-password (`:16,33,37`);
  - `inquiries/signin-code` and `signin-verify` (none at all).
- **Missing `password_changed`:** operator change-password and reset.
- **Smallest fix:** add the matching `securityEvent` kind at each of these points.

### L3. Any staff login can mint a 30-day preview token and approve the course's page
- **File:** `src/app/api/operator/preview-link/route.ts:9-17`.
- **Exploit:** this route has no `isStaff` check and no permission check, while `/api/operator/approve-page` refuses staff. A staff login gets the token, then POSTs `/api/preview/<id>/approve` or `request-changes`. The token outlives a deactivated staff member. It only matters before the course is live.
- **Smallest fix:** `if (session.isStaff) return 403`.

### L4. The admin's course-offline and archive actions cancel and refund every future booking without a step-up (was L3, changed)
- **Files:**
  - `src/app/api/admin/course-detail/route.ts:207-262`;
  - `src/app/api/admin/archive-course/route.ts:18-50`.
- **Exploit:** a manager session, or a stolen `gr_owner` cookie, sends `active:false, cancelBookings:true`. `cancelFutureBookingsForClosure` then cancels and refunds every future booking at the course. `/api/admin/refund` requires a step-up; these two routes don't. (The golfers `cancel` and tee-sheet `cancel_booking` paths named in the old L3 were removed on 2026-11-12.)
- **Smallest fix:** call `stepUpRequired(session)` when `cancelBookings === true`, on both routes. See also Question 1.

### L5. Concurrent identical admin refunds write duplicate refund rows, and hold refunds count against the round's cap
- **Files:**
  - `src/lib/refund-booking.ts:80,104,116-119`;
  - `src/app/api/stripe/webhook/route.ts:77-84`.
- **Exploit:** two identical refund requests share one idempotency key. Stripe makes one refund and the ledger dedupes it, but `PaymentEvent` gets two `refund` rows. Later refunds are then capped too low, and the golfer gets two emails. Separately, the webhook records hold-charge refunds as `refund`, which also shrinks the round's cap. Every error is toward refunding too little; no money is lost.
- **Smallest fix:**
  - Skip the insert when a `PaymentEvent` with that `stripeId` already exists, as `staff-refund.ts:90` does.
  - Compute the round's refunds from `MoneyMove` rows (`what:'round', direction:'out'`).

### L6. A login with only `shop.sell` can void a cash sale (was L5, still open)
- **File:** `src/app/api/operator/shop-sales/route.ts:246-253`.
- **Exploit:** a staff login with only `shop.sell` can void a `paid_cash` sale. Voiding a `paid_account` sale needs `sheet.counter_payment`; voiding a cash sale does not.
- **Smallest fix:** require `sheet.counter_payment` for `void_cash` as well (Question 2 from 2026-11-10, still unanswered).

### L7. The staff setup email builds its HTML from an unescaped, operator-chosen name
- **File:** `src/app/api/admin/resend-staff-setup/route.ts:35`.
- **Exploit:** an operator creates a staff login with an address they choose and up to 120 characters of HTML as the name. When a manager clicks Resend, that markup goes out from GreenReserve's admin address, which makes a phishing vehicle on GreenReserve's domain. It needs an admin click.

  The route also builds its own `new Resend(...)` instead of using `getResend()`, which breaks a CLAUDE.md rule.
- **Smallest fix:** HTML-escape `staff.name`, and send through `getResend()` / `lib/email`.

### L8. `scripts/admin-areas-test.ts` still can't catch most missing-gate mistakes (was L2)
- **File:** `scripts/admin-areas-test.ts:34-35`.
- **Problem:** the test only checks that the source contains `areaGate(`. It would not catch any of M9's places, because the routes call `areaGate` and then return money anyway.
- **Smallest fix:** assert per route that money fields are behind `hasArea(...,'money')`, or add a fixture-driven test that calls each route with a Courses-only session.

### L9. npm audit: 5 moderate advisories in production dependencies (was L6)
- **Packages:** `@sentry/nextjs` → `@sentry/bundler-plugins` / `@sentry/node` → `glob`, `minimatch`. All are build-time paths with fixes available.
- **Severity summary:** 0 high or critical in production dependencies. The full tree has 11 high, all dev-only through `lighthouse` → `puppeteer-core` (`extract-zip`, `basic-ftp`, `ip-address`, `proxy-agent`, and `zod` through `chromium-bidi`). The production `zod` is 4.6.7, which is patched.
- **Smallest fix:** bump `@sentry/nextjs` and `lighthouse` in one dependency PR after launch.

---

## Unverified

### U1. Per-IP rate limits key on the left-most `X-Forwarded-For` value (unchanged)
- **File:** `src/lib/rate-limit.ts:61-64`.
- **Why it matters:** most sign-in caps use `clientIp()`. If Vercel passes a client-supplied left-most hop through:
  - M6 becomes practical;
  - golfer OTP texts become uncapped spend. `sendSmsOtp` only caps at 3 per 10 minutes per number, with no global cap.
- **Not confirmed because:** checking it means sending a forged header to production.
- **Fix:**
  - Make `clientIp` prefer `x-vercel-forwarded-for`, as `evidentiaryIp` already does.
  - Add a global hourly cap on texted codes either way.

### U2. One webhook secret for both platform and Connect events
- **File:** `src/app/api/stripe/webhook/route.ts:23`.
- **Why it matters:** the separately charged $1.50 lives on the platform account, while round, hold, dues, shop and event charges live on connected accounts. Stripe gives each endpoint its own signing secret. If both endpoints point at this URL, one side always fails verification, and its refunds and disputes are never mirrored to the ledger. `REVIEW_LEDGER.md:224` already notes this.
- **Not confirmed because:** it needs the live Stripe dashboard.
- **Fix:** verify against `STRIPE_WEBHOOK_SECRET`, then `STRIPE_CONNECT_WEBHOOK_SECRET`, or split the endpoint into two routes. Cam can confirm in Stripe → Webhooks how many endpoints there are and which events each one sends.

---

## Checked and clean
- **Sign-in:**
  - **Cookies match the CLAUDE.md session table.** All are httpOnly, secure in production and path `/`.
    - `gr_operator`: 7d, sliding.
    - `gr_golfer`: 90d, sliding.
    - `gr_member`: 7d absolute.
    - `admin_session`: 12h absolute.
    - `gr_owner`: 4h, backed by a revocable `OwnerSession` row.
    - `gr_owner_device`: SameSite strict.
  - **JWTs:** HS with a secret that fails closed in production. Every verifier checks its own `type` or `purpose`, and no token can stand in for another.
  - **Passkeys:**
    - rpID and origin come from config;
    - user verification is required;
    - the challenge is single and consumed atomically;
    - the counter is updated;
    - passkey sign-in requires the post-password marker.
  - **TOTP** has a ±1-step window and a replay guard. Recovery codes are bcrypt-hashed and single-use.
  - **Golfer OTP** is an HMAC challenge compared with `timingSafeEqual`, attempts are capped, and each challenge is single-use.
  - **Owner device approval** is stored as sha256, lasts 15 minutes, is single-use and is approved only by POST.
  - **Unknown accounts:** operator, admin and `/cam` login give the same answer, take the same time and apply the same lockout, apart from M2.
  - **CSRF:** cookies are SameSite=Lax, and cookie-authenticated writes are POST, PATCH or DELETE only.
- **Course separation:**
  - **Operator routes (90 files):** every verb and every `action` branch checks the session and `requirePermission`, or refuses staff on owner-only routes. Every id from the request is scoped to the course, nested ids included: tier, membership, reader, line-rate rounds, event children, product, note, chat, move and payout.
  - **Admin and cam routes (81 files):** each checks its role. Owner routes use `requireOwner` with the mfa claim, and step-up is in place where the decisions require it. Areas match the catalog, apart from M9.
  - **Golfer, member and token routes (41 files):** each token or session is matched to the row it names.
    - Preview JWTs last 30 days.
    - The inquiry `detailsToken` lasts 60 days, is gated on all four handlers, and is refused once the inquiry is building, live, rejected or archived.
  - **Responses:** no password hash, reset token, 2FA secret or pay token goes out in a response.
- **Money:**
  - **Staff-typed card at check-in:** scoped to the booking's course, charged at the server-computed `roundChargeCents` under the AUDIT-1 lock, with one key format across staff, pay link and reader.
  - **New dues code:**
    - one claim covers the pay link, a typed card, the reader, cash and auto-renew;
    - one intent per term;
    - the 1% is computed on the server and is exact at half cents (checked from 50¢ to $2,000 in 1¢ steps);
    - it is ledgered.
  - **Member rates per price-list line:** bounded to the course's own rounds, and capped at the public price.
  - **`/api/bookings`:** recomputes every price, plus the $1.50 × players, on the server.
  - **Shop fee:** integer half-up and zero on cash.
  - **Staff refunds:** capped, and idempotent across two at once.
  - **Stripe webhook:** the signature is checked on the raw body, events are deduped, and no golfer-settable metadata is trusted.
  - **`performCancellation`:** its keys and ledgering are correct, apart from M1.
- **Inputs and output:**
  - **XSS:** the 4 `dangerouslySetInnerHTML` uses render a server-generated QR SVG, agreements rendered from repo files under `legal/`, and static JSON-LD.
    - The public inquiry form's `website` field is stored without a scheme check and rendered as `href` in admin. React 19 in the App Router blocks `javascript:` URLs, so this is not exploitable. Normalising it with `normalizeHttpUrl` would be defence in depth.
  - **SSRF:** no server fetch takes a user-controlled URL. Weather goes to fixed Census and weather.gov hosts with an encoded address.
  - **Open redirects:** the only redirect parameter is `from`, and it is compared against a fixed value.
  - **Uploads:**
    - image types are allow-listed (JPEG, PNG, WebP) with size caps;
    - member photos and admin documents go to private blob storage, served through permission-checked routes;
    - client-token uploads are restricted by path and content type.
  - **Webhooks:** Twilio inbound validates `x-twilio-signature`, and Cal.com verifies an HMAC.
- **Secrets and config:**
  - **`NEXT_PUBLIC_`** is used only for the site URL, the Sentry DSN and the Stripe publishable key. No client component reads a server env var.
  - **CORS:** no route sets `Access-Control-Allow-Origin`.
  - **Headers:** HSTS (2y, includeSubDomains), nosniff, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, Referrer-Policy and Permissions-Policy are all set. The script part of the CSP is still report-only. Enforcing it is post-launch hardening; no XSS sink was found that it would cover.
  - **Crons:** all 6 in `vercel.json` use `cronRoute` → `cronAuthFailure`, which refuses when `CRON_SECRET` is unset. The admin "Re-run job" refuses the charging jobs.
  - **Rate limits:** every public endpoint that sends or charges is capped, apart from M10 and U1. The public routes without a limit are reads, signature-checked webhooks, `/api/waitlist` (410) and `/api/auth/verify` (a single-use token).

## Not checked
- Vercel's real `X-Forwarded-For` behaviour (U1) and the Stripe webhook endpoint setup (U2). Both need production.
- The internals of event-payments and member statements (unchanged since the last sweep, which cleared them).
- The reader-rounds internals beyond their claim and lock.
- `fillTestCourse`, `roundDeleteClashes` and the internals of inquiries `handleAction`.
- Each Birdie propose tool one by one. Only the shared `toolCtx` scoping was confirmed.
- Whether any other host under `greenreserve.app` serves untrusted content. That would make the Lax cookies reachable same-site.
- The DB-backed test scripts were not run, to keep the audit read-only.

## Recommended order before launch
Before Nov 26: H1, M1, M2, M3, M4, M9. Each is small and contained.
M5–M8 and M10 are next. M8 needs an additive migration.
The lows can follow launch, except L3, which is a one-line fix.

## Questions for Cam
Answer these through Build.
1. CLAUDE.md says the admin "never charges, retries, refunds or cancels a golfer's booking". In the code, though:
   - `/api/admin/refund` is live, and it is sound: manager-plus, step-up, server-capped and ledgered;
   - `scripts/admin-never-charges-test.ts` says "Refunds stay";
   - the course-offline and archive actions cancel and refund every future booking (L4).

   Which is right: the rule or the code?
2. Should voiding a cash sale need `sheet.counter_payment` (L6)? This was asked on 2026-11-10 and is unanswered.
