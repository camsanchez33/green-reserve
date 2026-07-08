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
- [ ] HARDENING_SPEC — full spec in HARDENING_SPEC.md, ONE long run (~1hr, unattended): (A) atomic tee-time claim, capacity-aware, shared claimTeeTime(), concurrency test script must pass; (B) tenant-isolation integration test matrix (cross-course, cross-golfer, cross-role, token replay) — failures are vulnerabilities, fix in-run; (C) verify card data never touches server + Stripe flow docs + webhook idempotency; (D) per-surface session policy with sliding renewal, documented in CLAUDE.md; (E) ARCHITECTURE.md backend map generated by scripts/route-inventory.ts + URL surface review + noindex on authed paths + consolidation without file moves. Commit after each section. NO folder restructuring.
- [ ] BACKUP_OPS_SPEC — full spec in BACKUP_OPS_SPEC.md: (A) nightly encrypted pg_dump via GitHub Actions + docs/RESTORE.md + quarterly restore drill; (B) "Shipping to production" discipline in CLAUDE.md — preview deploys + Neon DB branches for migrations, rollback steps; (C) docs/RUNBOOK.md secrets inventory (names/locations only, NEVER values) + laptop-loss + rotation runbooks. Ends with 2 manual steps for Cam (GitHub secrets). No migration, unattended OK.
- [ ] ONBOARDING_SPEC Phase O1b — TWO course types only (public/private) + branch questions per type (3 public, 5 private), structured needsJson answers, migrate existing type values, wizard type step reorganized (small run)
- [ ] ONBOARDING_SPEC Phase O2 — type-aware details sheet: structured sections per course type, server-side draft save, mobile-first (big run)
- [ ] ONBOARDING_SPEC Phase O3 — build handoff: wizard fully pre-filled from structured sheet + ready-to-build checklist (medium run)
- [ ] ONBOARDING_SPEC Phase O4 — go-live welcome email + walkthrough video embed + welcomeEmailSentAt guard (schema change, run attended)
- [ ] ONBOARDING_SPEC Phase O5 — homepage redesign pass: editorial layout, real screenshots replace icon cards, hero de-templated, funnel-matched copy (medium run)
- [ ] ONBOARDING_SPEC Phase O6 — private course page mode: members-only courses get info + member sign-in page (no public booking), server-side booking rejection for private type (medium run)

## Ideas / not yet specced

- Remove or keep "No account yet" badge on dashboard members list (GolferAccount linking undecided)
- Outings & tournaments: real models + operator features (dashboard pages are placeholders)
- Marketplace mode: golfer-facing homepage + course directory (when course volume justifies)
- Work email provisioning for employees (Google Workspace — outside the app)
- Product walkthrough video for homepage (SHOW_VIDEO flag ready after public site run)
- Dashboard screenshots → public/screenshots/dashboard-1/2/3.png (Cam captures — retake AFTER Clubhouse sweep)
- Course hero photos: upload flow for course pages (D3 adds the slot)
