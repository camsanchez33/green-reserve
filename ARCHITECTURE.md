# GreenReserve — Architecture Reference

> **Auto-generated** by `scripts/route-inventory.ts`. Re-run after adding routes.
> Last generated: 2026-07-08

---

## API Routes

| Route | Methods | Surface | Purpose |
|-------|---------|---------|---------|
| `/api/admin/activity` | GET | admin | — |
| `/api/admin/archive-course` | POST | admin | — |
| `/api/admin/backfill-orphaned-inquiries` | POST | admin | One-time fix: inquiries whose course was hard-deleted before Phase 2d |
| `/api/admin/bootstrap` | POST | admin | — |
| `/api/admin/broadcasts` | GET, POST | admin | — |
| `/api/admin/change-password` | POST | admin | — |
| `/api/admin/course-detail` | GET, PATCH | admin | — |
| `/api/admin/course-members` | GET | admin | — |
| `/api/admin/course-settings` | GET, PATCH | admin | GET /api/admin/course-settings?courseId=X — full course record for the admin edi |
| `/api/admin/courses` | GET, DELETE | admin | DELETE now archives (soft-delete). Hard delete lives at /api/admin/archive-cours |
| `/api/admin/create-course` | GET, POST | admin | — |
| `/api/admin/employees` | GET, POST, PATCH | admin | — |
| `/api/admin/inquiries` | GET, POST, PATCH, DELETE | admin | — |
| `/api/admin/login` | POST | admin | — |
| `/api/admin/logout` | POST | admin | — |
| `/api/admin/messages` | GET, POST, PATCH | admin | GET /api/admin/messages — thread list (no courseId param) |
| `/api/admin/owner-login` | POST | admin | — |
| `/api/admin/resend-staff-setup` | POST | admin | — |
| `/api/admin/schedule` | GET, POST, PATCH, DELETE | admin | GET /api/admin/schedule?courseId=X |
| `/api/admin/session` | GET | admin | — |
| `/api/admin/set-password` | POST | admin | — |
| `/api/admin/stats` | GET | admin | — |
| `/api/admin/tee-sheet` | GET, POST, PATCH | admin | GET /api/admin/tee-sheet?courseId=X&date=Y |
| `/api/admin/transactions` | GET | admin | — |
| `/api/admin/verify-operator` | GET, POST | admin | — |
| `/api/auth/2fa/resend` | POST | operator-auth | — |
| `/api/auth/2fa/status` | GET | operator-auth | — |
| `/api/auth/2fa/verify` | POST | operator-auth | — |
| `/api/auth/forgot-password` | POST | operator-auth | — |
| `/api/auth/get-token` | GET | operator-auth | — |
| `/api/auth/login` | POST | operator-auth | — |
| `/api/auth/logout` | POST | operator-auth | — |
| `/api/auth/register` | POST | operator-auth | — |
| `/api/auth/reset-password` | GET, POST | operator-auth | — |
| `/api/auth/verify` | POST | operator-auth | — |
| `/api/bookings` | GET, POST | golfer | Resolves the green fee and cart fee for a golfer based on their membership tier. |
| `/api/bookings/cancel` | POST | golfer | — |
| `/api/bookings/setup-intent` | POST | golfer | Creates (or reuses) a Stripe Customer and a SetupIntent so the booking page |
| `/api/checkin/[bookingId]` | GET, POST | token-gated | Public, token-gated check-in endpoint — the golfer doesn't need to be |
| `/api/courses` | GET | public | — |
| `/api/courses/[slug]` | GET | public | — |
| `/api/courses/[slug]/tee-times` | GET | public | Maps a Prisma TeeTime row (camelCase, real availability counts) onto the |
| `/api/cron/cancellation-cutoff` | GET | cron | Runs once daily (Vercel Hobby plan caps frequency at once/day). Processes |
| `/api/cron/generate-tee-times` | GET | cron | — |
| `/api/cron/hourly` | GET | cron | Runs every hour (Vercel Pro). Handles all time-sensitive booking actions: |
| `/api/cron/send-reminders` | GET | cron | — |
| `/api/golfer/auth/accept-invite` | GET, POST | golfer | Lets an operator-added member (no GolferAccount yet) land on the emailed link, |
| `/api/golfer/auth/forgot-password` | POST | golfer | — |
| `/api/golfer/auth/login` | POST | golfer | — |
| `/api/golfer/auth/logout` | POST | golfer | — |
| `/api/golfer/auth/me` | GET | golfer | — |
| `/api/golfer/auth/register` | POST | golfer | — |
| `/api/golfer/auth/reset-password` | GET, POST | golfer | — |
| `/api/golfer/memberships` | GET, POST | golfer | Golfer requests membership at a course |
| `/api/golfer/profile` | GET | golfer | — |
| `/api/inquiries` | GET, POST | public | — |
| `/api/inquiries/details` | GET, POST | public | — |
| `/api/member/[courseSlug]/logout` | POST | member | — |
| `/api/member/[courseSlug]/payments` | GET | member | — |
| `/api/member/[courseSlug]/send-code` | POST | member | — |
| `/api/member/[courseSlug]/session` | GET | member | — |
| `/api/member/[courseSlug]/tee-times` | GET | member | — |
| `/api/member/[courseSlug]/verify` | GET | member | — |
| `/api/membership/[id]` | GET, POST | member | Public, token-gated membership dues payment — the member pays from the |
| `/api/operator/analytics` | GET | operator | — |
| `/api/operator/announcements` | GET | operator | — |
| `/api/operator/announcements/dismiss` | POST | operator | — |
| `/api/operator/blackouts` | GET, POST, DELETE | operator | — |
| `/api/operator/bookings` | GET, PATCH | operator | Used by both the Payments tab (all bookings, transaction ledger) and the |
| `/api/operator/change-password` | POST | operator | — |
| `/api/operator/conditions` | PATCH | operator | — |
| `/api/operator/courses` | GET, PATCH | operator | — |
| `/api/operator/members` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/messages` | GET, POST, PATCH | operator | GET /api/operator/messages — own thread with all messages |
| `/api/operator/onboarding-complete` | POST | operator | — |
| `/api/operator/profile` | GET, PATCH | operator | — |
| `/api/operator/regenerate-tee-times` | POST | operator | — |
| `/api/operator/schedule` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/settings` | GET, PATCH | operator | — |
| `/api/operator/staff` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/stripe/callback` | GET | operator | — |
| `/api/operator/stripe/connect` | GET | operator | — |
| `/api/operator/tee-sets` | GET, PUT | operator | — |
| `/api/operator/tee-times` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/tiers` | GET, POST, PATCH, DELETE | operator | — |
| `/api/operator/upload` | POST, DELETE | operator | Course branding image upload (logo / hero photo) via Vercel Blob. |
| `/api/stripe/webhook` | POST | stripe-webhook | — |
| `/api/waitlist` | POST | public | — |

