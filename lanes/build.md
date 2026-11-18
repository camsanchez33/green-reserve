# Build lane — coordinator and shared code

Read CLAUDE.md, LANES.md and this.

Build owns `src/lib`, `src/app/api`, `prisma`, `globals.css`, CI, `.claude/`,
CLAUDE.md, LANES.md and the specs; makes every mockup; answers Cam's comment threads; writes approved decisions into
the lane files; merges every PR in dependency order after Cam's review sitting; regenerates `STATUS.*`.

**Control Room** (Cam watches it): Build alone writes https://claude.ai/artifact/CWmgjgJHTZaTr4XThBuvZL with `ArtifactData`: its own `sessions/<id>` row at start, after each push/merge/blocker and before ending (a `working` row silent 30 min shows as Silent), and the web (`areas`, `items`, `questions`, `lookat`) after every merge, answer and change of plan. Full protocol: `docs/DECISIONS.md` → "Control Room".

## Queued (not started)
- Residents log in — NEXT (Cam 2026-11-18). Resident cards become a `gr_member` group, so a resident logs in with the
  one per-course "Log in" and gets the resident rate online. Until then, the online resident rate works only for a
  member whose log-in email is on that course's resident list (signedInResident(), after the golfer-sign-in
  retirement). Money and auth: Opus, final-reviewer.
- Golfer log-in data (`lanes/golfer.md` items 2–4): record the first-log-in terms tick per golfer per course with its
  version; the two-groups rule (lower price, longer window); guest pass use at checkout (a tick per guest, counted
  against `guestPassesPerYear`); the header group label; and the group list for the log-in line. Also, after #477:
  - Rewrite the member emails and pages to "Log in" wording.
  - The member invite goes out only when the membership is active; otherwise it says "once your dues are paid".
  - /api/operator/members allows contact edits on golfer-linked members, since no golfer account signs in now.
  - Once the Dashboard lane removes the Join online control, the tiers route stores 'off' and the membership-join
    helpers are deleted.
  - The manage page says "Log in first to keep your member rate" when an expired member moves a booking from the
    emailed link.
- Tee time alerts (`lanes/golfer.md` item 7): `TeeTimeAlert` grows multiple dates or "weekends", time of day,
  players, an optional phone with its own alert-text consent, the logged-in one-tap path (no email confirm), the
  course switch "Let golfers set tee time alerts", and a stop link in every email. Keep the queued expiry rule (an
  alert ends after the day's last tee time unless the course sets a later end). Additive migration.
- Range balls on online bookings (`lanes/golfer.md` item 5): the course switch "Sell range balls with tee times";
  buckets from the Range settings priced on the booking as their own line and paid with the round (`describePolicy()`
  wording, `recordMove()` when charged).
- #458 Build follow-ups: the server messages that still suggest "take cash instead" (pay-link limits, reader minimums,
  a $0 sale) follow `takesCash`; add a test that charge to account still settles with cash off; the #458 migration's
  timestamp sorts before `20261117193347_team_roles` (applied fine; note only).
- Legal list: the Terms must cover a golfer logging in at a course (the first-log-in agree box). Add a version; never
  edit a published file under `legal/`.
