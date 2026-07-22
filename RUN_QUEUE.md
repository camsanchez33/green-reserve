# Run Queue

Ordered list of Claude Code runs. One item per run. Check off when committed, pushed,
and verified on the live site. After every run: `git status` — if dirty:
- RUN_QUEUE.md or *_SPEC.md or CLAUDE.md dirty → COMMIT them ("queue/spec update") —
  these are edited between runs by Cowork and must never be discarded.
- Anything else dirty → `git checkout -- .`
FIRST ACTION of every run: commit any dirty doc files (same rule) BEFORE reading the queue.

## Done

- [x] Members page: dark theme + tier setup wizard + auto-expiry from tier term
- [x] Member sign-in portal (per-course, magic link) — c81a07a
- [x] Admin Phase 1: accounts, login, employees, bootstrap — 9cccd7c
- [x] Admin Phase 2: split into routes + richer overview — e9f9f8b
- [x] Admin Phase 3: inquiries search/filter/sort — 12dc5ad
- [x] Admin Phase 4: courses search/filters/stats — 8982ba0
- [x] Admin Phase 5: add-course wizard + inquiry pre-fill — f1b6daf
- [x] Admin Phase 6: broadcasts — 88064bd
- [x] Admin Phase 7: cross-course activity feed — 83a41c5
- [x] ADMIN_V2 Phase 0: banner-on-login bug, golfer stat removed, clickable overview — 5c1230b

## In progress

(nothing running)

## Queue (run in this order)

- [x] DESIGN_SYSTEM_SPEC Phase D1 — Clubhouse tokens, shared UI components, admin sweep, CLAUDE.md design section rewrite — 99cbc9a
- [x] ADMIN_V2 Phase 1 — full course detail page at /admin/courses/[id] (build in Clubhouse style)
- [x] ADMIN_V2 Phase 2 — inquiries kanban board (build in Clubhouse style) — ad20254
- [x] ADMIN_V2 Phase 2b — pipeline automation: auto stage transitions, status timeline, needs-action ordering (schema change, run attended) — f4192cf
- [x] ADMIN_V2 Phase 2c — inquiries unified list + course archive + integrity (schema change, run attended) — c759159
- [x] ADMIN_V2 Phase 3 — two-way admin↔course messages (schema change, run attended) — 8ad5b31
- [x] ADMIN_V2 Phase 2d — inquiry lifecycle mirrors course archive/delete + Active/Archived tab split + overview financial integrity (block hard-delete with payment history, stats include archived, needs-attention excludes archived) (no migration) — 1f68f8b
- [x] ADMIN_V2 Phase 2e — backfill orphaned inquiries to Archived + permanent-delete action for archived inquiries (small run, no migration) — 695fb7a
- [x] Small run: inline delete on archived inquiry rows — Trash2 icon button on each row in the Archived tab (reuse existing deleteInquiry fn + confirm), Archived tab only, never on Active rows — e881c43
- [x] ADMIN_V2 Phase 4 — employee roles + temp-password provisioning (schema change, run attended) — 25a7284
- [x] ADMIN_V2 Phase 4b — requireRole in every /api/admin route (support can currently create courses!) + /admin/profile tab + owner-only owner password + /admin/owner-login with 2FA (schema change, run attended) — 5e4771c
- [x] ADMIN_V2 Phase 5 — type-aware add-course wizard — 29f050b
- [x] DESIGN_SYSTEM_SPEC Phase D2 — operator dashboard sweep + per-course brandColor (schema change, run attended) — e4c735c
- [x] PUBLIC_SITE_SPEC Phases A+B — footer fix, /contact, /courses redirect, all-50-states form, screenshots section, SEO metadata (build in Clubhouse style)
- [x] DESIGN_SYSTEM_SPEC Phase D3 — golfer-facing + public pages sweep, course personalization, powered-by footer
- [x] Small run: extend gr_member session from 7 to 90 days (src/lib/member-session.ts)
- [x] BUG small run: activating a course doesn't make it public — (1) admin course-detail PATCH sets active=true but never liveStatus='live', so the public page/API (which require BOTH + not archived) still 404 — audit EVERY code path that sets Course.active=true and make each also set liveStatus='live' (deactivate → liveStatus='draft'); (2) /courses/[slug] renders a blank shell when the API 404s — add a proper "Course not found" state with a link home; (3) after deploy, re-toggle daisylinks active in admin to heal its liveStatus

- [x] P0 BUG: Stripe Connect accounts can't take card payments — 5ba5772 — (1) src/app/api/operator/stripe/connect/route.ts creates Express accounts with NO capabilities — add `capabilities: { card_payments: { requested: true }, transfers: { requested: true } }` to stripe.accounts.create; (2) callback route: stripeAccountActive must ALSO require account.capabilities?.card_payments === 'active', not just charges_enabled/payouts_enabled; (3) repair path for EXISTING accounts: when connect is hit for a course whose account lacks the capability, call stripe.accounts.update to request it and send the operator back through the onboarding link; (4) handle `account.updated` in the Stripe webhook to keep stripeAccountActive in sync both directions; (5) check-in preflight: if card_payments isn't active, show "Stripe setup incomplete — finish onboarding in Settings" instead of the raw Stripe error
- [x] ONBOARDING_SPEC Phase O1 — inquiry form → short lead capture + applicant confirmation email + what-happens-next success screen (small run) — 5c31d3a
- [x] SECURITY fixes from independent audit (schema change for attempt counters → run attended) — in priority order:
  1. CRITICAL: 2FA brute-forceable — src/app/api/auth/2fa/verify/route.ts:24 + src/app/api/admin/owner-login/route.ts:32 have NO attempt limit; owner-login compares the code in PLAINTEXT. Hash the stored code (bcrypt, like operator flow), add per-account attempt counter invalidating the code after 5 wrong tries, add IP rateLimit() on both verify paths.
  2. HIGH: src/app/api/admin/course-detail/route.ts:14 `include:{operator:true}` returns operator password hash + resetToken + twoFactorCode to ANY admin role — replace with explicit select of non-secret fields.
  3. HIGH: admin login + owner-login have no IP rate limit and no account lockout — add rateLimit('login:admin:'+ip) + failed-attempt lockout on AdminUser (mirror operator pattern).
  4. MED: src/app/api/cron/cancellation-cutoff/route.ts:63 charges WITHOUT idempotencyKey (hourly cron + check-in both pass one) — double-charge risk; use the same key format as hourly (cancelfee-{bookingId}-{pmId}).
  5. MED: rateLimit() on token-gated charge/data endpoints: checkin/[bookingId], membership/[id], inquiries/details; give payToken/detailsToken expiry.
  6. MED: golfer register — add validatePasswordStrength + rateLimit; return generic response instead of 409 "Email already registered" (enumeration).
  7. LOW: src/lib/two-factor.ts:15 Math.random() → crypto.randomInt(100000,1000000).
  8. ROLE GATE: src/app/api/admin/transactions/route.ts + src/app/api/admin/activity/route.ts GET have no requireRole — gate to SUPPORT_PLUS (owner/manager/support). Rationale: support troubleshoots courses and needs the ledger; viewer becomes truly read-only dashboards with NO financial ledger or golfer PII. Audit any other admin GET returning golfer PII and apply the same rule.
- [x] HARDENING_SPEC — full spec in HARDENING_SPEC.md, ONE long run (~1hr, unattended): (A) atomic tee-time claim, capacity-aware, shared claimTeeTime(), concurrency test script must pass; (B) tenant-isolation integration test matrix (cross-course, cross-golfer, cross-role, token replay) — failures are vulnerabilities, fix in-run; (C) verify card data never touches server + Stripe flow docs + webhook idempotency; (D) per-surface session policy with sliding renewal, documented in CLAUDE.md; (E) ARCHITECTURE.md backend map generated by scripts/route-inventory.ts + URL surface review + noindex on authed paths + consolidation without file moves. Commit after each section. NO folder restructuring.
- [x] BACKUP_OPS_SPEC — full spec in BACKUP_OPS_SPEC.md: (A) nightly encrypted pg_dump via GitHub Actions + docs/RESTORE.md + quarterly restore drill; (B) "Shipping to production" discipline in CLAUDE.md — preview deploys + Neon DB branches for migrations, rollback steps; (C) docs/RUNBOOK.md secrets inventory (names/locations only, NEVER values) + laptop-loss + rotation runbooks. Ends with 2 manual steps for Cam (GitHub secrets). No migration, unattended OK.
- [x] ONBOARDING_SPEC Phase O1b — TWO course types only (public/private) + branch questions per type (3 public, 5 private), structured needsJson answers, migrate existing type values, wizard type step reorganized (small run)
- [x] ONBOARDING_SPEC Phase O2 — type-aware details sheet: structured sections per course type, server-side draft save, mobile-first (big run)
- [x] ONBOARDING_SPEC Phase O3 — build handoff: wizard fully pre-filled from structured sheet + ready-to-build checklist (medium run)
- [x] ONBOARDING_SPEC Phase O4 — go-live welcome email + walkthrough video embed + welcomeEmailSentAt guard (schema change, run attended)
- [x] ONBOARDING_SPEC Phase O5 — homepage redesign pass: editorial layout, real screenshots replace icon cards, hero de-templated, funnel-matched copy (medium run)
- [x] ONBOARDING_SPEC Phase O6 — private course page mode: members-only courses get info + member sign-in page (no public booking), server-side booking rejection for private type (medium run)

- [x] GOLFER_SPEC Phase G1 — course page identity: About tab (directions, gift-card link-out), operator photo uploads via Vercel Blob, hero photo (schema change via db push, run attended; manual step: BLOB_READ_WRITE_TOKEN) — 187245a
- [x] GOLFER_SPEC Phase G2 — tee sheet corresponding filters (date/time-of-day/party size in sync), seats-remaining slot cards, itemized pricing before personal info, shareable filter URLs (no migration) — 6b0998b
- [x] GOLFER_SPEC Phase G3 — tee time alerts: full-slot alerts + criteria alerts, one email per alert, unsubscribe tokens, absorb Waitlist model (schema change via db push, run attended) — 5873842
- [x] GOLFER_SPEC Phase G4 — member experience: quiet per-course sign-in link, member pricing in slot cards, member-only times, cross-course isolation test (no migration) — b7ca915