---

## Pages

| Page | Surface | Authed? |
|------|---------|---------|
| `/account` | golfer | yes |
| `/account/accept-invite` | golfer | yes |
| `/account/forgot-password` | golfer | yes |
| `/account/login` | golfer | yes |
| `/account/register` | golfer | yes |
| `/account/reset-password` | golfer | yes |
| `/admin` | admin | yes |
| `/admin/activity` | admin | yes |
| `/admin/broadcasts` | admin | yes |
| `/admin/courses` | admin | yes |
| `/admin/courses/[id]` | admin | yes |
| `/admin/create` | admin | yes |
| `/admin/employees` | admin | yes |
| `/admin/inquiries` | admin | yes |
| `/admin/login` | admin | yes |
| `/admin/messages` | admin | yes |
| `/admin/owner-login` | admin | yes |
| `/admin/profile` | admin | yes |
| `/admin/set-password` | admin | yes |
| `/book` | golfer | yes |
| `/checkin/[bookingId]` | token-gated | yes |
| `/contact` | public | no |
| `/courses/[slug]` | public | no |
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
| `/membership/[id]` | public | yes |
| `/page.tsx` | public | yes |
| `/privacy` | public | no |
| `/terms` | public | no |

**Public pages** (no auth required):
`/`, `/for-courses`, `/for-courses/details` (token-gated), `/courses`, `/courses/[slug]`, `/contact`, `/privacy`, `/terms`, login pages (`/account/login`, `/account/register`, `/api/auth/login`)

