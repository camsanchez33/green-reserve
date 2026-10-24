# GreenReserve — code map

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/codemap.mjs`.
> Everything below is derived from the working tree. If a line here is wrong,
> the code is wrong or the generator is — fix one of those, not this file.

540 source files · 259 routes · 177 libraries · 56 models

## Single sources of truth

One concept, one owner. A second file claiming the same `@brain` tag fails
this script with a non-zero exit — that is the point of the tag.

| concept | file | exports |
|---|---|---|
| `agreement-publishing` | `src/lib/agreement-publish.ts` | `agreementVersionsOverview`, `publishAgreementVersion`, `publishDates`, `PublishResult`, `REACCEPT_WINDOW_DAYS`, `reacceptPublishError` +1 more |
| `agreement-versions` | `src/lib/agreements.ts` | `AgreementDocument`, `currentDocuments`, `currentVersion`, `DOCUMENT_DIR`, `DocumentMeta`, `listVersions` +4 more |
| `call-agenda` | `src/lib/inquiry-call.ts` | `AGENDA`, `AgendaItem`, `agendaStatus`, `AgendaStatusRow`, `callGate`, `CallLike` +15 more |
| `course-events` | `src/lib/course-timeline.ts` | `AGREEMENT_ACCEPTED_PREFIX`, `AgreementAcceptedPayload`, `buildCourseFeed`, `CHECKIN_CALL_PREFIX`, `CheckInCallPayload`, `CURRENT_AGREEMENT_VERSION` +28 more |
| `course-health` | `src/lib/course-metrics.ts` | `COMPLETED_BOOKING_STATUSES`, `computeCourseHealth`, `computeNetPnL`, `CourseHealth`, `CourseHealthInput`, `CourseHealthStatus` +11 more |
| `inquiry-signin-challenge` | `src/lib/inquiry-signin.ts` | `CODE_TTL_SECONDS`, `codeMatches`, `cookieOptions`, `generateCode`, `inertChallenge`, `macCode` +7 more |
| `inquiry-statuses` | `src/lib/inquiry-status.ts` | `ACTIVE_STATUSES`, `ALIVE_STATUSES`, `ARCHIVED_STATUSES`, `CLOSED_REASONS`, `compareQueue`, `daysSince` +25 more |
| `money-movement` | `src/lib/stripe.ts` | `ACCESS_FEE_CENTS`, `chargeOnConnectedAccount`, `MEMBERSHIP_FEE_RATE`, `membershipFeeCents`, `refundOnConnectedAccount`, `stripe` |
| `private-file-storage` | `src/lib/private-blob.ts` | `isBlobStoreUrl`, `PRIVATE_STORAGE_MISSING`, `privateBlobToken` |
| `pro-shop` | `src/lib/shop.ts` | `addItemToBooking`, `MAX_BOOKING_SHOP_CENTS`, `MAX_ITEM_PRICE_CENTS`, `MAX_LINE_QUANTITY`, `removeLineFromBooking`, `roundApplicationFeeCents` +11 more |
| `separate-booking-fee` | `src/lib/access-fee.ts` | `bookingIdForFeeCharge`, `chargeAccessFeeSeparately`, `counterFeesUncollected`, `FeeChargeResult`, `liveSeparateFee`, `refundSeparateAccessFee` |
| `still-need-from-them` | `src/lib/inquiry-needs.ts` | `NeedItem`, `stillNeed` |
| `whose-move-is-it` | `src/lib/inquiry-status.ts` | `ACTIVE_STATUSES`, `ALIVE_STATUSES`, `ARCHIVED_STATUSES`, `CLOSED_REASONS`, `compareQueue`, `daysSince` +25 more |

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
| `/` | public | public | page | `src/app/page.tsx` | 15 |
| `/admin` | admin | client-side | page | `src/app/admin/page.tsx` | 453 |
| `/admin/activity` | admin | client-side | page | `src/app/admin/activity/page.tsx` | 9 |
| `/admin/announcements` | admin | client-side | page | `src/app/admin/announcements/page.tsx` | 261 |
| `/admin/audit` | admin | client-side | page | `src/app/admin/audit/page.tsx` | 137 |
| `/admin/broadcasts` | admin | client-side | page | `src/app/admin/broadcasts/page.tsx` | 12 |
| `/admin/company-documents` | admin | client-side | page | `src/app/admin/company-documents/page.tsx` | 165 |
| `/admin/courses` | admin | client-side | page | `src/app/admin/courses/page.tsx` | 527 |
| `/admin/courses/[id]` | admin | client-side | page | `src/app/admin/courses/[id]/page.tsx` | 326 |
| `/admin/create` | admin | client-side | page | `src/app/admin/create/page.tsx` | 761 |
| `/admin/employees` | admin | client-side | page | `src/app/admin/employees/page.tsx` | 278 |
| `/admin/forgot-password` | admin | client-side | page | `src/app/admin/forgot-password/page.tsx` | 67 |
| `/admin/goals` | admin | client-side | page | `src/app/admin/goals/page.tsx` | 164 |
| `/admin/golfers` | admin | client-side | page | `src/app/admin/golfers/page.tsx` | 457 |
| `/admin/groups` | admin | client-side | page | `src/app/admin/groups/page.tsx` | 208 |
| `/admin/inquiries` | admin | client-side | page | `src/app/admin/inquiries/page.tsx` | 963 |
| `/admin/inquiries/[id]` | admin | client-side | page | `src/app/admin/inquiries/[id]/page.tsx` | 2254 |
| `/admin/login` | admin | client-side | page | `src/app/admin/login/page.tsx` | 137 |
| `/admin/messages` | admin | client-side | page | `src/app/admin/messages/page.tsx` | 479 |
| `/admin/problems` | admin | client-side | page | `src/app/admin/problems/page.tsx` | 221 |
| `/admin/profile` | admin | client-side | page | `src/app/admin/profile/page.tsx` | 123 |
| `/admin/revenue` | admin | client-side | page | `src/app/admin/revenue/page.tsx` | 1074 |
| `/admin/set-password` | admin | client-side | page | `src/app/admin/set-password/page.tsx` | 159 |
| `/admin/system` | admin | client-side | page | `src/app/admin/system/page.tsx` | 603 |
| `/api/admin/agreement-versions` | admin | file | GET POST | `src/app/api/admin/agreement-versions/route.ts` | 57 |
| `/api/admin/archive-course` | admin | file | POST | `src/app/api/admin/archive-course/route.ts` | 79 |
| `/api/admin/ask` | admin | file | POST | `src/app/api/admin/ask/route.ts` | 121 |
| `/api/admin/audit` | admin | file | GET | `src/app/api/admin/audit/route.ts` | 48 |
| `/api/admin/backfill-orphaned-inquiries` | admin | file | POST | `src/app/api/admin/backfill-orphaned-inquiries/route.ts` | 46 |
| `/api/admin/bootstrap` | admin | secret header | POST | `src/app/api/admin/bootstrap/route.ts` | 31 |
| `/api/admin/broadcasts` | admin | file | GET POST | `src/app/api/admin/broadcasts/route.ts` | 140 |
| `/api/admin/change-password` | admin | file | POST | `src/app/api/admin/change-password/route.ts` | 31 |
| `/api/admin/company-documents` | admin | file | DELETE GET POST | `src/app/api/admin/company-documents/route.ts` | 71 |
| `/api/admin/company-documents/download` | admin | file | GET | `src/app/api/admin/company-documents/download/route.ts` | 37 |
| `/api/admin/company-documents/upload` | admin | file | POST | `src/app/api/admin/company-documents/upload/route.ts` | 48 |
| `/api/admin/course-calls` | admin | file | POST | `src/app/api/admin/course-calls/route.ts` | 123 |
| `/api/admin/course-detail` | admin | file | GET PATCH | `src/app/api/admin/course-detail/route.ts` | 345 |
| `/api/admin/course-documents` | admin | file | GET POST | `src/app/api/admin/course-documents/route.ts` | 89 |
| `/api/admin/course-documents/download` | admin | file | GET | `src/app/api/admin/course-documents/download/route.ts` | 61 |
| `/api/admin/course-documents/record` | admin | file | POST | `src/app/api/admin/course-documents/record/route.ts` | 41 |
| `/api/admin/course-documents/upload` | admin | file | POST | `src/app/api/admin/course-documents/upload/route.ts` | 62 |
| `/api/admin/course-feed` | admin | file | GET | `src/app/api/admin/course-feed/route.ts` | 22 |
| `/api/admin/course-groups` | admin | file | DELETE GET PATCH POST | `src/app/api/admin/course-groups/route.ts` | 111 |
| `/api/admin/course-members` | admin | file | GET | `src/app/api/admin/course-members/route.ts` | 53 |
| `/api/admin/course-payouts` | admin | file | GET | `src/app/api/admin/course-payouts/route.ts` | 49 |
| `/api/admin/course-reminders` | admin | file | PATCH | `src/app/api/admin/course-reminders/route.ts` | 22 |
| `/api/admin/course-settings` | admin | file | GET PATCH | `src/app/api/admin/course-settings/route.ts` | 83 |
| `/api/admin/courses` | admin | file | GET | `src/app/api/admin/courses/route.ts` | 246 |
| `/api/admin/create-course` | admin | file | GET POST | `src/app/api/admin/create-course/route.ts` | 192 |
| `/api/admin/data-reset` | admin | file | GET POST | `src/app/api/admin/data-reset/route.ts` | 32 |
| `/api/admin/disputes/[bookingId]/evidence` | admin | file | GET | `src/app/api/admin/disputes/[bookingId]/evidence/route.ts` | 29 |
| `/api/admin/employees` | admin | file | GET PATCH POST | `src/app/api/admin/employees/route.ts` | 146 |
| `/api/admin/expenses` | admin | file | GET POST | `src/app/api/admin/expenses/route.ts` | 47 |
| `/api/admin/expenses/[id]` | admin | file | DELETE PATCH | `src/app/api/admin/expenses/[id]/route.ts` | 78 |
| `/api/admin/forgot-password` | admin | entry | POST | `src/app/api/admin/forgot-password/route.ts` | 45 |
| `/api/admin/goals` | admin | file | DELETE GET POST | `src/app/api/admin/goals/route.ts` | 61 |
| `/api/admin/golfers` | admin | file | GET POST | `src/app/api/admin/golfers/route.ts` | 255 |
| `/api/admin/inquiries` | admin | file | DELETE GET PATCH POST | `src/app/api/admin/inquiries/route.ts` | 1295 |
| `/api/admin/login` | admin | entry | POST | `src/app/api/admin/login/route.ts` | 88 |
| `/api/admin/logout` | admin | entry | POST | `src/app/api/admin/logout/route.ts` | 19 |
| `/api/admin/messages` | admin | file | GET PATCH POST | `src/app/api/admin/messages/route.ts` | 221 |
| `/api/admin/nav-badges` | admin | file | GET | `src/app/api/admin/nav-badges/route.ts` | 53 |
| `/api/admin/orphan-sweep` | admin | file | GET POST | `src/app/api/admin/orphan-sweep/route.ts` | 49 |
| `/api/admin/owner-devices` | admin | file | DELETE GET | `src/app/api/admin/owner-devices/route.ts` | 55 |
| `/api/admin/passkeys` | admin | file | DELETE GET POST | `src/app/api/admin/passkeys/route.ts` | 82 |
| `/api/admin/platform-stripe` | admin | file | GET | `src/app/api/admin/platform-stripe/route.ts` | 117 |
| `/api/admin/problems` | admin | file | GET PATCH | `src/app/api/admin/problems/route.ts` | 98 |
| `/api/admin/reconcile-lifecycle-pairs` | admin | file | POST | `src/app/api/admin/reconcile-lifecycle-pairs/route.ts` | 23 |
| `/api/admin/refund` | admin | file | POST | `src/app/api/admin/refund/route.ts` | 30 |
| `/api/admin/request-re-review` | admin | file | POST | `src/app/api/admin/request-re-review/route.ts` | 41 |
| `/api/admin/resend-staff-setup` | admin | file | POST | `src/app/api/admin/resend-staff-setup/route.ts` | 49 |
| `/api/admin/retry-charge/[bookingId]` | admin | file | POST | `src/app/api/admin/retry-charge/[bookingId]/route.ts` | 46 |
| `/api/admin/revenue` | admin | file | GET | `src/app/api/admin/revenue/route.ts` | 365 |
| `/api/admin/schedule` | admin | file | DELETE GET PATCH POST | `src/app/api/admin/schedule/route.ts` | 83 |
| `/api/admin/search` | admin | file | GET | `src/app/api/admin/search/route.ts` | 234 |
| `/api/admin/send-golive-reminder` | admin | file | POST | `src/app/api/admin/send-golive-reminder/route.ts` | 50 |
| `/api/admin/sentry-test` | admin | file | POST | `src/app/api/admin/sentry-test/route.ts` | 23 |
| `/api/admin/session` | admin | file | GET | `src/app/api/admin/session/route.ts` | 17 |
| `/api/admin/set-password` | admin | entry | POST | `src/app/api/admin/set-password/route.ts` | 73 |
| `/api/admin/stripe-match` | admin | file | GET | `src/app/api/admin/stripe-match/route.ts` | 29 |
| `/api/admin/system` | admin | file | GET | `src/app/api/admin/system/route.ts` | 109 |
| `/api/admin/tee-sheet` | admin | file | GET PATCH POST | `src/app/api/admin/tee-sheet/route.ts` | 128 |
| `/api/admin/test-course` | admin | file | GET PATCH POST | `src/app/api/admin/test-course/route.ts` | 53 |
| `/api/admin/today` | admin | file | GET | `src/app/api/admin/today/route.ts` | 52 |
| `/api/admin/transactions` | admin | file | GET | `src/app/api/admin/transactions/route.ts` | 143 |
| `/api/admin/transactions/export` | admin | file | GET | `src/app/api/admin/transactions/export/route.ts` | 93 |
| `/api/admin/two-factor` | admin | file | GET POST | `src/app/api/admin/two-factor/route.ts` | 96 |
| `/api/admin/verify-operator` | admin | file | POST | `src/app/api/admin/verify-operator/route.ts` | 44 |
| `/api/alerts` | public | public | POST | `src/app/api/alerts/route.ts` | 52 |
| `/api/alerts/unsubscribe/[token]` | public | public | GET | `src/app/api/alerts/unsubscribe/[token]/route.ts` | 53 |
| `/api/auth/2fa/resend` | public | token | POST | `src/app/api/auth/2fa/resend/route.ts` | 32 |
| `/api/auth/2fa/status` | public | token | GET | `src/app/api/auth/2fa/status/route.ts` | 29 |
| `/api/auth/2fa/verify` | public | token | POST | `src/app/api/auth/2fa/verify/route.ts` | 69 |
| `/api/auth/forgot-password` | public | entry | POST | `src/app/api/auth/forgot-password/route.ts` | 58 |
| `/api/auth/login` | public | entry | POST | `src/app/api/auth/login/route.ts` | 81 |
| `/api/auth/logout` | public | entry | POST | `src/app/api/auth/logout/route.ts` | 8 |
| `/api/auth/resend-verification` | operator | file | POST | `src/app/api/auth/resend-verification/route.ts` | 37 |
| `/api/auth/reset-password` | public | entry | GET POST | `src/app/api/auth/reset-password/route.ts` | 81 |
| `/api/auth/verify` | public | public | POST | `src/app/api/auth/verify/route.ts` | 36 |
| `/api/birdie/chat` | operator | file | GET POST PUT | `src/app/api/birdie/chat/route.ts` | 246 |
| `/api/bookings` | golfer | public for POST | GET POST | `src/app/api/bookings/route.ts` | 393 |
| `/api/bookings/cancel` | golfer | file | POST | `src/app/api/bookings/cancel/route.ts` | 44 |
| `/api/bookings/resident-rate` | member | file | GET | `src/app/api/bookings/resident-rate/route.ts` | 28 |
| `/api/bookings/setup-intent` | public | public | POST | `src/app/api/bookings/setup-intent/route.ts` | 73 |
| `/api/calcom/webhook` | public | public | POST | `src/app/api/calcom/webhook/route.ts` | 219 |
| `/api/call/[token]` | public | public | GET | `src/app/api/call/[token]/route.ts` | 80 |
| `/api/cam/device` | public | token | GET POST | `src/app/api/cam/device/route.ts` | 24 |
| `/api/cam/login` | public | entry | POST | `src/app/api/cam/login/route.ts` | 288 |
| `/api/cam/step-up` | admin | file | GET POST | `src/app/api/cam/step-up/route.ts` | 70 |
| `/api/checkin/[bookingId]` | public | token | GET POST | `src/app/api/checkin/[bookingId]/route.ts` | 113 |
| `/api/courses` | public | public | GET | `src/app/api/courses/route.ts` | 45 |
| `/api/courses/[slug]` | public | public | GET | `src/app/api/courses/[slug]/route.ts` | 13 |
| `/api/courses/[slug]/account` | golfer | file | GET | `src/app/api/courses/[slug]/account/route.ts` | 86 |
| `/api/courses/[slug]/tee-times` | public | public | GET | `src/app/api/courses/[slug]/tee-times/route.ts` | 15 |
| `/api/cron/cancellation-cutoff` | cron | file | GET | `src/app/api/cron/cancellation-cutoff/route.ts` | 145 |
| `/api/cron/chase-onboarding` | cron | file | GET | `src/app/api/cron/chase-onboarding/route.ts` | 115 |
| `/api/cron/generate-tee-times` | cron | file | GET | `src/app/api/cron/generate-tee-times/route.ts` | 17 |
| `/api/cron/hourly` | cron | file | GET | `src/app/api/cron/hourly/route.ts` | 258 |
| `/api/cron/monthly-review` | cron | file | GET | `src/app/api/cron/monthly-review/route.ts` | 51 |
| `/api/cron/send-reminders` | cron | file | GET | `src/app/api/cron/send-reminders/route.ts` | 91 |
| `/api/event-payment/[id]` | public | token | GET POST | `src/app/api/event-payment/[id]/route.ts` | 45 |
| `/api/event-signup/[id]` | public | public | POST | `src/app/api/event-signup/[id]/route.ts` | 19 |
| `/api/golfer/auth/accept-invite` | golfer | entry | GET POST | `src/app/api/golfer/auth/accept-invite/route.ts` | 78 |
| `/api/golfer/auth/logout` | golfer | entry | POST | `src/app/api/golfer/auth/logout/route.ts` | 8 |
| `/api/golfer/auth/me` | golfer | file | GET | `src/app/api/golfer/auth/me/route.ts` | 15 |
| `/api/golfer/auth/otp/request` | golfer | entry | POST | `src/app/api/golfer/auth/otp/request/route.ts` | 40 |
| `/api/golfer/auth/otp/verify` | golfer | entry | POST | `src/app/api/golfer/auth/otp/verify/route.ts` | 102 |
| `/api/golfer/memberships` | golfer | file | GET POST | `src/app/api/golfer/memberships/route.ts` | 29 |
| `/api/golfer/profile` | golfer | file | GET | `src/app/api/golfer/profile/route.ts` | 14 |
| `/api/health` | public | public | GET | `src/app/api/health/route.ts` | 21 |
| `/api/inquiries` | public | public | POST | `src/app/api/inquiries/route.ts` | 297 |
| `/api/inquiries/details` | public | token | GET PATCH POST | `src/app/api/inquiries/details/route.ts` | 155 |
| `/api/inquiries/signin-code` | public | public | POST | `src/app/api/inquiries/signin-code/route.ts` | 132 |
| `/api/inquiries/signin-verify` | public | public | POST | `src/app/api/inquiries/signin-verify/route.ts` | 113 |
| `/api/inquiries/upload` | public | token | POST | `src/app/api/inquiries/upload/route.ts` | 49 |
| `/api/manage/[bookingId]` | golfer | file | GET | `src/app/api/manage/[bookingId]/route.ts` | 91 |
| `/api/manage/[bookingId]/available-times` | golfer | file | GET | `src/app/api/manage/[bookingId]/available-times/route.ts` | 56 |
| `/api/manage/[bookingId]/change-players` | golfer | file | POST | `src/app/api/manage/[bookingId]/change-players/route.ts` | 134 |
| `/api/manage/[bookingId]/send-modified-email` | golfer | file | POST | `src/app/api/manage/[bookingId]/send-modified-email/route.ts` | 51 |
| `/api/manage/[bookingId]/swap-time` | golfer | file | POST | `src/app/api/manage/[bookingId]/swap-time/route.ts` | 67 |
| `/api/member/[courseSlug]/logout` | member | entry | POST | `src/app/api/member/[courseSlug]/logout/route.ts` | 14 |
| `/api/member/[courseSlug]/payments` | member | file | GET | `src/app/api/member/[courseSlug]/payments/route.ts` | 81 |
| `/api/member/[courseSlug]/send-code` | member | entry | POST | `src/app/api/member/[courseSlug]/send-code/route.ts` | 66 |
| `/api/member/[courseSlug]/session` | member | file | GET | `src/app/api/member/[courseSlug]/session/route.ts` | 80 |
| `/api/member/[courseSlug]/tee-times` | member | file | GET | `src/app/api/member/[courseSlug]/tee-times/route.ts` | 114 |
| `/api/member/[courseSlug]/verify` | member | token | GET | `src/app/api/member/[courseSlug]/verify/route.ts` | 57 |
| `/api/membership/[id]` | public | token | GET POST | `src/app/api/membership/[id]/route.ts` | 158 |
| `/api/operator/active-course` | operator | file | POST | `src/app/api/operator/active-course/route.ts` | 30 |
| `/api/operator/agreement` | operator | file | GET POST | `src/app/api/operator/agreement/route.ts` | 38 |
| `/api/operator/analytics` | operator | file | GET | `src/app/api/operator/analytics/route.ts` | 37 |
| `/api/operator/announcements` | operator | file | GET | `src/app/api/operator/announcements/route.ts` | 51 |
| `/api/operator/announcements/dismiss` | operator | file | POST | `src/app/api/operator/announcements/dismiss/route.ts` | 31 |
| `/api/operator/approve-page` | operator | file | POST | `src/app/api/operator/approve-page/route.ts` | 65 |
| `/api/operator/blackouts` | operator | file | DELETE GET POST | `src/app/api/operator/blackouts/route.ts` | 60 |
| `/api/operator/bookings` | operator | file | GET PATCH POST | `src/app/api/operator/bookings/route.ts` | 356 |
| `/api/operator/bookings/shop` | operator | file | DELETE POST | `src/app/api/operator/bookings/shop/route.ts` | 52 |
| `/api/operator/change-password` | operator | file | POST | `src/app/api/operator/change-password/route.ts` | 40 |
| `/api/operator/conditions` | operator | file | PATCH | `src/app/api/operator/conditions/route.ts` | 15 |
| `/api/operator/course-products` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/course-products/route.ts` | 122 |
| `/api/operator/course-shape` | operator | file | POST | `src/app/api/operator/course-shape/route.ts` | 23 |
| `/api/operator/courses` | operator | file | GET PATCH | `src/app/api/operator/courses/route.ts` | 109 |
| `/api/operator/events` | operator | file | GET POST | `src/app/api/operator/events/route.ts` | 70 |
| `/api/operator/events/[id]` | operator | file | GET PATCH | `src/app/api/operator/events/[id]/route.ts` | 296 |
| `/api/operator/events/[id]/payments` | operator | file | POST | `src/app/api/operator/events/[id]/payments/route.ts` | 114 |
| `/api/operator/frost-delay` | operator | file | POST | `src/app/api/operator/frost-delay/route.ts` | 33 |
| `/api/operator/golfer-messages` | operator | file | GET POST | `src/app/api/operator/golfer-messages/route.ts` | 59 |
| `/api/operator/home` | operator | file | GET | `src/app/api/operator/home/route.ts` | 15 |
| `/api/operator/members` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/members/route.ts` | 293 |
| `/api/operator/members/import` | operator | file | POST | `src/app/api/operator/members/import/route.ts` | 35 |
| `/api/operator/members/remind-overdue` | operator | file | POST | `src/app/api/operator/members/remind-overdue/route.ts` | 76 |
| `/api/operator/messages` | operator | file | GET PATCH POST | `src/app/api/operator/messages/route.ts` | 123 |
| `/api/operator/money/overview` | operator | file | GET | `src/app/api/operator/money/overview/route.ts` | 35 |
| `/api/operator/monthly-reviews` | operator | file | GET | `src/app/api/operator/monthly-reviews/route.ts` | 29 |
| `/api/operator/my-courses` | operator | file | GET | `src/app/api/operator/my-courses/route.ts` | 33 |
| `/api/operator/nines` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/nines/route.ts` | 82 |
| `/api/operator/onboarding-complete` | operator | file | POST | `src/app/api/operator/onboarding-complete/route.ts` | 15 |
| `/api/operator/photos` | operator | file | GET POST | `src/app/api/operator/photos/route.ts` | 58 |
| `/api/operator/photos/[id]` | operator | file | DELETE | `src/app/api/operator/photos/[id]/route.ts` | 27 |
| `/api/operator/preview-link` | operator | file | GET | `src/app/api/operator/preview-link/route.ts` | 19 |
| `/api/operator/profile` | operator | file | GET PATCH | `src/app/api/operator/profile/route.ts` | 36 |
| `/api/operator/regenerate-tee-times` | operator | file | POST | `src/app/api/operator/regenerate-tee-times/route.ts` | 32 |
| `/api/operator/request-changes` | operator | file | POST | `src/app/api/operator/request-changes/route.ts` | 32 |
| `/api/operator/residents` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/residents/route.ts` | 89 |
| `/api/operator/round-rules` | operator | file | PUT | `src/app/api/operator/round-rules/route.ts` | 32 |
| `/api/operator/sales-tax` | operator | file | GET PATCH POST | `src/app/api/operator/sales-tax/route.ts` | 58 |
| `/api/operator/schedule` | operator | file | DELETE GET PATCH POST PUT | `src/app/api/operator/schedule/route.ts` | 96 |
| `/api/operator/schedule/preview` | operator | file | POST | `src/app/api/operator/schedule/preview/route.ts` | 32 |
| `/api/operator/search` | operator | file | GET | `src/app/api/operator/search/route.ts` | 16 |
| `/api/operator/settings` | operator | file | GET PATCH | `src/app/api/operator/settings/route.ts` | 123 |
| `/api/operator/shop-items` | operator | NONE FOUND for POST/PATCH/DELETE | DELETE GET PATCH POST | `src/app/api/operator/shop-items/route.ts` | 91 |
| `/api/operator/shop-items/read` | operator | file | POST | `src/app/api/operator/shop-items/read/route.ts` | 33 |
| `/api/operator/shop-sales` | operator | file | GET PATCH POST | `src/app/api/operator/shop-sales/route.ts` | 202 |
| `/api/operator/shop-sales/quote` | operator | file | POST | `src/app/api/operator/shop-sales/quote/route.ts` | 21 |
| `/api/operator/sign` | operator | file | GET POST | `src/app/api/operator/sign/route.ts` | 105 |
| `/api/operator/staff` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/staff/route.ts` | 124 |
| `/api/operator/stripe/callback` | operator | file | GET | `src/app/api/operator/stripe/callback/route.ts` | 42 |
| `/api/operator/stripe/connect` | operator | file | GET | `src/app/api/operator/stripe/connect/route.ts` | 71 |
| `/api/operator/stripe/dashboard-link` | operator | file | POST | `src/app/api/operator/stripe/dashboard-link/route.ts` | 29 |
| `/api/operator/stripe/payouts` | operator | file | GET | `src/app/api/operator/stripe/payouts/route.ts` | 41 |
| `/api/operator/tee-sets` | operator | file | DELETE GET PATCH POST PUT | `src/app/api/operator/tee-sets/route.ts` | 169 |
| `/api/operator/tee-times` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/tee-times/route.ts` | 151 |
| `/api/operator/tiers` | operator | file | DELETE GET PATCH POST | `src/app/api/operator/tiers/route.ts` | 130 |
| `/api/operator/upload` | operator | file | DELETE POST | `src/app/api/operator/upload/route.ts` | 89 |
| `/api/operator/weather-cancel` | operator | file | POST | `src/app/api/operator/weather-cancel/route.ts` | 50 |
| `/api/preview/[courseId]` | public | token | GET | `src/app/api/preview/[courseId]/route.ts` | 66 |
| `/api/preview/[courseId]/approve` | public | token | POST | `src/app/api/preview/[courseId]/approve/route.ts` | 70 |
| `/api/preview/[courseId]/request-changes` | public | token | POST | `src/app/api/preview/[courseId]/request-changes/route.ts` | 38 |
| `/api/preview/[courseId]/tee-times` | public | token | GET | `src/app/api/preview/[courseId]/tee-times/route.ts` | 37 |
| `/api/preview/send` | admin | file | POST | `src/app/api/preview/send/route.ts` | 154 |
| `/api/receipt/[bookingId]` | admin | file | GET | `src/app/api/receipt/[bookingId]/route.ts` | 76 |
| `/api/shop-sale/[id]` | public | token | GET POST | `src/app/api/shop-sale/[id]/route.ts` | 33 |
| `/api/stripe/webhook` | public | secret header | POST | `src/app/api/stripe/webhook/route.ts` | 134 |
| `/api/waitlist` | public | public | POST | `src/app/api/waitlist/route.ts` | 7 |
| `/book` | public | public | page | `src/app/book/page.tsx` | 33 |
| `/call/[token]` | public | public | page | `src/app/call/[token]/page.tsx` | 142 |
| `/cam` | public | public | page | `src/app/cam/page.tsx` | 155 |
| `/cam/approve` | public | token | page | `src/app/cam/approve/page.tsx` | 64 |
| `/checkin/[bookingId]` | golfer | token | page | `src/app/checkin/[bookingId]/page.tsx` | 379 |
| `/contact` | public | public | page | `src/app/contact/page.tsx` | 79 |
| `/courses/[slug]` | public | public | page | `src/app/courses/[slug]/page.tsx` | 51 |
| `/courses/[slug]/account` | golfer | **NONE FOUND** | page | `src/app/courses/[slug]/account/page.tsx` | 11 |
| `/courses/[slug]/account/accept-invite` | golfer | entry | page | `src/app/courses/[slug]/account/accept-invite/page.tsx` | 144 |
| `/courses/[slug]/member` | member | **NONE FOUND** | page | `src/app/courses/[slug]/member/page.tsx` | 862 |
| `/dashboard` | operator | middleware | page | `src/app/dashboard/page.tsx` | 1501 |
| `/dashboard/2fa` | operator | entry | page | `src/app/dashboard/2fa/page.tsx` | 110 |
| `/dashboard/analytics` | operator | middleware | page | `src/app/dashboard/analytics/page.tsx` | 705 |
| `/dashboard/cancellations` | operator | middleware | page | `src/app/dashboard/cancellations/page.tsx` | 17 |
| `/dashboard/events` | operator | middleware | page | `src/app/dashboard/events/page.tsx` | 176 |
| `/dashboard/forgot-password` | operator | entry | page | `src/app/dashboard/forgot-password/page.tsx` | 63 |
| `/dashboard/home` | operator | middleware | page | `src/app/dashboard/home/page.tsx` | 209 |
| `/dashboard/login` | operator | entry | page | `src/app/dashboard/login/page.tsx` | 77 |
| `/dashboard/members` | operator | middleware | page | `src/app/dashboard/members/page.tsx` | 694 |
| `/dashboard/messages` | operator | middleware | page | `src/app/dashboard/messages/page.tsx` | 196 |
| `/dashboard/money` | operator | middleware | page | `src/app/dashboard/money/page.tsx` | 288 |
| `/dashboard/onboarding` | operator | **NONE FOUND** | page | `src/app/dashboard/onboarding/page.tsx` | 316 |
| `/dashboard/outings` | operator | middleware | page | `src/app/dashboard/outings/page.tsx` | 5 |
| `/dashboard/payments` | operator | middleware | page | `src/app/dashboard/payments/page.tsx` | 18 |
| `/dashboard/reset-password` | operator | entry | page | `src/app/dashboard/reset-password/page.tsx` | 112 |
| `/dashboard/schedules` | operator | middleware | page | `src/app/dashboard/schedules/page.tsx` | 610 |
| `/dashboard/settings` | operator | middleware | page | `src/app/dashboard/settings/page.tsx` | 1184 |
| `/dashboard/shop` | operator | middleware | page | `src/app/dashboard/shop/page.tsx` | 497 |
| `/dashboard/sign` | operator | middleware | page | `src/app/dashboard/sign/page.tsx` | 26 |
| `/dashboard/tournaments` | operator | middleware | page | `src/app/dashboard/tournaments/page.tsx` | 5 |
| `/dashboard/verify` | operator | token | page | `src/app/dashboard/verify/page.tsx` | 148 |
| `/demo` | public | public | GET | `src/app/demo/route.ts` | 18 |
| `/events/[id]` | public | public | page | `src/app/events/[id]/page.tsx` | 56 |
| `/for-courses` | public | public | page | `src/app/for-courses/page.tsx` | 18 |
| `/for-courses/details` | public | token | page | `src/app/for-courses/details/page.tsx` | 1946 |
| `/g/[slug]` | public | public | page | `src/app/g/[slug]/page.tsx` | 133 |
| `/manage/[bookingId]` | golfer | token | page | `src/app/manage/[bookingId]/page.tsx` | 573 |
| `/membership/[id]` | public | token | page | `src/app/membership/[id]/page.tsx` | 205 |
| `/operator-agreement` | public | public | page | `src/app/operator-agreement/page.tsx` | 85 |
| `/pay/event/[id]` | public | token | page | `src/app/pay/event/[id]/page.tsx` | 147 |
| `/pay/shop/[id]` | public | token | page | `src/app/pay/shop/[id]/page.tsx` | 143 |
| `/preview/[courseId]` | public | token | page | `src/app/preview/[courseId]/page.tsx` | 58 |
| `/privacy` | public | public | page | `src/app/privacy/page.tsx` | 248 |
| `/receipt/[bookingId]` | golfer | token | page | `src/app/receipt/[bookingId]/page.tsx` | 262 |
| `/teesheet` | public | public | page | `src/app/teesheet/page.tsx` | 219 |
| `/terms` | public | public | page | `src/app/terms/page.tsx` | 221 |

## Libraries

Sorted by how many files import them, so the load-bearing ones are first.

| file | used by | lines | purpose | exports |
|---|---|---|---|---|
| `src/lib/prisma.ts` | 221 | 15 |  | `prisma` |
| `src/lib/admin-session.ts` | 68 | 201 |  | `AdminSession`, `AdminSessionUnavailable`, `areaGate`, `MANAGER_PLUS`, `OWNER_ONLY`, `ownerGateError`, `requireOwner`, `requireRole` +7 more |
| `src/lib/email.ts` | 56 | 2179 |  | `BookingEmailData`, `escapeHtml`, `firstName`, `isPlaceholderEmail`, `PLACEHOLDER_EMAIL_DOMAIN`, `sendAdminDigest`, `sendAdminPasswordChangedNotification`, `sendAdminPasswordResetEmail` +65 more |
| `src/lib/session.ts` | 56 | 120 |  | `ACTIVE_COURSE_COOKIE`, `can`, `requirePermission`, `resolveDashboardSession`, `ResolvedSession`, `STAFF_FORBIDDEN`, `touchStaffSeen` |
| `src/lib/format.ts` | 48 | 78 | MP-9 (ADMIN_V4 V4-6 §3) — the one place admin pages format money and time. | `formatCents`, `formatDate`, `formatDateTime`, `formatEasternDate`, `formatEasternDay`, `formatMoney`, `formatRelative`, `formatStamp` +3 more |
| `src/lib/rate-limit.ts` | 47 | 78 |  | `clientIp`, `evidentiaryIp`, `rateLimit`, `rateLimitCount` |
| `src/lib/admin-audit.ts` | 42 | 194 | BRAIN-1a (Cam 2026-10-22): | `ACTION_LABELS`, `auditAdmin`, `AuditEntry`, `bodyWithReason`, `changedFields`, `courseOfBooking`, `needReason`, `REASON_ACTIONS` +5 more |
| `src/lib/course-time.ts` | 37 | 46 | SD-3 — course-local time. | `addDaysStr`, `clockIn`, `DEFAULT_TZ`, `isPastIn`, `isValidTimezone`, `todayIn`, `US_TIMEZONES` |
| `src/lib/agreement-required.ts` | 29 | 124 | AGREEMENT_SPEC AG-3 — version bumps and re-acceptance. | `AGREEMENT_REQUIRED_MESSAGE`, `agreementDueByCourse`, `agreementOverdueCourses`, `agreementReacceptance`, `currentReacceptWindow`, `Reacceptance`, `ReacceptWindow`, `requireAgreementCurrent` +1 more |
| `src/lib/auth.ts` | 28 | 202 |  | `DashboardSession`, `getGolferSession`, `getOperatorSession`, `signGolferToken`, `signMemberInviteToken`, `signPendingTwoFactorToken`, `signStaffResetToken`, `signStaffToken` +4 more |
| `src/lib/money.ts` | 26 | 50 | Money conversions, in one place. | `centsToDollars`, `centsToDollarsOr0`, `dollarsToCents`, `dollarsToCentsOr0`, `fmtCents` |
| `src/lib/stripe.ts` | 25 | 96 | Every charge, refund and SetupIntent GreenReserve makes goes through here. | `ACCESS_FEE_CENTS`, `chargeOnConnectedAccount`, `MEMBERSHIP_FEE_RATE`, `membershipFeeCents`, `refundOnConnectedAccount`, `stripe` |
| `src/lib/dashboard-fetch.ts` | 24 | 43 | SD-10 (from the SD review). | `dfetch`, `DFetchResult` |
| `src/lib/contact.ts` | 22 | 20 | MAIL-1 (Cam 2026-10-22): | `ADMIN_EMAIL`, `BILLING_EMAIL`, `NOREPLY_EMAIL`, `SUPPORT_EMAIL` |
| `src/lib/change-requests.ts` | 17 | 149 | Single source of truth for structured "request changes" data (V13b). | `APPROVED_MARKER`, `CATEGORY_LABEL`, `CHANGE_ADDRESSED_PREFIX`, `CHANGE_CATEGORIES`, `ChangeCategoryKey`, `ChangeItem`, `CHANGES_REQUESTED_PREFIX`, `computeOpenChanges` +14 more |
| `src/lib/admin-fetch.ts` | 16 | 153 | One place that decides what an admin fetch failure MEANS. | `adminErrorMessage`, `adminFetch`, `AdminFetchAction`, `AdminFetchFailure`, `AdminFetchResult`, `LOGIN_SESSION_ENDED` |
| `src/lib/inquiry-status.ts` | 16 | 480 | Single source of truth for what every inquiry status means and which pipeline segment it belongs to. | `ACTIVE_STATUSES`, `ALIVE_STATUSES`, `ARCHIVED_STATUSES`, `CLOSED_REASONS`, `compareQueue`, `daysSince`, `decodeResubmit`, `diffResubmit` +23 more |
| `src/lib/cancel-policy.ts` | 15 | 240 | SP-B (STAFF_POLICY_SPEC Part B). | `afterCutoffLine`, `afterCutoffShort`, `bookingWindowHours`, `cancelNowWords`, `CancelPolicy`, `cardRequired`, `chargesNoShow`, `chargesOnLateCancel` +14 more |
| `src/lib/course-timeline.ts` | 15 | 363 |  | `AGREEMENT_ACCEPTED_PREFIX`, `AgreementAcceptedPayload`, `buildCourseFeed`, `CHECKIN_CALL_PREFIX`, `CheckInCallPayload`, `CURRENT_AGREEMENT_VERSION`, `DOCUMENT_UPLOADED_PREFIX`, `DocumentUploadedPayload` +26 more |
| `src/lib/inquiry-call.ts` | 15 | 175 | INQUIRY_CALL_SPEC IC-1 §2 — the discovery-call agenda catalog, and the small derivations the sheet, the detail page and the queue share. | `AGENDA`, `AgendaItem`, `agendaStatus`, `AgendaStatusRow`, `callGate`, `CallLike`, `defaultAgenda`, `DIRECTION_LABEL` +13 more |
| `src/lib/shop.ts` | 14 | 156 | POS-1a (PLATFORM_ROADMAP_SPEC §4, Cam 2026-10-08): | `addItemToBooking`, `MAX_BOOKING_SHOP_CENTS`, `MAX_ITEM_PRICE_CENTS`, `MAX_LINE_QUANTITY`, `removeLineFromBooking`, `roundApplicationFeeCents`, `roundChargeCents`, `roundChargedTotal` +9 more |
| `src/lib/booking-fees.ts` | 13 | 36 |  | `ACCESS_FEE_CENTS`, `ACCESS_FEE_PER_PLAYER`, `EVENT_FEE_LABEL`, `EVENT_FEE_ON`, `hoursLabel`, `serviceFeeLabel`, `SHOP_FEE_LABEL`, `SHOP_FEE_ON` +1 more |
| `src/lib/admin-areas.ts` | 12 | 44 | AW-11 (Cam 2026-10-22: | `ADMIN_AREAS`, `AdminArea`, `ALL_AREAS`, `effectiveAreas`, `hasArea`, `isAdminArea` |
| `src/lib/admin-session-context.tsx` | 12 | 80 | MP-11a (ADMIN_V4 V4-7, LAW rule 2): | `AdminSessionProvider`, `AdminSessionView`, `isAdminAuthPath`, `useAdminSession` |
| `src/lib/booking-events.ts` | 12 | 85 |  | `BookingEventInput`, `EventActor`, `recordBookingEvent`, `recordBookingEventSafe`, `teeTimeInstant` |
| `src/lib/step-up-client.ts` | 11 | 70 | AW-1c: | `askReason`, `registerReasonHandler`, `registerStepUpHandler`, `stepUpFetch`, `withReason` |
| `src/lib/use-dashboard-access.ts` | 11 | 51 | SP-A: | `DashboardAccess`, `useDashboardAccess` |
| `src/lib/cron-log.ts` | 10 | 141 | MP-8b: | `cronHealth`, `CronHealth`, `cronRoute`, `lastStripeWebhook`, `logStripeWebhook`, `STRIPE_WEBHOOK_JOB` |
| `src/lib/real-courses.ts` | 10 | 22 | TEST-2 (Cam 2026-10-22: | `ON_REAL_BOOKING`, `ON_REAL_COURSE`, `REAL_COURSE` |
| `src/lib/staff-permissions.ts` | 10 | 140 | SP-A (STAFF_POLICY_SPEC Part A). | `ALL_KEYS`, `deniedMessage`, `labelFor`, `LEGACY_KEYS`, `normalizePermissions`, `PermissionDef`, `PermissionKey`, `PERMISSIONS` +5 more |
| `src/lib/access-fee.ts` | 9 | 184 | FB-3 (Cam 2026-09-29, FB3_FEE_PLAN_SPEC.md option B). | `bookingIdForFeeCharge`, `chargeAccessFeeSeparately`, `counterFeesUncollected`, `FeeChargeResult`, `liveSeparateFee`, `refundSeparateAccessFee` |
| `src/lib/agreement-gate.ts` | 9 | 117 | AG-1: | `AgreementDocStatus`, `agreementStatus`, `AgreementStatus`, `hasAcceptedAgreement`, `latestOperatorAgreement` |
| `src/lib/agreements.ts` | 9 | 134 | AGREEMENT_SPEC AG-1 §2 — versioned agreement documents. | `AgreementDocument`, `currentDocuments`, `currentVersion`, `DOCUMENT_DIR`, `DocumentMeta`, `listVersions`, `loadDocument`, `LoadedDocument` +2 more |
| `src/lib/member-session.ts` | 9 | 109 |  | `getGolferMembership`, `getMemberSession`, `golferResident`, `residentOn`, `signMemberMagicToken`, `signMemberSessionToken`, `verifyMemberMagicToken` |
| `src/lib/tee-sheet-engine.ts` | 9 | 255 |  | `DesiredSlot`, `desiredSlots`, `generateForAllCourses`, `generateTeeTimes`, `regenerateUpcoming`, `ScheduleForSlots`, `slotKey` |
| `src/lib/admin-roles.ts` | 8 | 17 | Role lists, client-safe. | `MANAGER_PLUS`, `OWNER_ONLY`, `SUPPORT_PLUS`, `VIEWER_PLUS` |
| `src/lib/course-checkin.ts` | 8 | 106 | COURSES_SHEET_SPEC CS-1 §2 — check-in calls with live courses. | `CHECKIN_AGENDA`, `CHECKIN_DUE_WINDOW_DAYS`, `CHECKIN_EVERY_DAYS`, `CHECKIN_FIRST_DAYS`, `CheckinAgendaItem`, `CheckinCallLike`, `CheckinCourseLike`, `checkInSignal` +8 more |
| `src/lib/course-metrics.ts` | 8 | 219 | THE shared metrics brain (REVISE_QUEUE A-04 item 0) — bookings/gross/ GR-fees/period math defined ONCE. | `COMPLETED_BOOKING_STATUSES`, `computeCourseHealth`, `computeNetPnL`, `CourseHealth`, `CourseHealthInput`, `CourseHealthStatus`, `HEALTH_STATUS_DOT`, `HEALTH_STATUS_LABEL` +9 more |
| `src/lib/private-blob.ts` | 8 | 33 | Contracts and signed agreements live in their OWN, private Vercel Blob store (Cam 2026-09-29). | `isBlobStoreUrl`, `PRIVATE_STORAGE_MISSING`, `privateBlobToken` |
| `src/lib/residents.ts` | 8 | 66 | RES-1 (Cam 2026-10-19): | `cardValidOn`, `groupGreenFee`, `MAX_CARD_NUMBER`, `MAX_RESIDENT_NAME`, `otherPerPlayerCents`, `residentInput` |
| `src/lib/schedule-service.ts` | 8 | 365 | MP-5d. | `compileCoursePlan`, `createSchedule`, `deleteSchedule`, `listSchedules`, `planRounds`, `saveCoursePlan`, `saveSchedulePlan`, `ScheduleConflictError` +6 more |
| `src/lib/tee-time-utils.ts` | 8 | 41 | Converts a stored tee-time (date "YYYY-MM-DD", time "HH:MM" in the course's local timezone) to a UTC millisecond timestamp. | `teeToUtcMs` |
| `src/lib/admin-day.ts` | 7 | 111 | Platform day boundaries. | `dayKey`, `PLATFORM_TZ`, `platformHour`, `startOfPlatformDay`, `startOfPlatformDaysAgo`, `startOfPlatformMonth`, `startOfPlatformMonthsAgo`, `startOfPlatformWeek` |
| `src/lib/cron-auth.ts` | 7 | 39 |  | `cronAuthFailure` |
| `src/lib/money-problems.ts` | 7 | 43 |  | `FAILED_CHARGE_WHERE`, `missedCheckInWhere`, `openDisputes` |
| `src/lib/owner-session.ts` | 7 | 170 | AW-1 (Cam 2026-10-20: | `alertTime`, `approveDevice`, `clearOwnerCookie`, `createOwnerSession`, `DEVICE_COOKIE`, `deviceForApproval`, `deviceLabel`, `deviceTokenFromCookie` +13 more |
| `src/lib/preview-token.ts` | 7 | 25 |  | `signPreviewToken`, `verifyPreviewToken` |
| `src/lib/seo.ts` | 7 | 21 | Link previews (Walk 1, 2026-10-19). | `OG_BASE`, `previewFor` |
| `src/lib/twilio.ts` | 7 | 57 |  | `sendSms`, `sendSmsOtp`, `smsConfigured` |
| `src/lib/admin-today.ts` | 6 | 194 |  | `paidWindow`, `STAFF_QUIET_DAYS`, `staffSeenSignal`, `STUCK_DAYS`, `TodayCourse`, `todayCourses`, `todayHealth`, `todayMoney` +1 more |
| `src/lib/analytics.ts` | 6 | 552 | AN-1 (Cam 2026-10-01): | `Analytics`, `computeAnalytics`, `EVENT_LOG_START`, `headline`, `NO_SHOW_GRACE_MIN`, `previousRange`, `Range`, `RES_START` +1 more |
| `src/lib/calcom.ts` | 6 | 93 | CAL-1 — Cal.com as the call scheduler, in place of the Google Calendar grid. | `calcomBookingUrl`, `calcomCreatedBy`, `calcomEmbedUrl`, `calcomManageLinks`, `calcomStatus`, `calcomUidOf`, `verifyCalcomSignature` |
| `src/lib/call-answers.ts` | 6 | 349 | INQUIRY_CALL_SPEC IC-5 — structured discovery-call answers. | `BOOKING_METHOD_OPTIONS`, `CALL_FIELDS`, `CallAnswers`, `callRecapLines`, `DAY_SHORT`, `emptyAnswers`, `FieldSpec`, `FieldType` +19 more |
| `src/lib/cancel-booking.ts` | 6 | 280 |  | `CancellationOptions`, `performCancellation` |
| `src/lib/golfer-otp.ts` | 6 | 94 |  | `classifyIdentifier`, `EMAIL_RE`, `generateOtpCode`, `normalizePhone`, `OtpChallenge`, `otpCodeMatches`, `OtpIdentifierType`, `otpUsedKey` +2 more |
| `src/lib/manage-access.ts` | 6 | 17 | R-AUTH-003 / R-GOLF-003 (G13) — who may manage a booking from the golfer side. | `canManageBooking` |
| `src/lib/password.ts` | 6 | 14 | Shared password strength rule — used on registration, reset, and in-dashboard change-password, both server-side (enforcement) and client-side (live hint). | `PASSWORD_REQUIREMENTS_HINT`, `validatePasswordStrength` |
| `src/lib/round-shop-tax.ts` | 6 | 146 | W2-7 part B2 (Cam 2026-10-20: | `EnsureResult`, `ensureShopTax`, `recordPendingRoundShopTax`, `recordRoundShopTax`, `refreshOpenRoundShopTax`, `shopTaxKey`, `TAX_UNAVAILABLE` |
| `src/lib/approval-state.ts` | 5 | 41 |  | `ApprovalState`, `getApprovalState` |
| `src/lib/booking-rules.ts` | 5 | 67 | W2-6 slice 3 (Cam 2026-10-20: | `groupSizeError`, `readRoundRules`, `RuleCourse`, `RuleRound`, `Rules`, `rulesFor`, `walkingAllowedAt` |
| `src/lib/course-plan.ts` | 5 | 286 | W2-6 Schedule simplification (Cam 2026-10-21: | `ALL_DAYS`, `autoName`, `blankPlan`, `checkPlan`, `checkRows`, `columnNames`, `CompiledRow`, `compilePlan` +11 more |
| `src/lib/expenses.ts` | 5 | 88 | EXPENSE TRACKER (RUN_QUEUE "EXPENSE TRACKER / real P&L") — the manual half of the P&L: | `EXPENSE_CADENCE_LABEL`, `EXPENSE_CADENCES`, `EXPENSE_CATEGORIES`, `EXPENSE_CATEGORY_LABEL`, `ExpenseCadence`, `ExpenseCategory`, `isExpenseCadence`, `isExpenseCategory` +4 more |
| `src/lib/no-show-fee.ts` | 5 | 194 | SP-B (STAFF_POLICY_SPEC Part B4). | `chargeNoShow`, `dueAutoNoShows`, `dueNoShowCharges`, `liveNoShowCharge`, `markNoShow`, `NoShowResult`, `refundNoShowFee` |
| `src/lib/refund-booking.ts` | 5 | 136 | MP-6b. | `findBookingByStripeId`, `PaymentEventKind`, `recordPaymentEvent`, `refundBooking`, `RefundResult` |
| `src/lib/tax-categories.ts` | 5 | 21 | W2-7 part B: | `isTaxCategory`, `TAX_CATEGORIES`, `TaxCategory`, `US_STATES` |
| `src/lib/admin-course-tabs.ts` | 4 | 98 | AW-7 (Cam 2026-10-21): | `bucketWeeks`, `COURSE_TABS`, `COURSE_WEEKS`, `CourseTab`, `openingTab`, `ProblemInput`, `SetupCheck`, `SetupCheckKey` +5 more |
| `src/lib/birdie/ask.ts` | 4 | 33 | AN-3 (Cam 2026-10-19: | `APPLIED_EVENT`, `ASK_EVENT`, `askBirdie`, `markBirdieReady`, `useBirdieReady` |
| `src/lib/birdie/proposal-types.ts` | 4 | 65 | BIRDIE_AI_SPEC B4b — the confirm-card shape, shared by the server (which builds cards in proposals.ts) and the widget (which shows them and makes the call). | `cardCalls`, `isProposalCard`, `PROPOSAL_ROUTES`, `ProposalCall`, `ProposalCard` |
| `src/lib/booking-window.ts` | 4 | 76 | BOOKING WINDOWS (RUN_QUEUE) — how far ahead each audience can see and book the tee sheet. | `dayOffset`, `DEFAULT_MEMBER_WINDOW_DAYS`, `DEFAULT_PUBLIC_WINDOW_DAYS`, `generationHorizonDays`, `lastBookableDate`, `MIN_GENERATION_DAYS`, `outsideWindowBody`, `utcToday` +4 more |
| `src/lib/call-invite.ts` | 4 | 106 | CALL_SCHEDULING_SPEC SC-2 §1 — the "pick a call time" invite. | `deliverCallInvite`, `INVITE_DAYS`, `inviteAgendaLines`, `InviteSendResult`, `inviteUrl`, `issueCallInvite`, `sendCallInvite`, `sendCallReminders` |
| `src/lib/company-documents.ts` | 4 | 61 | CO-DOCS (Cam 2026-10-01): | `COMPANY_DOC_CATEGORIES`, `COMPANY_DOC_MAX_BYTES`, `COMPANY_DOC_PREFIX`, `COMPANY_DOC_TYPES`, `CompanyDocCategory`, `companyDocPathOf`, `describeCompanyPath`, `isAllowedCompanyPath` +1 more |
| `src/lib/demo-courses.ts` | 4 | 4 | Cam: | `DEMO_COURSE_SLUGS` |
| `src/lib/event-payments.ts` | 4 | 456 | W2-9b (Cam 2026-10-22: | `chargeEventPayment`, `COURSE_METHODS`, `createPayLink`, `eventFeeFor`, `eventMoney`, `HOLD_MINUTES`, `holdProblem`, `MAX_EVENT_PAYMENT_CENTS` +14 more |
| `src/lib/event-signup.ts` | 4 | 232 | W2-9d (Cam 2026-10-22): | `cleanQuestions`, `HOLD_MINUTES`, `lapseHolds`, `MAX_GROUP`, `MAX_QUESTIONS`, `moveOntoList`, `questionsOf`, `sendSignupConfirmation` +7 more |
| `src/lib/lifecycle.ts` | 4 | 414 |  | `archivePair`, `deleteInquiryOrPair`, `deletePair`, `forceDeleteOrphan`, `ForceDeleteResult`, `LifecycleResult`, `listAcknowledgedOrphans`, `ORPHAN_FLAG` +6 more |
| `src/lib/move-booking.ts` | 4 | 231 | ACT-1 (PLATFORM_ROADMAP_SPEC §2, Cam 2026-10-07): | `moveBooking`, `MoveCode`, `MoveFail`, `MoveOk`, `MovePricing` |
| `src/lib/platform-stripe.ts` | 4 | 58 |  | `fetchStripeFeeWindow`, `fetchStripeProcessingCostCents`, `StripeFeeWindow` |
| `src/lib/public-tee-times.ts` | 4 | 92 | PERF-1: | `loadPublicTeeTimes`, `normalizeDbTeeTime`, `PublicTeeTimes` |
| `src/lib/sales-tax.ts` | 4 | 176 | W2-7 part B (Cam 2026-10-20: | `isTaxCategory`, `quoteShopTax`, `recordPendingShopTax`, `recordShopSaleTax`, `reuseShopTaxQuote`, `setTaxOn`, `setUpTax`, `TAX_CATEGORIES` +6 more |
| `src/lib/schedule-conflict.ts` | 4 | 143 | COURSE_LAYOUT_SPEC L2 — checks for schedules that share ground. | `checkSchedule`, `ConflictNine`, `ConflictProduct`, `ConflictSchedule`, `findScheduleConflict`, `TURN_MINUTES` |
| `src/lib/shop-sales.ts` | 4 | 554 | POS-2 (Cam 2026-10-19: | `cancelSaleIntent`, `chargeSale`, `createSale`, `discountFor`, `DiscountInput`, `hasDiscount`, `MAX_SALE_CENTS`, `MAX_SALE_LINES` +16 more |
| `src/lib/terms.ts` | 4 | 8 | Bump this whenever /terms materially changes so old bookings keep an honest record of which version the golfer actually agreed to. | `CURRENT_TERMS_VERSION` |
| `src/lib/tier-rates.ts` | 4 | 61 | The member-rate rules, shared by booking (api/bookings) and moving a group to another time (lib/move-booking.ts) so both price a member the same way. | `applyTierRates`, `isWeekend` |
| `src/lib/unsaved-guard.ts` | 4 | 95 | SD-8b — leaving a dashboard page with unsaved edits. | `confirmLeave`, `setLeaveGuard`, `useBackGuard` |
| `src/lib/admin-action-queue.ts` | 3 | 116 | AW-4 (Cam 2026-10-21): | `ActionRow`, `buildActionQueue`, `QueueItem` |
| `src/lib/booking-mode.ts` | 3 | 20 | Course-world pages: | `isBookingMode`, `isCourseWorld` |
| `src/lib/checkin-booking.ts` | 3 | 464 |  | `cartAddOnCentsFor`, `collectPayment`, `performCheckIn` |
| `src/lib/claim-tee-time.ts` | 3 | 93 |  | `claimTeeTime`, `TeeTimeClaimError` |
| `src/lib/course-setup.ts` | 3 | 52 | COURSES_SHEET_SPEC CS-1 §1 — the five setup steps a built course goes through before it is live. | `SETUP_STEPS`, `SetupCourseLike`, `setupProgress`, `SetupProgress`, `SetupStep`, `SetupStepKey` |
| `src/lib/course-wire.ts` | 3 | 57 |  | `COURSE_MONEY_WIRE_FIELDS`, `courseMoneyFromWire`, `courseToWire` |
| `src/lib/dashboard-visits.ts` | 3 | 45 | Tracks which operator dashboard tabs a device has visited — used to derive "Look around your dashboard" / "Check your tee sheet schedule" in the Getting Started checklist (V13). | `CORE_TABS`, `getVisitedTabs`, `isIntroSeen`, `LOOK_AROUND_THRESHOLD`, `markIntroSeen`, `recordTabVisit` |
| `src/lib/event-hold.ts` | 3 | 36 | W2-9: | `heldBy`, `HoldEvent`, `ninesByProduct` |
| `src/lib/go-live-preflight.ts` | 3 | 35 |  | `computeStripeGoLiveCheck`, `StripeGoLiveCheck` |
| `src/lib/inquiry-needs.ts` | 3 | 39 | INQUIRY_CALL_SPEC IC-1 §3 — "Still need from them", the sheet's column. | `NeedItem`, `stillNeed` |
| `src/lib/member-csv.ts` | 3 | 101 | Members → Import a list: | `ImportProblem`, `ImportRow`, `MAX_IMPORT_ROWS`, `parseCsv`, `parseCsvLines`, `readMemberCsv`, `toYmd` |
| `src/lib/monthly-review.ts` | 3 | 255 | BI-1 (PLATFORM_ROADMAP_SPEC §1, Cam 2026-10-07: | `allowedNumbers`, `buildFacts`, `claudeWriter`, `draftProblems`, `emailPendingReviews`, `isFullMonth`, `monthLabel`, `monthRange` +11 more |
| `src/lib/normalize-course.ts` | 3 | 91 |  | `normalizeDbCourse` |
| `src/lib/operator-home.ts` | 3 | 132 | DASH-C Home (Cam 2026-10-22, "very nice" on the course dashboard mockups): | `DeclinedCard`, `declinedCards`, `HomeGroup`, `HomeSlot`, `operatorHome` |
| `src/lib/owner-passkey.ts` | 3 | 111 | AW-1b (Cam 2026-10-21: | `addPasskey`, `authenticationOptions`, `hasPasskey`, `registrationOptions`, `relyingParty`, `verifyPasskeySignIn` |
| `src/lib/owner-totp.ts` | 3 | 100 | OWNER TOTP 2FA (RUN_QUEUE) — the authenticator-app second factor for the owner account. | `generateRecoveryCodes`, `generateTotpSecret`, `looksLikeRecoveryCode`, `matchRecoveryCode`, `normalizeRecoveryCode`, `RECOVERY_CODE_COUNT`, `signEnrolToken`, `TOTP_ISSUER` +8 more |
| `src/lib/problems.ts` | 3 | 61 | BRAIN-2a (Cam 2026-10-22): | `listProblems`, `openProblemCount`, `ProblemView`, `SNOOZE_DAYS` |
| `src/lib/public-course.ts` | 3 | 31 | PERF-1: | `loadPublicCourse` |
| `src/lib/schedule-wire.ts` | 3 | 94 |  | `scheduleMoneyForCreate`, `scheduleMoneyFromWire`, `scheduleToWire`, `teeTimeToWire` |
| `src/lib/sent-messages.ts` | 3 | 47 | BRAIN-1b (Cam 2026-10-22): | `logSent`, `SendMeta` |
| `src/lib/shop-import.ts` | 3 | 133 | W2-7 (Cam 2026-10-20: | `ImportItem`, `ImportOption`, `ImportRow`, `MAX_IMPORT_ITEMS`, `MAX_OPTIONS`, `parseImport`, `parsePriceCents` |
| `src/lib/stripe-errors.ts` | 3 | 26 | Friendly-message map for Stripe decline/error strings (REVISE_QUEUE A-06 item 4: | `friendlyStripeError` |
| `src/lib/thread-signal.ts` | 3 | 52 | MP-7a. | `compareThreads`, `SignalMessage`, `threadSignal`, `ThreadSignal`, `UNANSWERED_AFTER_DAYS` |
| `src/lib/walking.ts` | 3 | 23 | Settings rework (Cam 2026-10-19): | `walkingSummary`, `walkingWords` |
| `src/lib/admin-goals.ts` | 2 | 49 | AW-4b (Cam 2026-10-21): | `GOAL_METRICS`, `goalCurrent`, `GoalMetric`, `goalPace`, `isGoalMetric`, `listGoals` |
| `src/lib/agreement-publish.ts` | 2 | 101 | AG-3 — publishing an agreement version: | `agreementVersionsOverview`, `publishAgreementVersion`, `publishDates`, `PublishResult`, `REACCEPT_WINDOW_DAYS`, `reacceptPublishError`, `VersionRow` |
| `src/lib/agreement-sign.ts` | 2 | 207 | AGREEMENT_SPEC AG-2 — the signing service. | `deliverAgreementPdfs`, `recordSigning`, `retryMissingAgreementPdfs`, `SignInput`, `SignResult` |
| `src/lib/announcement-audience.ts` | 2 | 18 | Cam 2026-10-05: | `announcementsSince` |
| `src/lib/birdie/guardrails.ts` | 2 | 74 | BIRDIE_AI_SPEC B1 — scope, caps and the kill switch. | `BIRDIE_MODEL`, `birdieEnabled`, `BirdieTurn`, `birdieUsageToday`, `checkCaps`, `logConversation`, `MAX_HISTORY_TURNS`, `MAX_REPLY_TOKENS` +4 more |
| `src/lib/birdie/tools.ts` | 2 | 182 | BIRDIE_AI_SPEC B4a (Cam 2026-10-05) — live-data READ tools for the operator persona. | `READ_TOOLS`, `runReadTool`, `ToolContext`, `ToolOutcome` |
| `src/lib/calcom-url.ts` | 2 | 21 | The prefilled Cal.com booking link — no server-only imports, so the /for-courses thanks page can build it in the browser (FB-1 review) as well as the server routes (via lib/calcom.ts). | `calcomEmbedUrl` |
| `src/lib/course-closure.ts` | 2 | 129 | MP-5b. | `cancelFutureBookingsForClosure`, `closureImpact`, `ClosureImpact`, `ClosureResult`, `notifyOperatorOfClosure` |
| `src/lib/course-events.ts` | 2 | 378 | W2-9 Events (Cam 2026-10-21: | `applyHold`, `autoPairings`, `cancelEvent`, `createEvent`, `DEFAULT_TASKS`, `dueFor`, `EVENT_KINDS`, `EventError` +18 more |
| `src/lib/course-group.ts` | 2 | 13 | GRP-1 (Cam 2026-10-19, after golfbergencounty.com): | `groupCourseIds` |
| `src/lib/course-shape-setup.ts` | 2 | 179 | W2-6 (Cam 2026-10-20: | `applyCourseSetup`, `planCourseSetup`, `SetupInput`, `SetupPreview` |
| `src/lib/course-shape.ts` | 2 | 116 | W2-6 (Cam 2026-10-20: | `guessShape`, `isStockLabel`, `PlanNine`, `PlanRound`, `shapeDef`, `ShapeDef`, `ShapeKey`, `shapeNines` +2 more |
| `src/lib/course-timeline-groups.ts` | 2 | 16 | BRAIN-1b: | `FEED_GROUPS`, `FeedGroup`, `FeedItem` |
| `src/lib/courses-data.ts` | 2 | 324 |  | `Course`, `COURSES`, `generateTeeTimes`, `getCourseBySlug`, `searchCourses`, `TeeTime` |
| `src/lib/data-reset.ts` | 2 | 147 | TEST-1 (Cam 2026-10-22: | `CourseResetPreview`, `KEPT_TABLES`, `previewCourseReset`, `previewWipeAll`, `resetTestCourse`, `TableCounts`, `WIPE_ALL_UNTIL`, `WIPE_CONFIRM_WORDS` +3 more |
| `src/lib/facilities.ts` | 2 | 55 | Settings rework (Cam 2026-10-19: | `FacilityFields`, `facilityLines`, `FOOD_TYPES`, `RANGE_TYPES`, `TOURNAMENT_FREQ` |
| `src/lib/image-resize.ts` | 2 | 33 | Client-side downscale so a 12MB phone photo never has to travel over the wire or blow the perf budget on the page that eventually renders it. | `downscaleImage` |
| `src/lib/inquiry-action-queue.ts` | 2 | 105 | The Overview action queue's inquiry rows. | `ActionQueueRow`, `buildInquiryQueueRows`, `QueueInquiry` |
| `src/lib/inquiry-board.ts` | 2 | 83 | AW-6a (Cam 2026-10-21): | `BOARD_COLUMNS`, `BOARD_STUCK_DAYS`, `boardColumn`, `BoardColumn`, `BoardInquiry`, `LIVE_ON_BOARD_DAYS`, `nextStep`, `NextStep` +1 more |
| `src/lib/inquiry-signin.ts` | 2 | 124 | SD-11 — the "are you trying to sign in?" challenge that sits between the public sign-up form and a course that already exists. | `CODE_TTL_SECONDS`, `codeMatches`, `cookieOptions`, `generateCode`, `inertChallenge`, `macCode`, `MAX_CODE_ATTEMPTS`, `newChallengeId` +5 more |
| `src/lib/operator-search.ts` | 2 | 58 | DASH-C search (the mockups' "Find a golfer, booking or member"): | `operatorSearch`, `SearchResult` |
| `src/lib/settings-validation.ts` | 2 | 141 | SD-1. | `normalizeHttpUrl`, `SettingsValidation`, `validateSettingsPatch` |
| `src/lib/sheet-token.ts` | 2 | 52 |  | `CLOSED_TO_SHEET`, `DETAILS_TOKEN_TTL_DAYS`, `gateSheetAccess`, `SheetGate` |
| `src/lib/shop-tree.ts` | 2 | 44 | W2-7: | `bySku`, `FlatItem`, `matches`, `shopTree`, `stockOf`, `TreeItem` |
| `src/lib/staff-fonts.ts` | 2 | 10 | U-0 (UI_REVISE_SPEC §1b) used to give /dashboard and /admin their own STAFF look here: | `STAFF_LOOK_CLASS` |
| `src/lib/submit-change-request.ts` | 2 | 88 |  | `cleanChangeItems`, `submitChangeRequest` |
| `src/lib/tee-colour.ts` | 2 | 22 | Settings rework (Cam 2026-10-19: | `teeColour` |
| `src/lib/two-factor.ts` | 2 | 41 |  | `issueTwoFactorCode` |
| `src/lib/admin-ask-links.ts` | 1 | 15 | AW-3b: | `ADMIN_LINK`, `safeAdminPath` |
| `src/lib/admin-ask.ts` | 1 | 161 | AW-3b (Cam 2026-10-21: | `ASK_TOOL_NAMES`, `ASK_TOOLS`, `AskOutcome`, `runAskTool` |
| `src/lib/admin-checks.ts` | 1 | 223 | AW-5 (Cam 2026-10-21: | `DIGEST_HOUR_ET`, `digestFacts`, `DigestFacts`, `digestSummary`, `Finding`, `runAdminChecks`, `runMorningDigest`, `runUrgentChecks` +2 more |
| `src/lib/admin-course-page.ts` | 1 | 59 | AW-7 (Cam 2026-10-21): | `courseMoney`, `courseWeeks`, `FailedChargeRow` |
| `src/lib/admin-home.ts` | 1 | 130 | ADMIN-C (Cam 2026-10-22, mockup C "Clean hub"): | `homeCourseStats`, `HomeCourseStats`, `homeOverview`, `homeToday` |
| `src/lib/agreement-pdf.tsx` | 1 | 129 | AGREEMENT_SPEC AG-2 §2 — the signed-agreement PDF. | `AgreementPdf`, `markdownBlocks`, `renderAgreementPdf`, `SignatureBlock` |
| `src/lib/birdie/course-context.ts` | 1 | 75 | BIRDIE_AI_SPEC B1 — read-only awareness of THE OPERATOR'S OWN course. | `describeCourseContext`, `operatorCourseContext`, `OperatorCourseContext` |
| `src/lib/birdie/knowledge-operator.ts` | 1 | 64 | BIRDIE_AI_SPEC B1 — the operator knowledge pack. | `DASHBOARD_PAGES`, `DashboardPage`, `OPERATOR_KNOWLEDGE` |
| `src/lib/birdie/proposals.ts` | 1 | 451 | BIRDIE_AI_SPEC B4b (Cam 2026-10-05) — propose-and-confirm CHANGES. | `isProposeTool`, `ProposalCard`, `ProposalOutcome`, `PROPOSE_TOOLS`, `runProposeTool` |
| `src/lib/booking-residents.ts` | 1 | 60 | RES-1 (Cam 2026-10-19): | `setBookingResidents`, `SetResidentsResult` |
| `src/lib/booking-status.ts` | 1 | 77 | Single source of truth for what to show a user (operator, staff, or golfer) given a booking's current status + paymentStatus pair. | `BookingStatusInfo`, `getBookingStatus`, `statusDot`, `StatusTone` |
| `src/lib/cancel-confirm.ts` | 1 | 38 | The words staff read before cancelling a booking — the tee sheet's panel and Money → Cancellations ask the same question the same way, so the fee outcome they promise matches what lib/cancel-bookin... | `cancelConfirmText`, `CancelResult`, `cancelResultText` |
| `src/lib/checkin-errors.ts` | 1 | 15 | R-GOLF-011: | `golferCheckInError` |
| `src/lib/course-action-queue.ts` | 1 | 37 | COURSES_SHEET_SPEC CS-1 §4 — the Overview action queue's course rows for check-in calls. | `buildCourseCheckInRows`, `QueueCourse` |
| `src/lib/course-feed.ts` | 1 | 64 | MP-5e part 3 — the course's relationship feed: | `buildRelationshipFeed`, `FeedItem`, `FeedKind` |
| `src/lib/course-rounds.ts` | 1 | 20 | Settings rework (Cam 2026-10-19): | `CandidateRound`, `candidateRounds`, `sameNines` |
| `src/lib/cron-windows.ts` | 1 | 26 | R-CRON-003 — when the hourly cron sends its time-based emails. | `checkInEmailDue`, `cutoffWarningDue` |
| `src/lib/dispute-evidence.ts` | 1 | 117 | ADMIN-C Money → Disputes (PR2b): | `EvidenceInput`, `evidenceText`, `loadEvidence` |
| `src/lib/faq.ts` | 1 | 26 | SD-7: | `faqJsonLd`, `HOME_FAQ` |
| `src/lib/fees-by-day.ts` | 1 | 28 | ADMIN-C Money → Overview chart: | `feesByDay`, `Window` |
| `src/lib/frost-delay.ts` | 1 | 100 | B-9 frost delay (Cam 2026-10-01: | `applyFrostDelay`, `FrostMove`, `FrostPlan`, `isFrostTime`, `planFrostDelay` |
| `src/lib/golfer-messages.ts` | 1 | 110 | MSG-1 (PLATFORM_ROADMAP_SPEC §5, Cam 2026-10-07: | `audience`, `checkWindow`, `MAX_MESSAGE_CHARS`, `reach`, `sendCourseMessage`, `SMS_CHARS`, `smsRoom`, `Window` |
| `src/lib/member-import.ts` | 1 | 65 | Members → Import a list (Cam 2026-10-19, OPERATOR_REWORK_SPEC "Members = list first … Add member and Import list at the top"). | `importMembers`, `ImportOptions`, `ImportResult` |
| `src/lib/money-tabs.ts` | 1 | 15 | ADMIN-C Money: | `isMoneyTab`, `MONEY_TABS`, `MoneyTab`, `visibleMoneyTab` |
| `src/lib/receipt-charges.ts` | 1 | 94 | R-GOLF-010 — what was actually charged to (and refunded from) the golfer's card, for the receipt. | `chargedNowCents`, `ReceiptCharge`, `receiptCharges` |
| `src/lib/schedule-plans.ts` | 1 | 98 | W2-4 (Cam 2026-10-19: | `checkPeriods`, `groupSchedules`, `normDays`, `PlanGroup`, `PlanRow`, `snapToGrid` |
| `src/lib/schedule-preview.ts` | 1 | 154 | Schedule rework (Cam 2026-10-19: | `diffDay`, `PREVIEW_DAYS`, `previewScheduleChange`, `ScheduleChange`, `SchedulePreview` |
| `src/lib/sheet-vs-live.ts` | 1 | 108 | MP-5e. | `ConfigDrift`, `InquirySide`, `LiveSide`, `sheetVsLive` |
| `src/lib/shop-ai-import.ts` | 1 | 96 | W2-7 (Cam 2026-10-20: | `cleanRows`, `MAX_READ_CHARS`, `ReadRow`, `readShopList`, `SHOP_READ_MODEL` |
| `src/lib/shop-catalog.ts` | 1 | 139 | W2-7 (Cam 2026-10-20): | `createItems`, `deleteItem`, `ImportItem`, `ITEM_SELECT`, `ItemIn`, `optionName`, `readItem`, `setItemActive` +1 more |
| `src/lib/stripe-match.ts` | 1 | 25 | ADMIN-C Money → Disputes: | `lastFullMonths`, `matchResult`, `MonthWindow` |
| `src/lib/tee-time-fit.ts` | 1 | 19 | Cam 2026-10-19: | `FIT_WINDOW_MIN`, `timesTooClose` |
| `src/lib/tier-wire.ts` | 1 | 43 |  | `tierToWire` |
| `src/lib/use-resource.ts` | 1 | 40 | MP-11b (ADMIN_V4 V4-7 item 4). | `ResourceError`, `useResource` |
| `src/lib/weather-cancel.ts` | 1 | 89 | WX-1 weather cancel (Cam 2026-10-01: | `applyWeatherCancel`, `isWeatherTime`, `planWeatherCancel`, `WeatherGroup`, `WeatherPlan`, `WeatherResult` |
| `src/lib/who-pays.ts` | 1 | 104 | Settings → Prices & fees, "Who pays what" (Cam 2026-10-19, OPERATOR_REWORK_SPEC "Settings — round 1"): | `Cell`, `Period`, `Row`, `whoPays`, `WireSchedule`, `WireTier` |
| `src/lib/api-response.ts` | 0 | 22 | Common JSON response helpers to reduce boilerplate in API routes. | `badRequest`, `conflict`, `forbidden`, `notFound`, `serverError`, `unauthorized` |
| `src/lib/data.ts` | 0 | 3 | Deprecated — use @/lib/courses-data instead |  |
| `src/lib/db.ts` | 0 | 2 |  |  |
| `src/lib/seed.ts` | 0 | 2 |  |  |
| `src/lib/use-tab-intro.ts` | 0 | 18 |  | `useTabIntro` |

## Components

Sorted the same way.

| file | used by | lines | purpose | exports |
|---|---|---|---|---|
| `src/components/ui/StatusDot.tsx` | 62 | 36 |  | `StatusDot` |
| `src/components/ui/Card.tsx` | 58 | 17 |  | `Card`, `CARD` |
| `src/components/ui/field.ts` | 42 | 8 | MP-9: | `INPUT`, `INPUT_COMPACT` |
| `src/components/admin/AdminSidebar.tsx` | 18 | 236 |  | `AdminNavKey`, `default (AdminSidebar)` |
| `src/components/ui/Eyebrow.tsx` | 13 | 19 |  | `Eyebrow`, `EYEBROW` |
| `src/components/dashboard/LoadError.tsx` | 11 | 16 | SD-10. | `LoadError` |
| `src/components/dashboard/Toast.tsx` | 11 | 70 | SD-2. | `toast`, `Toaster`, `ToastKind` |
| `src/components/OperatorSidebar.tsx` | 11 | 287 |  | `default (OperatorSidebar)`, `OperatorNavKey` |
| `src/components/ui/ErrorState.tsx` | 9 | 96 |  | `ErrorBanner`, `LoadFailure` |
| `src/components/ui/Modal.tsx` | 9 | 141 | MP-9 (ADMIN_V4 V4-6 §4) — the one dialog. | `Modal`, `ModalActions` |
| `src/components/CourseHeaderBar.tsx` | 8 | 46 | White-label rule: | `CourseHeaderBar` |
| `src/components/dashboard/StaffNotice.tsx` | 5 | 30 | SD-11 / SP-A. | `StaffNotice` |
| `src/components/AuthPhotoShell.tsx` | 4 | 23 |  | `AUTH_PHOTO_LINK`, `AUTH_PHOTO_LINKS`, `AuthPhotoShell` |
| `src/components/dashboard/money/types.ts` | 4 | 18 | SD-8 — one booking shape for all three Money tabs. | `MoneyBooking`, `MoneyCourse` |
| `src/components/dashboard/money/PayoutsTable.tsx` | 3 | 73 | Money rework (Cam 2026-10-19): | `fmtDay`, `Payout`, `PayoutsData`, `PayoutsTable`, `usd` |
| `src/components/dashboard/SignAgreements.tsx` | 3 | 222 | AGREEMENT_SPEC AG-2 §1 — the "Sign" step. | `default (SignAgreements)` |
| `src/components/EmptyState.tsx` | 3 | 22 |  | `EmptyState` |
| `src/components/GolferExitLinks.tsx` | 3 | 24 |  | `GolferExitLinks` |
| `src/components/PlainHeader.tsx` | 3 | 17 |  | `default (PlainHeader)` |
| `src/components/admin/CourseCheckInCard.tsx` | 2 | 364 | COURSES_SHEET_SPEC CS-3 §2 — the "Next check-in" card on a live course's Overview. | `CourseCallRow`, `default (CourseCheckInCard)`, `describeCheckIn` |
| `src/components/admin/LeadDialogs.tsx` | 2 | 129 | AW-6c (Cam 2026-10-21: | `AddLeadDialog`, `MoveToTalkingDialog` |
| `src/components/admin/TestDataTools.tsx` | 2 | 170 | TEST-1 (Cam 2026-10-22): | `LaunchWipeCard`, `TestCourseCard` |
| `src/components/dashboard/events/EventDetail.tsx` | 2 | 374 | W2-9 Events: | `default (EventDetail)`, `EventData`, `EventFull`, `EventPlayer`, `EventTask` |
| `src/components/dashboard/events/EventSetup.tsx` | 2 | 379 | W2-9 Events: | `blankForm`, `default (EventSetup)`, `EventForm`, `KINDS`, `NineOpt`, `PAYERS`, `Product` |
| `src/components/home/ProductShot.tsx` | 2 | 16 |  | `default (ProductShot)` |
| `src/components/TrustNote.tsx` | 2 | 12 |  | `TrustNote` |
| `src/components/ui/Btn.tsx` | 2 | 27 |  | `Btn` |
| `src/components/admin/AgreementVersionsCard.tsx` | 1 | 117 | AG-3 — Admin → System → Agreement versions (Cam 2026-10-12: | `default (AgreementVersionsCard)` |
| `src/components/admin/CommandPalette.tsx` | 1 | 341 |  | `default (CommandPalette)` |
| `src/components/admin/InquiryBoard.tsx` | 1 | 137 | AW-6a (Cam 2026-10-21: | `BoardCardInquiry`, `default (InquiryBoard)` |
| `src/components/admin/InquiryCallCards.tsx` | 1 | 916 | INQUIRY_CALL_SPEC IC-2 — the two discovery-call cards on the inquiry detail page. | `CallFocus`, `CallRow`, `default (InquiryCallCards)`, `describeCall` |
| `src/components/admin/OwnerDevicesCard.tsx` | 1 | 61 | AW-1c (Cam 2026-10-21): | `default (OwnerDevicesCard)` |
| `src/components/admin/OwnerPasskeysCard.tsx` | 1 | 94 | AW-1b (Cam 2026-10-21): | `default (OwnerPasskeysCard)` |
| `src/components/admin/OwnerSignOutEverywhere.tsx` | 1 | 27 | AW-1: | `default (OwnerSignOutEverywhere)` |
| `src/components/admin/OwnerTwoFactorCard.tsx` | 1 | 159 | OWNER TOTP 2FA — the enrolment card on /admin/profile (owner only). | `default (OwnerTwoFactorCard)` |
| `src/components/admin/ReasonDialog.tsx` | 1 | 48 | BRAIN-1a (Cam 2026-10-22): | `default (ReasonDialog)` |
| `src/components/admin/StepUpDialog.tsx` | 1 | 99 | AW-1c (Cam 2026-10-21: | `default (StepUpDialog)` |
| `src/components/AnnouncementBanner.tsx` | 1 | 51 |  | `default (AnnouncementBanner)` |
| `src/components/birdie/BirdieWidget.tsx` | 1 | 229 | BIRDIE_AI_SPEC B1 — Birdie's chat panel for the operator dashboard, and its launcher in the bottom corner on every screen (W2-1, Cam 2026-10-19). | `default (BirdieWidget)` |
| `src/components/birdie/ConfirmCard.tsx` | 1 | 99 | BIRDIE_AI_SPEC B4b — a change Birdie drafted, waiting on the operator. | `ConfirmCard` |
| `src/components/dashboard/AgreementNotice.tsx` | 1 | 68 | AGREEMENT_SPEC AG-3 §3 — the re-acceptance banner and, after the deadline, the modal. | `AGREEMENT_REQUIRED_EVENT`, `default (AgreementNotice)` |
| `src/components/dashboard/CourseLayoutTab.tsx` | 1 | 495 | Settings rework (Cam 2026-10-19: | `default (CourseLayoutTab)` |
| `src/components/dashboard/CoursePreview.tsx` | 1 | 80 | B-6 (UI_REVISE_SPEC §4): | `CoursePreviewProps`, `default (CoursePreview)` |
| `src/components/dashboard/DateRangeButton.tsx` | 1 | 117 | AN-3 (Cam 2026-10-19: | `DateRange`, `default (DateRangeButton)`, `presets`, `rangeLabel` |
| `src/components/dashboard/events/EventMoney.tsx` | 1 | 315 | W2-9b: | `default (EventMoney)`, `EventPayment`, `EventRefund`, `Guarantee`, `Money` |
| `src/components/dashboard/events/EventSignup.tsx` | 1 | 149 | W2-9d (Cam 2026-10-22): | `default (EventSignup)`, `SignupQuestion` |
| `src/components/dashboard/GettingStartedChecklist.tsx` | 1 | 187 |  | `default (GettingStartedChecklist)` |
| `src/components/dashboard/GolferMessageModal.tsx` | 1 | 136 | MSG-1 (PLATFORM_ROADMAP_SPEC §5): | `default (GolferMessageModal)` |
| `src/components/dashboard/members/ImportMembers.tsx` | 1 | 124 | Members → Import a list (Cam 2026-10-19). | `ImportMembers` |
| `src/components/dashboard/members/ResidentsCard.tsx` | 1 | 169 | RES-1 (Cam 2026-10-19): | `ResidentsCard` |
| `src/components/dashboard/money/CancellationsPanel.tsx` | 1 | 80 | Money rework (Cam 2026-10-19: | `CancellationsPanel` |
| `src/components/dashboard/money/PaymentsPanel.tsx` | 1 | 117 | Money rework (Cam 2026-10-19: | `PaymentsPanel`, `paymentStatus` |
| `src/components/dashboard/money/PayoutsPanel.tsx` | 1 | 96 | SD-8 — the Stripe card, moved here out of Settings. | `PayoutsPanel` |
| `src/components/dashboard/MoveGroupModal.tsx` | 1 | 154 | ACT-1 (PLATFORM_ROADMAP_SPEC §2): | `default (MoveGroupModal)` |
| `src/components/dashboard/OperatorSearch.tsx` | 1 | 87 | DASH-C: | `default (OperatorSearch)` |
| `src/components/dashboard/RoundRulesCard.tsx` | 1 | 89 | W2-6 slice 3 (Cam 2026-10-20): | `CourseRules`, `default (RoundRulesCard)`, `RoundRules` |
| `src/components/dashboard/SalesTaxCard.tsx` | 1 | 82 | W2-7 part B (Cam 2026-10-20): | `SalesTaxCard` |
| `src/components/dashboard/settings/FinishSetup.tsx` | 1 | 54 | Settings rework (Cam 2026-10-19: | `FinishSetup`, `SetupItem` |
| `src/components/dashboard/settings/WhoPaysWhat.tsx` | 1 | 97 | Settings → Prices & fees: | `WhoPaysWhat` |
| `src/components/dashboard/ShopCatalog.tsx` | 1 | 374 | POS-1a (PLATFORM_ROADMAP_SPEC §4, Cam 2026-10-08): | `ShopCatalog` |
| `src/components/dashboard/ShopItemsForGroup.tsx` | 1 | 150 | POS-1a (PLATFORM_ROADMAP_SPEC §4, Cam 2026-10-08): | `default (ShopItemsForGroup)`, `ShopLine` |
| `src/components/dashboard/StaffPermissions.tsx` | 1 | 243 | SP-A (STAFF_POLICY_SPEC A6): | `StaffPermissions` |
| `src/components/dashboard/TeeSheetBoard.tsx` | 1 | 165 | SHEET-2 (PLATFORM_ROADMAP_SPEC §9, Cam 2026-10-07: | `BoardGroup`, `BoardSlot`, `default (TeeSheetBoard)`, `groupTone` |
| `src/components/Footer.tsx` | 1 | 79 |  | `default (Footer)` |
| `src/components/home/TeeSheetDemo.tsx` | 1 | 320 | HOME-2 (HOMEPAGE_SPEC.md, Cam 2026-10-07: | `LaptopDemo` |
| `src/components/MainOffset.tsx` | 1 | 32 |  | `default (MainOffset)` |
| `src/components/Nav.tsx` | 1 | 126 |  | `default (Nav)` |
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

### AdminAlert

16 fields · 3 writer(s) · 5 reader(s)

- fields: `id`, `key`, `kind`, `title`, `detail`, `href`, `firstSeenAt`, `lastSeenAt`, `alertedAt`, `resolvedAt`, `ownerId`, `ownerName`, `courseId`, `snoozedUntil`, `snoozeReason`, `events`
- writers: `src/app/api/admin/problems/route.ts`, `src/lib/admin-checks.ts`, `src/lib/data-reset.ts`
- readers: `src/app/api/admin/problems/route.ts`, `src/lib/admin-checks.ts`, `src/lib/course-timeline.ts`, `src/lib/data-reset.ts`, `src/lib/problems.ts`

### AdminAlertEvent

7 fields · 2 writer(s) · 0 reader(s)

- fields: `id`, `alertId`, `alert`, `kind`, `actorName`, `text`, `createdAt`
- writers: `src/app/api/admin/problems/route.ts`, `src/lib/admin-checks.ts`
- readers: **none**

### AdminAuditLog

13 fields · 1 writer(s) · 2 reader(s)

- fields: `id`, `adminId`, `admin`, `action`, `targetType`, `targetId`, `detail`, `reason`, `before`, `after`, `courseId`, `actorName`, `createdAt`
- writers: `src/lib/admin-audit.ts`
- readers: `src/app/api/admin/audit/route.ts`, `src/lib/course-timeline.ts`

### AdminGoal

7 fields · 1 writer(s) · 3 reader(s)

- fields: `id`, `metric`, `target`, `startsAt`, `dueAt`, `createdBy`, `createdAt`
- writers: `src/app/api/admin/goals/route.ts`
- readers: `src/app/api/admin/goals/route.ts`, `src/lib/admin-goals.ts`, `src/lib/admin-home.ts`

### AdminUser

28 fields · 10 writer(s) · 16 reader(s)

- fields: `id`, `email`, `name`, `passwordHash`, `role`, `active`, `mustChangePassword`, `lastLoginAt`, `createdAt`, `setPasswordToken`, `setPasswordTokenExpiry`, `twoFactorCode`, `twoFactorCodeExpiry`, `twoFactorAttempts`, `twoFactorSecret`, `twoFactorEnrolledAt`, `twoFactorRecoveryCodes`, `failedLoginAttempts`, `lockoutUntil`, `sessionVersion`, `areas`, `areasSetAt`, `auditLogs`, `ownerSessions`, `ownerDevices`, `ownerPasskeys`, `passkeyChallenge`, `passkeyChallengeExpiry`
- writers: `src/app/api/admin/bootstrap/route.ts`, `src/app/api/admin/change-password/route.ts`, `src/app/api/admin/employees/route.ts`, `src/app/api/admin/forgot-password/route.ts`, `src/app/api/admin/login/route.ts`, `src/app/api/admin/set-password/route.ts`, `src/app/api/admin/two-factor/route.ts`, `src/app/api/cam/login/route.ts`, `src/app/api/cam/step-up/route.ts`, `src/lib/owner-passkey.ts`
- readers: `src/app/api/admin/audit/route.ts`, `src/app/api/admin/bootstrap/route.ts`, `src/app/api/admin/broadcasts/route.ts`, `src/app/api/admin/change-password/route.ts`, `src/app/api/admin/employees/route.ts`, `src/app/api/admin/forgot-password/route.ts`, `src/app/api/admin/login/route.ts`, `src/app/api/admin/passkeys/route.ts`, `src/app/api/admin/problems/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/api/admin/set-password/route.ts`, `src/app/api/admin/two-factor/route.ts` +4 more (see `docs/codemap.json`)

### AgreementAcceptance

16 fields · 2 writer(s) · 4 reader(s)

- fields: `id`, `courseId`, `course`, `document`, `version`, `textHash`, `signerName`, `signerTitle`, `signerEmail`, `authorityAttested`, `marketingOptOut`, `ip`, `userAgent`, `pdfUrl`, `legacy`, `acceptedAt`
- writers: `src/app/api/operator/agreement/route.ts`, `src/lib/agreement-sign.ts`
- readers: `src/app/api/admin/course-documents/route.ts`, `src/lib/agreement-gate.ts`, `src/lib/agreement-required.ts`, `src/lib/agreement-sign.ts`

### AgreementVersion

8 fields · 2 writer(s) · 3 reader(s)

- fields: `id`, `document`, `version`, `textHash`, `effectiveAt`, `reacceptBy`, `noticeSentAt`, `createdAt`
- writers: `src/lib/agreement-publish.ts`, `src/lib/agreement-required.ts`
- readers: `src/lib/agreement-gate.ts`, `src/lib/agreement-publish.ts`, `src/lib/agreement-required.ts`

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

5 fields · 3 writer(s) · 9 reader(s)

- fields: `id`, `courseId`, `course`, `date`, `reason`
- writers: `src/app/api/operator/blackouts/route.ts`, `src/lib/lifecycle.ts`, `src/lib/weather-cancel.ts`
- readers: `src/app/api/operator/blackouts/route.ts`, `src/lib/analytics.ts`, `src/lib/birdie/proposals.ts`, `src/lib/birdie/tools.ts`, `src/lib/course-events.ts`, `src/lib/data-reset.ts`, `src/lib/schedule-preview.ts`, `src/lib/tee-sheet-engine.ts`, `src/lib/weather-cancel.ts`

### Booking

58 fields · 11 writer(s) · 56 reader(s)

- fields: `id`, `teeTimeId`, `teeTime`, `courseId`, `course`, `golferAccountId`, `golferAccount`, `golferName`, `golferEmail`, `golferPhone`, `players`, `appliedRate`, `greenFeeTotal`, `cartFeeTotal`, `cartSelected`, `rangeBallsSize`, `rangeBallsTotal`, `accessFeeTotal`, `totalAmount`, `stripeCustomerId`, `stripePaymentMethodId`, `stripePaymentIntentId`, `cancellationFeeTotal`, `cancellationFeeChargeId`, `cancellationFeeChargedAt`, `cancelledAt`, `checkInToken`, `checkedInAt`, `roundPaymentIntentId`, `checkInFailReason`, `paymentStatus`, `status`, `termsAcceptedAt`, `termsVersion`, `cancellationFeeApplies`, `lateFeeTimingAtBooking`, `noShowFeeTotal`, `autoNoShowMinutesAtBooking`, `source`, `checkedInPlayers`, `noShowAt`, `paidOffline`, `cancellationHoursAtBooking`, `paidAt`, `shopTotalCents`, `shopFeeCents`, `shopLockedAt`, `shopTaxCents`, `shopTaxCalculationId`, `shopTaxKey`, `shopTaxExpiresAt`, `shopTaxTransactionId`, `roundChargedCents`, `residentPlayers`, `residentRateCents`, `createdAt`, `paymentEvents`, `shopItems`
- writers: `src/app/api/cron/cancellation-cutoff/route.ts`, `src/app/api/cron/hourly/route.ts`, `src/app/api/golfer/auth/otp/verify/route.ts`, `src/app/api/operator/bookings/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/access-fee.ts`, `src/lib/checkin-booking.ts`, `src/lib/data-reset.ts`, `src/lib/lifecycle.ts`, `src/lib/refund-booking.ts`, `src/lib/round-shop-tax.ts`
- readers: `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/courses/route.ts`, `src/app/api/admin/golfers/route.ts`, `src/app/api/admin/messages/route.ts`, `src/app/api/admin/nav-badges/route.ts`, `src/app/api/admin/platform-stripe/route.ts`, `src/app/api/admin/revenue/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/api/admin/stripe-match/route.ts`, `src/app/api/admin/transactions/export/route.ts`, `src/app/api/admin/transactions/route.ts`, `src/app/api/bookings/cancel/route.ts` +44 more (see `docs/codemap.json`)

### BookingEvent

12 fields · 1 writer(s) · 6 reader(s)

- fields: `id`, `bookingId`, `courseId`, `type`, `occurredAt`, `actorType`, `actorId`, `amountCents`, `playerCount`, `teeTimeAt`, `stripeId`, `metadata`
- writers: `src/lib/data-reset.ts`
- readers: `src/lib/analytics.ts`, `src/lib/course-timeline.ts`, `src/lib/data-reset.ts`, `src/lib/dispute-evidence.ts`, `src/lib/no-show-fee.ts`, `src/lib/receipt-charges.ts`

### BookingShopItem

11 fields · 0 writer(s) · 1 reader(s)

- fields: `id`, `bookingId`, `booking`, `shopItemId`, `shopItem`, `name`, `unitPriceCents`, `quantity`, `taxCategory`, `addedBy`, `createdAt`
- writers: **none** — nothing in `src/` writes this model
- readers: `src/lib/shop.ts`

### Call

22 fields · 3 writer(s) · 8 reader(s)

- fields: `id`, `kind`, `inquiryId`, `inquiry`, `courseId`, `course`, `scheduledAt`, `durationMin`, `direction`, `phone`, `agendaJson`, `agendaExtra`, `outcome`, `answersJson`, `notes`, `followUpAt`, `completedAt`, `createdBy`, `createdAt`, `updatedAt`, `bookedByCourse`, `gcalEventId`
- writers: `src/app/api/admin/course-calls/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/calcom/webhook/route.ts`
- readers: `src/app/api/admin/course-calls/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/calcom/webhook/route.ts`, `src/app/api/call/[token]/route.ts`, `src/app/api/inquiries/details/route.ts`, `src/lib/call-invite.ts`, `src/lib/course-timeline.ts`

### ChangeRequest

10 fields · 0 writer(s) · 0 reader(s)

- fields: `id`, `inquiryId`, `inquiry`, `category`, `body`, `status`, `raisedBy`, `addressedBy`, `addressedAt`, `createdAt`
- writers: **none** — nothing in `src/` writes this model
- readers: **none**

### Course

123 fields · 16 writer(s) · 97 reader(s)

- fields: `id`, `isTest`, `slug`, `name`, `type`, `city`, `state`, `zipCode`, `address`, `phone`, `website`, `bookingUrl`, `holes`, `par`, `yardage`, `slope`, `courseRating`, `description`, `amenities`, `walkingAllowed`, `walkingNote`, `cartRequired`, `dresscode`, `minPlayers`, `maxPlayers`, `cancellationHours`, `checkInWindowHours`, `lateCancellationFeeCents`, `lateFeeBasis`, `lateFeeTiming`, `noShowFeeCents`, `noShowFeeBasis`, `autoNoShowMinutes`, `timezone`, `rainCheckPolicy`, `publicAdvanceDays`, `memberAdvanceDays`, `hasMemberPricing`, `hasResidentPricing`, `residentCounty`, `residentState`, `residentProofRequired`, `hasCaddies`, `caddieType`, `caddieLooperRateCents`, `caddieForeRateCents`, `caddieNote`, `hasDrivingRange`, `drivingRangeType`, `rangeBallsFree`, `rangeBallsSmallPriceCents`, `rangeBallsMediumPriceCents`, `rangeBallsLargePriceCents`, `hasPuttingGreen`, `hasShortGameArea`, `hasProShop`, `proShopPhone`, `restaurantType`, `hasCartGirl`, `tournamentFrequency`, `hasLessons`, `hasClubRental`, `clubRentalRateCents`, `hasPushCartRental`, `pushCartRateCents`, `hasBagStorage`, `hasLockerRoom`, `hasGpsCarts`, `hasTournaments`, `stripeAccountId`, `stripeAccountActive`, `shopTaxOn`, `rating`, `reviewCount`, `imageGradient`, `brandColor`, `establishedYear`, `logoUrl`, `heroImageUrl`, `confirmationNote`, `featured`, `active`, `liveStatus`, `firstWentLiveAt`, `offlineAt`, `welcomeEmailSentAt`, `adminNotes`, `archivedAt`, `archivedBy`, `createdAt`, `updatedAt`, `operatorId`, `operator`, `conditions`, `conditionsUpdatedAt`, `giftCardUrl`, `heroPhotoUrl`, `teeTimes`, `bookings`, `schedules`, `blackouts`, `memberships`, `residents`, `groupId`, `group`, `membershipTiers`, `staff`, `teeSets`, `thread`, `photos`, `teeTimeAlerts`, `events`, `nines`, `nextCheckInAt`, `staffLastSeenAt`, `calls`, `legalName`, `agreements`, `courseProducts`, `monthlyReviews`, `golferMessages`, `shopItems`, `shopSales`
- writers: `src/app/api/admin/course-calls/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/course-groups/route.ts`, `src/app/api/admin/course-settings/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/admin/test-course/route.ts`, `src/app/api/operator/conditions/route.ts`, `src/app/api/operator/courses/route.ts`, `src/app/api/operator/settings/route.ts`, `src/app/api/operator/stripe/callback/route.ts`, `src/app/api/operator/stripe/connect/route.ts`, `src/app/api/operator/upload/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/agreement-sign.ts`, `src/lib/lifecycle.ts`, `src/lib/sales-tax.ts`
- readers: `src/app/api/admin/audit/route.ts`, `src/app/api/admin/broadcasts/route.ts`, `src/app/api/admin/course-calls/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/course-documents/route.ts`, `src/app/api/admin/course-groups/route.ts`, `src/app/api/admin/course-payouts/route.ts`, `src/app/api/admin/course-settings/route.ts`, `src/app/api/admin/courses/route.ts`, `src/app/api/admin/create-course/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/admin/messages/route.ts` +85 more (see `docs/codemap.json`)

### CourseEvent

43 fields · 3 writer(s) · 8 reader(s)

- fields: `id`, `courseId`, `course`, `name`, `kind`, `date`, `format`, `startTime`, `holdFrom`, `holdTo`, `holdToCustom`, `productId`, `shareCourse`, `holdNineIds`, `keepOpen`, `holes`, `groups`, `players`, `organizerName`, `organizerEmail`, `organizerPhone`, `pricePerPlayerCents`, `includes`, `terms`, `notes`, `status`, `createdBy`, `createdAt`, `updatedAt`, `tasks`, `entrants`, `teeTimes`, `payments`, `finalHeadcount`, `payer`, `guaranteeDaysBefore`, `guaranteedPlayers`, `guaranteedAt`, `guaranteedBy`, `signupOpen`, `signupPay`, `signupMaxGroup`, `signupQuestions`
- writers: `src/app/api/operator/events/[id]/route.ts`, `src/lib/course-events.ts`, `src/lib/data-reset.ts`
- readers: `src/app/api/operator/events/[id]/payments/route.ts`, `src/app/api/operator/events/[id]/route.ts`, `src/app/api/operator/events/route.ts`, `src/lib/course-events.ts`, `src/lib/data-reset.ts`, `src/lib/event-payments.ts`, `src/lib/event-signup.ts`, `src/lib/tee-sheet-engine.ts`

### CourseEventPayment

27 fields · 1 writer(s) · 4 reader(s)

- fields: `id`, `eventId`, `event`, `courseId`, `kind`, `label`, `amountCents`, `feeCents`, `method`, `status`, `payToken`, `paymentIntentId`, `chargeStartedAt`, `paidAt`, `voidedAt`, `payerName`, `payerEmail`, `payerPhone`, `headcount`, `playerId`, `groupKey`, `player`, `note`, `refundedCents`, `createdBy`, `createdAt`, `refunds`
- writers: `src/lib/event-payments.ts`
- readers: `src/app/api/operator/events/[id]/payments/route.ts`, `src/app/api/operator/events/[id]/route.ts`, `src/lib/event-payments.ts`, `src/lib/event-signup.ts`

### CourseEventPlayer

16 fields · 3 writer(s) · 4 reader(s)

- fields: `id`, `eventId`, `event`, `name`, `email`, `phone`, `groupNo`, `startHole`, `payments`, `status`, `holdUntil`, `source`, `groupKey`, `answers`, `sortOrder`, `createdAt`
- writers: `src/app/api/operator/events/[id]/route.ts`, `src/lib/event-payments.ts`, `src/lib/event-signup.ts`
- readers: `src/app/api/event-payment/[id]/route.ts`, `src/app/api/operator/events/[id]/route.ts`, `src/lib/event-payments.ts`, `src/lib/event-signup.ts`

### CourseEventRefund

10 fields · 1 writer(s) · 2 reader(s)

- fields: `id`, `paymentId`, `payment`, `amountCents`, `status`, `stripeRefundId`, `reason`, `error`, `createdBy`, `createdAt`
- writers: `src/lib/event-payments.ts`
- readers: `src/app/api/operator/events/[id]/payments/route.ts`, `src/lib/event-payments.ts`

### CourseEventTask

8 fields · 2 writer(s) · 2 reader(s)

- fields: `id`, `eventId`, `event`, `label`, `dueDate`, `doneAt`, `doneBy`, `sortOrder`
- writers: `src/app/api/operator/events/[id]/route.ts`, `src/lib/course-events.ts`
- readers: `src/app/api/operator/events/[id]/route.ts`, `src/lib/course-events.ts`

### CourseGroup

7 fields · 1 writer(s) · 3 reader(s)

- fields: `id`, `name`, `slug`, `description`, `createdAt`, `updatedAt`, `courses`
- writers: `src/app/api/admin/course-groups/route.ts`
- readers: `src/app/api/admin/course-groups/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/g/[slug]/page.tsx`

### CourseInquiry

45 fields · 8 writer(s) · 27 reader(s)

- fields: `id`, `firstName`, `lastName`, `contactName`, `contactTitle`, `email`, `phone`, `courseName`, `address`, `city`, `state`, `zipCode`, `website`, `courseType`, `currentBookingMethod`, `teeTimesPerDay`, `greenFeeRange`, `hasResidentPricing`, `hasMemberPricing`, `hasCaddies`, `pricingNotes`, `facilitiesNotes`, `lookingFor`, `additionalNotes`, `needsJson`, `status`, `adminNotes`, `builtCourseId`, `detailsToken`, `detailsJson`, `reviewStartedAt`, `wentLiveAt`, `source`, `closedReason`, `snoozeUntil`, `nextFollowUpAt`, `createdAt`, `updatedAt`, `events`, `changeRequests`, `callSkippedReason`, `calls`, `callInviteToken`, `callInviteSentAt`, `callInviteExpiresAt`
- writers: `src/app/api/admin/backfill-orphaned-inquiries/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/create-course/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/inquiries/details/route.ts`, `src/app/api/inquiries/route.ts`, `src/lib/call-invite.ts`, `src/lib/lifecycle.ts`
- readers: `src/app/api/admin/backfill-orphaned-inquiries/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/courses/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/admin/messages/route.ts`, `src/app/api/admin/nav-badges/route.ts`, `src/app/api/admin/request-re-review/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/api/calcom/webhook/route.ts`, `src/app/api/call/[token]/route.ts`, `src/app/api/inquiries/details/route.ts`, `src/app/api/inquiries/route.ts` +15 more (see `docs/codemap.json`)

### CourseMembership

24 fields · 8 writer(s) · 24 reader(s)

- fields: `id`, `golferId`, `golfer`, `courseId`, `course`, `tierId`, `tier`, `membershipType`, `inviteEmail`, `inviteName`, `invitePhone`, `inviteAccepted`, `status`, `addedBy`, `expiresAt`, `startedAt`, `paymentStatus`, `payToken`, `lastPaidAt`, `lastPaymentIntentId`, `renewalRemindedAt`, `initiationWaived`, `notes`, `createdAt`
- writers: `src/app/api/cron/send-reminders/route.ts`, `src/app/api/golfer/auth/accept-invite/route.ts`, `src/app/api/golfer/memberships/route.ts`, `src/app/api/operator/members/remind-overdue/route.ts`, `src/app/api/operator/members/route.ts`, `src/lib/data-reset.ts`, `src/lib/lifecycle.ts`, `src/lib/member-import.ts`
- readers: `src/app/api/admin/course-members/route.ts`, `src/app/api/admin/courses/route.ts`, `src/app/api/admin/transactions/route.ts`, `src/app/api/bookings/resident-rate/route.ts`, `src/app/api/bookings/route.ts`, `src/app/api/cron/send-reminders/route.ts`, `src/app/api/golfer/auth/accept-invite/route.ts`, `src/app/api/golfer/memberships/route.ts`, `src/app/api/member/[courseSlug]/payments/route.ts`, `src/app/api/member/[courseSlug]/send-code/route.ts`, `src/app/api/member/[courseSlug]/session/route.ts`, `src/app/api/member/[courseSlug]/tee-times/route.ts` +12 more (see `docs/codemap.json`)

### CourseMessage

12 fields · 2 writer(s) · 2 reader(s)

- fields: `id`, `courseId`, `course`, `date`, `fromTime`, `toTime`, `body`, `sentEmail`, `sentSms`, `failed`, `sentBy`, `createdAt`
- writers: `src/lib/data-reset.ts`, `src/lib/golfer-messages.ts`
- readers: `src/app/api/operator/golfer-messages/route.ts`, `src/lib/data-reset.ts`

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

16 fields · 3 writer(s) · 13 reader(s)

- fields: `id`, `courseId`, `course`, `label`, `holes`, `nineIds`, `active`, `sortOrder`, `createdAt`, `walkingPolicy`, `minPlayers`, `maxPlayers`, `publicAdvanceDays`, `teeSetRatings`, `schedules`, `teeTimes`
- writers: `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/course-products/route.ts`, `src/app/api/operator/round-rules/route.ts`
- readers: `src/app/api/admin/course-detail/route.ts`, `src/app/api/operator/course-products/route.ts`, `src/app/api/operator/events/[id]/route.ts`, `src/app/api/operator/events/route.ts`, `src/app/api/operator/nines/route.ts`, `src/app/api/operator/round-rules/route.ts`, `src/app/api/operator/tee-sets/route.ts`, `src/lib/birdie/course-context.ts`, `src/lib/course-events.ts`, `src/lib/course-shape-setup.ts`, `src/lib/schedule-preview.ts`, `src/lib/schedule-service.ts` +1 more (see `docs/codemap.json`)

### CourseProductTeeSet

7 fields · 2 writer(s) · 0 reader(s)

- fields: `id`, `courseProductId`, `courseProduct`, `teeSetId`, `teeSet`, `rating`, `slope`
- writers: `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/tee-sets/route.ts`
- readers: **none**

### CourseResident

11 fields · 2 writer(s) · 3 reader(s)

- fields: `id`, `courseId`, `course`, `name`, `email`, `cardNumber`, `expiresOn`, `notes`, `addedBy`, `createdAt`, `updatedAt`
- writers: `src/app/api/operator/residents/route.ts`, `src/lib/data-reset.ts`
- readers: `src/app/api/operator/residents/route.ts`, `src/lib/data-reset.ts`, `src/lib/member-session.ts`

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

9 fields · 2 writer(s) · 4 reader(s)

- fields: `id`, `name`, `category`, `amountCents`, `cadence`, `startedAt`, `endedAt`, `createdAt`, `updatedAt`
- writers: `src/app/api/admin/expenses/[id]/route.ts`, `src/app/api/admin/expenses/route.ts`
- readers: `src/app/api/admin/expenses/[id]/route.ts`, `src/app/api/admin/expenses/route.ts`, `src/app/api/admin/revenue/route.ts`, `src/lib/admin-today.ts`

### GolferAccount

14 fields · 3 writer(s) · 11 reader(s)

- fields: `id`, `email`, `password`, `firstName`, `lastName`, `phone`, `stripeCustomerId`, `resetToken`, `resetTokenExpiry`, `failedLoginAttempts`, `lockoutUntil`, `createdAt`, `bookings`, `memberships`
- writers: `src/app/api/bookings/setup-intent/route.ts`, `src/app/api/golfer/auth/accept-invite/route.ts`, `src/app/api/golfer/auth/otp/verify/route.ts`
- readers: `src/app/api/admin/golfers/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/api/bookings/setup-intent/route.ts`, `src/app/api/courses/[slug]/account/route.ts`, `src/app/api/golfer/auth/accept-invite/route.ts`, `src/app/api/golfer/auth/me/route.ts`, `src/app/api/golfer/auth/otp/verify/route.ts`, `src/app/api/golfer/profile/route.ts`, `src/app/api/operator/members/route.ts`, `src/lib/member-import.ts`, `src/lib/member-session.ts`

### InquiryStatusEvent

8 fields · 15 writer(s) · 9 reader(s)

- fields: `id`, `inquiryId`, `fromStatus`, `toStatus`, `trigger`, `actorName`, `createdAt`, `inquiry`
- writers: `src/app/api/admin/backfill-orphaned-inquiries/route.ts`, `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/admin/request-re-review/route.ts`, `src/app/api/calcom/webhook/route.ts`, `src/app/api/inquiries/details/route.ts`, `src/app/api/inquiries/route.ts`, `src/app/api/inquiries/signin-code/route.ts`, `src/app/api/inquiries/signin-verify/route.ts`, `src/app/api/operator/approve-page/route.ts`, `src/app/api/preview/[courseId]/approve/route.ts`, `src/app/api/preview/send/route.ts`, `src/lib/course-timeline.ts`, `src/lib/lifecycle.ts`, `src/lib/submit-change-request.ts`
- readers: `src/app/api/admin/courses/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/approve-page/route.ts`, `src/app/api/operator/courses/route.ts`, `src/app/api/preview/[courseId]/approve/route.ts`, `src/app/api/preview/[courseId]/route.ts`, `src/lib/approval-state.ts`, `src/lib/course-timeline.ts`, `src/lib/sheet-token.ts`

### MembershipTier

19 fields · 4 writer(s) · 5 reader(s)

- fields: `id`, `courseId`, `course`, `name`, `color`, `greenFeeWeekdayCents`, `greenFeeWeekendCents`, `cartFeeWeekdayCents`, `cartFeeWeekendCents`, `discountPct`, `advanceBookingDays`, `guestPassesPerYear`, `annualFeeCents`, `initiationFeeCents`, `termMonths`, `notes`, `active`, `createdAt`, `memberships`
- writers: `src/app/api/admin/create-course/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/tiers/route.ts`, `src/lib/lifecycle.ts`
- readers: `src/app/api/admin/course-members/route.ts`, `src/app/api/operator/members/route.ts`, `src/app/api/operator/tiers/route.ts`, `src/lib/analytics.ts`, `src/lib/member-import.ts`

### Message

10 fields · 3 writer(s) · 6 reader(s)

- fields: `id`, `threadId`, `senderType`, `senderId`, `senderName`, `body`, `readAt`, `isBroadcast`, `createdAt`, `thread`
- writers: `src/app/api/admin/messages/route.ts`, `src/app/api/operator/messages/route.ts`, `src/lib/submit-change-request.ts`
- readers: `src/app/api/admin/course-detail/route.ts`, `src/app/api/admin/messages/route.ts`, `src/app/api/admin/nav-badges/route.ts`, `src/app/api/operator/messages/route.ts`, `src/lib/course-timeline.ts`, `src/lib/operator-home.ts`

### MessageThread

9 fields · 4 writer(s) · 6 reader(s)

- fields: `id`, `courseId`, `adminLastEmailAt`, `operatorLastEmailAt`, `closedAt`, `updatedAt`, `createdAt`, `course`, `messages`
- writers: `src/app/api/admin/messages/route.ts`, `src/app/api/operator/messages/route.ts`, `src/lib/data-reset.ts`, `src/lib/submit-change-request.ts`
- readers: `src/app/api/admin/messages/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/api/operator/messages/route.ts`, `src/lib/admin-action-queue.ts`, `src/lib/data-reset.ts`, `src/lib/submit-change-request.ts`

### MonthlyReview

13 fields · 2 writer(s) · 3 reader(s)

- fields: `id`, `courseId`, `course`, `month`, `isBaseline`, `metrics`, `status`, `body`, `model`, `error`, `emailedAt`, `createdAt`, `updatedAt`
- writers: `src/lib/data-reset.ts`, `src/lib/monthly-review.ts`
- readers: `src/app/api/operator/monthly-reviews/route.ts`, `src/lib/data-reset.ts`, `src/lib/monthly-review.ts`

### Nine

8 fields · 2 writer(s) · 9 reader(s)

- fields: `id`, `courseId`, `course`, `name`, `par`, `sortOrder`, `createdAt`, `teeSetYardages`
- writers: `src/app/api/admin/inquiries/route.ts`, `src/app/api/operator/nines/route.ts`
- readers: `src/app/api/admin/course-detail/route.ts`, `src/app/api/operator/course-products/route.ts`, `src/app/api/operator/events/route.ts`, `src/app/api/operator/nines/route.ts`, `src/app/api/operator/tee-sets/route.ts`, `src/lib/course-events.ts`, `src/lib/course-shape-setup.ts`, `src/lib/schedule-preview.ts`, `src/lib/schedule-service.ts`

### OwnerDevice

13 fields · 2 writer(s) · 2 reader(s)

- fields: `id`, `adminId`, `admin`, `tokenHash`, `label`, `ip`, `approvalTokenHash`, `approvalExpiresAt`, `approvedAt`, `revokedAt`, `createdAt`, `lastUsedAt`, `sessions`
- writers: `src/app/api/admin/owner-devices/route.ts`, `src/lib/owner-session.ts`
- readers: `src/app/api/admin/owner-devices/route.ts`, `src/lib/owner-session.ts`

### OwnerPasskey

10 fields · 2 writer(s) · 2 reader(s)

- fields: `id`, `adminId`, `admin`, `credentialId`, `publicKey`, `counter`, `transports`, `name`, `createdAt`, `lastUsedAt`
- writers: `src/app/api/admin/passkeys/route.ts`, `src/lib/owner-passkey.ts`
- readers: `src/app/api/admin/passkeys/route.ts`, `src/lib/owner-passkey.ts`

### OwnerSession

13 fields · 2 writer(s) · 1 reader(s)

- fields: `id`, `adminId`, `admin`, `deviceId`, `device`, `method`, `ip`, `userAgent`, `createdAt`, `expiresAt`, `lastSeenAt`, `revokedAt`, `stepUpAt`
- writers: `src/app/api/admin/owner-devices/route.ts`, `src/lib/owner-session.ts`
- readers: `src/lib/owner-session.ts`

### PaymentEvent

10 fields · 1 writer(s) · 10 reader(s)

- fields: `id`, `bookingId`, `booking`, `kind`, `amountCents`, `stripeId`, `actor`, `actorName`, `detail`, `createdAt`
- writers: `src/lib/refund-booking.ts`
- readers: `src/app/api/admin/revenue/route.ts`, `src/app/api/admin/transactions/export/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/access-fee.ts`, `src/lib/admin-home.ts`, `src/lib/admin-today.ts`, `src/lib/course-timeline.ts`, `src/lib/money-problems.ts`, `src/lib/no-show-fee.ts`, `src/lib/receipt-charges.ts`

### RateLimit

3 fields · 0 writer(s) · 0 reader(s)

- fields: `key`, `count`, `windowStart`
- writers: **none** — nothing in `src/` writes this model
- readers: **none**

### SentMessage

11 fields · 2 writer(s) · 3 reader(s)

- fields: `id`, `channel`, `kind`, `to`, `courseId`, `bookingId`, `inquiryId`, `status`, `providerId`, `error`, `createdAt`
- writers: `src/lib/data-reset.ts`, `src/lib/sent-messages.ts`
- readers: `src/lib/course-timeline.ts`, `src/lib/data-reset.ts`, `src/lib/dispute-evidence.ts`

### ShopItem

19 fields · 2 writer(s) · 3 reader(s)

- fields: `id`, `courseId`, `course`, `name`, `category`, `priceCents`, `active`, `sortOrder`, `stockCount`, `sku`, `parentId`, `parent`, `options`, `optionLabel`, `taxCategory`, `createdAt`, `updatedAt`, `sales`, `saleLines`
- writers: `src/app/api/operator/shop-items/route.ts`, `src/lib/shop-catalog.ts`
- readers: `src/app/api/operator/shop-items/route.ts`, `src/lib/shop-catalog.ts`, `src/lib/shop-sales.ts`

### ShopSale

25 fields · 4 writer(s) · 5 reader(s)

- fields: `id`, `courseId`, `course`, `status`, `totalCents`, `taxCents`, `taxCalculationId`, `taxTransactionId`, `customerName`, `customerPhone`, `customerEmail`, `payToken`, `paymentIntentId`, `chargeStartedAt`, `paidAt`, `voidedAt`, `soldBy`, `createdAt`, `discountCents`, `discountNote`, `cashTenderedCents`, `refundedCents`, `receiptSentAt`, `refunds`, `lines`
- writers: `src/app/api/operator/shop-sales/route.ts`, `src/lib/data-reset.ts`, `src/lib/sales-tax.ts`, `src/lib/shop-sales.ts`
- readers: `src/app/api/operator/shop-sales/route.ts`, `src/lib/analytics.ts`, `src/lib/data-reset.ts`, `src/lib/sales-tax.ts`, `src/lib/shop-sales.ts`

### ShopSaleLine

8 fields · 0 writer(s) · 0 reader(s)

- fields: `id`, `saleId`, `sale`, `shopItemId`, `shopItem`, `name`, `unitPriceCents`, `quantity`
- writers: **none** — nothing in `src/` writes this model
- readers: **none**

### ShopSaleRefund

14 fields · 1 writer(s) · 2 reader(s)

- fields: `id`, `saleId`, `sale`, `courseId`, `amountCents`, `method`, `status`, `stripeRefundId`, `taxReversalId`, `reason`, `restocked`, `error`, `createdBy`, `createdAt`
- writers: `src/lib/shop-sales.ts`
- readers: `src/app/api/operator/shop-sales/route.ts`, `src/lib/shop-sales.ts`

### StaffPermissionChange

7 fields · 1 writer(s) · 2 reader(s)

- fields: `id`, `courseId`, `staffId`, `changedBy`, `before`, `after`, `createdAt`
- writers: `src/app/api/operator/staff/route.ts`
- readers: `src/app/api/operator/staff/route.ts`, `src/lib/course-timeline.ts`

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

22 fields · 9 writer(s) · 27 reader(s)

- fields: `id`, `courseId`, `course`, `date`, `time`, `holes`, `playersAvailable`, `playersBooked`, `greenFeeCents`, `memberRateCents`, `residentRateCents`, `cartFeeCents`, `walkingAllowed`, `tierName`, `status`, `createdAt`, `bookings`, `teeTimeAlerts`, `eventId`, `event`, `productId`, `product`
- writers: `src/app/api/operator/blackouts/route.ts`, `src/app/api/operator/tee-times/route.ts`, `src/lib/course-events.ts`, `src/lib/data-reset.ts`, `src/lib/frost-delay.ts`, `src/lib/lifecycle.ts`, `src/lib/schedule-service.ts`, `src/lib/tee-sheet-engine.ts`, `src/lib/weather-cancel.ts`
- readers: `src/app/api/admin/tee-sheet/route.ts`, `src/app/api/bookings/resident-rate/route.ts`, `src/app/api/bookings/route.ts`, `src/app/api/manage/[bookingId]/available-times/route.ts`, `src/app/api/manage/[bookingId]/swap-time/route.ts`, `src/app/api/member/[courseSlug]/tee-times/route.ts`, `src/app/api/operator/bookings/route.ts`, `src/app/api/operator/events/[id]/route.ts`, `src/app/api/operator/tee-times/route.ts`, `src/app/api/preview/[courseId]/route.ts`, `src/app/api/preview/[courseId]/tee-times/route.ts`, `src/lib/admin-home.ts` +15 more (see `docs/codemap.json`)

### TeeTimeAlert

14 fields · 5 writer(s) · 5 reader(s)

- fields: `id`, `courseId`, `course`, `email`, `name`, `date`, `windowStart`, `windowEnd`, `players`, `teeTimeId`, `teeTime`, `token`, `notifiedAt`, `createdAt`
- writers: `src/app/api/alerts/route.ts`, `src/app/api/alerts/unsubscribe/[token]/route.ts`, `src/lib/cancel-booking.ts`, `src/lib/data-reset.ts`, `src/lib/lifecycle.ts`
- readers: `src/app/api/alerts/route.ts`, `src/app/api/alerts/unsubscribe/[token]/route.ts`, `src/lib/analytics.ts`, `src/lib/cancel-booking.ts`, `src/lib/data-reset.ts`

### TeeTimeSchedule

23 fields · 4 writer(s) · 9 reader(s)

- fields: `id`, `courseId`, `course`, `tierName`, `daysOfWeek`, `startTime`, `endTime`, `intervalMinutes`, `holes`, `greenFeeWeekdayCents`, `greenFeeWeekendCents`, `memberRateWeekdayCents`, `memberRateWeekendCents`, `residentRateWeekdayCents`, `residentRateWeekendCents`, `cartFeeCents`, `walkingAllowed`, `cartFeeWeekendCents`, `walkingWeekend`, `active`, `createdAt`, `productId`, `product`
- writers: `src/app/api/admin/create-course/route.ts`, `src/app/api/admin/inquiries/route.ts`, `src/lib/lifecycle.ts`, `src/lib/schedule-service.ts`
- readers: `src/app/api/operator/course-products/route.ts`, `src/app/api/operator/residents/route.ts`, `src/app/api/operator/tee-times/route.ts`, `src/lib/birdie/course-context.ts`, `src/lib/course-events.ts`, `src/lib/course-shape-setup.ts`, `src/lib/schedule-preview.ts`, `src/lib/schedule-service.ts`, `src/lib/tee-sheet-engine.ts`

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

