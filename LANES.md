# Lanes — how GreenReserve work runs (Cam 2026-11-14, replacing the 2026-11-10 version)

Cam's goal: an AI development operation that is effective and cheap. One coordinator, a few lanes with hard file
boundaries, cheap agents for cheap work, and a small number of PRs waiting on Cam at any time. The full history of
how this was set up is in `docs/DECISIONS.md` (appendix "LANES.md as it stood on 2026-11-10").

## The lanes
| Lane | Reads | Owns (writes) | Never touches |
|---|---|---|---|
| **Build** (coordinator) | CLAUDE.md, `lanes/build.md` | ALL shared code: `src/lib/**`, `src/app/api/**` (except admin read/display routes), `prisma/**`, `globals.css`, root layouts, `src/components/ui/**`, CI, config, `.claude/**`, CLAUDE.md, LANES.md, specs. Merges every PR. | — |
| **Dashboard** | CLAUDE.md, `lanes/dashboard.md` | `src/app/dashboard/**`, `src/components/dashboard/**` | shared code |
| **Admin** | CLAUDE.md, `lanes/admin.md` | `src/app/admin/**`, `src/components/admin/**`, admin routes that only read or display | sign-in and money routes (`src/app/cam/**`, `src/app/api/cam/**`, `api/admin/{login,logout,session,forgot-password,set-password,two-factor,passkeys,owner-devices,refund,course-payouts,data-reset,disputes,transactions,change-password,bootstrap,employees}` and any route that charges, refunds, signs in or steps up), `src/lib/**`, schema |
| **Homepage** | CLAUDE.md, `lanes/homepage.md` | `src/app/page.tsx`, `HomeContent.tsx`, `home.module.css`, `src/app/{teesheet,for-courses,demo,contact}/**`, `src/components/home/**`, `Nav`, `Footer`, `PlainHeader` | `legal/`, `src/lib/**` |
| **Golfer** | CLAUDE.md, `lanes/golfer.md` | `src/app/{courses,book,g,checkin,manage,pay,receipt,statement,events,membership}/**` and their components | every price, fee and charge |
| Testing, Security (read-only) | CLAUDE.md + the brief | `lanes/testing/`, `lanes/security/` (findings) | all code |
| Company (no app code) | CLAUDE.md + the brief | `company/` (outreach, course lists, email and copy drafts) | all code, published `legal/` files |

A change that needs another lane's files is a `send_message` to Build. A change that crosses areas (a field on the
golfer page, the tee sheet and admin) is ONE PR from Build.

## How a page gets done
1. **Mockup.** Build makes it from the live code ("as it works today", only the skin changes, unless Cam asked for a
   change) in BOTH looks for the dashboard. Cam comments in the artifact; Build answers each thread.
2. **Approve.** Cam says "approved". Build writes the decisions into the lane file (and data needs into
   `lanes/build.md`), then sends the lane one short brief that points at them.
3. **Build it.** Data first (Build), then the page (lane), each its own PR, each reviewed (see CLAUDE.md "Review").
   **Design and accessibility tools (Cam 2026-11-16).** When a session has them, it uses them as a second check, never instead of the mockup or `docs/DECISIONS.md` → "Design system":
   - **Mockups:** before a mockup goes to Cam, run Design's `design-critique` and `accessibility-review` (WCAG 2.1 AA contrast in BOTH looks, tap targets, labels), and fix what fails.
   - **Built pages:** before the PR is held for Cam, run UI Design Review's `ui-review` on the rendered page at phone and desktop width, plus `accessibility-review`. Put the results in the PR.
   - **Build sessions:** sessions touching money, sign-in or `src/lib` may run Security Guidance. Page lanes don't, because it runs an AI review every turn and costs too much there.
   - **Community plugins:** never install or use plugins that run commands, such as securitymaxxing, Backend Design or Pi Security. That is a supply-chain risk on a money app.
4. **Hold for Cam.** PRs wait for Cam's review sitting; Build merges what he OKs, in dependency order.

## Limits that keep cost down (Cam 2026-11-14)
- **Work-in-progress cap: one PR per lane waiting on Cam.** A lane with a PR waiting starts nothing new; it goes idle.
- **One review sitting.** Cam reviews everything waiting at once; Build merges it all in order straight after.
- **Batch comments.** Cam comments a whole mockup, then Build revises once (not one publish per comment).
- **Cheapest agent that can do it right** (models are fixed in `.claude/agents/*.md`):
  | Work | Agent | Model |
  |---|---|---|
  | Lookups, "where is X" | `scout` | Haiku · low |
  | Running checks before review | `check-runner` | Haiku · low |
  | Mechanical edits from an exact plan | `builder` | Sonnet |
  | Mockups from the live code | `general-purpose` with `model: "sonnet"` | Sonnet |
  | Review of UI / copy / tests | `light-reviewer` | Sonnet · medium |
  | Review touching money, sign-in, lib, api, prisma, crons, config | `final-reviewer` | Fable · high |
  | Security sweep (sign-in, money, routes) | `security-auditor` | Opus · high |
  | Money, sign-in, schema, judgement | the lane head itself | never a cheaper model |
- **Don't delegate small work** (under ~3 files, or what you already have open). At most one sub-agent at a time.
- **Short sessions.** One job, then idle. A session whose context gets large hands over with a short note in
  `lanes/<lane>/` and Build starts a fresh one.
- **No polling.** Lanes message Build once when a PR is green; Build waits on background checks, never loops by hand.
- **Generated files are never committed** (`docs/CODEMAP.md`, `docs/codemap.json`): they are rebuilt at session
  start, so PRs never conflict on them. `STATUS.*` is regenerated by Build only.
- **Cost per page.** Each PR body ends with one line: `Cost: <agents used> · <rough size: S/M/L>`. Build reviews the
  week's lines with Cam on Fridays.

## Rules for every lane
1. One lane per session; the title starts with the lane name.
2. Stay in your files; shared code is Build's alone.
3. Never touch production (no prod DB, live Stripe keys, real emails or texts). Testing and Security run locally.
4. No secrets or customer data in findings, PRs, messages or artifacts. Never read `.env`.
5. Lanes talk to Build only (`send_message`); Build asks Cam. A product question goes with your recommendation.
6. Before asking Build to merge: merge `origin/main` into your branch, run your tests, make sure CI is green.

## Running the app locally (Testing, Security, DB tests)
```bash
# Postgres on 5499 (a throwaway cluster in /tmp)
mkdir -p /tmp/pgdata && chown postgres /tmp/pgdata
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pgdata -A trust" >/dev/null
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgdata -o '-p 5499 -k /tmp' -l /tmp/pgdata/log start"
su postgres -c "psql -h /tmp -p 5499 -c 'create database gr_ci'"
export DATABASE_URL="postgresql://postgres@localhost:5499/gr_ci?host=/tmp" DIRECT_URL="$DATABASE_URL" \
       JWT_SECRET=ci-only-not-a-real-secret-0123456789abcdef NEXT_PUBLIC_BASE_URL=http://localhost:3100
npx prisma migrate deploy && npx tsx scripts/perf-seed.ts      # course slug perf-audit
nohup npx next dev -p 3100 > /tmp/next.log 2>&1 &
```
Sign in as the seeded operator, or mint a `gr_operator` cookie the way the DB tests do. Playwright and Chromium are
pre-installed (`require('playwright')`). Local only — never a production URL with real data.
