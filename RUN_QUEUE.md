# Run Queue

Ordered list of Claude Code runs. One item per run. Check off when committed, pushed,
and verified on the live site. After every run: `git status` — if dirty, `git checkout -- .`

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
- [ ] Small run: extend gr_member session from 7 to 90 days (src/lib/member-session.ts)

## Ideas / not yet specced

- Remove or keep "No account yet" badge on dashboard members list (GolferAccount linking undecided)
- Outings & tournaments: real models + operator features (dashboard pages are placeholders)
- Marketplace mode: golfer-facing homepage + course directory (when course volume justifies)
- Work email provisioning for employees (Google Workspace — outside the app)
- Product walkthrough video for homepage (SHOW_VIDEO flag ready after public site run)
- Dashboard screenshots → public/screenshots/dashboard-1/2/3.png (Cam captures — retake AFTER Clubhouse sweep)
- Course hero photos: upload flow for course pages (D3 adds the slot)
