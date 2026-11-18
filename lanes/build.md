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
  - The member invite goes out only once the membership is active (Build 2026-11-18: no email before the dues are paid). Done in 2c.
  - /api/operator/members allows contact edits on golfer-linked members, since no golfer account signs in now.
  - Once the Dashboard lane removes the Join online control, the tiers route stores 'off' and the membership-join
    helpers are deleted.
  - The manage page says "Log in first to keep your member rate" when an expired member moves a booking from the
    emailed link.
- Tee time alerts (`lanes/golfer.md` item 7): `TeeTimeAlert` grows multiple dates (no "weekends" kind), time of
  day, players, an optional phone with its own alert-text consent, the logged-in one-tap path (no email confirm), the
  course switch "Let golfers set tee time alerts", and a stop link in every email. An alert ends after the last tee
  time on its last date and fires at most once per date (ALERTS-2). Additive migration. The "ends after the day's last
  tee time unless the course sets a later end" rule belongs to the Course alert LINE, built with Course alert.
- Range balls on online bookings (`lanes/golfer.md` item 5): the data side is in the RANGE-1 PR (switch
  `Course.sellRangeOnline`, `range_buckets` on the public course, `rangeBuckets: [{ id, qty }]` on POST /api/bookings,
  inside the round's price, settled wherever the round is). Left for the Golfer lane: the −/+ section in the new Book
  page design (BookClient has a plain working version).
- RANGE-1 after launch (Cam 2026-11-17, "after launch, not now"): range-only online sales (buckets bought with no tee
  time) and prepaid range cards. Both sell from the same bucket list (`lib/range-buckets`).
- RANGE-1 for Cam: online buckets ride the round (no sales tax, no 1% shop fee, as before); the same bucket at the
  register carries both where the course has them on. Same list price; the add-ons differ by channel. Decide
  whether that stays.
- #458 Build follow-ups: the server messages that still suggest "take cash instead" (pay-link limits, reader minimums,
  a $0 sale) follow `takesCash`; add a test that charge to account still settles with cash off; the #458 migration's
  timestamp sorts before `20261117193347_team_roles` (applied fine; note only).
- Legal list: the Terms must cover a golfer logging in at a course (the first-log-in agree box). Add a version; never
  edit a published file under `legal/`.
