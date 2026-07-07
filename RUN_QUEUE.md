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

## In progress

- [ ] Admin Phase 7: cross-course activity feed (running now — verify + git status)

## Queue (run in this order)

- [ ] ADMIN_V2_SPEC Phase 0 — banner-on-login-page bug, remove golfer stat, clickable overview
- [ ] ADMIN_V2_SPEC Phase 1 — full course detail page at /admin/courses/[id], kill drawer
- [ ] ADMIN_V2_SPEC Phase 2 — inquiries kanban board
- [ ] ADMIN_V2_SPEC Phase 3 — two-way admin↔course messages (schema change, run attended)
- [ ] ADMIN_V2_SPEC Phase 4 — employee roles (owner/manager/support/viewer) + temp-password provisioning (schema change, run attended)
- [ ] ADMIN_V2_SPEC Phase 5 — type-aware add-course wizard
- [ ] PUBLIC_SITE_SPEC Phases A+B — footer fix, /contact, /courses redirect, all-50-states form, screenshots section, SEO metadata
- [ ] Small run: extend gr_member session from 7 to 90 days (src/lib/member-session.ts)

## Ideas / not yet specced

- Remove or keep "No account yet" badge on dashboard members list (GolferAccount linking undecided)
- Outings & tournaments: real models + operator features (dashboard pages are placeholders)
- Marketplace mode: golfer-facing homepage + course directory (when course volume justifies)
- Work email provisioning for employees (Google Workspace — outside the app)
- Product walkthrough video for homepage (SHOW_VIDEO flag ready after public site run)
- Dashboard screenshots → public/screenshots/dashboard-1/2/3.png (Cam captures)
