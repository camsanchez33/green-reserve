# GreenReserve — Architecture Reference

> **Auto-generated** by `scripts/route-inventory.ts`. Re-run after adding routes.
> Last generated: 2026-09-16

---

## Routes — see `docs/CODEMAP.md`

Cam, 2026-09-16: this file's route tables are **deleted**, not moved. They had
drifted from `docs/CODEMAP.md` on 21 API rows — two generated maps disagreeing
about who each route is for, with a CI drift check on only one of them. Two
trusted maps that disagree are worse than one, because the reader just picks.

`docs/CODEMAP.md` is the route map now. It carries every URL, its methods, who
it is for, **and where that is actually enforced** — in the route, in a layout,
in middleware, by a capability token, or nowhere. That last column is the thing
the deleted tables could never express, which is exactly why they were trusted
further than they deserved.

What stays in this file is what the map cannot generate: the money flow, the
session-policy table, the model relationships, and the notes explaining why the
system is shaped the way it is.

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

4. STRIPE WEBHOOKS  (src/app/api/stripe/webhook) — registered as a CONNECT webhook
   account.updated                 → sync Course.stripeAccountActive
   charge.refunded                 → PaymentEvent 'refund' (deduped on refund id); full refund → paymentStatus 'refunded'
   charge.dispute.created/updated/closed → PaymentEvent 'dispute' / 'dispute_closed' (one row per state, evidence due date in detail)
   payment_intent.payment_failed   → PaymentEvent 'charge_failed'
   (idempotent: every handler dedupes on a Stripe id or a composite marker)