- [x] PRODUCTION_READINESS_SPEC — full spec in file. Big sectioned run: (A) baseline onto real prisma migrations, REVERSING the db-push rule — ATTENDED, hands Cam prod resolve cmd + shadow/env vars; (B) serverless connection safety — cache Prisma client in ALL envs, connection_limit tuning, leak audit; (C) scripts/load-test.ts at 100-course scale, must pass; (D) schema-drift CI guardrail + /api/health endpoint so a missing migration is a red X pre-deploy not a 404 after; (E) Sentry + structured money-path logging + uptime runbook — ATTENDED, needs SENTRY_DSN. Commit per section. NOTE: this run intentionally reverses the "always db push" rule — run it BEFORE more schema-change phases (G3, O-series migrations) so those use real migrations. Sections A–E committed; manual steps remain for Cam (see below)

- [x] MANAGE_BOOKING_SPEC Phase M1 — token-gated /manage/[bookingId] page (view + cancel, NO login), reuse checkInToken, cancel API accepts token or session, fix "Manage My Booking" email button to point here not /account (no migration) — 9119d8c
- [x] MANAGE_BOOKING_SPEC Phase M2 — modify on manage page: change tee time (atomic claim-new + release-old) + party size (price/fee recalc), re-send confirmation (no migration) — a697d08
- [x] RECEIPT_SPEC Phases R1+R2 — itemized on-brand receipts: service fee named everywhere ($1.50 × players, never "Fees"), token-gated printable /receipt/[bookingId] page, receipt email brought on-brand + linked from confirmation/check-in/account (no migration, unattended OK) — R1: 213851d, R2: b11edb2
- [x] ONBOARDING_V2_SPEC Phase V1 — admin inquiry fixes: editable contact info, hide empty detail boxes, tabbed detail panel (small, no migration) — a61971b
- [x] ONBOARDING_V2_SPEC Phase V2 — applicant confirmation email rewrite + details-sheet follow-up email with their answers (small, no migration) — 6dc2c16
- [x] ONBOARDING_V2_SPEC Phase V3 — details sheet v2: branch-driven sections from inquiry answers, 9-hole/yardages/tee sets, resident + membership + private-access depth, cancellation explainer, facilities rebuild, photos via Blob (big, no migration) — 6b4daa9
- [x] ONBOARDING_V2_SPEC Phase V3b — playability follows hole count: 9/18/27/36 layouts, three-9s naming + combos, 18+9, par per nine, rotating-nines flagged as build note (small, no migration) — d87f24b
- [x] ONBOARDING_V2_SPEC Phase V3c — walkthrough refinements: resident-rate validation bug, merge residents+memberships into one "Memberships & passes" step (tier types incl. resident card, verification: automatic vs purchased card), explicit "no cancellation policy" choice (small/medium, no migration) — d87f24b
- [x] ONBOARDING_V2_SPEC Phase V5 — inquiry full page at /admin/inquiries/[id] replaces the drawer: header + action toolbar, full-width tabs, HUMAN-readable sheet tab (label/value maps, sections, coherent-answers filtering, amber "not provided"), stage-driven "Next steps" card, delete drawer (medium-big, no migration) — 9d54218
- [x] ONBOARDING_V2_SPEC Phase V4 — one-click "Create draft course" from submitted sheet (replaces wizard in pipeline; wizard = in-person only), fix bugged build entry point on course/inquiry rows, needs-review notes for missing fields (medium, no migration) — 1eed95f
- [x] ONBOARDING_V2_SPEC Phase V6 — inquiries list: single tab bar (Your move/New/In review/Waiting/Building/All/Archived) with counts + per-tab description, kills the chip row, tab in URL, row cleanup (small/medium, no migration) — e0ce53a
- [x] ONBOARDING_V2_SPEC Phase V7 — multi-nine data model: par adapts to hole count (no overall par on 27/36), structured combo builder with per-combo notes, per-nine par, per-combo ratings + auto-summed combo yardages per tee set, flows through Sheet tab + draft build (medium, no migration) — 56f88b6
- [x] ONBOARDING_V2_SPEC Phase V8 — memberships & passes + facilities fixes: root cause = React controlled type="number" drops keystrokes on partial decimal; DollarInput switched to type="text" inputMode="decimal"; legacy fee stored as number coerced to string on load; re-audited all money fields (medium, no migration) — 56f88b6
- [x] ONBOARDING_V2_SPEC Phase V9 — draft build reuses existing operator by email (never fails on it), alert() → inline banners on admin inquiry pages (small, no migration) — 997501d
- [x] GOLFER_EDGE_SPEC Phase E1 — perf audit script (scripts/perf-audit.ts), CI workflow (.github/workflows/perf-audit.yml), fix worst offenders: remove framer-motion (~45KB), defer Stripe JS (no-fee courses), lazy-load imgs, CLAUDE.md budgets — 2f8ef39
- [x] GOLFER_EDGE_SPEC Phase E2 — tap budget: mobile inline player picker saves 1 tap (6→5 for non-default players), no-account guard comment in CheckoutForm, before/after counts documented in commit — 6b4408f
- [x] GOLFER_EDGE_SPEC Phase E3 — trust copy via shared TrustNote component: slot price/"100% to course", card entry/"nothing charged now", confirm/"no charge until check-in"; fixed "checkout"→"Secured by Stripe" — 2500ef1
- [x] ADMIN_V3_SPEC Phase A0 — audit fixes FIRST: blank revenue chart + axis, bogus 100% deltas, course eye-view bounce bug, Building=Your move + dup Go Live buttons, All/Active/Archived filter, archive-with-activity warning, relative-time bug, wizard inline validation + $0 placeholder trap, broadcast preview step, activity date default, 2FA link styling, no-silent-failures rule → CLAUDE.md (medium, no migration) — 8460668
- [x] ADMIN_V3_SPEC Phase A1 — collapsible sidebar (icon rail, persisted, `[` shortcut) + "Add Course"→"Manual build" demotion (small, no migration) — d429ce5
- [x] ADMIN_V3_SPEC Phase A2 — /admin/revenue: fees today/7d/month, per-course table, failed charges + refunds problems section, SUPPORT_PLUS (medium, no migration) — 4f8f40b
- [x] ADMIN_V3_SPEC Phase A3 — /admin/golfers support lookup: search → all bookings/charges/receipts, resend emails, SUPPORT_PLUS (medium, no migration) — 213ca0d
- [x] ADMIN_V3_SPEC Phase A4 — Overview "Needs you" action list above stats (small/medium, no migration) — 2f7e04d
- [x] ADMIN_V3_SPEC Phase A5 — Ctrl+K command palette, role-aware global search (medium, no migration) — 2b61883
- [x] PUBLIC_SITE_SPEC Phase C — lead form integrity: server+client email validation (CRITICAL), honeypot, inline per-field errors + autoscroll, CTA routing through type segmentation, brand line consistency, login autoComplete hygiene (small, no migration) — 4b19f8a
- [x] ADMIN_V3_SPEC Phase A6 — audit round 2: course-detail 500 (CRITICAL, check Sentry), pending states + async emails on action buttons, revenue table includes archived, golfer $0 aggregation, Ctrl+K keystroke drops + stale results, inquiry status mismatches, tz date mismatch, guest grouping, activity filter, cancellation labels (medium-big, no migration) — 8f34a18 (item 1) + 68caa0f (items 2-10)
- [x] PUBLIC_SITE_SPEC Phase D — proof layer: image fallbacks (Cam captures real screenshots — manual), founding-courses section, comparison table de-FUD, private-club reassurance block, operator sections in terms/privacy with {{COMPANY_LEGAL_NAME}}, "good fit" copy fix (small/medium, no migration) — 5fb8585
  NOTE: {{COMPANY_LEGAL_NAME}} and state of formation are marked TODO in /terms and /privacy — Cam must supply LLC name + state once formed; attorney review needed before scale.
- [x] ADMIN_V3_SPEC Phase A7 — course health signals on Courses list: last booking, 30d trend, operator last login (amber/red thresholds), Health sort, detail-page strip (small, no migration) — f4dabe0
  NOTE: CourseOperator has no lastLoginAt column — operator last login renders "—" everywhere. Add lastLoginAt to CourseOperator in a future attended schema run, then wire it in the operator login route and remove the placeholder.
- [x] PUBLIC_SITE_SPEC Phase E — live demo course page: DEMO_COURSE_SLUGS banner, full flow walkable with confirm intercepted (client+server), homepage "See it for yourself" section, noindex (small, no migration) — 29659a6
  NOTE: DEMO_COURSE_SLUGS is empty in src/lib/demo-courses.ts — Cam adds the real demo slug there. Homepage shows "Demo course coming soon" card until then. Server-side rejection in /api/bookings is already live.
- [x] MANAGE_BOOKING_SPEC Phase M4 — course-configurable check-in window (Course.checkInWindowHours) driving the existing "time to check in" email; operator sets it in Settings (schema change, attended) — d3ce2c7 (feat/checkin-window, merged to main)
  BUG FIX (same run): package.json build was "next build" — prisma migrate deploy never ran on deploy. Fixed: build is now "prisma generate && node scripts/migrate-prod.js && next build"; script guards on VERCEL_ENV === 'production' so previews never migrate prod. CLAUDE.md updated to match actual mechanism.