**Auth-protected pages** — middleware redirects unauthenticated hits:
- `/admin/*` → redirects to `/admin/login`
- `/dashboard/*` → redirects to `/login`
- `/account/*` → redirects to `/account/login`

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
| `src/lib/admin-session.ts` | — |
| `src/lib/auth.ts` | Fail closed: in production a missing JWT_SECRET must never silently fa |
| `src/lib/booking-mode.ts` | Booking mode: pages a golfer reaches via a course's own website. |
| `src/lib/booking-status.ts` | Single source of truth for what to show a user (operator, staff, or go |
| `src/lib/cancel-booking.ts` | Shared cancellation logic used by both the golfer-initiated cancel rou |
| `src/lib/checkin-booking.ts` | Shared check-in logic used by both the staff "Check In" button on the |
| `src/lib/claim-tee-time.ts` | Atomically creates a booking and updates tee-time capacity. |
| `src/lib/courses-data.ts` | Deterministic tee time generation — same output for same course+date e |
| `src/lib/data.ts` | Deprecated — use @/lib/courses-data instead |
| `src/lib/db.ts` | — |
| `src/lib/email.ts` | Fired by the cancellation-fee cron the moment it successfully auto-cha |
| `src/lib/member-session.ts` | 15-minute magic link token — sent in email |
| `src/lib/normalize-course.ts` | eslint-disable-next-line @typescript-eslint/no-explicit-any |
| `src/lib/password.ts` | Shared password strength rule — used on registration, reset, and in-da |
| `src/lib/prisma.ts` | — |
| `src/lib/rate-limit.ts` | DB-backed fixed-window rate limiter. A single atomic upsert means it c |
| `src/lib/seed.ts` | — |
| `src/lib/session.ts` | Resolves the courseId for both operator and staff sessions. |
| `src/lib/stripe.ts` | Charges a card the platform saved (via SetupIntent on a platform Custo |
| `src/lib/tee-sheet-engine.ts` | Generates/refreshes TeeTime rows for one course on one date from its a |
| `src/lib/tee-time-utils.ts` | Converts a stored tee-time (date "YYYY-MM-DD", time "HH:MM" in the cou |
| `src/lib/twilio.ts` | — |
| `src/lib/two-factor.ts` | Generates a fresh 6-digit code, stores its hash on the operator, and s |

---

## Database Connection Architecture

### Neon pooling setup
- **DATABASE_URL** → Neon pooled endpoint (pgbouncer, transaction pooling mode). Used by all runtime queries.
- **DIRECT_URL** → Neon direct endpoint (no pooler). Used exclusively by Prisma migrations (`migrate deploy`/`migrate dev`). Never used at runtime.
- **SHADOW_DATABASE_URL** → A second Neon branch (e.g. `shadow-dev`). Required locally by `prisma migrate dev` to compute diffs. Not set in production.

### Connection limit guidance
Neon's free tier allows ~100 total connections. Vercel Fluid Compute can have many concurrent lambda instances during a traffic spike. The Neon pooler sits in front and limits the actual Postgres connections, but each Prisma client still opens one connection to the pooler.

The `prisma.ts` singleton caches the client on `globalThis` in ALL environments — a warm lambda reuses the same connection rather than opening a new one per request. This is the standard Vercel+Prisma pattern.

**If connection exhaustion appears under load:** add `?connection_limit=1&pool_timeout=0` to the DATABASE_URL in Vercel env vars to cap each lambda at one pooler connection. At 100-course scale with Vercel's concurrency, the Neon free tier (100 connections) is likely sufficient. Upgrade to Neon Pro (~500 connections) before a high-traffic launch.

### Migration workflow (post-baseline)
- Schema changes → `prisma migrate dev --name <x>` (needs SHADOW_DATABASE_URL locally)
- Deploy → `prisma migrate deploy` (runs automatically via Vercel build, uses DIRECT_URL)
- Never `db push` in this project (bypasses migration history)