5. REFUNDS — two paths, one money rule
   lib/refund-booking.ts (admin Refund, MANAGER_PLUS) and lib/stripe.ts
   refundOnConnectedAccount (cancellations) both pass refund_application_fee:
   true — GreenReserve's fee reverses pro rata on every refunded round.
   PaymentEvent is the ledger; /api/admin/transactions/export is the CSV of it.
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
| `src/lib/admin-roles.ts` | Viewer: read-only, and only the surfaces with no golfer PII and no led |
| `src/lib/admin-session-context.tsx` | MP-11a (ADMIN_V4 V4-7, LAW rule 2): the admin session is resolved ONCE |
| `src/lib/admin-session.ts` | Defined in admin-roles.ts (client-safe) and re-exported here so existi |
| `src/lib/agreement-gate.ts` | AG-1: the go-live gate. Server only (reads legal/documents/ via |
| `src/lib/agreement-pdf.tsx` | AGREEMENT_SPEC AG-2 §2 — the signed-agreement PDF. Server only. |
| `src/lib/agreement-required.ts` | AGREEMENT_SPEC AG-3 — version bumps and re-acceptance. Server only. |
| `src/lib/agreement-sign.ts` | AGREEMENT_SPEC AG-2 — the signing service. Server only. |
| `src/lib/agreements.ts` | @brain agreement-versions |
| `src/lib/api-response.ts` | Common JSON response helpers to reduce boilerplate in API routes. |
| `src/lib/approval-state.ts` | DB-backed counterpart to the pure functions in change-requests.ts — fo |
| `src/lib/auth.ts` | Fail closed: in production a missing JWT_SECRET must never silently fa |
| `src/lib/booking-fees.ts` | — |
| `src/lib/booking-mode.ts` | Course-world pages: the course page itself, its member portal, and its |
| `src/lib/booking-status.ts` | Single source of truth for what to show a user (operator, staff, or go |
| `src/lib/booking-window.ts` | BOOKING WINDOWS (RUN_QUEUE) — how far ahead each audience can see and  |
| `src/lib/call-answers.ts` | INQUIRY_CALL_SPEC IC-5 — structured discovery-call answers. |
| `src/lib/call-availability.ts` | @brain when-cam-is-free |
| `src/lib/call-invite.ts` | CALL_SCHEDULING_SPEC SC-2 §1 — the "pick a call time" invite. |
| `src/lib/cancel-booking.ts` | MP-5b. Cancelling normally frees a slot, so anyone watching for that t |
| `src/lib/change-requests.ts` | Single source of truth for structured "request changes" data (V13b). |
| `src/lib/checkin-booking.ts` | Charging a round, and checking a golfer in, are two different things. |
| `src/lib/claim-tee-time.ts` | Atomically creates a booking and updates tee-time capacity. |
| `src/lib/course-action-queue.ts` | COURSES_SHEET_SPEC CS-1 §4 — the Overview action queue's course rows f |
| `src/lib/course-checkin.ts` | COURSES_SHEET_SPEC CS-1 §2 — check-in calls with live courses. |
| `src/lib/course-closure.ts` | MP-5b. Taking a course offline or archiving it used to ignore the golf |
| `src/lib/course-metrics.ts` | @brain course-health |
| `src/lib/course-setup.ts` | COURSES_SHEET_SPEC CS-1 §1 — the five setup steps a built course goes |
| `src/lib/course-time.ts` | SD-3 — course-local time. Tee times are stored as the course's local |
| `src/lib/course-timeline.ts` | @brain course-events |
| `src/lib/course-wire.ts` | Course money: cents at rest, dollars on the wire. |
| `src/lib/courses-data.ts` | Deterministic tee time generation — same output for same course+date e |
| `src/lib/cron-auth.ts` | The cron bearer check, in one place. |
| `src/lib/dashboard-fetch.ts` | SD-10 (from the SD review). The operator dashboard's fetches were, alm |
| `src/lib/dashboard-visits.ts` | Tracks which operator dashboard tabs a device has visited — used to de |
| `src/lib/data.ts` | Deprecated — use @/lib/courses-data instead |
| `src/lib/db.ts` | — |
| `src/lib/demo-courses.ts` | Cam: replace '' with the real demo course slug once the course is poli |
| `src/lib/email.ts` | SD-5: a walk-in entered without an email gets a placeholder address so |
| `src/lib/expenses.ts` | EXPENSE TRACKER (RUN_QUEUE "EXPENSE TRACKER / real P&L") — the manual  |
| `src/lib/faq.ts` | SD-7: the homepage FAQ, in one place, so the rendered accordion and th |
| `src/lib/go-live-preflight.ts` | ONE function, used by BOTH the preflight-check GET (modal display) and |
| `src/lib/golfer-otp.ts` | Passwordless golfer sign-in (GOLFER_SPEC G5). No schema change was all |
| `src/lib/google-calendar.ts` | CALL_SCHEDULING_SPEC SC-1 §2 — Google Calendar, the smallest honest ve |
| `src/lib/ics.ts` | SC-2 §3 — a minimal iCalendar file so a booked call lands in the cours |
| `src/lib/image-resize.ts` | Client-side downscale so a 12MB phone photo never has to travel over t |
| `src/lib/inquiry-action-queue.ts` | The Overview action queue's inquiry rows. |
| `src/lib/inquiry-call.ts` | @brain call-agenda |
| `src/lib/inquiry-needs.ts` | @brain still-need-from-them |
| `src/lib/inquiry-status.ts` | @brain inquiry-statuses |
| `src/lib/lifecycle.ts` | LIFECYCLE PARITY LAW (RUN_QUEUE) — a linked pair (CourseInquiry.builtC |
| `src/lib/member-session.ts` | 15-minute magic link token — sent in email |
| `src/lib/money-problems.ts` | MP-8a. The two "money that should exist and does not" predicates, shar |
| `src/lib/money.ts` | Money conversions, in one place. |
| `src/lib/normalize-course.ts` | eslint-disable-next-line @typescript-eslint/no-explicit-any |
| `src/lib/owner-totp.ts` | OWNER TOTP 2FA (RUN_QUEUE) — the authenticator-app second factor for t |
| `src/lib/password.ts` | Shared password strength rule — used on registration, reset, and in-da |
| `src/lib/platform-stripe.ts` | EXPENSE TRACKER (RUN_QUEUE) — the AUTOMATIC half of the P&L: what Stri |
| `src/lib/preview-token.ts` | — |
| `src/lib/prisma.ts` | Cache on globalThis in ALL environments — in serverless (Vercel) each  |
| `src/lib/rate-limit.ts` | DB-backed fixed-window rate limiter. A single atomic upsert means it c |
| `src/lib/refund-booking.ts` | MP-6b. The refund primitive, and the PaymentEvent ledger it writes to. |
| `src/lib/schedule-conflict.ts` | COURSE_LAYOUT_SPEC L2 — conflict detection for product-scoped schedule |
| `src/lib/schedule-service.ts` | MP-5d. The one place a tee-time schedule is created, changed or remove |
| `src/lib/schedule-wire.ts` | TeeTimeSchedule and TeeTime money: cents at rest, dollars on the wire. |
| `src/lib/seed.ts` | — |
| `src/lib/session.ts` | SD-1: staff run the tee sheet; they do not configure the course. "Staf |
| `src/lib/settings-validation.ts` | SD-1. Server-side validation for the operator settings PATCH. Before t |
| `src/lib/sheet-token.ts` | The setup-sheet token gate, shared by every route a `detailsToken` ope |
| `src/lib/sheet-vs-live.ts` | MP-5e. Two sides of the same course sit in the database and nothing ha |
| `src/lib/staff-fonts.ts` | U-0 (UI_REVISE_SPEC §1b): the STAFF look. /dashboard and /admin set th |
| `src/lib/stripe-errors.ts` | Friendly-message map for Stripe decline/error strings (REVISE_QUEUE A- |
| `src/lib/stripe.ts` | @brain money-movement |
| `src/lib/submit-change-request.ts` | Shared by both request-changes entry points (token-gated preview page  |
| `src/lib/tee-sheet-engine.ts` | Generates/refreshes TeeTime rows for one course on one date from its a |
| `src/lib/tee-time-utils.ts` | Converts a stored tee-time (date "YYYY-MM-DD", time "HH:MM" in the cou |
| `src/lib/terms.ts` | Bump this whenever /terms materially changes so old bookings keep an |
| `src/lib/thread-signal.ts` | MP-7a. ONE answer to "is this course waiting on us, and for how long?" |
| `src/lib/tier-wire.ts` | MembershipTier: cents at rest, dollars on the wire. |
| `src/lib/twilio.ts` | — |
| `src/lib/two-factor.ts` | Generates a fresh 6-digit code, stores its hash on the operator, and s |
| `src/lib/unsaved-guard.ts` | SD-8b — leaving a dashboard page with unsaved edits. |
| `src/lib/use-resource.ts` | MP-11b (ADMIN_V4 V4-7 item 4). The GET-loader shape that every admin p |
| `src/lib/use-tab-intro.ts` | Drives the first-visit "what is this page" intro card (V13 item 2) — |