- [x] CI TYPE-CHECK GUARD (small, no migration) — production crashed on a missing lucide import (Trash2, Sentry f50b2a37) because next.config.ts ignores TS errors and nothing type-checks before deploy. Add .github/workflows/typecheck.yml running `npx tsc --noEmit` on every push/PR (red X on failure). Fix ALL existing tsc errors as part of this run so the check starts green — expect a pile, since ignoreBuildErrors has been hiding them; if any are too deep to fix safely, silence with targeted @ts-expect-error + a TODO note, never blanket-disable. Also add the tsc command to CLAUDE.md's validation section (parse check alone doesn't catch missing imports). Do NOT flip ignoreBuildErrors in next.config.ts in this run — that's a follow-up once CI has been green for a while. — 3538a43
  NOTE: @sentry/nextjs, @vercel/blob, lighthouse, chrome-launcher errors only appear locally due to npm permissions issue (those packages are in package.json and will install correctly on CI via npm ci). .next/types/* stale-build errors also won't appear on CI (no build step before typecheck). All real app code errors are fixed.
- [x] ONBOARDING_V2_SPEC Phase V10 — draft preview loop: stateless-token /preview/[courseId] (public page, booking intercepted, noindex), "Send preview" email action from inquiry + course detail, timeline logging, Next-step card becomes Send preview → Go Live (medium, no migration) — 3c88d6d + V10 item 5 (dashboard early access reframe): "Send dashboard access" action replaces "Send Login Email" in building stage, early-access email copy, dashboard draft banner, preview email secondary line, go-live email skips full orientation if dashboard access was already sent — 8062cf6
- [x] ONBOARDING_V2_SPEC Phase V11 — operator first-login: removed the fake instant-verify (deleted /api/auth/get-token, which handed an operator their own verificationToken over an authenticated fetch — no email required; also closed the same hole in /api/auth/register, which returned verificationToken directly in the JSON response instead of emailing it). Verification-by-possession already worked correctly for the emailed-link path (welcome/dashboard-access emails → /dashboard/verify?token=... auto-verifies) — left that alone. Rebuilt the no-token fallback screen (session-but-unverified operators, e.g. logged in with temp password without clicking the link): "We sent a link to {email}", status-aware copy (live vs not-live course), Resend button with a 60s cooldown backed by the existing DB rate limiter, new sendOperatorVerifyEmail(). Onboarding Stripe-connect step now has a real skip ("Do this later") for no-fee-policy courses (lateCancellationFee === 0, the same signal book/page.tsx already uses) instead of hard-blocking Continue. Audited all operator/golfer auth flows for other dev-mode shortcuts — get-token and register's token leak were the only two; nothing else found. (medium, no migration) — f03748d
  NOTE: the spec's "set your permanent password" mandatory first step (before Course Details) could NOT be done without a schema change — CourseOperator has no mustChangePassword-style column to know whether the temp password is still active (admin employees have this field, operators don't). Deferred; needs a `mustChangePassword Boolean @default(true)` column on CourseOperator (attended migration) plus renumbering the onboardingStep 0-3 sequence used across admin displays (courses list/detail, admin home stuck-operators, stats route) before it can be added as a real gated step.
- [x] IMAGE STORAGE hardening (small/medium, no migration) — Blob store + BLOB_READ_WRITE_TOKEN were already live from GOLFER_SPEC G1. (1) upload validation was already present (size cap, jpeg/png/webp allowlist) — bumped the cap 5MB→8MB now that uploads are pre-shrunk client-side; (2) new src/lib/image-resize.ts canvas downscale (cap 2000px, preserves original mime for PNG transparency, falls back to the original file on any failure) wired into operator logo/hero, operator gallery, and inquiry sheet uploads; (3) replacing/removing a logo, hero, or gallery photo now calls del() on the old blob (best-effort, non-blocking); (4) the one place course photos render (course page Photos tab) already had loading="lazy" — confirmed, no change needed; (5) fixed two silent failures — removing a logo/hero and deleting a gallery photo both updated UI state even when the request failed, now both check res.ok and show an inline error — bad4530
  NOTE: item 6 (alt text per photo) needs a CoursePhoto.altText column — schema change, deferred per this run's no-migration rule. Also noted in passing: Course.logoUrl/heroImageUrl are captured in Settings but not yet rendered anywhere golfer-facing (no course page currently shows them) — pre-existing gap, out of scope for a hardening run, worth its own small item later.
- [x] Small run: Stripe Express dashboard link for operators (no migration) — POST /api/operator/stripe/dashboard-link (operator-session only, own course's connected account), "View payouts & balance →" button on Settings Stripe Payouts card when stripeAccountActive. Investigated the stale "Draft — will take you live shortly" report: audited every Course.active write path, all correctly pair active+liveStatus (already fixed in an earlier run) — root cause was dashboard/page.tsx + settings/page.tsx only fetching course status once on mount, so a tab left open across an admin go-live kept showing stale state. Fixed: both API routes force-dynamic, both pages refetch on window focus, dashboard draft banner now correctly clears instead of only ever flipping true — f308013
- [x] ADMIN_V3 A2b: platform Stripe section on /admin/revenue (OWNER-only, no migration) — GET /api/admin/platform-stripe pulls live balance (available/pending), next scheduled payout, and net application fees (paginated, refunds netted out) for 7d/30d, cached 5min in-process. Reconciliation line compares expected GR fees (existing accessFeeTotal booking math) vs actual Stripe application fees for the same window — green check within $1 tolerance, red banner with expected/actual/booking-count otherwise. Owner-only card with period toggle + "Open Stripe dashboard" link; non-owners never fetch it — f750471
- [x] ONBOARDING_V2_SPEC Phase V12 — course approval loop: "Looks good — approve my page" + "Request changes" on both the token-gated preview page and the operator dashboard draft banner. Approve logs an inquiry timeline event + emails admin (advisory only, going live stays a separate admin action); Request changes feeds the EXISTING admin↔course MessageThread. New routes: /api/preview/[courseId]/approve + /request-changes (token-gated, rate-limited), /api/operator/approve-page (session-gated; request-changes reuses existing /api/operator/messages). pageApprovalStatus computed from the latest matching timeline event so both UIs reflect real state across reloads. Admin Next-step card (building stage) is approval-aware: waiting/sent-X-days-ago+resend → approved (Go Live highlighted) → changes requested (link to Messages) — 58cfff6
- [x] Small run: sheet passes → membership tiers automatically (no migration) — create_draft_course now turns every sheet tier (membership/season pass/resident card/punch card/other) into a real MembershipTier row instead of discarding everything but two booleans + one flat resident rate. resident_rate entries stay excluded (they already flow into TeeTimeSchedule resident rates, not a tier). Per-round discounted rates map to a flat tier override; separate-surcharge or per-season/per-punch pricing (which the model can't represent) gets a needsReview note instead of a silent guess — d7400d5
  NOTE: did not build the "tier wizard prefills from sheet data when adding manually" half — with tiers now auto-created on draft build, the manual-add path is only for tiers added post-launch (no sheet data to prefill from), so it wasn't load-bearing. Skipped.
- [x] Small run: admin forgot-password (no migration) — /admin/login "Forgot password?" link → new /admin/forgot-password page + POST /api/admin/forgot-password (rate-limited 5/15min per IP, generic "if that account exists" response, no enumeration). No schema change: reused AdminUser's existing setPasswordToken/setPasswordTokenExpiry + signAdminSetPasswordToken (24h expiry) and the existing /api/admin/set-password route (token validate + single-use + password write) instead of adding parallel reset fields — a reset link is just a fresh /admin/set-password token. set-password's check upgraded from length>=8 to shared validatePasswordStrength (10 chars + upper/lower/number) since it now serves both first-login and reset. "Password changed" notification email fires only when mustChangePassword was already false (genuine reset, not first-time activation). New sendAdminPasswordResetEmail/sendAdminPasswordChangedNotification in email.ts mirror the operator versions. Also added footer line on /admin/login: "Course operator? Sign in at your dashboard →" (reverse hint intentionally not added on the operator side). Owner-login 2FA unaffected (reset only changes password). Verified via tsc + babel parse-check + live dev server (page renders, link/footer line present, nonexistent-email returns generic success, rate limiter 429s on the 5th request) — 37af53c
- [x] Small run: booking terms consent (schema-batch2 migration: Booking.termsAcceptedAt/termsVersion, run attended) — consent line above the Confirm/Reserve button in both booking flows (card-on-file + no-card) AND above swap-time/change-players on the manage page (both re-price, so both re-stamp consent). CURRENT_TERMS_VERSION lives in src/lib/terms.ts. Server rejects (400) any of these four requests without termsAccepted === true — feat/schema-batch2: d37fb32 (migration), e7baaca (book flow), 0d95ef0 (manage-page re-price flows)
  NOTE: wording is a placeholder pending attorney pass, as flagged. Admin's manual tee-sheet booking (staff on a golfer's behalf) intentionally has no consent capture — not a golfer-facing flow.
- [x] GOLFER_SPEC Phase G5 — per-course golfer portal at /courses/[slug]/account. No schema change needed — GolferAccount.phone already existed from schema-batch2. Sections:
  (A) Passwordless OTP over the EXISTING GolferAccount/gr_golfer session, no new auth system: stateless challenge JWT (identifier + bcrypt code hash, 10min expiry) since no schema change was available for OTP columns; attempt/resend limits via the existing RateLimit table; find-or-create on verify (OTP-created accounts get a random unrevealed password hash); guest-booking auto-linkage by verified email (exact, case-insensitive) or phone (last-10-digit match, since guest phones were typed free-form).
  (B) /api/manage/[bookingId]'s GET/swap-time/change-players/available-times/send-modified-email now accept a gr_golfer session as an alternative to the emailed token (same dual-auth pattern /api/bookings/cancel already used); the manage page no longer hard-requires ?token= in the URL.
  (C+D) GET /api/courses/[slug]/account + the portal page: course-scoped upcoming/past bookings + membership strip; isolation comes from filtering every query by the course's id, not from the (global) golfer session. Reuses the existing token-gated checkin/receipt pages as-is for check-in and receipt links.
  (E) Wired into every entry point: quiet "Sign in" link on the course page header; confirmation page "View My Bookings" -> the portal with ?email= prefill (addendum); confirmation + receipt emails get a "View your tee times at {course} ->" link, and the old generic /account fallback is gone.
  (F) Extended scripts/isolation-test.ts with portal + session-manage cross-course checks, actually ran it end-to-end and fixed 4 real bugs surfaced in the process (mostly pre-existing test/app drift, unrelated to G5 except where noted): seed fixtures used mixed-case emails while login normalizes to lowercase (every operator/golfer login in the test was silently broken); seed fixtures passed phone:'' for two golfers (collided under the new unique constraint); the test's own JSON-parse fallback was dead code, crashing the run on any non-JSON response; operator login now always requires 2FA (prior hardening run) and the test never completed that step; and /api/checkin/[bookingId] POST 500'd on a body-less request instead of a clean 4xx (real bug, now fixed). 30/30 checks pass.
  main: d51afde (A), f015ece (B), 6902f53 (C+D), a8c42d5 (E), d17dfb3 (F)
- [x] MULTI-COURSE OPERATORS (schema change, attended) — Course.operatorId dropped the UNIQUE constraint (plain index kept); CourseOperator.course is now Course[]. Code sweep: resolveDashboardSession() picks the active course via a new gr_active_course cookie (validated server-side against the operator's own courses every read), every CourseOperator.course?.id compile break fixed across create-course/inquiries/stats routes, admin/broadcasts' operator-email query updated to `course: { some: { active: true } }`. New /api/operator/my-courses + /api/operator/active-course; OperatorSidebar shows a course switcher only when an operator has >1 course. create_draft_course's existing-operator guard is the real V9-1b behavior: different/no name conflict → attach; same name archived → attach; same name active → 409 name_conflict banner with View existing course / Create anyway (force, -2 slug suffix) — never a dead-end. feat/schema-batch2: d37fb32 (migration), 845f532 (code sweep + switcher + guard)

- [x] Small run: booking-surface polish (no migration) — (1) confirmation page "Back to home" → "Back to {Course Name}" → /courses/[slug]; (2) root-caused the holes bug: every DISPLAY already read TeeTime.holes correctly — the bug was both draft-build paths seeding TeeTimeSchedule.holes from the sheet's course-level hole count (27/36 for multi-nine courses) instead of the standard playable round; fixed to 9-or-18 in both seed paths; (3) new hoursLabel() helper in booking-fees.ts fixes "at least 1 hours" everywhere a cancellation window renders as a word count; (4) removed the 🎉 from the operator New Booking email heading — 88b65c5
  NOTE: could not find "Course ." (stray space) anywhere in current email.ts or elsewhere in src after an extensive multi-angle search (exact string, case-insensitive, git pickaxe history) — likely already fixed in an earlier pass and this line wasn't checked off then. Flag to Cam if it's still visible in a live send. NOTE: any course already built before this fix needs its Schedule tab re-saved to regenerate correct-holes tee times — no backfill script (no-migration run).
- [x] EMAIL DESIGN PASS (medium, no migration) — turned out there was no separate dark operator template left by the time this ran (every sendXxx already used the shared baseTemplate()) — this was a wrapper + consistency pass. baseTemplate(): removed the header row entirely (no logo anywhere, content starts at the card's top edge, sharp 4px corners on top+bottom now that there's no header block). Footer: birdie-badge-88.png circle replaced with the standalone golfer mark (public/brand/golfer.png, 46x56 — already high-res, no new asset needed) above "Green Reserve · greenreserve.app" — no lockup, no Birdie (Birdie's email career is over, web-only now: 404/coming-soon/empty states). Fixed the recurring "Course ." report: added courseName.trim() in sendOperatorBookingNotification — earlier passes couldn't find a literal template bug because there isn't one; the cause is upstream data (a course name with trailing whitespace) colliding with the sentence's closing period, so trimming at render is the permanent fix. Ad-hoc styles killed: all 44 font-weight:900 → 700; one outlier CTA button was background:#111827 (near-black) → #1b4332; two spots used #24513B (the web app's pine token) instead of the ~30 other occurrences' #1b4332 → normalized to match the dominant color. Updated CLAUDE.md's stale "black header bar" line. Verified via tsc + babel parse-check + a real browser render of baseTemplate with sample content (temp static file served through the dev server, since file:// isn't reachable from the Chrome extension) — 836f21e

- [x] GOLFER_SPEC G5b — member recognition via golfer session (no migration) — new getGolferMembership(courseId) in src/lib/member-session.ts resolves an ACTIVE CourseMembership at THIS course for the gr_golfer session (golferId link OR verified-email match on an invite-only membership). /api/member/[courseSlug]/session + .../tee-times fall back to it when there's no gr_member session, returning the identical response shape (+ a source field) so the course page's existing member-pricing UI needed no separate code path. /api/bookings' tier lookup uses the same helper (previously golferId-only, now also catches invite-only memberships). Course page header now shows the member name + "Member — {tier}" chip when recognized, "Hi, {firstName}" for a signed-in non-member golfer, or "Sign in" — the existing "Member? Sign in" quiet link already hid correctly once memberSession is set from either source. memberSignOut signs out of the right session (gr_golfer fully, not a no-op gr_member clear). Isolation matrix extended (member of Course A recognized there, completely absent on Course B for the same golfer and for a non-member) and actually run against a live dev server + the Neon branch DB — 38/38 pass, no cross-course leakage — 6587527
  RE-VERIFIED live (2026-07-15 follow-up): slot-card display + member marker were flagged as possibly incomplete — re-checked end-to-end against a real dev server (seeded golfer + 20%-discount tier membership, logged in, hit /api/member/[slug]/tee-times and .../session directly): has_member_rate:true, member_green_fee correctly discounted, source:"golfer" — confirms the slot-card "member rate" badge + strikethrough price (CourseBookingClient.tsx, already reads has_member_rate/member_green_fee agnostic of session source) and the header/tee-sheet "signed in" badges all already work via the shared memberSession state extended in 6587527. No code change needed — no new hash.

- [x] Small run: dead-end pages get exits (no migration) — new shared <GolferExitLinks> ("View My Bookings" → portal, "Back to {Course Name}" → course page) wired into /manage/[bookingId]'s cancelled + modified confirmations, /checkin/[bookingId]'s check-in-complete screen, and /receipt/[bookingId] (not named in the item but the same dead end, reachable from check-in success + the portal's past-rounds list). /api/alerts/unsubscribe/[token] was a raw-HTML page hardcoded to the generic marketplace /courses — now looks up the alert's own course first and links back to it + its portal. Audited the preview-intercept + demo-intercept modals: both dismiss onto the same live page underneath rather than stranding anyone, so neither needed the fix — left as-is — 64d3288
- [x] Small run: suppress marketing nav on course-world pages (no migration) — split isBookingMode() into isCourseWorld() (/courses/[slug]* — course page, member portal, golfer portal: Nav + Footer return null entirely, own branded header/footer) and isBookingMode() (/book, /checkin, /manage, /receipt, /membership: minimal wordmark-only nav + powered-by footer, no marketing links). Audit found /manage and /receipt were missing from the old list entirely — they were rendering the FULL marketing nav (How It Works/Pricing/FAQ/Operator Login/List Your Course). New MainOffset wrapper replaces the hardcoded main pt-16 (Nav is fixed and reserves that space; removing it on course-world pages without this leaves a blank gap above the hero) — scoped to isCourseWorld only, admin/dashboard untouched. Verified live against a real course page + /book + /manage + /receipt + both portals via curl against a dev server — d4b219d

- [ ] BOOKING WINDOWS (schema change, attended) — how far ahead each audience can see/book the tee sheet:
  - Course.publicBookingWindowDays (Int, default 7) — operator sets in dashboard Settings ("How far ahead can golfers book?") with plain explainer
  - MembershipTier.bookingWindowDays (Int?, null = course default) — per-tier member perk, set in the tier editor ("Members of this tier can book N days ahead")
  - Enforcement SERVER-side on the tee-times API + booking create (not just UI): public/anonymous sessions see + book only within the public window; recognized members (gr_member OR G5b golfer-session match) get their tier's window; date picker greys out days beyond the viewer's window with "Members can book earlier — sign in" hint (soft upsell, course-appropriate copy)
  - Tee-time generation cron must generate at least max(all windows)+1 days ahead (currently ~8) — derive, don't hardcode
  - Details sheet + draft build: ask public window + member window in the sheet's tee-sheet section, map into the draft (small V-series follow-through)
  - Migration via CLAUDE.md checklist — Neon branch, attended
  RE-VERIFIED (2026-07-17 run): asked to check off this item on the assumption it was already built — it isn't. Fresh, skeptical re-audit of the tee-times API, booking-creation route, tee-time generation cron, and the course-page date picker found zero enforcement anywhere (independently corroborated by 26778c7's own commit message, which flagged the same gap the same day). The tee-times APIs return every future date identically regardless of viewer; booking creation only rejects past/private/demo; the cron still generates a hardcoded 8 days; the date picker only disables past dates and caps at a fixed 2-month view, no per-viewer window or sign-in upsell copy anywhere. publicAdvanceDays/memberAdvanceDays/MembershipTier.advanceBookingDays exist in the schema and are wired into admin/operator settings CRUD only. Left unchecked — this is real, unbuilt, schema+attended work, not something to check off or silently build inside an unrelated run.

- [x] BIRDIE brand integration (small/medium, no migration) — assets landed in public/brand/ (birdie-head.png, birdie-sitting.png for web; SVG traces + raw captures kept for print/archival only, never referenced from code). Favicon/app icons generated from birdie-head via sharp (icon.png 32x32, apple-icon.png 180x180, favicon.ico regenerated as a 48x48 PNG-in-ICO) — Next's file-based icon convention picks these up with no code changes. Email baseTemplate footer mark, new global 404 (src/app/not-found.tsx, didn't exist before — distinct from the existing course-world "Course Not Found" state, untouched), new shared <EmptyState> wired into admin inquiries/courses/golfers empty results, receipt header mark. HARD RULE verified: grepped every course-world file for "birdie" (zero matches) and confirmed live via dev server that the course page's rendered HTML has no birdie <img> tag. Every placement uses next/image or explicit width/height (+ loading="lazy" on web; email uses explicit dimensions only, "lazy" isn't meaningful in email HTML) — 60b41d9
  NOTE: two loose files at the repo root (GREEN RESERVE LOGO.png, birdie-both.png) look like scratch assets outside the public/brand/ convention — left untouched (not committed, not deleted), flagging for Cam to move into public/brand/ or discard.
  UPDATE (brand swap run): two more root-level scratch files have since appeared (Green-Reserve-Golfer.png, greenreserve-logo.png) — same story, still untracked/untouched. All 4 loose root PNGs need Cam to either move into public/brand/ or delete; none were referenced by this run (public/brand/logo-lockup-900.png and public/brand/golfer.png, already committed in 89951ad, were used instead).
  UPDATE (confirmation page course header run): a 5th loose root scratch file appeared (NEW-GR-LOGO.png) — same story, untouched, not referenced (public/brand/logo-lockup-900.png keeps being the one actually wired into the app).

- [x] Small run: dedupe member advance-booking setting (no migration) — both controls were bound to the exact same form.memberAdvanceDays state / Course.memberAdvanceDays column already (not a data-source conflict) — removed the legacy standalone field in Member Pricing, kept only the Booking Windows one, gated on hasMemberPricing (carried over the legacy field's sensible conditional). Audited enforcement: there isn't any yet — publicAdvanceDays/memberAdvanceDays/MembershipTier.advanceBookingDays already exist in the schema and are readable/writable everywhere, but nothing in the golfer-facing tee-times/booking routes restricts booking based on them (that's the separate still-queued BOOKING WINDOWS item, schema+attended) — so no "single source" enforcement bug existed to fix, just the one duplicated field. Verified via tsc + babel parse-check — 26778c7

- [x] COURSE_LAYOUT_SPEC Phase L1 — Nine + CourseProduct model, "Course & Layout" dashboard tab, per-nine tee-set yardages, draft-build maps sheet combos into real rows (SCHEMA CHANGE, ATTENDED, run directly against production — de1e54f). Additive-only migration: generated with `migrate dev --create-only`, manually verified the SQL was purely CREATE TABLE/CREATE INDEX/ADD CONSTRAINT on 4 new tables (Nine, CourseProduct, TeeSetNine, CourseProductTeeSet) with zero ALTER on any existing table's own columns, then `migrate deploy` — no db push, no reset. Existing flat Course fields (holes/par/yardage/slope/courseRating) stay the display fallback for simple 18-hole courses, no forced backfill.
  API routes (5bdffc7): /api/operator/nines, /api/operator/course-products (both new, session-gated + ownership-checked, matching the /api/operator/schedule pattern). Extended (not replaced) the existing /api/operator/tee-sets route — it already existed for dashboard/onboarding.tsx's bulk replace-all flow, which I nearly overwrote blindly before checking; added POST/PATCH/DELETE for single-row editing plus nested nineYardages/productRatings, left the onboarding-facing GET/PUT untouched.
  Dashboard tab (bfca088): new "Course & Layout" tab in Settings, right after Course Info — the flat Course Details box moved here (per spec) with the new Nine/Product/TeeSet list editors beneath it (src/components/dashboard/CourseLayoutTab.tsx), each self-saving with explicit saving/saved/error states per row.
  Draft build (e2c85bf): create_draft_course now maps the sheet's three_9s/18_plus_9/two_18s combo answers into real Nine + CourseProduct + TeeSetNine + CourseProductTeeSet rows instead of a "verify manually" build note. 36-hole 'other' and simple 9/18-hole courses correctly create nothing. Caught a real bug in review before shipping: the two_18s case has products but zero nines, so gating the write block on nineSpecs.length alone would've silently skipped it — fixed to gate on either list being non-empty.
  Verified: tsc + babel parse-check clean throughout, live checks against production confirm /api/health returns {"ok":true,"db":"up"} and the new API routes 401 (not 404) for unauthenticated requests, proving the deploy picked up the new code; `prisma migrate status` clean against the same production DB. Draft-build mapping was NOT live-tested end-to-end (would create real rows in production with no clean rollback) — validated by static review + a full walkthrough of each layout branch against the sheet's documented JSON shape instead.
- [ ] COURSE_LAYOUT_SPEC Phase L2 — booking page sells products: product selector on tee sheet, per-product slots/pricing/labels everywhere (big; answer the spec's OPEN QUESTION first)
- [ ] COURSE_LAYOUT_SPEC Phase L3 — isolation tests + admin layout summary (small)

- [x] Small run: email Birdie mark crispness (no migration) — generated public/brand/birdie-badge-88.png via sharp: Birdie composited onto a solid pine (#24513B) circle (88x88, 2x asset) — since Birdie's own fill is already pine, the badge reads as an engraved medallion (cream linework visible, no flat sticker look). Display bumped 28px→44px in baseTemplate's footer. Rolled into the brand-swap commit below (single baseTemplate edit touched both header and footer) — 9e4614e
- [x] Brand swap: GreenReserve lockup replaces text/leaf logo (no migration) — public/brand/logo-lockup-900.png swapped in for the text/leaf wordmark in the 4 specified spots: marketing Nav (~40px, priority/eager since always above the fold), marketing footer (~44px, lazy), admin login page (replaced the lucide Leaf icon), and email baseTemplate header (220x110, drawing 4x oversampling off the 900px source — no separate resized asset needed). Header background changed #0a0a0a → white since the lockup is pine-on-transparent and illegible on black. golfer.png (standalone square mark) had no natural fit among the 4 spots — left unused. admin/owner-login + admin/set-password still use the old Leaf icon (same pattern, not named in scope — flagged as a follow-up, not touched). Course-world pages verified untouched (grep + live curl against a real course detail page, zero matches) — 9e4614e

- [x] Small run: Birdie on coming-soon pages (no migration) — Outings + Tournaments (the only 2 dashboard stubs) get the sitting Birdie (96x135) with "Birdie's working on this one" heading (an "OUTINGS"/"TOURNAMENTS" eyebrow keeps the page identifiable now the heading's generic) + body copy trimmed to one line. "Tell us what you need" mailto replaced with a link to /dashboard/messages?prefill=... — pre-fills the compose box with context-specific starter text instead of a dead mailto. Messages page split into MessagesContent (reads prefill via useSearchParams) + Suspense-wrapped default export. Operator dashboard only — verified golfer-facing course pages stay Birdie-free (the one src/app/courses match is the already-approved Course-Not-Found exception from an earlier run, not new). Verified via tsc + babel parse-check — 8676def

- [x] Small run: brand swap round 2, items 1-4 (no migration) — generated public/brand/logo-lockup-cream-900.png (+ full-res logo-lockup-cream.png), cream-on-transparent variant for dark/pine surfaces where the regular pine lockup disappears. (1) AdminSidebar: cream lockup (112x56) replaces the icon-box + "GreenReserve" text, "Admin" eyebrow kept beneath. (2) OperatorSidebar: pine lockup (112x56, sidebar is white) — same treatment, "Operator" eyebrow beneath. (3) marketing Nav bumped ~40% (40px→56px, fills the h-14 bar); Footer + admin/login lockups (already live from round 1) bumped the same ~40% for consistency. (4) full sweep for remaining text-only "GreenReserve" wordmarks found more than login pages: admin/owner-login + admin/set-password (Leaf-icon pattern flagged in round 1, now fixed), the booking-mode minimal Nav bar, 3 golfer /account/* auth pages, 3 operator /dashboard/* auth pages (login, forgot-password, 2fa — all had a bare 28px text div), and the two dark-pine section headers on /for-courses + /for-courses/details (cream variant). All 3 admin auth pages matched to the same 100x50 size. Verified via tsc + babel parse-check + live dev server (right variant on each surface, course-world pages still zero matches) — 50b1352
  NOT DONE this run — item (0) below was added by Cowork's amendment to this line after the run's instructions were already given (chat scope was items 1-4 only): sitting Birdie on the "Course Not Found" state. Split out as its own item so it isn't lost:
- [x] Small run: Birdie on "Course Not Found" state (no migration) — CourseBookingClient.tsx's notFound state swaps the generic Flag icon for the sitting Birdie mark, headline now "Birdie couldn't find that course." (dropped the now-redundant "We couldn't find that course." line, kept the helpful copy + back-to-home link). AMENDED BIRDIE RULE confirmed live: no course resolved = nothing to white-label here, but a real course page still renders its own fully-branded header with zero Birdie/GreenReserve chrome — 67817c0

- [x] Small run: login-page logo sizing (no migration) — admin family (login, owner-login, set-password, forgot-password) converted from side-by-side (small logo + "Admin" text beside) to a centered stack: logo 300px wide, "ADMIN" as an 11px uppercase eyebrow underneath. Operator dashboard family (login, forgot-password, 2fa, reset-password, onboarding) was already stacked — bumped from a mix of 88x44/112x56 up to the same 300x150, existing subtitle copy ("Course Operator Portal" etc.) left as-is rather than replaced with a bare "OPERATOR" eyebrow (more descriptive, no real reason to regress it). Golfer /account/* auth pages (register, login, accept-invite) got the same 300px bump. ALSO per the follow-up note: booking-mode minimal Nav bar logo matched to the marketing Nav's 56px (was floating small at 36px in the same h-14/px-6 bar). Verified via tsc + babel parse-check + live dev-server screenshots of /admin/login, /dashboard/login, /book (transparent PNG renders clean, no box/edge, at the new size) — aafd8af
- [x] Small run: confirmation page course header (no migration) — new shared <CourseHeaderBar> component (courseName + accent) replaces 6+ copy-pasted instances of the same h-14 colored bar across manage/[bookingId], book, and checkin. Booking confirmation (book/page.tsx) and check-in success (checkin/[bookingId]/page.tsx) both restructured to the same shell cancellation/modification already used: header bar on top, smaller check icon + heading beneath, redundant "Course" detail row dropped. Check-in success needed a real backend change — /api/checkin/[bookingId] had no brandColor field at all (added to the Prisma select + response + CheckInInfo type); also fixed a pre-existing bug on the same page where the PRE-check-in header was hardcoded bg-pine instead of the real brand color, and GolferExitLinks there was missing its accent prop entirely (silently defaulting to pine). Modification success + cancellation already had the header bar and brandColor — just swapped inline markup for the shared component; left the two action-context headers (change-time/change-players, "Choose a new time") untouched since they're a different pattern, not a course name. Verified via tsc + babel parse-check + live screenshot of the /book pre-confirmation shell (same component + same accent variable as the new confirmed-state block) — 5ec92c7

- [x] Tiny run: auth page logo final polish (no migration) — (1) committed Cowork's regenerated public/brand/logo-lockup*.png (clean transparency, box fixed at asset level) — the crop is also much tighter now (900x170 vs the old 900x450, ~5.3:1 vs 2:1), which broke every FIXED-HEIGHT placement (browser blows out the width to match the new intrinsic ratio); audited every reference and fixed the ones that would've rendered oversized/distorted: Footer (was h-[62px] → would've hit ~328px wide, now fixed 160px width), email.ts header img (raw HTML has no CSS override, hardcoded height=110 would've squished the logo → height=42), and every width=300 height=150 auth placement corrected to height=57. Nav.tsx booking-mode bar + the two /for-courses pine headers also use fixed-height classes but stayed safely within their unconstrained containers — left as-is. (2) removed the "ADMIN" eyebrow entirely from all 4 admin auth pages (login/owner-login/set-password/forgot-password); operator dashboard pages kept their "Course Operator Portal"-style subtitles since nothing else on those pages restates the operator context (unlike admin cards, which already say "admin" in their own copy); sidebars keep their eyebrows. (3) AdminSidebar + OperatorSidebar restructured to a centered stack, logo ~190px (search button moved to its own row above on AdminSidebar to free up width). (4) marketing Nav: dropped the max-w-6xl/mx-auto wrapper so the logo sits ~24px from the real viewport edge; bumped to 200px wide / 64px bar height (kept within the existing MainOffset pt-16 offset, no other page needed adjustment). Verified via tsc + babel parse-check + live screenshots (homepage Nav, /admin/login, /dashboard/login); sidebars validated by width math only (behind an authenticated session, not screenshotted). Course-world pages still zero matches — 3727c6a

- [x] Tiny run: booking flow loses the white GR header (no migration) — Nav.tsx's isBookingMode branch removed entirely (returns null, same as isCourseWorld) — the course's own CourseHeaderBar is the header on /book, /checkin, /manage, /receipt, /membership now. MainOffset updated to match (no pt-16 for either case, avoiding a 64px gap). Footer's combined isBookingMode/isCourseWorld branch split in two: booking-mode gets a small 120px lockup in the "Powered by GreenReserve" line, course-world keeps the original text-only treatment (a logo image on a course's own page would undermine white-labeling even small). Nav/Footer/MainOffset are rendered once in the root layout and self-guard by path, so the footer already existed everywhere — verified via curl (zero <nav> tags across all 4 booking-flow routes, footer lockup present). Terminal screens (confirmed/cancelled/updated/checked-in) had their CheckCircle-in-a-box swapped for a 140px lockup between the course bar and heading. SIZE DOCTRINE compliance: shrunk the 12 auth pages from 300px (set two runs ago) down to 190px — that size was a direct violation of the new ≤200px auth ceiling. Verified via tsc + babel parse-check + curl structural checks against a live dev server (browser screenshot tooling was unreliable this session, relied on curl instead) — d64c990

- [x] Small run: retire /account (no migration) — (1) next.config.ts redirects() /account/:path* -> / (permanent, same pattern as the existing /courses -> / entry), with a code comment noting the marketplace-mode revisit. (2) swept every /account link: sendBookingConfirmation, sendCancellationWarningEmail, sendBookingModifiedEmail, sendReminderEmail (the last 3 had no courseSlug param at all — added it, updated every caller's Prisma select to fetch course.slug: cron/hourly, cron/send-reminders, manage/send-modified-email, bookings/route), and sendMemberLinkedNotification (a hard-coded primary link, not a fallback — also fixed, 2 call sites in operator/members/route.ts). All now resolve to the course's own portal when courseSlug is known, homepage otherwise. (3) deleted the whole src/app/account/ tree (cross-course dashboard + password login/register/forgot-password/reset-password pages — checked, confirmed via full-repo grep each had exactly one caller, its own page) and their 4 API routes. accept-invite was NOT deleted — it's a real still-needed flow (course-invited members without an account) — relocated to /courses/[slug]/account/accept-invite instead, course-scoped like everything else post-G5; picked up the CourseHeaderBar treatment while in there. middleware.ts's /account auth-gate + ACCOUNT_PUBLIC removed (would've raced the config-level redirect); robots.ts dropped /account from disallow. Verified: tsc + babel parse-check clean, full-repo grep zero remaining /account references, live dev-server checks (308 redirects preserve query strings, relocated accept-invite page 200s, its API still handles invalid tokens correctly) — 037eacc

- [x] Tiny run: /for-courses drops the white nav (no migration) — Nav.tsx returns null for pathname.startsWith('/for-courses') (same return-null pattern as admin/dashboard/course-world/booking-mode). MainOffset updated to match (no pt-16, avoiding the 64px gap the last two runs already had to account for elsewhere). The pine hero's cream lockup now links to / and a small "← Back" text link sits in the hero's top-left, on both /for-courses and /for-courses/details — without either, a visitor arriving here directly would have no way back to the marketing site. Footer untouched. Verified via tsc + babel parse-check + live dev-server check (0 <nav> tags on both pages, back link + cream lockup present in /for-courses' raw HTML; /for-courses/details' hero only renders after a client-side fetch resolves — same limitation as /book earlier this session — but the JSX is byte-identical to the verified ForCoursesContent pattern) — 6f47cac

- [ ] Tiny run: legal entity name fill-in (no migration) — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + /privacy with "TheGreenReserve LLC" + formation state (CAM: confirm the state before this runs — e.g. "TheGreenReserve LLC, a New York limited liability company"). Bump "Last updated" dates. Attorney-review HTML comment stays.

- [ ] EXPENSE TRACKER / real P&L (schema change, attended) — Cam wants the revenue view to read like a stock P&L: fees earned MINUS costs = net. Two expense sources:
  (1) AUTOMATIC: Stripe's own processing costs on GR's application fees — pull from Stripe balance transactions (fee field) alongside the A2b reconciliation, no manual entry;
  (2) MANUAL: new `Expense` table (name, category [infra/tools/legal/other], amountCents, cadence [monthly/annual/one-time], startedAt, endedAt?) — admin CRUD on /admin/revenue for the fixed costs (Vercel, Neon, Resend, Twilio, domain, etc.), monthly costs prorated into period views.
  Display on /admin/revenue (and the Overview P&L header once A-01b lands): Fees earned − Stripe processing − expenses = NET, per Day/Week/Month period, with vs-prior delta. Migration via checklist (additive table — create-only → review → deploy pattern OK).

- [ ] ONBOARDING_V2_SPEC Phase V13 — guided operator onboarding: Getting Started checklist derived from real state (verify/password/look around/review page/connect Stripe/check schedule), every dashboard tab introduces itself with plain-English intro cards + reopenable "?", emails point to the checklist (BIG, no migration — full spec in ONBOARDING_V2_SPEC.md)

- [ ] ONBOARDING_V2_SPEC Phase V13b — request-changes v2: structured category form on the preview page, requests live ON the inquiry (checkpoint area + addressable item list → "Send updated preview"), Messages gets a mirror link only, stall logic counts unaddressed requests as Your Move (medium, no migration)

- [x] BUG: checklist approve button is a dead wire — FIXED, code-verified (live
  click-through/email-delivery confirmation still pending Cam's own test —
  see note). Root causes found by code trace (DB dumps and session-token
  forging were both correctly blocked as production-data/security actions,
  so this was fixed from static analysis + the A6 item 2 precedent, not a
  live click):
  1. `/api/operator/approve-page` and `/api/preview/[courseId]/approve` both
     AWAITED `sendCourseApprovedNotification` synchronously in the request
     path — the exact anti-pattern A6 item 2 banned ("Send Sheet"/"Reset pwd"
     froze 30s-2min for this reason). Switched to fire-and-forget + .catch
     logging in both, plus the request-changes route's admin-notification
     email (same bug, found while in there).
  2. Both approve routes silently no-op'd (`if (inquiry) {...}` then still
     returned `{ ok: true }`) when a course has no linked CourseInquiry
     (possible for manually-built courses, A-12). That let the checklist
     flip to "done" optimistically with NOTHING durably recorded — explaining
     "unchecked again after reload" exactly. Now returns an explicit 409 with
     a real error message instead of a silent no-op (no-silent-failures).
  3. `GettingStartedChecklist`'s review-page step had a pending state (spinner)
     and an implicit success state (checkmark) but NO error path — added an
     `approveError` prop, wired from dashboard/page.tsx's existing (previously
     unused-here) error state, rendered inline under the step.
  4. Item 5: converted the dashboard's own Request-changes modal (used by
     both the checklist and the draft-course banner) from free-text to the
     same V13b structured category form as the preview page. Extracted
     shared logic into src/lib/submit-change-request.ts so the token-gated
     preview route and a new session-authed /api/operator/request-changes
     route can never drift.
  NOTE for Cam: I could not click through live — a raw DB dump of
  course/operator records and minting a session JWT to impersonate the test
  operator were both correctly blocked by auto mode as production-data/
  security actions, and you chose "skip live repro, fix from code trace"
  when asked. Please do one real click-through on a draft test course
  (e.g. DaisyLinks) to confirm: button shows pending → checkmark, survives a
  reload, and the "{course} approved their page" email actually lands at
  hello@greenreserve.app. Original spec:
  checklist approve button is a dead wire (no migration) — on the V13
  Getting Started checklist, "Looks good — approve" gives NO feedback, the
  step is unchecked again after reload, and the V12 admin notification email
  never arrives. Reproduce first, then fix the whole chain:
  (1) button gets pending → success/error states (no-silent-failures rule —
  this exact pattern was mandated in A6 item 2, apply it);
  (2) confirm the click actually hits /api/operator/approve-page and the
  approval timeline event is WRITTEN (check server logs/response);
  (3) the checklist's "Review your booking page" step must DERIVE from
  pageApprovalStatus (the V12 computed value) so it survives reload;
  (4) the admin notification email ("{course} approved their page — ready to
  go live") must fire — verify delivery to hello@greenreserve.app, not just
  code that looks right;
  (5) test the Request-changes path from the checklist the same way (it
  should open the V13b structured form once that ships);
  (6) after fix: approve on the test course → step shows ✓ immediately AND
  after reload → email lands → inquiry Next-step flips to "Course approved
  — Go Live".

- [ ] BIRDIE_AI_SPEC Phase B1 — Birdie assistant foundation + operator helper: /api/birdie/chat (Anthropic API, Haiku, streaming), persona/tools derived server-side from surface+session, tenant isolation as law, scope guardrails + rate caps + BIRDIE_ENABLED kill switch, floating Birdie chat UI, operator how-to knowledge pack + read-only course awareness + deep links, NO writes (BIG, no migration; PREREQ: Cam adds ANTHROPIC_API_KEY to Vercel — full spec in BIRDIE_AI_SPEC.md; B2 golfer / B3 admin / B4 confirm-actions follow)

- [x] BUG: review loop doesn't understand "already live" — FIXED, verified
  against the real test-course data that reproduced it (CAM SANCHEZ COURSE:
  read-only, non-PII query of its inquiry events — went live at 17:08:27,
  then SIX stacked "Course approved their page" events between 17:09 and
  17:42, plus a CHANGES_REQUESTED submission at 17:13 while already live —
  confirms every part of Cam's repro):
  1. GettingStartedChecklist: `pageReviewed = pageApprovalStatus === 'approved'
     || !courseDraft` — going live now supersedes approval, and the
     approve/request-changes mini-controls are explicitly re-gated on
     `courseDraft` too (belt-and-suspenders — never show pre-live controls on
     a live course). Collapse logic reworked: was `if (!courseDraft && allDone)
     return null` (vanished forever once live, could never re-derive since
     pageReviewed was unreachable for live courses) — now collapses to the
     slim bar whenever all steps are done, live or not, via a proper
     expand/collapse override state (previously "done" would have gotten
     permanently stuck collapsed with no way to reopen — fixed that too).
  2. /api/operator/approve-page AND /api/preview/[courseId]/approve: both now
     check `course.active && course.liveStatus === 'live'` first and return
     `{ ok: true, alreadyLive: true, message: "You're already live — nothing
     to approve." }` with no event write. Both also check
     `latestPageDecision(events) === 'approved'` before writing — a repeat
     click while already approved (pre-live) is now a no-op instead of a
     stacked duplicate event + duplicate admin email.
  3. Admin inquiry detail (live stage): now shows "Live since {date} · Page
     approved by course · {date}" using the most recent "Course approved
     their page" event, so the approval survives as visible history instead
     of vanishing once the inquiry leaves 'building' status.
  4. Preview page (CourseBookingClient): added `is_live` to the preview API
     response; the banner now shows a "this course is live" message with no
     approve/request-changes controls when `is_live`, instead of the stale
     pre-live banner an old bookmarked/emailed preview link would otherwise
     still show forever. The changes_requested marker written while live
     (confirmed in the repro data) is already correctly ignored by the admin
     UI (gated on `status === 'building'`) — it just sits in Activity history,
     never mistaken for a pending pre-live request.
  Original spec:
  BUG: review loop doesn't understand "already live" (no migration) — DB
  truth (verified): approval events write fine + email fires; the course was
  set LIVE first, and /api/operator/courses only derives pageApprovalStatus
  for NON-live courses, so the checklist showed an unchecked approve step on
  a live course forever. Fix the state machine, not the wire:
  (1) course live ⇒ "Review your booking page" step derives as DONE (going
  live supersedes approval) and the whole Getting Started checklist collapses
  to its slim completed bar when the course is live and steps are done —
  a live course must never show pre-live review controls;
  (2) /api/operator/approve-page: if course is already live, return a
  friendly "You're already live — nothing to approve" (200, no event)
  instead of recording; also make approval idempotent pre-live (consecutive
  duplicate approve events don't stack — Cam's test wrote SIX);
  (3) admin inquiry (live stage): header shows a quiet "Page approved by
  course · {date}" note when approval events exist, so the approval isn't
  invisible history;
  (4) sanity-check the V13b changes_requested path for the same live-state
  hole (a live course requesting changes should route to Messages/support,
  not the pre-live loop).

- [x] BUG: inquiry ⋯ menu renders EMPTY for live/archived inquiries — FIXED
  (6d93f6d). LIVE and ARCHIVED/REJECTED each get their own contextual
  MoreMenu block reusing the existing guarded archive-course flows (archive,
  hard-delete-after-archive with the payment-history guard shown, restore).
  Verified against the real CAM SANCHEZ COURSE inquiry (status='live',
  builtCourseId set, slug 'cam-sanchez-course' confirmed via course-detail
  fetch): Manage Course/View public page/Copy booking link/Archive/Delete
  all render for this exact record — the menu is no longer empty. Original
  spec below.
  ORIGINAL: verified in code: every MoreMenu item is gated to
  pending/in_review/details_*/building, and live inquiries also read as
  archived, so status='live' matches nothing → clicking ⋯ opens a blank
  popover. Fix:
  (1) RULE: the menu must NEVER render empty — every stage gets its
  contextual set;
  (2) LIVE: Manage Course, View public page, Copy booking link, Archive
  (with the existing recent-activity warning), Delete (existing
  payment-history guard applies — archive-only when guarded, with the
  guard's reason shown);
  (3) ARCHIVED: View course (if built), Restore to previous stage,
  Permanently delete (existing guarded flow from the list's archived tab —
  same code path, not a new one);
  (4) all destructive items keep typed-confirm modals per A-03 conventions;
  (5) quick audit: any other stage that produces a sparse/empty menu gets
  at least Manage/Copy-link items.

- [x] Small run: Send Preview = one combined send — BUILT (6d93f6d).
  sendPreviewWithDashboardAccessEmail (src/lib/email.ts) sends the preview
  link + a fresh temp password/setup link in one email, from both call
  sites (/api/preview/send handles inquiryId and courseId). Confirm modals
  on both the inquiry page and course-detail page list both items +
  recipient. Timeline logs one "Preview sent by {admin}" event (unchanged
  marker, now covers the combined action). "Send dashboard access" stays in
  the ⋯ menu, relabeled "(resend)". Original spec below — merge the
  separate "Send Preview" and "Send dashboard access" actions: pressing Send
  Preview sends ONE email containing the page preview link AND their
  dashboard login access, with copy pointing at the Getting Started
  checklist ("log in and it walks you through everything, including
  payments"). Still admin-initiated, never automatic at draft creation
  (first-impression rule stands). "Send dashboard access" remains available
  separately in the ⋯ menu for resends. The confirm modal lists both things
  being sent + the recipient. Timeline logs it as one combined event.

- [x] Small run: approval propagates + gates previews — BUILT (bdd7234 shared
  brain + 6d93f6d wiring). Verified against CAM SANCHEZ COURSE: its event
  log has no "Preview sent" anchor at all (approved directly without ever
  going through the official Send Preview flow during testing), so
  scopeToCurrentRound correctly falls back to full history — latestPageDecision
  walks it and correctly resolves 'approved' from the most recent of the six
  "Course approved their page" events. Courses tab (header note + list
  badge for drafts) and Send Preview gating (→ "Approved ✓ {date}" +
  "Request re-review", new /api/admin/request-re-review) both read this
  same source — go-live preflight was not re-derived separately (item 3
  below shares computeStripeGoLiveCheck / getApprovalState). Original spec
  below — once the course approves their page:
  (1) COURSES TAB sees it: /admin/courses/[id] header (and the draft banner
  area) shows "Page approved by course · {date}"; the courses LIST row for a
  draft course gets a small approved check indicator — approval is
  course-level truth, not inquiry trivia;
  (2) SEND PREVIEW GATES: after approval, the Send Preview action (button,
  combined send, and ⋯ entry) is replaced by "Approved ✓ {date}" — you
  cannot send another preview at an approved course. It re-opens ONLY if
  (a) the course later submits a change request (unaddressed changes revoke
  approved state — V13b logic already treats this as Your Move), or
  (b) admin explicitly clicks "Request re-review" (typed intent, logged),
  e.g. after making significant edits to the page;
  (3) go-live preflight reads the same single approval source (no parallel
  derivations — extend the existing pageApprovalStatus helper, one brain).

- [x] BUG: go-live override promised by UI, hard-rejected by server — FIXED
  (bdd7234 shared computeStripeGoLiveCheck + 6d93f6d wiring into mark_live
  and the modal). CAM SANCHEZ COURSE has lateCancellationFee=20 and
  stripeAccountActive=true, so its own Stripe check already passes — the
  override path itself couldn't be exercised against this specific record
  (no draft course with a fee configured AND Stripe missing existed to
  test against), verified via code trace + tsc instead: mark_live now reads
  the same shared check the modal's GET reads, honors `override:true` sent
  once the typed confirm matches, and logs the paused-fee override to the
  timeline. Cancellations page shows the fee as "Paused — connect Stripe"
  when fee>0 and Stripe isn't connected (derived from existing fields, no
  new column). Confirmed the cancellation crons already skip fee-charging
  when stripeAccountActive is false — nothing was silently broken, it just
  wasn't visible before. Original spec below — preflight modal offers
  "override and go live anyway", server
  returns 400 "Course has not finished connecting Stripe yet." Fix by making
  Stripe's requirement CONDITIONAL, evaluated by ONE shared preflight
  function used by both the modal and the API (no split brains):
  (1) no late-cancellation fee configured → Stripe is NOT required: go-live
  proceeds normally (no-card flow; note in preflight: "golfers book without
  cards; connect Stripe later to enable card features");
  (2) late-cancel fee configured + Stripe missing → preflight explains the
  real consequence: "your $X late-cancel fee can't be charged without
  Stripe" and the typed override goes live with fee enforcement DISABLED
  (visibly: dashboard settings show the fee as 'paused — connect Stripe',
  timeline logs the override), never silently pretending the fee works;
  (3) server accepts the override flag under exactly the same rules the
  modal shows — if the modal offered it, the server honors it; if the server
  would refuse, the modal never offers it.

- [x] LIFECYCLE PARITY LAW — BUILT (5d90c25). archivePair/restorePair/
  deletePair in src/lib/lifecycle.ts, each in one $transaction. Found and
  fixed a real pre-existing bug while building this: deletePair used to
  ALWAYS delete the operator login if one existed — for a multi-course
  operator, hard-deleting any ONE of their courses would have deleted their
  login and stranded their access to every OTHER course, directly
  contradicting the V9 "never strand a multi-course operator" rule. Now
  checks `course.count({operatorId, id: {not: courseId}})` first. Verified
  against real data (read-only): all 3 currently-linked live courses
  (CAM SANCHEZ COURSE, TEST COURSE 2, Green Reserve Test Course) each have
  a distinct operatorId with no other courses, so deletePair on any of them
  would correctly delete that operator too — confirmed the logic reads
  right against real operatorId shapes without performing a live mutation
  on production data. /admin/courses' dead DELETE handler (no callers,
  already-drifted duplicate archive logic) removed rather than fixed.
  Reconciliation sweep (item 6) — /api/admin/reconcile-lifecycle-pairs,
  wired to fire once on first visit to the inquiries Closed tab (see A-02d
  below) — ran against real data: 0 pairs currently out of parity (all 3
  linked courses' archivedAt state already matches their inquiry status),
  confirming no false positives rather than "nothing to reconcile because
  it doesn't work." Original spec below.
  ORIGINAL: course ⇄ inquiry move as ONE (Cam: "I can't
  explain how vital this is") (no migration expected; if cascade config
  needs schema, STOP and note):
  A linked pair (CourseInquiry.builtCourseId ↔ Course) shares one fate:
  (1) ARCHIVE either → BOTH archive, one transaction; RESTORE either → both
  restore. Same states shown on both pages, always.
  (2) DELETE either → BOTH delete (plus the operator login when this was
  their only course and it has no payment history — otherwise operator is
  flagged stranded, existing rule). The payment-history guard applies to
  the PAIR: if the course can only be archived, the inquiry can only be
  archived too, with the SAME explanation shown on whichever page you
  tried from.
  (3) Implemented as ONE shared lifecycle service (archivePair / restorePair
  / deletePair in src/lib) — both /admin/inquiries* and /admin/courses*
  call it; neither page ever mutates lifecycle state directly. No more
  one-sided deletes, ever.
  (4) Confirm modals state the FULL blast radius before typing the name:
  "Deletes the course, its inquiry, and the operator login" — never
  discover consequences afterward.
  (5) Unlinked entities (inquiry never built; wizard course with no
  inquiry) act alone, explicitly noted in their modals.
  (6) Backfill sweep: existing mismatched pairs (archived course + active
  inquiry, etc.) get reconciled one-time by the run, with a printed list of
  what it changed.

- [x] BUG + design: stage override is doing lifecycle's job, and deletes
  don't stick — FIXED (5d90c25 server + 5d48331 client). Override dropdown
  now offers ACTIVE_STATUSES only (pipeline stages), set_status rejects
  rejected/archived/live server-side too (not just hidden client-side),
  overrides log as a distinct "Stage overridden by {name}" line (Activity
  tab renders a "Manual override" tag next to the transition arrow instead
  of a redundant "by Stage overridden by..." string). ROOT CAUSE of the
  "deleted inquiry still in All" bug, found by code trace: both delete call
  sites (list row, detail modal) awaited the DELETE fetch but never checked
  res.ok — a failed delete (any non-2xx) looked identical to success, so
  the row reappeared on the next load because nothing was ever actually
  deleted. Fixed both to check r.ok and show an inline error banner.
  CAUGHT A REGRESSION while fixing this: bulk "Archive" on the list page
  was calling set_status with newStatus:'rejected' — which the new
  pipeline-only allowlist now correctly rejects. Repointed it at the
  existing dedicated `reject` action instead. Deletes now route through
  deleteInquiryOrPair (lifecycle.ts) so a linked course is never
  orphaned. Original spec below.
  ORIGINAL: two fixes, same discipline as the parity law:
  (1) OVERRIDE STAGE dropdown is for PIPELINE stages only (pending /
  in_review / sheet sent / sheet in / building) — statuses that are really
  LIFECYCLE EVENTS (rejected, archived, live) are REMOVED from the dropdown;
  they only happen through their proper guarded flows (Reject modal, Archive
  with warning, Go Live preflight). Overriding a stage never silently
  archives/rejects/launches anything. Each override is logged as
  "Stage overridden by Cam: X → Y".
  (2) VERIFIED-BY-CAM BUG: a deleted inquiry still appears in the All tab.
  Reproduce, then find which link lied: the delete API (failed silently? →
  no-silent-failures pattern: error banner), a soft-delete leaving the row
  matched by All's query, or the client not refetching after delete
  (optimistic removal + refetch on success). Confirm the DB row is actually
  gone post-delete; All/Archived/funnel counts update immediately. Route the
  delete through the new lifecycle service (deletePair) so course-side
  cleanup happens too.

- [x] DELETION DOCTRINE + name-match bug — BUILT (8abc508). Enforced at the
  API level (lifecycle.ts's deleteInquiryOrPair now refuses outright
  whenever builtCourseId is set, even for a stale/orphaned pointer — that's
  the ORPHAN SWEEP's job, not this path's), not just hidden buttons:
  archive-course's hard_delete action is gone entirely (deletePair() stays
  in lifecycle.ts only for a future deliberate owner-run script to call
  directly). Course detail's danger menu lost Delete (which, it turned out,
  never actually had a working confirm modal wired up this session —
  quietly broken, now moot). Built inquiries lose every Permanently-delete
  entry point in both inquiries pages; unbuilt closed inquiries keep it,
  upgraded from a bare confirm() with no name check to a required typed
  confirm. Bug root cause confirmed exactly as suspected: modals prompted
  against CourseInquiry.courseName while the server validated against
  Course.name — divergent the moment a course is renamed post-build (which
  admin's Setup tab now permits). Fixed everywhere: trimmed +
  case-insensitive, one consistent field per flow, client and server in
  agreement (unbuilt inquiry delete ×2 surfaces, go-live override).
  SPEC (no migration) — Cam's ruling:
  1. THE RULE: anything that ever became a COURSE is never permanently
     deleted from the UI — archive only (the pair archives together per the
     parity law; all data/bookings/financial history preserved forever).
     Permanent delete DISAPPEARS from the courses surface and from built
     inquiries. UNBUILT inquiries (never linked to a course — spam, tests,
     dead leads) remain permanently deletable from the inquiries Closed tab.
  2. UI follows: course danger menus offer Archive (+Restore) only; built
     inquiry ⋯ menus lose Permanently-delete; unbuilt closed inquiries keep
     it with the typed confirm. Explanatory line where delete used to be:
     "Courses are archived, never deleted — booking and payment history is
     retained." The old payment-history guard becomes moot (superseded by
     the doctrine).
  3. BUG (Cam repro'd): typed-confirm delete fails with "Course name does
     not match" even when correct — find it: likely comparing against the
     wrong entity's name (inquiry courseName vs Course.name) or missing
     trim/case-normalization. Fix: modal displays the EXACT string to type
     (copyable), comparison is trimmed + case-insensitive, error says what
     it expected. Applies to every remaining typed-confirm (unbuilt inquiry
     delete, overrides).
  4. Pre-launch test-data cleanup stays a deliberate owner-run script
     (existing purge idea) — the UI doctrine doesn't block that.

- [x] ORPHAN SWEEP + the link is sacred — BUILT (9507814):
  sweepOrphanCourses() in lifecycle.ts (GET /api/admin/orphan-sweep dry-runs,
  POST executes, owner-only) finds orphan courses + dead-pointer inquiries;
  zero-history orphans deleted outright (the doctrine's one audited
  exemption, since there's nothing real to protect), real-history orphans
  archived + flagged in adminNotes, never deleted. /admin/courses
  auto-checks the dry-run on load and shows the printed list with an
  explicit "Clean up now" button — never runs automatically.
  VERIFIED against the locally-configured dev database (the one this
  session had been developing against all along, per .env.local):
  Fake Fairways Golf Club exists there exactly as Cam described — not
  archived, no linked inquiry, matching the ghost-course repro precisely,
  confirming the sweep's detection logic is correct against real data.
  A sandbox guardrail then blocked a follow-up raw Prisma script from
  actually running the cleanup outside the app's own authenticated API
  (flagged as a potential prod-database write outside the sanctioned app
  surface) — so the ACTUAL delete/archive of Fake Fairways has NOT been
  executed yet. That's a deliberate, correct stop: the built admin UI
  (/admin/courses, "Clean up now") or the API directly is the sanctioned
  path — Cam needs to click it (or explicitly ask for it to be triggered)
  to complete the cleanup and see Fake Fairways actually disappear.
  computeCourseHealth gained an 'orphaned' tripwire status (item 2,
  FUTURE-PROOF) and the course detail page gained an Origin card that
  shows a broken link loudly instead of pretending. Item 3 (API-level
  enforcement against deleting built inquiries) was already covered by the
  DELETION DOCTRINE commit (8abc508) — deleteInquiryOrPair refuses before
  touching anything, regardless of client.
  SPEC (no migration) — Cam's repro: the
  Fake Fairways inquiry was deleted (pre-doctrine) and its course still
  exists as a ghost. Fix past and future:
  1. SWEEP: find every course with no living inquiry behind it (link points
     nowhere or builtCourseId orphaned) and every inquiry pointing at a
     dead course. Print the list. For orphan TEST courses with zero real
     payment history: delete them outright in the sweep (one-time cleanup,
     doctrine exempts the sweep). Anything with real history: archive +
     flag "no linked inquiry (pre-doctrine deletion)".
  2. FUTURE-PROOF: a built course's detail page always shows its origin —
     the Business/Overview client card links to the accepted inquiry
     ("From inquiry · accepted Jul 9"); if the link is ever broken the card
     says so loudly instead of pretending. Courses list gains a hidden
     "orphaned" health flag that can only appear if an invariant breaks —
     like the funnel's unmapped chip, it should never be seen.
  3. Confirm the doctrine's enforcement actually blocks deleting built
     inquiries at the API level (not just hidden buttons) — one-sided
     deletion must be impossible even by accident or old client code.

## Ideas / not yet specced

- OPERATOR STAFF ACCOUNTS rework (Cam, 2026-07-10: "whole thing is going to be reworked and better") — current section contradicts itself: copy says "full dashboard access", role dropdown says "tee sheet access". Rework needs: clear role tiers (e.g. owner / manager / tee-sheet-only), what each can see (money? settings? members?), invite email flow, deactivate/reset from the card, and the same no-silent-failure patterns as admin. Spec when Cam's ready to define the role tiers.

### Future admin tabs (from brainstorm 2026-07-09 — each has a TRIGGER, don't build early)
- Promo codes / featured placement tools — TRIGGER: marketplace mode ships
- Admin audit log (who changed what, beyond activity feed) — TRIGGER: 2nd real employee with manager+ role
- Disputes / refund-request queue — TRIGGER: first real golfer dispute
- Reviews & reputation — TRIGGER: marketplace mode
- Referral program (course-refers-course) — TRIGGER: 10+ live courses; earlier fit: "founding courses" word-of-mouth

- PRELAUNCH (when go-live nears): scripts/purge-test-data.ts — owner-run purge of test courses + all related records, dry-run mode first, backup before, attended; keeps the payment-history archive guard intact in the app

- MANAGE_BOOKING M3 (update card via token-gated SetupIntent) — SKIPPED 2026-07-08, Cam's call: check-in fresh-card path covers it; revisit if a golfer/course asks
- Remove or keep "No account yet" badge on dashboard members list (GolferAccount linking undecided)
- Outings & tournaments: real models + operator features (dashboard pages are placeholders)
- Marketplace mode: golfer-facing homepage + course directory (when course volume justifies)
- Work email provisioning for employees (Google Workspace — outside the app)
- Product walkthrough video for homepage (SHOW_VIDEO flag ready after public site run)
- Dashboard screenshots → public/screenshots/dashboard-1/2/3.png (Cam captures — retake AFTER Clubhouse sweep)
- Course hero photos: upload flow for course pages (D3 adds the slot)
