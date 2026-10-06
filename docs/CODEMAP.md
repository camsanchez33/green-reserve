# GreenReserve — code map

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/codemap.mjs`.
> Everything below is derived from the working tree. If a line here is wrong,
> the code is wrong or the generator is — fix one of those, not this file.

384 source files · 204 routes · 110 libraries · 35 models

## Single sources of truth

One concept, one owner. A second file claiming the same `@brain` tag fails
this script with a non-zero exit — that is the point of the tag.

| concept | file | exports |
|---|---|---|
| `agreement-versions` | `src/lib/agreements.ts` | `AgreementDocument`, `currentDocuments`, `currentVersion`, `DOCUMENT_DIR`, `DocumentMeta`, `listVersions` +3 more |
| `call-agenda` | `src/lib/inquiry-call.ts` | `AGENDA`, `AgendaItem`, `agendaStatus`, `AgendaStatusRow`, `callGate`, `CallLike` +15 more |
| `course-events` | `src/lib/course-timeline.ts` | `AGREEMENT_ACCEPTED_PREFIX`, `AgreementAcceptedPayload`, `CHECKIN_CALL_PREFIX`, `CheckInCallPayload`, `CURRENT_AGREEMENT_VERSION`, `DOCUMENT_UPLOADED_PREFIX` +22 more |
| `course-health` | `src/lib/course-metrics.ts` | `COMPLETED_BOOKING_STATUSES`, `computeCourseHealth`, `computeNetPnL`, `CourseHealth`, `CourseHealthInput`, `CourseHealthStatus` +11 more |
| `inquiry-signin-challenge` | `src/lib/inquiry-signin.ts` | `CODE_TTL_SECONDS`, `codeMatches`, `cookieOptions`, `generateCode`, `inertChallenge`, `macCode` +7 more |
| `inquiry-statuses` | `src/lib/inquiry-status.ts` | `ACTIVE_STATUSES`, `ALIVE_STATUSES`, `ARCHIVED_STATUSES`, `CLOSED_REASONS`, `compareQueue`, `daysSince` +23 more |
| `money-movement` | `src/lib/stripe.ts` | `ACCESS_FEE_CENTS`, `chargeOnConnectedAccount`, `MEMBERSHIP_FEE_CENTS`, `refundOnConnectedAccount`, `stripe` |
| `private-file-storage` | `src/lib/private-blob.ts` | `isBlobStoreUrl`, `PRIVATE_STORAGE_MISSING`, `privateBlobToken` |
| `separate-booking-fee` | `src/lib/access-fee.ts` | `bookingIdForFeeCharge`, `chargeAccessFeeSeparately`, `counterFeesUncollected`, `FeeChargeResult`, `liveSeparateFee`, `refundSeparateAccessFee` |
| `still-need-from-them` | `src/lib/inquiry-needs.ts` | `NeedItem`, `stillNeed` |
| `whose-move-is-it` | `src/lib/inquiry-status.ts` | `ACTIVE_STATUSES`, `ALIVE_STATUSES`, `ARCHIVED_STATUSES`, `CLOSED_REASONS`, `compareQueue`, `daysSince` +23 more |

## Routes

**auth** is who the route is for. **guard** is where that is enforced:

- `file` — the route calls a session helper AND refuses on a falsy result.
  Presence is not enough: `/api/bookings` calls two session helpers purely for
  member pricing and refuses nobody, and it used to carry this label.
- `X for POST` — split route. The named verbs are NOT covered; the rest are.
- `layout` — an ancestor layout resolves a session AND `redirect()`s on failure.
- `middleware` — inside the matcher and not in its exempt list.
- `client-side` — the guard is a client redirect, so the server renders it
  either way. Fine for a page shell, never sufficient for an API route.
- `entry` — an auth entry point (login, logout, otp, set-password). You cannot
  require a session to create one, and logout must work when it is already dead.
- `token` — session-free by design; a capability token in the URL is the guard.
  The golfer flow works this way: the link in the confirmation email IS the key.
- `secret header` — a shared secret compared against an env var, not a session.
- `public` — the URL prefix carries no auth expectation.
- **`NONE FOUND`** — none of the above on a route whose URL says it should have
  one. A finding, not a label. Read the file before believing the map or the route.

> ⚠ 3 route(s) below are marked `NONE FOUND`.

| url | auth | guard | methods | file | lines |
|---|---|---|---|---|---|
| `/` | public | public | page | `src/app/page.tsx` | 21 |
| `/admin` | admin | client-side | page | `src/app/admin/page.tsx` | 544 |
| `/admin/activity` | admin | client-side | page | `src/app/admin/activity/page.tsx` | 211 |
| `/admin/broadcasts` | admin | client-side | page | `src/app/admin/broadcasts/page.tsx` | 13 |
| `/admin/company-documents` | admin | client-side | page | `src/app/admin/company-documents/page.tsx` | 163 |
| `/admin/courses` | admin | client-side | page | `src/app/admin/courses/page.tsx` | 522 |
| `/admin/courses/[id]` | admin | client-side | page | `src/app/admin/courses/[id]/page.tsx` | 334 |
| `/admin/create` | admin | client-side | page | `src/app/admin/create/page.tsx` | 761 |
| `/admin/employees` | admin | client-side | page | `src/app/admin/employees/page.tsx` | 406 |
| `/admin/forgot-password` | admin | client-side | page | `src/app/admin/forgot-password/page.tsx` | 67 |
| `/admin/golfers` | admin | client-side | page | `src/app/admin/golfers/page.tsx` | 463 |
| `/admin/inquiries` | admin | client-side | page | `src/app/admin/inquiries/page.tsx` | 990 |
| `/admin/inquiries/[id]` | admin | client-side | page | `src/app/admin/inquiries/[id]/page.tsx` | 2262 |
| `/admin/login` | admin | client-side | page | `src/app/admin/login/page.tsx` | 154 |
| `/admin/messages` | admin | client-side | page | `src/app/admin/messages/page.tsx` | 695 |
| `/admin/owner-login` | admin | client-side | page | `src/app/admin/owner-login/page.tsx` | 147 |
| `/admin/profile` | admin | client-side | page | `src/app/admin/profile/page.tsx` | 130 |
| `/admin/revenue` | admin | client-side | page | `src/app/admin/revenue/page.tsx` | 917 |
| `/admin/set-password` | admin | client-side | page | `src/app/admin/set-password/page.tsx` | 159 |
| `/admin/system` | admin | client-side | page | `src/app/admin/system/page.tsx` | 536 |
| `/api/admin/activity` | admin | file | GET | `src/app/api/admin/activity/route.ts` | 145 |
| `/api/admin/archive-course` | admin | file | POST | `src/app/api/admin/archive-course/route.ts` | 71 |
| `/api/admin/backfill-orphaned-inquiries` | admin | file | POST | `src/app/api/admin/backfill-orphaned-inquiries/route.ts` | 42 |
| `/api/admin/bootstrap` | admin | secret header | POST | `src/app/api/admin/bootstrap/route.ts` | 31 |
| `/api/admin/broadcasts` | admin | file | GET POST | `src/app/api/admin/broadcasts/route.ts` | 132 |
| `/api/admin/change-password` | admin | file | POST | `src/app/api/admin/change-password/route.ts` | 27 |
| `/api/admin/company-documents` | admin | file | DELETE GET POST | `src/app/api/admin/company-documents/route.ts` | 70 |
| `/api/admin/company-documents/download` | admin | file | GET | `src/app/api/admin/company-documents/download/route.ts` | 35 |
| `/api/admin/company-documents/upload` | admin | file | POST | `src/app/api/admin/company-documents/upload/route.ts` | 46 |
| `/api/admin/course-calls` | admin | file | POST | `src/app/api/admin/course-calls/route.ts` | 115 |
| `/api/admin/course-detail` | admin | file | GET PATCH | `src/app/api/admin/course-detail/route.ts` | 319 |
| `/api/admin/course-documents` | admin | file | GET POST | `src/app/api/admin/course-documents/route.ts` | 83 |
| `/api/admin/course-documents/download` | admin | file | GET | `src/app/api/admin/course-documents/download/route.ts` | 59 |
| `/api/admin/course-documents/record` | admin | file | POST | `src/app/api/admin/course-documents/record/route.ts` | 37 |
| `/api/admin/course-documents/upload` | admin | file | POST | `src/app/api/admin/course-documents/upload/route.ts` | 60 |
| `/api/admin/course-members` | admin | file | GET | `src/app/api/admin/course-members/route.ts` | 51 |
| `/api/admin/course-reminders` | admin | file | PATCH | `src/app/api/admin/course-reminders/route.ts` | 18 |
| `/api/admin/course-settings` | admin | file | GET PATCH | `src/app/api/admin/course-settings/route.ts` | 72 |
| `/api/admin/courses` | admin | file | GET | `src/app/api/admin/courses/route.ts` | 244 |
| `/api/admin/create-course` | admin | file | GET POST | `src/app/api/admin/create-course/route.ts` | 184 |
| `/api/admin/employees` | admin | file | GET PATCH POST | `src/app/api/admin/employees/route.ts` | 100 |
| `/api/admin/expenses` | admin | file | GET POST | `src/app/api/admin/expenses/route.ts` | 45 |
| `/api/admin/expenses/[id]` | admin | file | DELETE PATCH | `src/app/api/admin/expenses/[id]/route.ts` | 72 |
| `/api/admin/forgot-password` | admin | entry | POST | `src/app/api/admin/forgot-password/route.ts` | 45 |
| `/api/admin/golfers` | admin | file | GET POST | `src/app/api/admin/golfers/route.ts` | 246 |
| `/api/admin/inquiries` | admin | file | DELETE GET PATCH POST | `src/app/api/admin/inquiries/route.ts` | 1201 |
| `/api/admin/login` | admin | entry | POST | `src/app/api/admin/login/route.ts` | 90 |
| `/api/admin/logout` | admin | entry | POST | `src/app/api/admin/logout/route.ts` | 14 |
| `/api/admin/messages` | admin | file | GET PATCH POST | `src/app/api/admin/messages/route.ts` | 211 |
| `/api/admin/nav-badges` | admin | file | GET | `src/app/api/admin/nav-badges/route.ts` | 36 |
| `/api/admin/orphan-sweep` | admin | file | GET POST | `src/app/api/admin/orphan-sweep/route.ts` | 45 |
| `/api/admin/owner-login` | admin | entry | POST | `src/app/api/admin/owner-login/route.ts` | 209 |
| `/api/admin/platform-stripe` | admin | file | GET | `src/app/api/admin/platform-stripe/route.ts` | 117 |
| `/api/admin/reconcile-lifecycle-pairs` | admin | file | POST | `src/app/api/admin/reconcile-lifecycle-pairs/route.ts` | 19 |
| `/api/admin/refund` | admin | file | POST | `src/app/api/admin/refund/route.ts` | 23 |
| `/api/admin/request-re-review` | admin | file | POST | `src/app/api/admin/request-re-review/route.ts` | 35 |
| `/api/admin/resend-staff-setup` | admin | file | POST | `src/app/api/admin/resend-staff-setup/route.ts` | 40 |
| `/api/admin/retry-charge/[bookingId]` | admin | file | POST | `src/app/api/admin/retry-charge/[bookingId]/route.ts` | 38 |
| `/api/admin/revenue` | admin | file | GET | `src/app/api/admin/revenue/route.ts` | 329 |
| `/api/admin/schedule` | admin | file | DELETE GET PATCH POST | `src/app/api/admin/schedule/route.ts` | 67 |
| `/api/admin/search` | admin | file | GET | `src/app/api/admin/search/route.ts` | 169 |
| `/api/admin/send-golive-reminder` | admin | file | POST | `src/app/api/admin/send-golive-reminder/route.ts` | 44 |
| `/api/admin/session` | admin | file | GET | `src/app/api/admin/session/route.ts` | 14 |
| `/api/admin/set-password` | admin | entry | POST | `src/app/api/admin/set-password/route.ts` | 73 |
| `/api/admin/stats` | admin | file | GET | `src/app/api/admin/stats/route.ts` | 482 |
| `/api/admin/system` | admin | file | GET | `src/app/api/admin/system/route.ts` | 107 |
| `/api/admin/tee-sheet` | admin | file | GET PATCH POST | `src/app/api/admin/tee-sheet/route.ts` | 117 |
| `/api/admin/transactions` | admin | file | GET | `src/app/api/admin/transactions/route.ts` | 140 |
| `/api/admin/transactions/export` | admin | file | GET | `src/app/api/admin/transactions/export/route.ts` | 87 |
| `/api/admin/two-factor` | admin | file | GET POST | `src/app/api/admin/two-factor/route.ts` | 92 |
| `/api/admin/verify-operator` | admin | file | POST | `src/app/api/admin/verify-operator/route.ts` | 38 |
| `/api/alerts` | public | public | POST | `src/app/api/alerts/route.ts` | 52 |
| `/api/alerts/unsubscribe/[token]` | public | public | GET | `src/app/api/alerts/unsubscribe/[token]/route.ts` | 53 |
| `/api/auth/2fa/resend` | public | token | POST | `src/app/api/auth/2fa/resend/route.ts` | 32 |
| `/api/auth/2fa/status` | public | token | GET | `src/app/api/auth/2fa/status/route.ts` | 21 |
| `/api/auth/2fa/verify` | public | token | POST | `src/app/api/auth/2fa/verify/route.ts` | 69 |
| `/api/auth/forgot-password` | public | entry | POST | `src/app/api/auth/forgot-password/route.ts` | 58 |
| `/api/auth/login` | public | entry | POST | `src/app/api/auth/login/route.ts` | 81 |
| `/api/auth/logout` | public | entry | POST | `src/app/api/auth/logout/route.ts` | 8 |
| `/api/auth/resend-verification` | operator | file | POST | `src/app/api/auth/resend-verification/route.ts` | 37 |
| `/api/auth/reset-password` | public | entry | GET POST | `src/app/api/auth/reset-password/route.ts` | 81 |
| `/api/auth/verify` | public | public | POST | `src/app/api/auth/verify/route.ts` | 36 |
| `/api/birdie/chat` | operator | file | GET POST PUT | `src/app/api/birdie/chat/route.ts` | 246 |
| `/api/bookings` | golfer | public for POST | GET POST | `src/app/api/bookings/route.ts` | 403 |
| `/api/bookings/cancel` | golfer | file | POST | `src/app/api/bookings/cancel/route.ts` | 44 |
| `/api/bookings/setup-intent` | public | public | POST | `src/app/api/bookings/setup-intent/route.ts` | 73 |
| `/api/calcom/webhook` | public | public | POST | `src/app/api/calcom/webhook/route.ts` | 219 |
| `/api/call/[token]` | public | public | GET | `src/app/api/call/[token]/route.ts` | 80 |
| `/api/checkin/[bookingId]` | public | token | GET POST | `src/app/api/checkin/[bookingId]/route.ts` | 80 |
| `/api/courses` | public | public | GET | `src/app/api/courses/route.ts` | 44 |
| `/api/courses/[slug]` | public | public | GET | `src/app/api/courses/[slug]/route.ts` | 13 |
| `/api/courses/[slug]/account` | golfer | file | GET | `src/app/api/courses/[slug]/account/route.ts` | 86 |
| `/api/courses/[slug]/tee-times` | public | public | GET | `src/app/api/courses/[slug]/tee-times/route.ts` | 15 |
| `/api/cron/cancellation-cutoff` | cron | file | GET | `src/app/api/cron/cancellation-cutoff/route.ts` | 145 |
| `/api/cron/chase-onboarding` | cron | file | GET | `src/app/api/cron/chase-onboarding/route.ts` | 110 |
| `/api/cron/generate-tee-times` | cron | file | GET | `src/app/api/cron/generate-tee-times/route.ts` | 17 |
| `/api/cron/hourly` | cron | file | GET | `src/app/api/cron/hourly/route.ts` | 221 |
| `/api/cron/send-reminders` | cron | file | GET | `src/app/api/cron/send-reminders/route.ts` | 88 |
| `/api/golfer/auth/accept-invite` | golfer | entry | GET POST | `src/app/api/golfer/auth/accept-invite/route.ts` | 76 |
| `/api/golfer/auth/logout` | golfer | entry | POST | `src/app/api/golfer/auth/logout/route.ts` | 8 |
| `/api/golfer/auth/me` | golfer | file | GET | `src/app/api/golfer/auth/me/route.ts` | 15 |
| `/api/golfer/auth/otp/request` | golfer | entry | POST | `src/app/api/golfer/auth/otp/request/route.ts` | 40 |
| `/api/golfer/auth/otp/verify` | golfer | entry | POST | `src/app/api/golfer/auth/otp/verify/route.ts` | 102 |
| `/api/golfer/memberships` | golfer | file | GET POST | `src/app/api/golfer/memberships/route.ts` | 29 |
| `/api/golfer/profile` | golfer | file | GET | `src/app/api/golfer/profile/route.ts` | 14 |
| `/api/health` | public | public | GET | `src/app/api/health/route.ts` | 21 |
| `/api/inquiries` | public | public | POST | `src/app/api/inquiries/route.ts` | 296 |
| `/api/inquiries/details` | public | token | GET PATCH POST | `src/app/api/inquiries/details/route.ts` | 155 |
| `/api/inquiries/signin-code` | public | public | POST | `src/app/api/inquiries/signin-code/route.ts` | 132 |
| `/api/inquiries/signin-verify` | public | public | POST | `src/app/api/inquiries/signin-verify/route.ts` | 113 |
| `/api/inquiries/upload` | public | token | POST | `src/app/api/inquiries/upload/route.ts` | 48 |
| `/api/manage/[bookingId]` | golfer | file | GET | `src/app/api/manage/[bookingId]/route.ts` | 81 |
| `/api/manage/[bookingId]/available-times` | golfer | file | GET | `src/app/api/manage/[bookingId]/available-times/route.ts` | 56 |
| `/api/manage/[bookingId]/change-players` | golfer | file | POST | `src/app/api/manage/[bookingId]/change-players/route.ts` | 101 |
| `/api/manage/[bookingId]/send-modified-email` | golfer | file | POST | `src/app/api/manage/[bookingId]/send-modified-email/route.ts` | 48 |
| `/api/manage/[bookingId]/swap-time` | golfer | file | POST | `src/app/api/manage/[bookingId]/swap-time/route.ts` | 139 |
| `/api/member/[courseSlug]/logout` | member | entry | POST | `src/app/api/member/[courseSlug]/logout/route.ts` | 14 |
| `/api/member/[courseSlug]/payments` | member | file | GET | `src/app/api/member/[courseSlug]/payments/route.ts` | 81 |
| `/api/member/[courseSlug]/send-code` | member | entry | POST | `src/app/api/member/[courseSlug]/send-code/route.ts` | 66 |
| `/api/member/[courseSlug]/session` | member | file | GET | `src/app/api/member/[courseSlug]/session/route.ts` | 80 |
| `/api/member/[courseSlug]/tee-times` | member | file | GET | `src/app/api/member/[courseSlug]/tee-times/route.ts` | 104 |
| `/api/member/[courseSlug]/verify` | member | token | GET | `src/app/api/member/[courseSlug]/verify/route.ts` | 57 |
| `/api/membership/[id]` | public | token | GET POST | `src/app/api/membership/[id]/route.ts` | 138 |
| `/api/operator/active-course` | operator | file | POST | `src/app/api/operator/active-course/route.ts` | 30 |
| `/api/operator/agreement` | operator | file | GET POST | `src/app/api/operator/agreement/route.ts` | 37 |
| `/api/operator/analytics` | operator | file | GET | `src/app/api/operator/analytics/route.ts` | 35 |
| `/api/operator/announcements` | operator | file | GET | `src/app/api/operator/announcements/route.ts` | 42 |
| `/api/operator/announcements/dismiss` | operator | file | POST | `src/app/api/operator/announcements/dismiss/route.ts` | 31 |
| `/api/operator/approve-page` | operator | file | POST | `src/app/api/operator/approve-page/route.ts` | 65 |
| `/api/operator/blackouts` | operator | file | DELETE GET POST | `src/app/api/operator/blackouts/route.ts` | 47 |
| `/api/operator/bookings` | operator | file | GET PATCH POST | `src/app/api/operator/bookings/route.ts` | 311 |
| `/api/operator/change-password` | operator | file | POST | `src/app/api/operator/change-password/route.ts` | 40 |
| `/api/operator/conditions` | operator | file | PATCH | `src/app/api/operator/conditions/route.ts` | 15 |
| `/api/operator/course-products` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/course-products/route.ts` | 122 |
| `/api/operator/courses` | operator | file | GET PATCH | `src/app/api/operator/courses/route.ts` | 109 |
| `/api/operator/frost-delay` | operator | file | POST | `src/app/api/operator/frost-delay/route.ts` | 33 |
| `/api/operator/members` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/members/route.ts` | 270 |
| `/api/operator/members/remind-overdue` | operator | file | POST | `src/app/api/operator/members/remind-overdue/route.ts` | 76 |
| `/api/operator/messages` | operator | file | GET PATCH POST | `src/app/api/operator/messages/route.ts` | 123 |
| `/api/operator/my-courses` | operator | file | GET | `src/app/api/operator/my-courses/route.ts` | 33 |
| `/api/operator/nines` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/nines/route.ts` | 82 |
| `/api/operator/onboarding-complete` | operator | file | POST | `src/app/api/operator/onboarding-complete/route.ts` | 15 |
| `/api/operator/photos` | operator | file | GET POST | `src/app/api/operator/photos/route.ts` | 57 |
| `/api/operator/photos/[id]` | operator | file | DELETE | `src/app/api/operator/photos/[id]/route.ts` | 27 |
| `/api/operator/preview-link` | operator | file | GET | `src/app/api/operator/preview-link/route.ts` | 19 |
| `/api/operator/profile` | operator | file | GET PATCH | `src/app/api/operator/profile/route.ts` | 36 |
| `/api/operator/regenerate-tee-times` | operator | file | POST | `src/app/api/operator/regenerate-tee-times/route.ts` | 32 |
| `/api/operator/request-changes` | operator | file | POST | `src/app/api/operator/request-changes/route.ts` | 32 |
| `/api/operator/schedule` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/schedule/route.ts` | 71 |
| `/api/operator/settings` | operator | file | GET PATCH | `src/app/api/operator/settings/route.ts` | 123 |
| `/api/operator/sign` | operator | file | GET POST | `src/app/api/operator/sign/route.ts` | 103 |
| `/api/operator/staff` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/staff/route.ts` | 124 |
| `/api/operator/stripe/callback` | operator | file | GET | `src/app/api/operator/stripe/callback/route.ts` | 42 |
| `/api/operator/stripe/connect` | operator | file | GET | `src/app/api/operator/stripe/connect/route.ts` | 71 |
| `/api/operator/stripe/dashboard-link` | operator | file | POST | `src/app/api/operator/stripe/dashboard-link/route.ts` | 29 |
| `/api/operator/tee-sets` | operator | file | DELETE GET PATCH POST PUT | `src/app/api/operator/tee-sets/route.ts` | 169 |
| `/api/operator/tee-times` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/tee-times/route.ts` | 138 |
| `/api/operator/tiers` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/tiers/route.ts` | 121 |
| `/api/operator/upload` | operator | file | DELETE POST | `src/app/api/operator/upload/route.ts` | 88 |
| `/api/operator/weather-cancel` | operator | file | POST | `src/app/api/operator/weather-cancel/route.ts` | 50 |
| `/api/preview/[courseId]` | public | token | GET | `src/app/api/preview/[courseId]/route.ts` | 60 |
| `/api/preview/[courseId]/approve` | public | token | POST | `src/app/api/preview/[courseId]/approve/route.ts` | 70 |
| `/api/preview/[courseId]/request-changes` | public | token | POST | `src/app/api/preview/[courseId]/request-changes/route.ts` | 38 |
| `/api/preview/[courseId]/tee-times` | public | token | GET | `src/app/api/preview/[courseId]/tee-times/route.ts` | 67 |
| `/api/preview/send` | admin | file | POST | `src/app/api/preview/send/route.ts` | 148 |
| `/api/receipt/[bookingId]` | admin | file | GET | `src/app/api/receipt/[bookingId]/route.ts` | 61 |
| `/api/stripe/webhook` | public | secret header | POST | `src/app/api/stripe/webhook/route.ts` | 134 |
| `/api/waitlist` | public | public | POST | `src/app/api/waitlist/route.ts` | 7 |
| `/book` | public | public | page | `src/app/book/page.tsx` | 33 |
| `/call/[token]` | public | public | page | `src/app/call/[token]/page.tsx` | 141 |
| `/checkin/[bookingId]` | golfer | token | page | `src/app/checkin/[bookingId]/page.tsx` | 343 |
| `/contact` | public | public | page | `src/app/contact/page.tsx` | 41 |
| `/courses/[slug]` | public | public | page | `src/app/courses/[slug]/page.tsx` | 45 |
| `/courses/[slug]/account` | golfer | **NONE FOUND** | page | `src/app/courses/[slug]/account/page.tsx` | 11 |
| `/courses/[slug]/account/accept-invite` | golfer | entry | page | `src/app/courses/[slug]/account/accept-invite/page.tsx` | 150 |
| `/courses/[slug]/member` | member | **NONE FOUND** | page | `src/app/courses/[slug]/member/page.tsx` | 843 |
| `/dashboard` | operator | middleware | page | `src/app/dashboard/page.tsx` | 1365 |
| `/dashboard/2fa` | operator | entry | page | `src/app/dashboard/2fa/page.tsx` | 99 |
| `/dashboard/analytics` | operator | middleware | page | `src/app/dashboard/analytics/page.tsx` | 423 |
| `/dashboard/cancellations` | operator | middleware | page | `src/app/dashboard/cancellations/page.tsx` | 17 |
| `/dashboard/forgot-password` | operator | entry | page | `src/app/dashboard/forgot-password/page.tsx` | 70 |
| `/dashboard/login` | operator | entry | page | `src/app/dashboard/login/page.tsx` | 78 |
| `/dashboard/members` | operator | middleware | page | `src/app/dashboard/members/page.tsx` | 713 |
| `/dashboard/messages` | operator | middleware | page | `src/app/dashboard/messages/page.tsx` | 193 |
| `/dashboard/money` | operator | middleware | page | `src/app/dashboard/money/page.tsx` | 183 |
| `/dashboard/onboarding` | operator | **NONE FOUND** | page | `src/app/dashboard/onboarding/page.tsx` | 316 |
| `/dashboard/outings` | operator | middleware | page | `src/app/dashboard/outings/page.tsx` | 27 |
| `/dashboard/payments` | operator | middleware | page | `src/app/dashboard/payments/page.tsx` | 18 |
| `/dashboard/reset-password` | operator | entry | page | `src/app/dashboard/reset-password/page.tsx` | 118 |
| `/dashboard/schedules` | operator | middleware | page | `src/app/dashboard/schedules/page.tsx` | 457 |
| `/dashboard/settings` | operator | middleware | page | `src/app/dashboard/settings/page.tsx` | 991 |
| `/dashboard/sign` | operator | middleware | page | `src/app/dashboard/sign/page.tsx` | 26 |
| `/dashboard/tournaments` | operator | middleware | page | `src/app/dashboard/tournaments/page.tsx` | 27 |
| `/dashboard/verify` | operator | token | page | `src/app/dashboard/verify/page.tsx` | 148 |
| `/demo` | public | public | GET | `src/app/demo/route.ts` | 18 |
| `/for-courses` | public | public | page | `src/app/for-courses/page.tsx` | 15 |
| `/for-courses/details` | public | token | page | `src/app/for-courses/details/page.tsx` | 1946 |
| `/manage/[bookingId]` | golfer | token | page | `src/app/manage/[bookingId]/page.tsx` | 560 |
| `/membership/[id]` | public | token | page | `src/app/membership/[id]/page.tsx` | 197 |
| `/operator-agreement` | public | public | page | `src/app/operator-agreement/page.tsx` | 82 |
| `/preview/[courseId]` | public | token | page | `src/app/preview/[courseId]/page.tsx` | 58 |
| `/privacy` | public | public | page | `src/app/privacy/page.tsx` | 249 |
| `/receipt/[bookingId]` | golfer | token | page | `src/app/receipt/[bookingId]/page.tsx` | 211 |
| `/terms` | public | public | page | `src/app/terms/page.tsx` | 192 |

