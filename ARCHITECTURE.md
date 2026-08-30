# GreenReserve — Architecture Reference

> **Auto-generated** by `scripts/route-inventory.ts`. Re-run after adding routes.
> Last generated: 2026-08-30

---

## API Routes

| Route | Methods | Surface | Purpose |
|-------|---------|---------|---------|
| `/api/admin/activity` | GET | admin | — |
| `/api/admin/archive-course` | POST | admin | Thin wrapper — all lifecycle mutation logic lives in src/lib/lifecycle.ts |
| `/api/admin/backfill-orphaned-inquiries` | POST | admin | One-time fix: inquiries whose course was hard-deleted before Phase 2d |
| `/api/admin/bootstrap` | POST | admin | — |
| `/api/admin/broadcasts` | GET, POST | admin | — |
| `/api/admin/change-password` | POST | admin | — |
| `/api/admin/course-detail` | GET, PATCH | admin | — |
| `/api/admin/course-documents` | GET, POST | admin | A-05 item 5 — Documents tab: auto records (operator agreement acceptance, |
| `/api/admin/course-documents/upload` | POST | admin | A-05 item 5b — PDF uploads per course, via the same Vercel Blob storage |
| `/api/admin/course-members` | GET | admin | — |
| `/api/admin/course-reminders` | PATCH | admin | A-05 item 4b — per-course kill switch for the auto-chase onboarding |
| `/api/admin/course-settings` | GET, PATCH | admin | GET /api/admin/course-settings?courseId=X — full course record for the admin edi |
| `/api/admin/courses` | GET | admin | Archive/restore/delete all route through src/lib/lifecycle.ts via |
| `/api/admin/create-course` | GET, POST | admin | — |
| `/api/admin/employees` | GET, POST, PATCH | admin | — |
| `/api/admin/expenses` | GET, POST | admin | EXPENSE TRACKER (RUN_QUEUE) — GreenReserve's own fixed operating costs. |
| `/api/admin/expenses/[id]` | PATCH, DELETE | admin | EXPENSE TRACKER (RUN_QUEUE) — edit/end/delete a single fixed cost. Owner-only. |
| `/api/admin/forgot-password` | POST | admin | — |
| `/api/admin/golfers` | GET, POST | admin | — |
| `/api/admin/inquiries` | GET, POST, PATCH, DELETE | admin | MP-2 (ADMIN_V4 V4-2 leak): this returned the whole CourseInquiry row, which |
| `/api/admin/login` | POST | admin | — |
| `/api/admin/logout` | POST | admin | — |
| `/api/admin/messages` | GET, POST, PATCH | admin | GET /api/admin/messages — thread list (no courseId param) |
| `/api/admin/orphan-sweep` | GET, POST | admin | ORPHAN SWEEP (RUN_QUEUE) — GET always dry-runs (prints the list, no |
| `/api/admin/owner-login` | POST | admin | — |
| `/api/admin/platform-stripe` | GET | admin | Cache Stripe responses ~5min — this hits the platform Balance/Payouts/ |
| `/api/admin/reconcile-lifecycle-pairs` | POST | admin | One-time backfill (RUN_QUEUE "LIFECYCLE PARITY LAW" item 6) — existing |
| `/api/admin/request-re-review` | POST | admin | Admin-initiated reopen of the review loop (RUN_QUEUE "approval propagates |
| `/api/admin/resend-staff-setup` | POST | admin | — |
| `/api/admin/retry-charge/[bookingId]` | POST | admin | REVISE_QUEUE A-06 item 4 — retry a failed check-in charge from the revenue |
| `/api/admin/revenue` | GET | admin | REVISE_QUEUE A-06 — /admin/revenue rebuilt as a real P&L. ONE period picker |
| `/api/admin/schedule` | GET, POST, PATCH, DELETE | admin | GET /api/admin/schedule?courseId=X |
| `/api/admin/search` | GET | admin | — |
| `/api/admin/send-golive-reminder` | POST | admin | AGREEMENT = GO-LIVE GATE / STRIPE RULE FINAL (RUN_QUEUE) — the one-click |
| `/api/admin/session` | GET | admin | — |
| `/api/admin/set-password` | POST | admin | — |
| `/api/admin/stats` | GET | admin | MP-1 fix-now (ET day boundary): these were UTC-based, so every "today" |
| `/api/admin/system` | GET | admin | — |
| `/api/admin/tee-sheet` | GET, POST, PATCH | admin | GET /api/admin/tee-sheet?courseId=X&date=Y |
| `/api/admin/transactions` | GET | admin | — |
| `/api/admin/verify-operator` | POST | admin | GET deliberately removed (MP-2, ADMIN_V4 V4-2 leak). It returned EVERY |
| `/api/alerts` | POST | public | — |
| `/api/alerts/unsubscribe/[token]` | GET | public | — |
| `/api/auth/2fa/resend` | POST | operator-auth | — |
| `/api/auth/2fa/status` | GET | operator-auth | — |
| `/api/auth/2fa/verify` | POST | operator-auth | — |
| `/api/auth/forgot-password` | POST | operator-auth | — |
| `/api/auth/login` | POST | operator-auth | — |
| `/api/auth/logout` | POST | operator-auth | — |
| `/api/auth/register` | POST | operator-auth | — |
| `/api/auth/resend-verification` | POST | operator-auth | Real verification email for operators who have a session but aren't yet |
| `/api/auth/reset-password` | GET, POST | operator-auth | — |
| `/api/auth/verify` | POST | operator-auth | — |
| `/api/bookings` | GET, POST | golfer | Resolves the green fee and cart fee for a golfer based on their membership tier. |
| `/api/bookings/cancel` | POST | golfer | — |
| `/api/bookings/setup-intent` | POST | golfer | Creates (or reuses) a Stripe Customer and a SetupIntent so the booking page |
| `/api/checkin/[bookingId]` | GET, POST | token-gated | Public, token-gated check-in endpoint — the golfer doesn't need to be |
| `/api/courses` | GET | public | — |
| `/api/courses/[slug]` | GET | public | — |
| `/api/courses/[slug]/account` | GET | public | Course-scoped golfer portal data (GOLFER_SPEC G5). Isolation guarantee |
| `/api/courses/[slug]/tee-times` | GET | public | Maps a Prisma TeeTime row (camelCase, real availability counts) onto the |
| `/api/cron/cancellation-cutoff` | GET | cron | Runs once daily (Vercel Hobby plan caps frequency at once/day). Processes |
| `/api/cron/chase-onboarding` | GET | cron | A-05 item 4b — auto-chase reminders for courses that haven't finished |
| `/api/cron/generate-tee-times` | GET | cron | — |
| `/api/cron/hourly` | GET | cron | Runs every hour (Vercel Pro). Handles all time-sensitive booking actions: |
| `/api/cron/send-reminders` | GET | cron | — |
| `/api/golfer/auth/accept-invite` | GET, POST | golfer | Lets an operator-added member (no GolferAccount yet) land on the emailed link, |
| `/api/golfer/auth/logout` | POST | golfer | — |
| `/api/golfer/auth/me` | GET | golfer | — |
| `/api/golfer/auth/otp/request` | POST | golfer | Always returns the same generic response whether or not the identifier |
| `/api/golfer/auth/otp/verify` | POST | golfer | Verification is what makes guest-booking linkage safe — once an identifier |
| `/api/golfer/memberships` | GET, POST | golfer | Golfer requests membership at a course |
| `/api/golfer/profile` | GET | golfer | — |
| `/api/health` | GET | public | — |
| `/api/inquiries` | POST | public | GET deliberately removed (MP-1b). It was PUBLIC — no session check behind a |
| `/api/inquiries/details` | GET, POST, PATCH | public | MP-2b: the gate that used to live here now lives in src/lib/sheet-token.ts so |
| `/api/inquiries/upload` | POST | public | — |
| `/api/manage/[bookingId]` | GET | public | — |
| `/api/manage/[bookingId]/available-times` | GET | public | — |
| `/api/manage/[bookingId]/change-players` | POST | public | — |
| `/api/manage/[bookingId]/send-modified-email` | POST | public | — |
| `/api/manage/[bookingId]/swap-time` | POST | public | — |
| `/api/member/[courseSlug]/logout` | POST | member | — |
| `/api/member/[courseSlug]/payments` | GET | member | — |
| `/api/member/[courseSlug]/send-code` | POST | member | — |
| `/api/member/[courseSlug]/session` | GET | member | — |
| `/api/member/[courseSlug]/tee-times` | GET | member | — |
| `/api/member/[courseSlug]/verify` | GET | member | — |
| `/api/membership/[id]` | GET, POST | member | Public, token-gated membership dues payment — the member pays from the |
| `/api/operator/active-course` | POST | operator | Sets which of an operator's courses the dashboard should act on. Always |
| `/api/operator/agreement` | GET, POST | operator | A-05 item 5a — Operator Agreement clickwrap, an extension of the existing |
| `/api/operator/analytics` | GET | operator | — |
| `/api/operator/announcements` | GET | operator | — |
| `/api/operator/announcements/dismiss` | POST | operator | — |
| `/api/operator/approve-page` | POST | operator | Approval is advisory, not automatic — going live stays an admin action. |
| `/api/operator/blackouts` | GET, POST, DELETE | operator | — |
| `/api/operator/bookings` | GET, PATCH | operator | Used by both the Payments tab (all bookings, transaction ledger) and the |
| `/api/operator/change-password` | POST | operator | — |
| `/api/operator/conditions` | PATCH | operator | — |
| `/api/operator/course-products` | GET, POST, PATCH, DELETE | operator | Every nineId a product claims must actually belong to this operator's course — |
| `/api/operator/courses` | GET, PATCH | operator | Never cache — the dashboard's live/draft banner reads this and must |
| `/api/operator/members` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/messages` | GET, POST, PATCH | operator | GET /api/operator/messages — own thread with all messages |
| `/api/operator/my-courses` | GET | operator | Lists every course this operator owns, plus which one is currently active |
| `/api/operator/nines` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/onboarding-complete` | POST | operator | — |
| `/api/operator/photos` | GET, POST | operator | — |
| `/api/operator/photos/[id]` | DELETE | operator | — |
| `/api/operator/preview-link` | GET | operator | Lets an operator open their own booking-page preview from the Getting |
| `/api/operator/profile` | GET, PATCH | operator | — |
| `/api/operator/regenerate-tee-times` | POST | operator | — |
| `/api/operator/request-changes` | POST | operator | Logged-in-operator counterpart to /api/preview/[courseId]/request-changes |
| `/api/operator/schedule` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/settings` | GET, PATCH | operator | Never cache — the dashboard's live/draft status must reflect the DB the |
| `/api/operator/staff` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/stripe/callback` | GET | operator | — |
| `/api/operator/stripe/connect` | GET | operator | — |
| `/api/operator/stripe/dashboard-link` | POST | operator | Single-use Stripe Express login link — generated fresh per click, operator |
| `/api/operator/tee-sets` | GET, POST, PATCH, PUT, DELETE | operator | nineYardages/productRatings included for the Course & Layout tab (L1) — |
| `/api/operator/tee-times` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/tiers` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/upload` | POST, DELETE | operator | Course branding image upload (logo / hero photo) via Vercel Blob. |
| `/api/preview/[courseId]` | GET | public | — |
| `/api/preview/[courseId]/approve` | POST | public | Approval is advisory, not automatic — going live stays an admin action. |
| `/api/preview/[courseId]/request-changes` | POST | public | Feeds into the EXISTING admin<->course messages thread (creates one if |
| `/api/preview/[courseId]/tee-times` | GET | public | eslint-disable-next-line @typescript-eslint/no-explicit-any |
| `/api/preview/send` | POST | public | RUN_QUEUE "Send Preview = one combined send": pressing Send Preview sends |
| `/api/receipt/[bookingId]` | GET | public | — |
| `/api/stripe/webhook` | POST | stripe-webhook | — |
| `/api/waitlist` | POST | public | Replaced by /api/alerts |

---

## Pages

| Page | Surface | Authed? |
|------|---------|---------|
| `/admin` | admin | yes |
| `/admin/activity` | admin | yes |
| `/admin/broadcasts` | admin | yes |
| `/admin/courses` | admin | yes |
| `/admin/courses/[id]` | admin | yes |
| `/admin/create` | admin | yes |
| `/admin/employees` | admin | yes |
| `/admin/forgot-password` | admin | yes |
| `/admin/golfers` | admin | yes |
| `/admin/inquiries` | admin | yes |
| `/admin/inquiries/[id]` | admin | yes |
| `/admin/login` | admin | yes |
| `/admin/messages` | admin | yes |
| `/admin/owner-login` | admin | yes |
| `/admin/profile` | admin | yes |
| `/admin/revenue` | admin | yes |
| `/admin/set-password` | admin | yes |
| `/admin/system` | admin | yes |
| `/book` | golfer | yes |
| `/checkin/[bookingId]` | token-gated | yes |
| `/contact` | public | no |
| `/courses/[slug]` | public | no |
| `/courses/[slug]/account` | public | yes |
| `/courses/[slug]/account/accept-invite` | public | yes |
| `/courses/[slug]/member` | member | yes |
| `/dashboard` | operator | yes |
| `/dashboard/2fa` | operator | yes |
| `/dashboard/cancellations` | operator | yes |
| `/dashboard/forgot-password` | operator | yes |
| `/dashboard/login` | operator | yes |
| `/dashboard/members` | operator | yes |
| `/dashboard/messages` | operator | yes |
| `/dashboard/onboarding` | operator | yes |
| `/dashboard/outings` | operator | yes |
| `/dashboard/payments` | operator | yes |
| `/dashboard/reset-password` | operator | yes |
| `/dashboard/schedules` | operator | yes |
| `/dashboard/settings` | operator | yes |
| `/dashboard/tournaments` | operator | yes |
| `/dashboard/verify` | operator | yes |
| `/for-courses` | public | no |
| `/for-courses/details` | public | no |
| `/manage/[bookingId]` | public | yes |
| `/membership/[id]` | public | yes |
| `/operator-agreement` | public | yes |
| `/page.tsx` | public | yes |
| `/preview/[courseId]` | public | yes |
| `/privacy` | public | no |
| `/receipt/[bookingId]` | public | yes |
| `/terms` | public | no |

**Public pages** (no auth required):
`/`, `/for-courses`, `/for-courses/details` (token-gated), `/courses`, `/courses/[slug]`, `/contact`, `/privacy`, `/terms`, login pages (`/account/login`, `/account/register`, `/api/auth/login`)

**Auth-protected pages.** Corrected MP-2c — this previously claimed middleware
guards `/admin/*` and `/account/*`. It does not. `src/middleware.ts` matches
`['/dashboard/:path*']` ONLY. Two consecutive security audits used this file as
their route map, and four ungated admin endpoints survived three admin-auth
commits partly because of it.
- `/dashboard/*` → middleware redirects to `/login`
- `/admin/*` → NO middleware. Each page checks `/api/admin/session` client-side
  and redirects to `/admin/login?reason=session_ended`; every `/api/admin/*`
  route enforces its own `resolveAdminSession` + `requireRole` gate. The API
  gates are the real boundary — a missing one is not covered by anything else.
- `/account/*` → NO middleware; golfer session checked per route.

---

## Money Flow

```
1. BOOKING
   Golfer → POST /api/bookings
   → Stripe SetupIntent (card saved, nothing charged)
   → Booking.paymentStatus = 'card_on_file'

2. CANCELLATION FEE (late cancel — cron)
   Vercel cron → GET /api/cron/cancellation-cutoff
   → chargeOnConnectedAccount() (idempotencyKey: cancelfee-{id}-{pmId})
   → Booking.paymentStatus = 'cancellation_fee_charged'

3. CHECK-IN CHARGE
   Staff/Golfer → POST /api/checkin/[bookingId]
   → performCheckIn() in src/lib/checkin-booking.ts
   → Stripe charge on connected account + application fee ($1.50/player)
   → Cancellation fee refunded if previously charged
   → Booking.status = 'completed'

4. STRIPE WEBHOOKS  (src/app/api/stripe/webhook)
   account.updated → sync Course.stripeAccountActive
   (idempotent: updateMany with same value is safe to replay)
```

---

## Session Policy

| Surface | Cookie | TTL | Renewal |
|---------|--------|-----|---------|
| Admin employees | `admin_session` | 12h | Absolute |
| Admin owner | `admin_session` | 12h | Absolute (2FA at login) |
| Operator / staff | `gr_operator` | 7 days | Sliding — reissued at >50% elapsed |
| Golfer | `gr_golfer` | 90 days | Sliding — reissued at >50% elapsed |
| Member | `gr_member` | 90 days | Absolute |

Sliding renewal implemented in `src/lib/auth.ts`.

---

## Model Relationships (summary)

```
CourseOperator ──< Course ──< TeeTime ──< Booking >── GolferAccount
                          └──< TeeTimeSchedule
                          └──< MembershipTier ──< CourseMembership >── GolferAccount
                          └──< TeeSet
                          └──< CourseStaff
```

Key models:
- **Course** — slug, operator, pricing, policies, Stripe account, liveStatus
- **TeeTime** — generated slot; playersBooked/playersAvailable for capacity guard
- **Booking** — links GolferAccount + TeeTime; holds paymentMethodId; status flow: confirmed → completed/cancelled
- **CourseOperator** — operator login (2FA, hashed code), Stripe accountId
- **GolferAccount** — golfer login (bcrypt password, email-based auth)
- **CourseMembership / MembershipTier** — per-course membership with tier pricing
- **AdminUser** — admin console login (owner/manager/support/viewer roles)
- **RateLimit** — DB-backed rate limiter (per-key, window counts)

---

## src/lib Index

| File | Purpose |
|------|---------|
| `src/lib/admin-day.ts` | Platform day boundaries. |
| `src/lib/admin-fetch.ts` | Routes commonly answer with a bare `{ error: 'Forbidden' }`. That is a |
| `src/lib/admin-roles.ts` | Role lists, client-safe. |
| `src/lib/admin-session.ts` | Defined in admin-roles.ts (client-safe) and re-exported here so existi |
| `src/lib/api-response.ts` | Common JSON response helpers to reduce boilerplate in API routes. |
| `src/lib/approval-state.ts` | DB-backed counterpart to the pure functions in change-requests.ts — fo |
| `src/lib/auth.ts` | Fail closed: in production a missing JWT_SECRET must never silently fa |
| `src/lib/booking-fees.ts` | — |
| `src/lib/booking-mode.ts` | Course-world pages: the course page itself, its member portal, and its |
| `src/lib/booking-status.ts` | Single source of truth for what to show a user (operator, staff, or go |
| `src/lib/cancel-booking.ts` | — |
| `src/lib/change-requests.ts` | Single source of truth for structured "request changes" data (V13b). |
| `src/lib/checkin-booking.ts` | Charging a round, and checking a golfer in, are two different things. |
| `src/lib/claim-tee-time.ts` | Atomically creates a booking and updates tee-time capacity. |
| `src/lib/course-metrics.ts` | THE shared metrics brain (REVISE_QUEUE A-04 item 0) — bookings/gross/ |
| `src/lib/course-timeline.ts` | A-05 items 4/5: a per-course event log with NO schema change — rides o |
| `src/lib/courses-data.ts` | Deterministic tee time generation — same output for same course+date e |
| `src/lib/dashboard-visits.ts` | Tracks which operator dashboard tabs a device has visited — used to de |
| `src/lib/data.ts` | Deprecated — use @/lib/courses-data instead |
| `src/lib/db.ts` | — |
| `src/lib/demo-courses.ts` | Cam: replace '' with the real demo course slug once the course is poli |
| `src/lib/email.ts` | Fired by the cancellation-fee cron the moment it successfully auto-cha |
| `src/lib/expenses.ts` | EXPENSE TRACKER (RUN_QUEUE "EXPENSE TRACKER / real P&L") — the manual  |
| `src/lib/go-live-preflight.ts` | ONE function, used by BOTH the preflight-check GET (modal display) and |
| `src/lib/golfer-otp.ts` | Passwordless golfer sign-in (GOLFER_SPEC G5). No schema change was all |
| `src/lib/image-resize.ts` | Client-side downscale so a 12MB phone photo never has to travel over t |
| `src/lib/inquiry-status.ts` | Single source of truth for what every inquiry status means and which p |
| `src/lib/lifecycle.ts` | LIFECYCLE PARITY LAW (RUN_QUEUE) — a linked pair (CourseInquiry.builtC |
| `src/lib/member-session.ts` | 15-minute magic link token — sent in email |
| `src/lib/normalize-course.ts` | eslint-disable-next-line @typescript-eslint/no-explicit-any |
| `src/lib/password.ts` | Shared password strength rule — used on registration, reset, and in-da |
| `src/lib/platform-stripe.ts` | EXPENSE TRACKER (RUN_QUEUE) — the AUTOMATIC half of the P&L: what Stri |
| `src/lib/preview-token.ts` | — |
| `src/lib/prisma.ts` | Cache on globalThis in ALL environments — in serverless (Vercel) each  |
| `src/lib/rate-limit.ts` | DB-backed fixed-window rate limiter. A single atomic upsert means it c |
| `src/lib/seed.ts` | — |
| `src/lib/session.ts` | — |
| `src/lib/sheet-token.ts` | The setup-sheet token gate, shared by every route a `detailsToken` ope |
| `src/lib/stripe-errors.ts` | Friendly-message map for Stripe decline/error strings (REVISE_QUEUE A- |
| `src/lib/stripe.ts` | Charges a card the platform saved (via SetupIntent on a platform Custo |
| `src/lib/submit-change-request.ts` | Shared by both request-changes entry points (token-gated preview page  |
| `src/lib/tee-sheet-engine.ts` | Generates/refreshes TeeTime rows for one course on one date from its a |
| `src/lib/tee-time-utils.ts` | Converts a stored tee-time (date "YYYY-MM-DD", time "HH:MM" in the cou |
| `src/lib/terms.ts` | Bump this whenever /terms materially changes so old bookings keep an |
| `src/lib/twilio.ts` | — |
| `src/lib/two-factor.ts` | Generates a fresh 6-digit code, stores its hash on the operator, and s |
| `src/lib/use-tab-intro.ts` | Drives the first-visit "what is this page" intro card (V13 item 2) — |