- Booking page look (Cam 2026-11-18): in Settings → Your course → Booking Page, a course picks Light or Dark for its golfer booking pages, plus one accent from four presets (Black, Green, Blue, Yellow, where Yellow is a deep gold so white text passes AA; no Red, Cam: red is for errors) instead of a free colour picker. Data: a new `Course.bookingLook` ('light'|'dark', default 'light', additive), and `brandColor` limited to the four preset values. Existing custom colours are mapped to the nearest preset only with Cam's OK, because that's a backfill; until then they render as they are. The golfer pages (course page, booking page, sign-in, confirmation, manage, pay, receipt) read both, and every combination passes WCAG AA. Build it with the golfer booking page build.
- Audit data (Cam approved 2026-11-18): /api/admin/audit gains q (search over action, actor, course, reason and changed fields across all dates, LIKE-escaped through like-exact) plus from/until. Owner only.
- Small Build text fixes: the admin-areas.ts help for 'golfers' still says "resend, cancel and refund"; the search route nav label still says "Golfer lookup".
- LIKE wildcard escape on email matching: in progress (session_014ceBnuw4aR9nRiD5mdt9bL).
- The admin course page refund button (useCourseDetail.tsx) goes with the /api/admin/refund removal.
- Golfers: "Paid in total" leaves out cash rounds; the list needs a SQL rollup past tens of thousands of bookings; audit-on-open waits for Cam.
- After #458 (Takes cash): the Dashboard lane updates TakesCashToggle wording and owner-only access, and hides cash buttons when `Course.takesCash` is false. Cash routes answer 409 { error, cashOff: true }. Build rewords the "take cash instead" server messages (shop-sales pay-link limits, card-reader minimum) by takesCash.
- Golfer lane: the golfer confirmation page shows the new confirmation-email parts (arrival, parking, contact, dress code) from #457.
- #457 Test reader: one Stripe test-mode run of the $0.00 reader display, before courses rely on it.
- After launch, if Cam wants them: alert channels and quiet hours in Settings.
- Action queue: two chats due at the same moment are ordered by a tiebreak (#454); keep the isolation test data unambiguous (#455).
- Inquiries data (Cam approved 2026-11-17, `lanes/admin.md`): course contacts (role, decision maker, best time), course facts, outreach stages from Target to Said yes with the Onboarding handoff, Cal.com call list and detail from the existing webhook data, agenda notes and outcome per call, an add-course search over public data with duplicate check, and CSV import. Additive migration.
- Golfers: counsel item. A privacy and golfer-terms version that says staff can view booking and payment history for support (never edit a published agreement; add a version).
- Team data (Cam approved 2026-11-17, `lanes/dashboard.md` item 8): editable roles with the course starting at Owner only, suggested roles, invite by email with an optional phone, a full welcome email via getResend, reset password by link, last active, and per-person overrides. Permission changes are written to the audit log. Opus and final-reviewer (access control).
- Course alert data (Cam approved 2026-11-17, `lanes/dashboard.md` item 7): conditions with updated-by and when, extra fields (status, wetness, temporary rules), custom conditions with add and delete, alert history, delayed-start reason. Delayed start and Close for weather reuse frost-delay and weather-cancel.
- `lib/analytics.ts` defects (found by Analytics review): policy(fee) reads cancellationFeeApplies on live bookings, so the "with fee" side is always empty; the booking-event query passes an unchunked id list, which errors at about 32k cancelled bookings in a range. Fix with tests.
- Analytics Filter: after launch, if Cam wants it. Booking counts only, money unfiltered.
- Company docs data (Cam approved 2026-11-17, `lanes/admin.md`): custom labels, document versions on Replace, open/upload/replace/delete history in the audit log, and a step-up (second factor) on delete; additive migration, owner only.
- Events data (Cam approved 2026-11-17, `lanes/dashboard.md` item 3): course-editable lists, sign-up question builder, terms presets driving refunds and Cancel event through describePolicy, event-day timeline, food count, rain plan; reminders only through sendSms(); event terms to counsel with the agreements.
- Settings data (item 6): confirmation email parts + test send, sales tax default from the course address, reader test, plus the per-setting save routes the popups need.
- Admin Security AI checker (`lanes/admin.md`): cron (cronRoute, vercel.json) at 7 AM / 7 PM plus spike triggers, model call, allowlisted reversible actions with Undo, Approve-fix queue, every action audited; Opus and final-reviewer.
- Analytics data (Cam 2026-11-17 approved the page, `lanes/dashboard.md` item 5): projections for the next 30 days against the last 30, no-shows by how they booked, spots filled again by cancel lead time, pro shop stock value, and the written monthly reports with a PDF download. Every money number comes from the ledger views. Agree the shape with the Dashboard lane first.
- Cam 2026-11-16 answers: admin change-password hardening (5 tries then 15 min lockout, 12-character minimum, securityEvent) and a blank member price line = a PUBLIC booking (promo and resident rate can apply, best price wins, never stacked) are in PRs from session_014ceBnwhjCVc1RW659Fcart. One-time-fee memberships and memberships with no end date wait until AFTER launch.
- Outreach (Cam 2026-11-16): see `lanes/outreach.md`. Emails start Dec 1. Prep starts Nov 23, sending from admin@greenreserve.app through Google Workspace Gmail (decided).
- Memberships data (Cam 2026-11-16 approved the page; money and schema, Opus, final-reviewer, one PR each, in this order):
  1. Every dues and season-pass payment recorded once via recordMove, so it shows in Revenue as Membership dues. Cash for dues and passes goes through the register: requireRegisterOpen, counted in the close-out's expected cash, shown on the register. Adding a member takes payment first (reader, cash, or a typed card through Stripe Elements) and they are a member only once paid.
  2. Member numbers: an automatic per-membership prefix and sequence, never reused. A member photo upload (private blob, the same pattern as shop item photos).
  3. Member rates set against the course's own price list (each round type and cart; blank = public, 0 = free, or % off), plus a booking window of "public" or N days.
  4. Season passes: a membership kind with fixed start/end dates (every pass ends on the end date), buy online and/or at the course, rates per price-list line, and the 1% fee golfers pay on top.
  5. AFTER LAUNCH (Cam agreed): resident cards become a membership type, with proof of residency checked by staff and the card good at every course in the group. Move existing residents onto it and retire the separate resident pricing path and switch.
  Anything in 1–4 not merged by Nov 23 waits until after launch.
- My profile data: IN PR (branch `build/my-profile-password-date`), held for Cam. `AdminUser.passwordChangedAt` on `AdminSessionView`; see `docs/DECISIONS.md` → "Password date".
- Revenue data (for the Dashboard lane's Revenue page, approved 2026-11-15): the 30-day average-by-time-of-day line, Food & beverage from shop categories, the Stripe-mismatch detail (a refund made in Stripe directly, per day and per payment). Course-scoped, `requirePermission`, test courses excluded only where platform numbers are concerned. Agree the shape with the Dashboard lane first.
- Platform activity data (for the Admin lane's page): whatever the board needs that `/api/admin/system` doesn't return yet — Neon (up + last backup), Resend (key set, sending domain), Twilio (each key set), Vercel (commit live), GitHub (CI/backup runs link), per-service state; a "Re-run job" route for a cron (manager+, audited, same `cronRoute` wrapper); "Re-check" = re-read the same status. Agree the shape with the Admin lane first.
- Business analytics limits: a lead with only a logged reply isn't in any cohort; a pay-separately part's green fee
  drops out of "booked online".