- Booking page look (Cam 2026-11-18): in Settings → Your course → Booking Page, a course picks Light or Dark for its golfer booking pages, plus one accent from four presets (Black, Green, Blue, Yellow, where Yellow is a deep gold so white text passes AA; no Red, Cam: red is for errors) instead of a free colour picker. Data: a new `Course.bookingLook` ('light'|'dark', default 'light', additive), and a separate `Course.bookingAccent` stored by preset NAME (nullable, NO default; server allowlist, red refused; each preset has light and dark values in `BOOKING_ACCENT_COLOURS`, lib/booking-look). Until a course first saves a look, the payload's `booking_look.accent` is null and every golfer page MUST fall back to `brand_color` (never index the presets with null); a null accent ignores the look too and renders today's light page, so nothing changes for an existing course. `brandColor` stays a free hex for receipts, emails and the dashboard rail, so no backfill is needed (built in #480, BOOKING-LOOK-1). The golfer pages (course page, booking page, sign-in, confirmation, manage, pay, receipt) read both, and every combination passes WCAG AA. Build it with the golfer booking page build.
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
- AI assistant overhaul — PLAN, mockup waiting for Cam (Cam 2026-11-18: "setting parameters, having it have
  GreenReserve personalized information, a cache it can access specific to each course and the admin's own, as well
  as maybe a little question bot on the homepage and the golfer facing"; "everything has to be done before launch").
  Mockup: `lanes/build/ai-assistant-mockup.html` (https://claude.ai/artifact/E2uiLWJ2YfBCX7LJmXxUCR). Nothing is built until Cam approves it.
  Today: the dashboard assistant (operator persona, `src/app/api/birdie/chat/route.ts`, `src/lib/birdie/*`) answers
  how-to questions on `claude-haiku-4-5` and runs tool turns on `claude-opus-5-5` (effort low), reads live data
  through `tools.ts`, drafts changes as confirm cards (`proposals.ts`, never writes on its own), with caps and the
  `BIRDIE_ENABLED` + `ANTHROPIC_API_KEY` kill switch in `guardrails.ts`. Admin has its own read-only Ask
  (`src/lib/admin-ask.ts`). No golfer or homepage bot exists. Marketing copy says "an AI assistant", never "Birdie";
  no dog artwork; course-world pages carry no GreenReserve/Birdie branding (DECISIONS: Birdie rules).
  1. **Per-course knowledge ("course brief").** One server function builds a plain-text brief per course from the
     course's own data only: settings, schedules and rates, policies through `describePolicy()` (verbatim, never
     paraphrased by code), hours, closures (`Blackout`), live course alert and conditions, upcoming events, range
     buckets, member groups and their benefits (names and rules, never member names), and the FAQs the course
     writes (new `CourseAssistantNote` rows: question, answer, audience staff|golfers, additive). Scoped by the
     session's or page's courseId with no cross-course read. Stored as a cached snapshot (new `CourseBrief` row:
     courseId, text, version hash, builtAt; WIPED_TABLES) rebuilt when any input changes (the settings, schedule,
     policy, blackout, event, alert and FAQ write paths call `markBriefStale(courseId)`; a rebuild runs in `after()`
     or on next read). The brief sits in the system prompt behind a `cache_control` breakpoint after a frozen
     persona prompt (prefix: persona → brief → conversation), so repeat questions read it from Anthropic's prompt
     cache; volatile text (today's date, tee-sheet numbers) goes after the breakpoint or through tools, never into
     the cached prefix. Check `usage.cache_read_input_tokens` in a test run.
  2. **Admin's own knowledge.** Owner-only brief from platform docs and runbooks (selected `docs/*.md` and
     `company/` files Cam marks, read at build time into a server-only bundle; never `AUDIT_MASTER.md`, never
     secrets or customer data), plus the existing read-only Ask tools. Same caching pattern; only owner sessions
     (`gr_owner`) reach it; `areaGate` as today.
  3. **Course settings for the assistant** (Settings → Assistant, `settings.edit`): on/off for staff and for
     golfers separately; tone (Friendly · Brief · Formal); what golfers may ask about (checkboxes: tee times and
     prices, policies, course info and directions, events, memberships and log-in); the hand-off line ("Call the
     pro shop at …" from the course phone); FAQs list; "What it knows" with the last refresh time and a Refresh
     button. All changes audited (`CourseSettingChange`).
  4. **Homepage bot** (greenreserve.app only): answers what GreenReserve is and does from the approved homepage
     and feature-page copy plus the allowed fee sentences in `legal/LQ-2_FEE_COPY.md` only, and offers "Book a
     call" (the Cal.com embed). No tools, no account data, no course data. Says it can't help with a booking and
     points golfers to their course. A launcher at the bottom right and a sheet (phone) or panel (desktop).
  5. **Golfer bot on the booking page** (course look, no GreenReserve/Birdie branding, labelled "Questions about
     <Course>"): answers ONLY from that course's brief, limited to the topics the course allowed. Never invents
     or rewords policy, refund or fee wording: when asked, it quotes `describePolicy()` lines and the fee wording
     exactly as the booking page shows them. Never takes payment, books, cancels, moves or refunds; it links to
     the page that does (Book, Manage booking). Doesn't know who the golfer is beyond an optional member log-in,
     and never reads bookings. When the brief doesn't cover it: "I'm not sure. Please call the pro shop at
     <phone>." Off by default until the course turns it on.
  6. **Abuse, cost and privacy.** Rate limits per IP and per session on the public bots (Upstash
     `rateLimit()`), a daily cap per course and a platform cap (existing `PLATFORM_PER_DAY` split per persona),
     the kill switch per persona. Course-written text (FAQs, alert text, event blurbs) and golfer messages are DATA:
     wrapped and labelled in the prompt, never instructions; the persona prompt says so; no tool on the public
     bots. No PII in prompts beyond what the question needs (no golfer emails, phones or names in the brief).
     Logs keep persona, courseId, token counts and a refusal flag, never message text with personal data or any
     key. Every reply checks `stop_reason` (`refusal`, `max_tokens`) and shows a plain fallback.
  7. **Models and keys.** Default `claude-opus-5-5` per the claude-api skill, effort `low` for chat turns and the
     existing tool turns; replace `claude-haiku-4-5` in `guardrails.ts` only on Cam's say (cost: he chose the
     cheap first turn on 2026-10-05). Use the server-side refusal `fallbacks` parameter on Opus 5.5 requests. The
     key stays server-only (`ANTHROPIC_API_KEY`, never `NEXT_PUBLIC_`). FLAG: the key may not be set in Vercel yet;
     the assistant, the security checker and the morning digest all need it (Cam to-do).
  8. **Build order once approved:** brief + cache + settings (Build, final-reviewer) → dashboard and admin
     wiring → golfer bot (Golfer lane UI, Build route) → homepage bot (Homepage lane UI, Build route).