## Libraries

Sorted by how many files import them, so the load-bearing ones are first.

| file | used by | lines | purpose | exports |
|---|---|---|---|---|
| `src/lib/prisma.ts` | 163 | 15 |  | `prisma` |
| `src/lib/admin-session.ts` | 52 | 149 |  | `AdminSession`, `AdminSessionUnavailable`, `MANAGER_PLUS`, `OWNER_ONLY`, `ownerGateError`, `requireOwner`, `requireRole`, `resolveAdminSession` +5 more |
| `src/lib/email.ts` | 46 | 1823 |  | `BookingEmailData`, `escapeHtml`, `isPlaceholderEmail`, `PLACEHOLDER_EMAIL_DOMAIN`, `sendAdminPasswordChangedNotification`, `sendAdminPasswordResetEmail`, `sendAdminSetPasswordEmail`, `sendAdminTwoFactorCode` +51 more |
| `src/lib/session.ts` | 36 | 99 |  | `ACTIVE_COURSE_COOKIE`, `can`, `requirePermission`, `resolveDashboardSession`, `ResolvedSession`, `STAFF_FORBIDDEN` |
| `src/lib/rate-limit.ts` | 33 | 78 |  | `clientIp`, `evidentiaryIp`, `rateLimit`, `rateLimitCount` |
| `src/lib/auth.ts` | 28 | 202 |  | `DashboardSession`, `getGolferSession`, `getOperatorSession`, `signGolferToken`, `signMemberInviteToken`, `signPendingTwoFactorToken`, `signStaffResetToken`, `signStaffToken` +4 more |
| `src/lib/money.ts` | 28 | 50 | Money conversions, in one place. | `centsToDollars`, `centsToDollarsOr0`, `dollarsToCents`, `dollarsToCentsOr0`, `fmtCents` |
| `src/lib/format.ts` | 27 | 78 | MP-9 (ADMIN_V4 V4-6 §3) — the one place admin pages format money and time. | `formatCents`, `formatDate`, `formatDateTime`, `formatEasternDate`, `formatEasternDay`, `formatMoney`, `formatRelative`, `formatStamp` +3 more |
| `src/lib/agreement-required.ts` | 20 | 122 | AGREEMENT_SPEC AG-3 — version bumps and re-acceptance. | `AGREEMENT_REQUIRED_MESSAGE`, `agreementDueByCourse`, `agreementOverdueCourses`, `agreementReacceptance`, `currentReacceptWindow`, `Reacceptance`, `ReacceptWindow`, `requireAgreementCurrent` +1 more |
| `src/lib/course-time.ts` | 18 | 46 | SD-3 — course-local time. | `addDaysStr`, `clockIn`, `DEFAULT_TZ`, `isPastIn`, `isValidTimezone`, `todayIn`, `US_TIMEZONES` |
| `src/lib/stripe.ts` | 18 | 87 | Every charge, refund and SetupIntent GreenReserve makes goes through here. | `ACCESS_FEE_CENTS`, `chargeOnConnectedAccount`, `MEMBERSHIP_FEE_CENTS`, `refundOnConnectedAccount`, `stripe` |
| `src/lib/change-requests.ts` | 16 | 149 | Single source of truth for structured "request changes" data (V13b). | `APPROVED_MARKER`, `CATEGORY_LABEL`, `CHANGE_ADDRESSED_PREFIX`, `CHANGE_CATEGORIES`, `ChangeCategoryKey`, `ChangeItem`, `CHANGES_REQUESTED_PREFIX`, `computeOpenChanges` +14 more |
| `src/lib/course-timeline.ts` | 13 | 165 |  | `AGREEMENT_ACCEPTED_PREFIX`, `AgreementAcceptedPayload`, `CHECKIN_CALL_PREFIX`, `CheckInCallPayload`, `CURRENT_AGREEMENT_VERSION`, `DOCUMENT_UPLOADED_PREFIX`, `DocumentUploadedPayload`, `getCourseTimeline` +20 more |
| `src/lib/inquiry-call.ts` | 13 | 175 | INQUIRY_CALL_SPEC IC-1 §2 — the discovery-call agenda catalog, and the small derivations the sheet, the detail page and the queue share. | `AGENDA`, `AgendaItem`, `agendaStatus`, `AgendaStatusRow`, `callGate`, `CallLike`, `defaultAgenda`, `DIRECTION_LABEL` +13 more |
| `src/lib/inquiry-status.ts` | 12 | 465 | Single source of truth for what every inquiry status means and which pipeline segment it belongs to. | `ACTIVE_STATUSES`, `ALIVE_STATUSES`, `ARCHIVED_STATUSES`, `CLOSED_REASONS`, `compareQueue`, `daysSince`, `decodeResubmit`, `diffResubmit` +21 more |
| `src/lib/admin-fetch.ts` | 11 | 150 | One place that decides what an admin fetch failure MEANS. | `adminErrorMessage`, `adminFetch`, `AdminFetchAction`, `AdminFetchFailure`, `AdminFetchResult`, `LOGIN_SESSION_ENDED` |
| `src/lib/staff-permissions.ts` | 10 | 129 | SP-A (STAFF_POLICY_SPEC Part A). | `ALL_KEYS`, `deniedMessage`, `labelFor`, `LEGACY_KEYS`, `normalizePermissions`, `PermissionDef`, `PermissionKey`, `PERMISSIONS` +5 more |
| `src/lib/booking-events.ts` | 9 | 85 |  | `BookingEventInput`, `EventActor`, `recordBookingEvent`, `recordBookingEventSafe`, `teeTimeInstant` |
| `src/lib/cancel-policy.ts` | 9 | 135 | SP-B (STAFF_POLICY_SPEC Part B). | `bookingWindowHours`, `CancelPolicy`, `cardRequired`, `chargesNoShow`, `chargesOnLateCancel`, `describePolicy`, `FeeBasis`, `holdsAtCutoff` +7 more |
| `src/lib/dashboard-fetch.ts` | 9 | 43 | SD-10 (from the SD review). | `dfetch`, `DFetchResult` |
| `src/lib/admin-session-context.tsx` | 8 | 77 | MP-11a (ADMIN_V4 V4-7, LAW rule 2): | `AdminSessionProvider`, `AdminSessionView`, `isAdminAuthPath`, `useAdminSession` |
| `src/lib/agreements.ts` | 8 | 118 | AGREEMENT_SPEC AG-1 §2 — versioned agreement documents. | `AgreementDocument`, `currentDocuments`, `currentVersion`, `DOCUMENT_DIR`, `DocumentMeta`, `listVersions`, `loadDocument`, `LoadedDocument` +1 more |
| `src/lib/course-metrics.ts` | 8 | 219 | THE shared metrics brain (REVISE_QUEUE A-04 item 0) — bookings/gross/ GR-fees/period math defined ONCE. | `COMPLETED_BOOKING_STATUSES`, `computeCourseHealth`, `computeNetPnL`, `CourseHealth`, `CourseHealthInput`, `CourseHealthStatus`, `HEALTH_STATUS_DOT`, `HEALTH_STATUS_LABEL` +9 more |
| `src/lib/private-blob.ts` | 8 | 33 | Contracts and signed agreements live in their OWN, private Vercel Blob store (Cam 2026-09-29). | `isBlobStoreUrl`, `PRIVATE_STORAGE_MISSING`, `privateBlobToken` |
| `src/lib/use-dashboard-access.ts` | 8 | 51 | SP-A: | `DashboardAccess`, `useDashboardAccess` |
| `src/lib/agreement-gate.ts` | 7 | 91 | AG-1: | `AgreementDocStatus`, `agreementStatus`, `AgreementStatus`, `hasAcceptedAgreement` |
| `src/lib/course-checkin.ts` | 7 | 106 | COURSES_SHEET_SPEC CS-1 §2 — check-in calls with live courses. | `CHECKIN_AGENDA`, `CHECKIN_DUE_WINDOW_DAYS`, `CHECKIN_EVERY_DAYS`, `CHECKIN_FIRST_DAYS`, `CheckinAgendaItem`, `CheckinCallLike`, `CheckinCourseLike`, `checkInSignal` +8 more |
| `src/lib/cron-log.ts` | 7 | 136 | MP-8b: | `cronHealth`, `CronHealth`, `cronRoute`, `lastStripeWebhook`, `logStripeWebhook`, `STRIPE_WEBHOOK_JOB` |
| `src/lib/member-session.ts` | 7 | 89 |  | `getGolferMembership`, `getMemberSession`, `signMemberMagicToken`, `signMemberSessionToken`, `verifyMemberMagicToken` |
| `src/lib/preview-token.ts` | 7 | 25 |  | `signPreviewToken`, `verifyPreviewToken` |
| `src/lib/tee-time-utils.ts` | 7 | 41 | Converts a stored tee-time (date "YYYY-MM-DD", time "HH:MM" in the course's local timezone) to a UTC millisecond timestamp. | `teeToUtcMs` |
| `src/lib/access-fee.ts` | 6 | 181 | FB-3 (Cam 2026-09-29, FB3_FEE_PLAN_SPEC.md option B). | `bookingIdForFeeCharge`, `chargeAccessFeeSeparately`, `counterFeesUncollected`, `FeeChargeResult`, `liveSeparateFee`, `refundSeparateAccessFee` |
| `src/lib/booking-fees.ts` | 6 | 11 |  | `ACCESS_FEE_CENTS`, `ACCESS_FEE_PER_PLAYER`, `hoursLabel`, `serviceFeeLabel` |
| `src/lib/calcom.ts` | 6 | 93 | CAL-1 — Cal.com as the call scheduler, in place of the Google Calendar grid. | `calcomBookingUrl`, `calcomCreatedBy`, `calcomEmbedUrl`, `calcomManageLinks`, `calcomStatus`, `calcomUidOf`, `verifyCalcomSignature` |
| `src/lib/call-answers.ts` | 6 | 349 | INQUIRY_CALL_SPEC IC-5 — structured discovery-call answers. | `BOOKING_METHOD_OPTIONS`, `CALL_FIELDS`, `CallAnswers`, `callRecapLines`, `DAY_SHORT`, `emptyAnswers`, `FieldSpec`, `FieldType` +19 more |
| `src/lib/cancel-booking.ts` | 6 | 255 |  | `CancellationOptions`, `performCancellation` |
| `src/lib/cron-auth.ts` | 6 | 39 |  | `cronAuthFailure` |
| `src/lib/manage-access.ts` | 6 | 17 | R-AUTH-003 / R-GOLF-003 (G13) — who may manage a booking from the golfer side. | `canManageBooking` |
| `src/lib/password.ts` | 6 | 14 | Shared password strength rule — used on registration, reset, and in-dashboard change-password, both server-side (enforcement) and client-side (live hint). | `PASSWORD_REQUIREMENTS_HINT`, `validatePasswordStrength` |
| `src/lib/schedule-service.ts` | 6 | 216 | MP-5d. | `createSchedule`, `deleteSchedule`, `listSchedules`, `ScheduleConflictError`, `ScheduleProductError`, `ScheduleScope`, `setTeeTimeBlocked`, `updateSchedule` |
| `src/lib/approval-state.ts` | 5 | 41 |  | `ApprovalState`, `getApprovalState` |
| `src/lib/refund-booking.ts` | 5 | 133 | MP-6b. | `findBookingByStripeId`, `PaymentEventKind`, `recordPaymentEvent`, `refundBooking`, `RefundResult` |
| `src/lib/tee-sheet-engine.ts` | 5 | 202 |  | `generateForAllCourses`, `generateTeeTimes`, `regenerateUpcoming` |
| `src/lib/admin-roles.ts` | 4 | 17 | Role lists, client-safe. | `MANAGER_PLUS`, `OWNER_ONLY`, `SUPPORT_PLUS`, `VIEWER_PLUS` |
| `src/lib/birdie/proposal-types.ts` | 4 | 30 | BIRDIE_AI_SPEC B4b — the confirm-card shape, shared by the server (which builds cards in proposals.ts) and the widget (which shows them and makes the call). | `isProposalCard`, `PROPOSAL_ROUTES`, `ProposalCall`, `ProposalCard` |
| `src/lib/booking-window.ts` | 4 | 76 | BOOKING WINDOWS (RUN_QUEUE) — how far ahead each audience can see and book the tee sheet. | `dayOffset`, `DEFAULT_MEMBER_WINDOW_DAYS`, `DEFAULT_PUBLIC_WINDOW_DAYS`, `generationHorizonDays`, `lastBookableDate`, `MIN_GENERATION_DAYS`, `outsideWindowBody`, `utcToday` +4 more |
| `src/lib/call-invite.ts` | 4 | 106 | CALL_SCHEDULING_SPEC SC-2 §1 — the "pick a call time" invite. | `deliverCallInvite`, `INVITE_DAYS`, `inviteAgendaLines`, `InviteSendResult`, `inviteUrl`, `issueCallInvite`, `sendCallInvite`, `sendCallReminders` |
| `src/lib/company-documents.ts` | 4 | 61 | CO-DOCS (Cam 2026-10-01): | `COMPANY_DOC_CATEGORIES`, `COMPANY_DOC_MAX_BYTES`, `COMPANY_DOC_PREFIX`, `COMPANY_DOC_TYPES`, `CompanyDocCategory`, `companyDocPathOf`, `describeCompanyPath`, `isAllowedCompanyPath` +1 more |
| `src/lib/demo-courses.ts` | 4 | 4 | Cam: | `DEMO_COURSE_SLUGS` |
| `src/lib/expenses.ts` | 4 | 77 | EXPENSE TRACKER (RUN_QUEUE "EXPENSE TRACKER / real P&L") — the manual half of the P&L: | `EXPENSE_CADENCE_LABEL`, `EXPENSE_CADENCES`, `EXPENSE_CATEGORIES`, `EXPENSE_CATEGORY_LABEL`, `ExpenseCadence`, `ExpenseCategory`, `isExpenseCadence`, `isExpenseCategory` +3 more |
| `src/lib/lifecycle.ts` | 4 | 414 |  | `archivePair`, `deleteInquiryOrPair`, `deletePair`, `forceDeleteOrphan`, `ForceDeleteResult`, `LifecycleResult`, `listAcknowledgedOrphans`, `ORPHAN_FLAG` +6 more |
| `src/lib/terms.ts` | 4 | 6 | Bump this whenever /terms materially changes so old bookings keep an honest record of which version the golfer actually agreed to. | `CURRENT_TERMS_VERSION` |
| `src/lib/analytics.ts` | 3 | 333 | AN-1 (Cam 2026-10-01): | `Analytics`, `computeAnalytics`, `EVENT_LOG_START`, `headline`, `NO_SHOW_GRACE_MIN`, `previousRange`, `Range` |
| `src/lib/booking-mode.ts` | 3 | 20 | Course-world pages: | `isBookingMode`, `isCourseWorld` |
| `src/lib/checkin-booking.ts` | 3 | 397 |  | `cartAddOnCentsFor`, `collectPayment`, `performCheckIn` |
| `src/lib/claim-tee-time.ts` | 3 | 93 |  | `claimTeeTime`, `TeeTimeClaimError` |
| `src/lib/course-setup.ts` | 3 | 52 | COURSES_SHEET_SPEC CS-1 §1 — the five setup steps a built course goes through before it is live. | `SETUP_STEPS`, `SetupCourseLike`, `setupProgress`, `SetupProgress`, `SetupStep`, `SetupStepKey` |
| `src/lib/course-wire.ts` | 3 | 57 |  | `COURSE_MONEY_WIRE_FIELDS`, `courseMoneyFromWire`, `courseToWire` |
| `src/lib/dashboard-visits.ts` | 3 | 45 | Tracks which operator dashboard tabs a device has visited — used to derive "Look around your dashboard" / "Check your tee sheet schedule" in the Getting Started checklist (V13). | `CORE_TABS`, `getVisitedTabs`, `isIntroSeen`, `LOOK_AROUND_THRESHOLD`, `markIntroSeen`, `recordTabVisit` |
| `src/lib/go-live-preflight.ts` | 3 | 35 |  | `computeStripeGoLiveCheck`, `StripeGoLiveCheck` |
| `src/lib/golfer-otp.ts` | 3 | 94 |  | `classifyIdentifier`, `EMAIL_RE`, `generateOtpCode`, `normalizePhone`, `OtpChallenge`, `otpCodeMatches`, `OtpIdentifierType`, `otpUsedKey` +2 more |
| `src/lib/inquiry-needs.ts` | 3 | 38 | INQUIRY_CALL_SPEC IC-1 §3 — "Still need from them", the sheet's column. | `NeedItem`, `stillNeed` |
| `src/lib/money-problems.ts` | 3 | 43 |  | `FAILED_CHARGE_WHERE`, `missedCheckInWhere`, `openDisputes` |
| `src/lib/no-show-fee.ts` | 3 | 135 | SP-B (STAFF_POLICY_SPEC Part B4). | `dueAutoNoShows`, `liveNoShowCharge`, `markNoShow`, `NoShowResult`, `refundNoShowFee` |
| `src/lib/normalize-course.ts` | 3 | 70 |  | `normalizeDbCourse` |
| `src/lib/public-course.ts` | 3 | 29 | PERF-1: | `loadPublicCourse` |
| `src/lib/thread-signal.ts` | 3 | 52 | MP-7a. | `compareThreads`, `SignalMessage`, `threadSignal`, `ThreadSignal`, `UNANSWERED_AFTER_DAYS` |
| `src/lib/twilio.ts` | 3 | 42 |  | `sendSms`, `sendSmsOtp` |
| `src/lib/unsaved-guard.ts` | 3 | 95 | SD-8b — leaving a dashboard page with unsaved edits. | `confirmLeave`, `setLeaveGuard`, `useBackGuard` |
| `src/lib/agreement-sign.ts` | 2 | 203 | AGREEMENT_SPEC AG-2 — the signing service. | `deliverAgreementPdfs`, `recordSigning`, `retryMissingAgreementPdfs`, `SignInput`, `SignResult` |
| `src/lib/announcement-audience.ts` | 2 | 18 | Cam 2026-10-05: | `announcementsSince` |
| `src/lib/birdie/guardrails.ts` | 2 | 74 | BIRDIE_AI_SPEC B1 — scope, caps and the kill switch. | `BIRDIE_MODEL`, `birdieEnabled`, `BirdieTurn`, `birdieUsageToday`, `checkCaps`, `logConversation`, `MAX_HISTORY_TURNS`, `MAX_REPLY_TOKENS` +4 more |
| `src/lib/birdie/tools.ts` | 2 | 182 | BIRDIE_AI_SPEC B4a (Cam 2026-10-05) — live-data READ tools for the operator persona. | `READ_TOOLS`, `runReadTool`, `ToolContext`, `ToolOutcome` |
| `src/lib/booking-status.ts` | 2 | 77 | Single source of truth for what to show a user (operator, staff, or golfer) given a booking's current status + paymentStatus pair. | `BookingStatusInfo`, `getBookingStatus`, `statusDot`, `StatusTone` |
| `src/lib/calcom-url.ts` | 2 | 21 | The prefilled Cal.com booking link — no server-only imports, so the /for-courses thanks page can build it in the browser (FB-1 review) as well as the server routes (via lib/calcom.ts). | `calcomEmbedUrl` |
| `src/lib/course-closure.ts` | 2 | 125 | MP-5b. | `cancelFutureBookingsForClosure`, `closureImpact`, `ClosureImpact`, `ClosureResult`, `notifyOperatorOfClosure` |
| `src/lib/courses-data.ts` | 2 | 320 |  | `Course`, `COURSES`, `generateTeeTimes`, `getCourseBySlug`, `searchCourses`, `TeeTime` |
| `src/lib/faq.ts` | 2 | 26 | SD-7: | `faqJsonLd`, `HOME_FAQ` |
| `src/lib/image-resize.ts` | 2 | 33 | Client-side downscale so a 12MB phone photo never has to travel over the wire or blow the perf budget on the page that eventually renders it. | `downscaleImage` |
| `src/lib/inquiry-action-queue.ts` | 2 | 105 | The Overview action queue's inquiry rows. | `ActionQueueRow`, `buildInquiryQueueRows`, `QueueInquiry` |
| `src/lib/inquiry-signin.ts` | 2 | 124 | SD-11 — the "are you trying to sign in?" challenge that sits between the public sign-up form and a course that already exists. | `CODE_TTL_SECONDS`, `codeMatches`, `cookieOptions`, `generateCode`, `inertChallenge`, `macCode`, `MAX_CODE_ATTEMPTS`, `newChallengeId` +5 more |
| `src/lib/owner-totp.ts` | 2 | 100 | OWNER TOTP 2FA (RUN_QUEUE) — the authenticator-app second factor for the owner account. | `generateRecoveryCodes`, `generateTotpSecret`, `looksLikeRecoveryCode`, `matchRecoveryCode`, `normalizeRecoveryCode`, `RECOVERY_CODE_COUNT`, `signEnrolToken`, `TOTP_ISSUER` +8 more |
| `src/lib/platform-stripe.ts` | 2 | 58 |  | `fetchStripeFeeWindow`, `fetchStripeProcessingCostCents`, `StripeFeeWindow` |
| `src/lib/public-tee-times.ts` | 2 | 81 | PERF-1: | `loadPublicTeeTimes`, `normalizeDbTeeTime`, `PublicTeeTimes` |
| `src/lib/schedule-conflict.ts` | 2 | 78 | COURSE_LAYOUT_SPEC L2 — conflict detection for product-scoped schedules. | `ConflictNine`, `ConflictProduct`, `ConflictSchedule`, `findScheduleConflict` |
| `src/lib/schedule-wire.ts` | 2 | 92 |  | `scheduleMoneyForCreate`, `scheduleMoneyFromWire`, `scheduleToWire`, `teeTimeToWire` |
| `src/lib/settings-validation.ts` | 2 | 141 | SD-1. | `normalizeHttpUrl`, `SettingsValidation`, `validateSettingsPatch` |
| `src/lib/sheet-token.ts` | 2 | 52 |  | `CLOSED_TO_SHEET`, `DETAILS_TOKEN_TTL_DAYS`, `gateSheetAccess`, `SheetGate` |
| `src/lib/staff-fonts.ts` | 2 | 10 | U-0 (UI_REVISE_SPEC §1b) used to give /dashboard and /admin their own STAFF look here: | `STAFF_LOOK_CLASS` |
| `src/lib/stripe-errors.ts` | 2 | 26 | Friendly-message map for Stripe decline/error strings (REVISE_QUEUE A-06 item 4: | `friendlyStripeError` |
| `src/lib/submit-change-request.ts` | 2 | 88 |  | `cleanChangeItems`, `submitChangeRequest` |
| `src/lib/two-factor.ts` | 2 | 41 |  | `issueTwoFactorCode` |
| `src/lib/admin-day.ts` | 1 | 111 | Platform day boundaries. | `dayKey`, `PLATFORM_TZ`, `platformHour`, `startOfPlatformDay`, `startOfPlatformDaysAgo`, `startOfPlatformMonth`, `startOfPlatformMonthsAgo`, `startOfPlatformWeek` |
| `src/lib/agreement-pdf.tsx` | 1 | 129 | AGREEMENT_SPEC AG-2 §2 — the signed-agreement PDF. | `AgreementPdf`, `markdownBlocks`, `renderAgreementPdf`, `SignatureBlock` |
| `src/lib/birdie/course-context.ts` | 1 | 72 | BIRDIE_AI_SPEC B1 — read-only awareness of THE OPERATOR'S OWN course. | `describeCourseContext`, `operatorCourseContext`, `OperatorCourseContext` |
| `src/lib/birdie/knowledge-operator.ts` | 1 | 64 | BIRDIE_AI_SPEC B1 — the operator knowledge pack. | `DASHBOARD_PAGES`, `DashboardPage`, `OPERATOR_KNOWLEDGE` |
| `src/lib/birdie/proposals.ts` | 1 | 201 | BIRDIE_AI_SPEC B4b (Cam 2026-10-05) — propose-and-confirm CHANGES. | `isProposeTool`, `ProposalCard`, `ProposalOutcome`, `PROPOSE_TOOLS`, `runProposeTool` |
| `src/lib/course-action-queue.ts` | 1 | 37 | COURSES_SHEET_SPEC CS-1 §4 — the Overview action queue's course rows for check-in calls. | `buildCourseCheckInRows`, `QueueCourse` |
| `src/lib/course-feed.ts` | 1 | 64 | MP-5e part 3 — the course's relationship feed: | `buildRelationshipFeed`, `FeedItem`, `FeedKind` |
| `src/lib/cron-windows.ts` | 1 | 26 | R-CRON-003 — when the hourly cron sends its time-based emails. | `checkInEmailDue`, `cutoffWarningDue` |
| `src/lib/frost-delay.ts` | 1 | 107 | B-9 frost delay (Cam 2026-10-01: | `applyFrostDelay`, `FrostMove`, `FrostPlan`, `isFrostTime`, `planFrostDelay` |
| `src/lib/sheet-vs-live.ts` | 1 | 108 | MP-5e. | `ConfigDrift`, `InquirySide`, `LiveSide`, `sheetVsLive` |
| `src/lib/tier-wire.ts` | 1 | 43 |  | `tierToWire` |
| `src/lib/use-resource.ts` | 1 | 40 | MP-11b (ADMIN_V4 V4-7 item 4). | `ResourceError`, `useResource` |
| `src/lib/weather-cancel.ts` | 1 | 89 | WX-1 weather cancel (Cam 2026-10-01: | `applyWeatherCancel`, `isWeatherTime`, `planWeatherCancel`, `WeatherGroup`, `WeatherPlan`, `WeatherResult` |
| `src/lib/api-response.ts` | 0 | 22 | Common JSON response helpers to reduce boilerplate in API routes. | `badRequest`, `conflict`, `forbidden`, `notFound`, `serverError`, `unauthorized` |
| `src/lib/data.ts` | 0 | 3 | Deprecated — use @/lib/courses-data instead |  |
| `src/lib/db.ts` | 0 | 2 |  |  |
| `src/lib/seed.ts` | 0 | 2 |  |  |
| `src/lib/use-tab-intro.ts` | 0 | 18 |  | `useTabIntro` |

## Components

Sorted the same way.

| file | used by | lines | purpose | exports |
|---|---|---|---|---|
| `src/components/ui/StatusDot.tsx` | 39 | 36 |  | `StatusDot` |
| `src/components/ui/Card.tsx` | 30 | 17 |  | `Card`, `CARD` |
| `src/components/ui/Eyebrow.tsx` | 28 | 19 |  | `Eyebrow`, `EYEBROW` |
| `src/components/ui/field.ts` | 19 | 8 | MP-9: | `INPUT`, `INPUT_COMPACT` |
| `src/components/admin/AdminSidebar.tsx` | 14 | 267 |  | `AdminNavKey`, `default (AdminSidebar)` |
| `src/components/dashboard/Toast.tsx` | 10 | 70 | SD-2. | `toast`, `Toaster`, `ToastKind` |
| `src/components/OperatorSidebar.tsx` | 10 | 244 |  | `default (OperatorSidebar)`, `OperatorNavKey` |
| `src/components/ui/ErrorState.tsx` | 7 | 96 |  | `ErrorBanner`, `LoadFailure` |
| `src/components/dashboard/LoadError.tsx` | 6 | 16 | SD-10. | `LoadError` |
| `src/components/ui/Modal.tsx` | 6 | 141 | MP-9 (ADMIN_V4 V4-6 §4) — the one dialog. | `Modal`, `ModalActions` |
| `src/components/CourseHeaderBar.tsx` | 5 | 46 | White-label rule: | `CourseHeaderBar` |
| `src/components/dashboard/money/types.ts` | 4 | 18 | SD-8 — one booking shape for all three Money tabs. | `MoneyBooking`, `MoneyCourse` |
| `src/components/admin/CourseCheckInCard.tsx` | 3 | 364 | COURSES_SHEET_SPEC CS-3 §2 — the "Next check-in" card on a live course's Overview. | `CourseCallRow`, `default (CourseCheckInCard)`, `describeCheckIn` |
| `src/components/dashboard/SignAgreements.tsx` | 3 | 221 | AGREEMENT_SPEC AG-2 §1 — the "Sign" step. | `default (SignAgreements)` |
| `src/components/dashboard/StaffNotice.tsx` | 3 | 30 | SD-11 / SP-A. | `StaffNotice` |
| `src/components/EmptyState.tsx` | 3 | 22 |  | `EmptyState` |
| `src/components/GolferExitLinks.tsx` | 3 | 24 |  | `GolferExitLinks` |
| `src/components/PlainHeader.tsx` | 3 | 17 |  | `default (PlainHeader)` |
| `src/components/TrustNote.tsx` | 2 | 12 |  | `TrustNote` |
| `src/components/ui/Btn.tsx` | 2 | 27 |  | `Btn` |
| `src/components/admin/CommandPalette.tsx` | 1 | 236 |  | `default (CommandPalette)` |
| `src/components/admin/InquiryCallCards.tsx` | 1 | 914 | INQUIRY_CALL_SPEC IC-2 — the two discovery-call cards on the inquiry detail page. | `CallFocus`, `CallRow`, `default (InquiryCallCards)`, `describeCall` |
| `src/components/admin/OwnerTwoFactorCard.tsx` | 1 | 159 | OWNER TOTP 2FA — the enrolment card on /admin/profile (owner only). | `default (OwnerTwoFactorCard)` |
| `src/components/AnnouncementBanner.tsx` | 1 | 49 |  | `default (AnnouncementBanner)` |
| `src/components/birdie/BirdieWidget.tsx` | 1 | 189 | BIRDIE_AI_SPEC B1 — the floating Birdie button and chat panel for the operator dashboard. | `default (BirdieWidget)` |
| `src/components/birdie/ConfirmCard.tsx` | 1 | 85 | BIRDIE_AI_SPEC B4b — a change Birdie drafted, waiting on the operator. | `ConfirmCard` |
| `src/components/dashboard/AgreementNotice.tsx` | 1 | 68 | AGREEMENT_SPEC AG-3 §3 — the re-acceptance banner and, after the deadline, the modal. | `AGREEMENT_REQUIRED_EVENT`, `default (AgreementNotice)` |
| `src/components/dashboard/CourseLayoutTab.tsx` | 1 | 469 |  | `default (CourseLayoutTab)` |
| `src/components/dashboard/CoursePreview.tsx` | 1 | 80 | B-6 (UI_REVISE_SPEC §4): | `CoursePreviewProps`, `default (CoursePreview)` |
| `src/components/dashboard/GettingStartedChecklist.tsx` | 1 | 187 |  | `default (GettingStartedChecklist)` |
| `src/components/dashboard/money/CancellationsPanel.tsx` | 1 | 179 | SD-8 — the Cancellations half of the Money page. | `CancellationsPanel` |
| `src/components/dashboard/money/PaymentsPanel.tsx` | 1 | 124 | SD-8 — the Payments half of the Money page. | `PaymentsPanel` |
| `src/components/dashboard/money/PayoutsPanel.tsx` | 1 | 126 | SD-8 — the Stripe card, moved here out of Settings. | `PayoutsPanel` |
| `src/components/dashboard/StaffPermissions.tsx` | 1 | 243 | SP-A (STAFF_POLICY_SPEC A6): | `StaffPermissions` |
| `src/components/Footer.tsx` | 1 | 77 |  | `default (Footer)` |
| `src/components/home/TeeSheetDemo.tsx` | 1 | 228 | UI-H-1 (HOMEPAGE_SPEC.md): | `HeroDemo`, `SeeItWorkDemo` |
| `src/components/MainOffset.tsx` | 1 | 32 |  | `default (MainOffset)` |
| `src/components/Nav.tsx` | 1 | 130 |  | `default (Nav)` |
| `src/components/ui/MonthPicker.tsx` | 1 | 75 |  | `MonthPicker` |
| `src/components/CourseCard.tsx` | 0 | 121 |  | `default (CourseCard)` |
| `src/components/dashboard/TabIntro.tsx` | 0 | 36 |  | `TabIntroButton`, `TabIntroCard` |
| `src/components/ui/PageHeader.tsx` | 0 | 18 |  | `PageHeader` |
| `src/components/ui/SidebarShell.tsx` | 0 | 24 |  | `SidebarShell` |
| `src/components/ui/StatGroup.tsx` | 0 | 18 |  | `StatGroup` |

## Schema

Writers are files calling `create`/`update`/`upsert`/`delete` on the model;
readers are every other `prisma.<model>.` call. Answers "what writes to Call?"
without opening anything.

### AdminAuditLog

8 fields · 1 writer(s) · 0 reader(s)

- fields: `id`, `adminId`, `admin`, `action`, `targetType`, `targetId`, `detail`, `createdAt`
- writers: `src/app/api/admin/company-documents/route.ts`
- readers: **none**

### AdminUser

21 fields · 8 writer(s) · 11 reader(s)

- fields: `id`, `email`, `name`, `passwordHash`, `role`, `active`, `mustChangePassword`, `lastLoginAt`, `createdAt`, `setPasswordToken`, `setPasswordTokenExpiry`, `twoFactorCode`, `twoFactorCodeExpiry`, `twoFactorAttempts`, `twoFactorSecret`, `twoFactorEnrolledAt`, `twoFactorRecoveryCodes`, `failedLoginAttempts`, `lockoutUntil`, `sessionVersion`, `auditLogs`
- writers: `src/app/api/admin/bootstrap/route.ts`, `src/app/api/admin/change-password/route.ts`, `src/app/api/admin/employees/route.ts`, `src/app/api/admin/forgot-password/route.ts`, `src/app/api/admin/login/route.ts`, `src/app/api/admin/owner-login/route.ts`, `src/app/api/admin/set-password/route.ts`, `src/app/api/admin/two-factor/route.ts`
- readers: `src/app/api/admin/bootstrap/route.ts`, `src/app/api/admin/broadcasts/route.ts`, `src/app/api/admin/change-password/route.ts`, `src/app/api/admin/employees/route.ts`, `src/app/api/admin/forgot-password/route.ts`, `src/app/api/admin/login/route.ts`, `src/app/api/admin/owner-login/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/api/admin/set-password/route.ts`, `src/app/api/admin/two-factor/route.ts`, `src/lib/admin-session.ts`

### AgreementAcceptance

16 fields · 2 writer(s) · 4 reader(s)

- fields: `id`, `courseId`, `course`, `document`, `version`, `textHash`, `signerName`, `signerTitle`, `signerEmail`, `authorityAttested`, `marketingOptOut`, `ip`, `userAgent`, `pdfUrl`, `legacy`, `acceptedAt`
- writers: `src/app/api/operator/agreement/route.ts`, `src/lib/agreement-sign.ts`
- readers: `src/app/api/admin/course-documents/route.ts`, `src/lib/agreement-gate.ts`, `src/lib/agreement-required.ts`, `src/lib/agreement-sign.ts`

### AgreementVersion

8 fields · 1 writer(s) · 2 reader(s)

- fields: `id`, `document`, `version`, `textHash`, `effectiveAt`, `reacceptBy`, `noticeSentAt`, `createdAt`
- writers: `src/lib/agreement-required.ts`
- readers: `src/lib/agreement-gate.ts`, `src/lib/agreement-required.ts`

### Announcement

7 fields · 1 writer(s) · 3 reader(s)

- fields: `id`, `title`, `body`, `emailSent`, `sentById`, `createdAt`, `dismissals`
- writers: `src/app/api/admin/broadcasts/route.ts`
- readers: `src/app/api/admin/broadcasts/route.ts`, `src/app/api/operator/announcements/dismiss/route.ts`, `src/app/api/operator/announcements/route.ts`

### AnnouncementDismissal

5 fields · 1 writer(s) · 0 reader(s)

- fields: `id`, `announcementId`, `operatorId`, `createdAt`, `announcement`
- writers: `src/app/api/operator/announcements/dismiss/route.ts`
- readers: **none**

### Blackout

5 fields · 3 writer(s) · 5 reader(s)

- fields: `id`, `courseId`, `course`, `date`, `reason`
- writers: `src/app/api/operator/blackouts/route.ts`, `src/lib/lifecycle.ts`, `src/lib/weather-cancel.ts`
- readers: `src/app/api/operator/blackouts/route.ts`, `src/lib/birdie/proposals.ts`, `src/lib/birdie/tools.ts`, `src/lib/tee-sheet-engine.ts`, `src/lib/weather-cancel.ts`

### Booking

46 fields · 9 writer(s) · 38 reader(s)

- fields: `id`, `teeTimeId`, `teeTime`, `courseId`, `course`, `golferAccountId`, `golferAccount`, `golferName`, `golferEmail`, `golferPhone`, `players`, `appliedRate`, `greenFeeTotal`, `cartFeeTotal`, `cartSelected`, `rangeBallsSize`, `rangeBallsTotal`, `accessFeeTotal`, `totalAmount`, `stripeCustomerId`, `stripePaymentMethodId`, `stripePaymentIntentId`, `cancellationFeeTotal`, `cancellationFeeChargeId`, `cancellationFeeChargedAt`, `cancelledAt`, `checkInToken`, `checkedInAt`, `roundPaymentIntentId`, `checkInFailReason`, `paymentStatus`, `status`, `termsAcceptedAt`, `termsVersion`, `cancellationFeeApplies`, `lateFeeTimingAtBooking`, `noShowFeeTotal`, `autoNoShowMinutesAtBooking`, `source`, `checkedInPlayers`, `noShowAt`, `paidOffline`, `cancellationHoursAtBooking`, `paidAt`, `createdAt`, `paymentEvents`
- writers: `src/app/api/cron/cancellation-cutoff/route.ts`, `src/app/api/cron/hourly/route.ts`, `src/app/api/golfer/auth/otp/verify/route.ts`, `src/app/api/operator/bookings/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/access-fee.ts`, `src/lib/checkin-booking.ts`, `src/lib/lifecycle.ts`, `src/lib/refund-booking.ts`
- readers: `src/app/api/admin/activity/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/courses/route.ts`, `src/app/api/admin/golfers/route.ts`, `src/app/api/admin/messages/route.ts`, `src/app/api/admin/nav-badges/route.ts`, `src/app/api/admin/platform-stripe/route.ts`, `src/app/api/admin/revenue/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/api/admin/stats/route.ts`, `src/app/api/admin/transactions/export/route.ts`, `src/app/api/admin/transactions/route.ts` +26 more (see `docs/codemap.json`)

### BookingEvent

12 fields · 0 writer(s) · 2 reader(s)

- fields: `id`, `bookingId`, `courseId`, `type`, `occurredAt`, `actorType`, `actorId`, `amountCents`, `playerCount`, `teeTimeAt`, `stripeId`, `metadata`
- writers: **none** — nothing in `src/` writes this model
- readers: `src/lib/analytics.ts`, `src/lib/no-show-fee.ts`

### Call

22 fields · 3 writer(s) · 7 reader(s)

- fields: `id`, `kind`, `inquiryId`, `inquiry`, `courseId`, `course`, `scheduledAt`, `durationMin`, `direction`, `phone`, `agendaJson`, `agendaExtra`, `outcome`, `answersJson`, `notes`, `followUpAt`, `completedAt`, `createdBy`, `createdAt`, `updatedAt`, `bookedByCourse`, `gcalEventId`
- writers: `src/app/api/admin/course-calls/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/calcom/webhook/route.ts`
- readers: `src/app/api/admin/course-calls/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/calcom/webhook/route.ts`, `src/app/api/call/[token]/route.ts`, `src/app/api/inquiries/details/route.ts`, `src/lib/call-invite.ts`

### ChangeRequest

10 fields · 0 writer(s) · 0 reader(s)

- fields: `id`, `inquiryId`, `inquiry`, `category`, `body`, `status`, `raisedBy`, `addressedBy`, `addressedAt`, `createdAt`
- writers: **none** — nothing in `src/` writes this model
- readers: **none**

### Course

112 fields · 13 writer(s) · 62 reader(s)

- fields: `id`, `slug`, `name`, `type`, `city`, `state`, `zipCode`, `address`, `phone`, `website`, `bookingUrl`, `holes`, `par`, `yardage`, `slope`, `courseRating`, `description`, `amenities`, `walkingAllowed`, `walkingNote`, `cartRequired`, `dresscode`, `minPlayers`, `maxPlayers`, `cancellationHours`, `checkInWindowHours`, `lateCancellationFeeCents`, `lateFeeBasis`, `lateFeeTiming`, `noShowFeeCents`, `noShowFeeBasis`, `autoNoShowMinutes`, `timezone`, `rainCheckPolicy`, `publicAdvanceDays`, `memberAdvanceDays`, `hasMemberPricing`, `hasResidentPricing`, `residentCounty`, `residentState`, `residentProofRequired`, `hasCaddies`, `caddieType`, `caddieLooperRateCents`, `caddieForeRateCents`, `caddieNote`, `hasDrivingRange`, `drivingRangeType`, `rangeBallsFree`, `rangeBallsSmallPriceCents`, `rangeBallsMediumPriceCents`, `rangeBallsLargePriceCents`, `hasPuttingGreen`, `hasShortGameArea`, `hasProShop`, `proShopPhone`, `restaurantType`, `hasCartGirl`, `tournamentFrequency`, `hasLessons`, `hasClubRental`, `clubRentalRateCents`, `hasPushCartRental`, `pushCartRateCents`, `hasBagStorage`, `hasLockerRoom`, `hasGpsCarts`, `hasTournaments`, `stripeAccountId`, `stripeAccountActive`, `rating`, `reviewCount`, `imageGradient`, `brandColor`, `establishedYear`, `logoUrl`, `heroImageUrl`, `confirmationNote`, `featured`, `active`, `liveStatus`, `firstWentLiveAt`, `offlineAt`, `welcomeEmailSentAt`, `adminNotes`, `archivedAt`, `archivedBy`, `createdAt`, `updatedAt`, `operatorId`, `operator`, `conditions`, `conditionsUpdatedAt`, `giftCardUrl`, `heroPhotoUrl`, `teeTimes`, `bookings`, `schedules`, `blackouts`, `memberships`, `membershipTiers`, `staff`, `teeSets`, `thread`, `photos`, `teeTimeAlerts`, `nines`, `nextCheckInAt`, `calls`, `legalName`, `agreements`, `courseProducts`
- writers: `src/app/api/admin/course-calls/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/course-settings/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/conditions/route.ts`, `src/app/api/operator/courses/route.ts`, `src/app/api/operator/settings/route.ts`, `src/app/api/operator/stripe/callback/route.ts`, `src/app/api/operator/stripe/connect/route.ts`, `src/app/api/operator/upload/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/agreement-sign.ts`, `src/lib/lifecycle.ts`
- readers: `src/app/api/admin/activity/route.ts`, `src/app/api/admin/broadcasts/route.ts`, `src/app/api/admin/course-calls/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/course-documents/route.ts`, `src/app/api/admin/course-settings/route.ts`, `src/app/api/admin/courses/route.ts`, `src/app/api/admin/create-course/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/admin/messages/route.ts`, `src/app/api/admin/revenue/route.ts`, `src/app/api/admin/search/route.ts` +50 more (see `docs/codemap.json`)

### CourseInquiry

45 fields · 8 writer(s) · 25 reader(s)

- fields: `id`, `firstName`, `lastName`, `contactName`, `contactTitle`, `email`, `phone`, `courseName`, `address`, `city`, `state`, `zipCode`, `website`, `courseType`, `currentBookingMethod`, `teeTimesPerDay`, `greenFeeRange`, `hasResidentPricing`, `hasMemberPricing`, `hasCaddies`, `pricingNotes`, `facilitiesNotes`, `lookingFor`, `additionalNotes`, `needsJson`, `status`, `adminNotes`, `builtCourseId`, `detailsToken`, `detailsJson`, `reviewStartedAt`, `wentLiveAt`, `source`, `closedReason`, `snoozeUntil`, `nextFollowUpAt`, `createdAt`, `updatedAt`, `events`, `changeRequests`, `callSkippedReason`, `calls`, `callInviteToken`, `callInviteSentAt`, `callInviteExpiresAt`
- writers: `src/app/api/admin/backfill-orphaned-inquiries/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/create-course/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/inquiries/details/route.ts`, `src/app/api/inquiries/route.ts`, `src/lib/call-invite.ts`, `src/lib/lifecycle.ts`
- readers: `src/app/api/admin/backfill-orphaned-inquiries/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/courses/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/admin/messages/route.ts`, `src/app/api/admin/nav-badges/route.ts`, `src/app/api/admin/request-re-review/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/api/admin/stats/route.ts`, `src/app/api/calcom/webhook/route.ts`, `src/app/api/call/[token]/route.ts`, `src/app/api/inquiries/details/route.ts` +13 more (see `docs/codemap.json`)

### CourseMembership

23 fields · 7 writer(s) · 21 reader(s)

- fields: `id`, `golferId`, `golfer`, `courseId`, `course`, `tierId`, `tier`, `membershipType`, `inviteEmail`, `inviteName`, `invitePhone`, `inviteAccepted`, `status`, `addedBy`, `expiresAt`, `startedAt`, `paymentStatus`, `payToken`, `lastPaidAt`, `lastPaymentIntentId`, `renewalRemindedAt`, `notes`, `createdAt`
- writers: `src/app/api/cron/send-reminders/route.ts`, `src/app/api/golfer/auth/accept-invite/route.ts`, `src/app/api/golfer/memberships/route.ts`, `src/app/api/membership/[id]/route.ts`, `src/app/api/operator/members/remind-overdue/route.ts`, `src/app/api/operator/members/route.ts`, `src/lib/lifecycle.ts`
- readers: `src/app/api/admin/activity/route.ts`, `src/app/api/admin/course-members/route.ts`, `src/app/api/admin/courses/route.ts`, `src/app/api/admin/transactions/route.ts`, `src/app/api/bookings/route.ts`, `src/app/api/cron/send-reminders/route.ts`, `src/app/api/golfer/auth/accept-invite/route.ts`, `src/app/api/golfer/memberships/route.ts`, `src/app/api/member/[courseSlug]/payments/route.ts`, `src/app/api/member/[courseSlug]/send-code/route.ts`, `src/app/api/member/[courseSlug]/session/route.ts`, `src/app/api/member/[courseSlug]/tee-times/route.ts` +9 more (see `docs/codemap.json`)

### CourseOperator

21 fields · 16 writer(s) · 19 reader(s)

- fields: `id`, `email`, `password`, `name`, `emailVerified`, `verificationToken`, `resetToken`, `resetTokenExpiry`, `onboardingStep`, `failedLoginAttempts`, `lockoutUntil`, `twoFactorEnabled`, `twoFactorMethod`, `twoFactorCode`, `twoFactorCodeExpiry`, `twoFactorAttempts`, `sessionVersion`, `phone`, `lastLoginAt`, `createdAt`, `course`
- writers: `src/app/api/admin/create-course/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/admin/verify-operator/route.ts`, `src/app/api/auth/2fa/verify/route.ts`, `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/resend-verification/route.ts`, `src/app/api/auth/reset-password/route.ts`, `src/app/api/auth/verify/route.ts`, `src/app/api/operator/change-password/route.ts`, `src/app/api/operator/onboarding-complete/route.ts`, `src/app/api/operator/profile/route.ts`, `src/app/api/operator/settings/route.ts`, `src/app/api/preview/send/route.ts`, `src/lib/lifecycle.ts`, `src/lib/two-factor.ts`
- readers: `src/app/api/admin/create-course/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/admin/verify-operator/route.ts`, `src/app/api/auth/2fa/resend/route.ts`, `src/app/api/auth/2fa/status/route.ts`, `src/app/api/auth/2fa/verify/route.ts`, `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/resend-verification/route.ts`, `src/app/api/auth/reset-password/route.ts`, `src/app/api/auth/verify/route.ts`, `src/app/api/inquiries/signin-verify/route.ts` +7 more (see `docs/codemap.json`)

### CoursePhoto

6 fields · 2 writer(s) · 2 reader(s)

- fields: `id`, `courseId`, `course`, `url`, `sortOrder`, `createdAt`
- writers: `src/app/api/operator/photos/[id]/route.ts`, `src/app/api/operator/photos/route.ts`
- readers: `src/app/api/operator/photos/[id]/route.ts`, `src/app/api/operator/photos/route.ts`

### CourseProduct

12 fields · 2 writer(s) · 7 reader(s)

- fields: `id`, `courseId`, `course`, `label`, `holes`, `nineIds`, `active`, `sortOrder`, `createdAt`, `teeSetRatings`, `schedules`, `teeTimes`
- writers: `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/course-products/route.ts`
- readers: `src/app/api/admin/course-detail/route.ts`, `src/app/api/operator/course-products/route.ts`, `src/app/api/operator/nines/route.ts`, `src/app/api/operator/tee-sets/route.ts`, `src/lib/birdie/course-context.ts`, `src/lib/schedule-service.ts`, `src/lib/tee-sheet-engine.ts`

### CourseProductTeeSet

7 fields · 2 writer(s) · 0 reader(s)

- fields: `id`, `courseProductId`, `courseProduct`, `teeSetId`, `teeSet`, `rating`, `slope`
- writers: `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/tee-sets/route.ts`
- readers: **none**

### CourseStaff

14 fields · 4 writer(s) · 9 reader(s)

- fields: `id`, `courseId`, `course`, `email`, `password`, `name`, `role`, `permissions`, `preset`, `permissionsSetAt`, `active`, `failedLoginAttempts`, `lockoutUntil`, `createdAt`
- writers: `src/app/api/auth/login/route.ts`, `src/app/api/auth/reset-password/route.ts`, `src/app/api/operator/staff/route.ts`, `src/lib/lifecycle.ts`
- readers: `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/resend-staff-setup/route.ts`, `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/reset-password/route.ts`, `src/app/api/operator/messages/route.ts`, `src/app/api/operator/staff/route.ts`, `src/lib/lifecycle.ts`, `src/lib/session.ts`

### CronRunLog

7 fields · 1 writer(s) · 1 reader(s)

- fields: `id`, `job`, `startedAt`, `finishedAt`, `outcome`, `detail`, `error`
- writers: `src/lib/cron-log.ts`
- readers: `src/lib/cron-log.ts`

### Expense

9 fields · 2 writer(s) · 3 reader(s)

- fields: `id`, `name`, `category`, `amountCents`, `cadence`, `startedAt`, `endedAt`, `createdAt`, `updatedAt`
- writers: `src/app/api/admin/expenses/[id]/route.ts`, `src/app/api/admin/expenses/route.ts`
- readers: `src/app/api/admin/expenses/[id]/route.ts`, `src/app/api/admin/expenses/route.ts`, `src/app/api/admin/revenue/route.ts`

### GolferAccount

14 fields · 3 writer(s) · 10 reader(s)

- fields: `id`, `email`, `password`, `firstName`, `lastName`, `phone`, `stripeCustomerId`, `resetToken`, `resetTokenExpiry`, `failedLoginAttempts`, `lockoutUntil`, `createdAt`, `bookings`, `memberships`
- writers: `src/app/api/bookings/setup-intent/route.ts`, `src/app/api/golfer/auth/accept-invite/route.ts`, `src/app/api/golfer/auth/otp/verify/route.ts`
- readers: `src/app/api/admin/golfers/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/api/bookings/setup-intent/route.ts`, `src/app/api/courses/[slug]/account/route.ts`, `src/app/api/golfer/auth/accept-invite/route.ts`, `src/app/api/golfer/auth/me/route.ts`, `src/app/api/golfer/auth/otp/verify/route.ts`, `src/app/api/golfer/profile/route.ts`, `src/app/api/operator/members/route.ts`, `src/lib/member-session.ts`

### InquiryStatusEvent

8 fields · 15 writer(s) · 10 reader(s)

- fields: `id`, `inquiryId`, `fromStatus`, `toStatus`, `trigger`, `actorName`, `createdAt`, `inquiry`
- writers: `src/app/api/admin/backfill-orphaned-inquiries/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/admin/request-re-review/route.ts`, `src/app/api/calcom/webhook/route.ts`, `src/app/api/inquiries/details/route.ts`, `src/app/api/inquiries/route.ts`, `src/app/api/inquiries/signin-code/route.ts`, `src/app/api/inquiries/signin-verify/route.ts`, `src/app/api/operator/approve-page/route.ts`, `src/app/api/preview/[courseId]/approve/route.ts`, `src/app/api/preview/send/route.ts`, `src/lib/course-timeline.ts`, `src/lib/lifecycle.ts`, `src/lib/submit-change-request.ts`
- readers: `src/app/api/admin/courses/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/admin/stats/route.ts`, `src/app/api/operator/approve-page/route.ts`, `src/app/api/operator/courses/route.ts`, `src/app/api/preview/[courseId]/approve/route.ts`, `src/app/api/preview/[courseId]/route.ts`, `src/lib/approval-state.ts`, `src/lib/course-timeline.ts`, `src/lib/sheet-token.ts`

### MembershipTier

19 fields · 4 writer(s) · 4 reader(s)

- fields: `id`, `courseId`, `course`, `name`, `color`, `greenFeeWeekdayCents`, `greenFeeWeekendCents`, `cartFeeWeekdayCents`, `cartFeeWeekendCents`, `discountPct`, `advanceBookingDays`, `guestPassesPerYear`, `annualFeeCents`, `initiationFeeCents`, `termMonths`, `notes`, `active`, `createdAt`, `memberships`
- writers: `src/app/api/admin/create-course/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/tiers/route.ts`, `src/lib/lifecycle.ts`
- readers: `src/app/api/admin/course-members/route.ts`, `src/app/api/operator/members/route.ts`, `src/app/api/operator/tiers/route.ts`, `src/lib/analytics.ts`

### Message

10 fields · 3 writer(s) · 5 reader(s)

- fields: `id`, `threadId`, `senderType`, `senderId`, `senderName`, `body`, `readAt`, `isBroadcast`, `createdAt`, `thread`
- writers: `src/app/api/admin/messages/route.ts`, `src/app/api/operator/messages/route.ts`, `src/lib/submit-change-request.ts`
- readers: `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/messages/route.ts`, `src/app/api/admin/nav-badges/route.ts`, `src/app/api/admin/stats/route.ts`, `src/app/api/operator/messages/route.ts`

### MessageThread

9 fields · 3 writer(s) · 4 reader(s)

- fields: `id`, `courseId`, `adminLastEmailAt`, `operatorLastEmailAt`, `closedAt`, `updatedAt`, `createdAt`, `course`, `messages`
- writers: `src/app/api/admin/messages/route.ts`, `src/app/api/operator/messages/route.ts`, `src/lib/submit-change-request.ts`
- readers: `src/app/api/admin/messages/route.ts`, `src/app/api/admin/stats/route.ts`, `src/app/api/operator/messages/route.ts`, `src/lib/submit-change-request.ts`

### Nine

8 fields · 2 writer(s) · 5 reader(s)

- fields: `id`, `courseId`, `course`, `name`, `par`, `sortOrder`, `createdAt`, `teeSetYardages`
- writers: `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/nines/route.ts`
- readers: `src/app/api/admin/course-detail/route.ts`, `src/app/api/operator/course-products/route.ts`, `src/app/api/operator/nines/route.ts`, `src/app/api/operator/tee-sets/route.ts`, `src/lib/schedule-service.ts`

### PaymentEvent

10 fields · 1 writer(s) · 6 reader(s)

- fields: `id`, `bookingId`, `booking`, `kind`, `amountCents`, `stripeId`, `actor`, `actorName`, `detail`, `createdAt`
- writers: `src/lib/refund-booking.ts`
- readers: `src/app/api/admin/revenue/route.ts`, `src/app/api/admin/transactions/export/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/access-fee.ts`, `src/lib/money-problems.ts`, `src/lib/no-show-fee.ts`

### RateLimit

3 fields · 0 writer(s) · 0 reader(s)

- fields: `key`, `count`, `windowStart`
- writers: **none** — nothing in `src/` writes this model
- readers: **none**

### StaffPermissionChange

7 fields · 1 writer(s) · 1 reader(s)

- fields: `id`, `courseId`, `staffId`, `changedBy`, `before`, `after`, `createdAt`
- writers: `src/app/api/operator/staff/route.ts`
- readers: `src/app/api/operator/staff/route.ts`

### TeeSet

11 fields · 3 writer(s) · 2 reader(s)

- fields: `id`, `courseId`, `course`, `name`, `yardage`, `rating`, `slope`, `sortOrder`, `createdAt`, `nineYardages`, `productRatings`
- writers: `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/tee-sets/route.ts`, `src/lib/lifecycle.ts`
- readers: `src/app/api/admin/course-detail/route.ts`, `src/app/api/operator/tee-sets/route.ts`

### TeeSetNine

6 fields · 2 writer(s) · 0 reader(s)

- fields: `id`, `teeSetId`, `teeSet`, `nineId`, `nine`, `yardage`
- writers: `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/tee-sets/route.ts`
- readers: **none**

### TeeTime

20 fields · 7 writer(s) · 15 reader(s)

- fields: `id`, `courseId`, `course`, `date`, `time`, `holes`, `playersAvailable`, `playersBooked`, `greenFeeCents`, `memberRateCents`, `residentRateCents`, `cartFeeCents`, `walkingAllowed`, `tierName`, `status`, `createdAt`, `bookings`, `teeTimeAlerts`, `productId`, `product`
- writers: `src/app/api/operator/blackouts/route.ts`, `src/app/api/operator/tee-times/route.ts`, `src/lib/frost-delay.ts`, `src/lib/lifecycle.ts`, `src/lib/schedule-service.ts`, `src/lib/tee-sheet-engine.ts`, `src/lib/weather-cancel.ts`
- readers: `src/app/api/admin/tee-sheet/route.ts`, `src/app/api/bookings/route.ts`, `src/app/api/manage/[bookingId]/available-times/route.ts`, `src/app/api/member/[courseSlug]/tee-times/route.ts`, `src/app/api/operator/bookings/route.ts`, `src/app/api/operator/tee-times/route.ts`, `src/app/api/preview/[courseId]/route.ts`, `src/app/api/preview/[courseId]/tee-times/route.ts`, `src/lib/analytics.ts`, `src/lib/birdie/tools.ts`, `src/lib/frost-delay.ts`, `src/lib/public-tee-times.ts` +3 more (see `docs/codemap.json`)

### TeeTimeAlert

14 fields · 4 writer(s) · 3 reader(s)

- fields: `id`, `courseId`, `course`, `email`, `name`, `date`, `windowStart`, `windowEnd`, `players`, `teeTimeId`, `teeTime`, `token`, `notifiedAt`, `createdAt`
- writers: `src/app/api/alerts/route.ts`, `src/app/api/alerts/unsubscribe/[token]/route.ts`, `src/lib/cancel-booking.ts`, `src/lib/lifecycle.ts`
- readers: `src/app/api/alerts/route.ts`, `src/app/api/alerts/unsubscribe/[token]/route.ts`, `src/lib/cancel-booking.ts`

### TeeTimeSchedule

21 fields · 4 writer(s) · 5 reader(s)

- fields: `id`, `courseId`, `course`, `tierName`, `daysOfWeek`, `startTime`, `endTime`, `intervalMinutes`, `holes`, `greenFeeWeekdayCents`, `greenFeeWeekendCents`, `memberRateWeekdayCents`, `memberRateWeekendCents`, `residentRateWeekdayCents`, `residentRateWeekendCents`, `cartFeeCents`, `walkingAllowed`, `active`, `createdAt`, `productId`, `product`
- writers: `src/app/api/admin/create-course/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/lib/lifecycle.ts`, `src/lib/schedule-service.ts`
- readers: `src/app/api/operator/course-products/route.ts`, `src/app/api/operator/tee-times/route.ts`, `src/lib/birdie/course-context.ts`, `src/lib/schedule-service.ts`, `src/lib/tee-sheet-engine.ts`

## Orphans

Nothing imports these and no route serves them. Framework-owned filenames
(`page.tsx`, `layout.tsx`, `route.ts`, …) are excluded — they are entered by
Next.js, not imported, so "nothing imports it" proves nothing about them.

- `src/components/CourseCard.tsx` (121 lines)
- `src/components/dashboard/TabIntro.tsx` (36 lines)
- `src/components/ui/PageHeader.tsx` (18 lines)
- `src/components/ui/SidebarShell.tsx` (24 lines)
- `src/components/ui/StatGroup.tsx` (18 lines)
- `src/lib/api-response.ts` (22 lines)
- `src/lib/data.ts` (3 lines)
- `src/lib/db.ts` (2 lines)
- `src/lib/seed.ts` (2 lines)
- `src/lib/use-tab-intro.ts` (18 lines)

