# Lanes — how GreenReserve work runs in parallel (Cam 2026-11-10)

Several Claude sessions at once, each in ONE lane. A lane is a scope of files and a kind of work, never a page or a
feature. Lanes exist so work can run side by side without two sessions writing the same file.

## The lanes

| Lane | Session title | Writes code? | Owns | Never touches |
|---|---|---|---|---|
| **Build / Dashboard** (coordinator) | `Build — <what it's doing>` | Yes | `src/app/dashboard/**`, `src/components/dashboard/**`, and ALL shared code: `src/lib/**`, `src/app/api/**` (except admin's read/display routes), `prisma/**`, `globals.css`, `layout.tsx`, `src/components/ui/**`, config, CLAUDE.md, specs. Merges every PR. | — |
| **Admin** | `Admin — <tab>` | Yes | `src/app/admin/**`, `src/components/admin/**`, and the admin routes that only read or display (`src/app/api/admin/**` minus the ones below) | sign-in and money: `src/app/cam/**`, `src/app/api/cam/**`, `api/admin/{login,logout,session,forgot-password,set-password,two-factor,passkeys,owner-devices,refund,course-payouts,data-reset,disputes,transactions}` and any route that charges, refunds, signs in or steps up — those stay Build's (CLAUDE.md: money and auth never delegated); `src/lib/**`, schema |
| **Homepage** | `Homepage — <task>` | Yes | `src/app/page.tsx`, `HomeContent.tsx`, `home.module.css`, `opengraph-image.tsx`, `src/app/{teesheet,for-courses,demo,contact}/**`, `src/components/home/**`, `Nav.tsx`, `Footer.tsx`, `PlainHeader.tsx`, `public/home/shots/**`, `scripts/screenshots/**`; privacy/terms layout only | `legal/`, `src/lib/**` (e.g. `faq.ts` wording goes to Build) |
| **Golfer** | `Golfer — <flow>` | Yes | `src/app/{courses,book,g,checkin,manage,pay,receipt,statement,events,membership}/**`, `CourseCard`, `CourseHeaderBar`, `CourseJoin`, `CoursePacks`, `GolferExitLinks`, `TrustNote`, `AuthPhotoShell` | every price, fee and charge (`src/lib/**`, `src/app/api/**`) |
| **Testing** | `Testing — <flow>` | No | `lanes/testing/` (its findings) | all code |
| **Security** | `Security — <area>` | No | `lanes/security/` (its findings) | all code |
| **Company** | `Company — <task>` | No app code | `company/` (outreach, course lists, email and copy drafts) | all code, `legal/` published files |

**One merge queue (Cam 2026-11-10: four build lanes at once).** Lanes never merge. Before asking Build to merge, a
lane merges `origin/main` into its own branch and regenerates the code map and status board (`node scripts/codemap.mjs
&& node scripts/status.mjs && node scripts/status-html.mjs`), so the generated files never conflict. Build merges one
PR at a time on green GitHub CI. A change one lane needs in another lane's files is a `send_message` request to Build.
The final reviewer reads one PR; what links the lanes together is CI on every PR, the one queue, and Testing walking
whole flows across pages after merges.


**No lane starts without Cam's plan (Cam 2026-11-11: "until I give plans for how the other two should work and operate
idk why they just started working").** Admin and Golfer are PAUSED: Cam reviews their open PRs (#360, #365, #361, #363)
and writes a plan per lane first; nothing in them merges and no new job starts until then. Homepage is reactive only —
a job when the real product changes and the homepage must match (the demo vs the tee sheet, page info, privacy/terms),
never a self-chosen polish pass. Build never dispatches a lane "because the launch plan says so"; Cam's plan does.

## Rules for every lane
1. **One lane per session.** The session title starts with the lane name.
2. **Stay in your files.** If the work needs a file outside your lane, stop and send it to Build (below). Shared code —
   `src/lib/**`, `src/app/api/**`, `prisma/**` — is Build's alone, so two sessions never edit it at once.
3. **A change that crosses areas is one PR in Build** (a field shown on the golfer page, the tee sheet and admin is
   one PR, not three lanes).
4. **Never touch production.** No prod database, no live Stripe keys, no real emails or texts to real people. Testing
   and Security run against a local Postgres and `next dev` (below).
5. **No secrets or customer data** in findings, PRs, messages or the Control Room. Never read `.env`.
6. **Branches.** Each session works on the branch it was given. Only Build pushes to
   `claude/walkthrough-2-prioritization-ui5xyu`.
7. **Report to the Control Room** (CLAUDE.md "Control Room"): your own row, `state` and `doing`, at start, after each
   step, and before ending.
8. **Hand-offs go to Build** with `send_message` to the Build session (its id is in your opening message), short:
   lane, what you found or finished, where the file is. Build replies the same way. Lanes never ask Cam directly.
9. **Cam decides.** Anything that needs a product choice goes in your findings as a question with your
   recommendation; Build asks Cam with the question feature. Never decide a product question yourself.

## Dispatch — Build runs the lanes (Cam 2026-11-10: "I don't want to manage each chat unless needed")
- **Cam talks to Build only.** Build opens each lane session with `create_session`, a complete brief (scope, files,
  output, budget) and the tag `lane:<name>`; lanes report back to Build only, by `send_message`.
- **Build relays:** a short summary of each report to Cam, his decisions as questions (the question feature), and the
  fixes into Build's own queue. Cam opens a lane chat only if Build says one needs him.
- **One job per session.** A lane session does its one brief and ends; Build archives it once the report or PR is in
  (`archive_session`). The next job is a NEW session with a new brief, never a long-lived chat that grows.
- **When to dispatch:** Testing after each launch-plan page lands (one flow per session, at most two at once);
  Security before outreach (Nov 30) and after any money or sign-in change; Company per launch-plan step (one
  deliverable per session). Nothing is dispatched "to stay busy".
- **Build checks on lanes** only when they report or about every 2 hours (`list_sessions` tags `lane:*`), never by
  polling. A lane silent for 2+ hours gets one short `send_message`; a lane stuck twice is archived and re-briefed.

## Spend (Cam 2026-11-10: "limit token usage and spend")
Each session caches its own context automatically, but caches are NOT shared between sessions — every new session
starts cold. So the savings come from:
- **Model by lane:** Testing and Company run on Sonnet (`model: "claude-sonnet-5-5"`, effort medium). Security and
  Build stay on the strongest model (money and sign-in never go to a cheaper one — CLAUDE.md).
- **Short sessions:** one brief, then end. A long session re-reads its whole history on every turn.
- **Small reads:** `docs/CODEMAP.md` before grepping; only the line ranges needed, never a whole large file; no
  full test-suite runs in a read-only lane.
- **Few subagents:** at most 1 at a time (Security: 2), never one per file or route.
- **Budgets in the brief:** web searches (Company ~20), screenshots at deviceScaleFactor 1, one report or PR per job.
- **Build itself:** starts a fresh Build session when its history gets long (past ~400k tokens), handing over with a
  short note: open PRs, decisions pending, what's next.

## The web — how work and questions flow (Cam 2026-11-10: "every question from anywhere should come back to me")
```
                 Cam
                  │  questions up (the question feature) · decisions down
              Build (coordinator)
   ┌──────────┬───────┼─────────┬──────────┬──────────┐
 Admin    Homepage  Golfer   Testing   Security   Company      ← lanes: plan, build, report
   │          │       │         │          │          │
 scout · check-runner · builder · auditors · light/final-reviewer ← each lane's own helpers, cheapest that fits
```
- **Every question goes up to Cam, whoever raises it:** a lane, a helper or a reviewer. A lane sends it to Build and
  keeps working on whatever doesn't depend on it.
- **Build never answers a product question for Cam.** It collects them, asks Cam with the question feature (a few at
  a time, each with a recommendation), then either sends the answer back down to the lane that asked or handles it
  itself when the work is Build's (shared code, money, sign-in, schema). Every answer is written into a spec file
  (`STRESS_1110_SPEC.md` or the lane's own notes), so no lane asks twice.
- **What Build may decide without Cam:** only how to build something Cam already decided: file ownership, merge
  order, which helper does a job, a requested shared-code change that follows an existing rule. Anything that changes
  what a course, golfer or Cam sees or pays goes to Cam.
- **Down:** Build sends each lane its jobs and Cam's answers. Lanes send their helpers narrow, complete briefs.

## Delegation inside every lane — the same routing Build uses (Cam 2026-11-10)
Every lane session follows CLAUDE.md's "Overseer protocol": it is the overseer of its own job, and it gives each
piece of work to the cheapest agent that can do it right. The agents and their models are fixed in
`.claude/agents/*.md`, so choosing the agent IS choosing the model.

| Work inside a lane | Give it to | Model · effort |
|---|---|---|
| Lookups: "where is X", "which routes write Y", "what does route Z check" | `scout` | Haiku · low |
| Running the checks (parse, tsc, guards, pinned tests) before a review | `check-runner` | Haiku · low |
| Broad searches across many files where only the answer is needed | `Explore` | pass `model: "haiku"`, `effort: "low"` |
| Mechanical edits from an exact plan you wrote | `builder` | Sonnet · pass `effort: "low"` for copy/markup, medium for logic |
| Design / no-silent-failure sweeps of pages | `design-auditor`, `admin-ux-auditor` | Sonnet · low |
| Checking shipped code against a spec | `spec-conformance` | Sonnet · medium |
| Security sweeps — only when a diff touches sign-in, money or routes | `security-auditor` | Opus · high |
| Review of a UI / copy / test-only diff | `light-reviewer` | Sonnet · medium |
| Review of a diff touching money, sign-in, `src/lib`, `src/app/api`, `prisma`, crons, pay pages or config | `final-reviewer` | Fable · high |
| Docs-only or generated-file diff (codemap, STATUS, lanes/, specs) | no reviewer — CI's drift check covers it | — |
| Judgement, planning, money, sign-in, anything ambiguous | the lane session itself | see "Lane heads" |

**Reviewer tiers (Cam 2026-11-10: "tiered … some haiku too … save money but keep it effective").** Run
`check-runner` first, then hand the reviewer its output so the reviewer reads instead of running commands. Pick
the reviewer by the files in the diff, not by how small it looks: one changed line in `src/lib` is a
`final-reviewer` diff. `light-reviewer` answers `ESCALATE` when it sees such a file — then use `final-reviewer`.
Never lower the effort of `final-reviewer` or `security-auditor`.

**Lane heads (Cam 2026-11-10).** Build and Admin run on Opus (money, sign-in, security). Homepage and Golfer run on
Sonnet — their files hold no money or sign-in, and anything that does goes to Build. A lane head never runs
on a bigger model than its table says; a job that needs more goes up to Build.

**Spend rules (Cam 2026-11-10: "we are burning usage").**
- Build does not subscribe to lane PRs. A lane messages Build once its PR's GitHub CI is green; Build checks once and merges.
- Lanes don't commit `STATUS.*`. Build regenerates the status board on its own branch after merges. Lanes still
  regenerate `docs/CODEMAP.md` / `docs/codemap.json`, which CI checks.
- One job at a time per lane. When the job is done, the lane reports and goes idle; Build archives it and starts the
  next job in a fresh session, so no session carries a long context.
- A job that passes about 30 turns stops and reports to Build with what's left.
- Build hands itself over to a fresh session (a short note in `lanes/build/`) once its context is large.

- **Don't delegate small work.** Under about 3 files, or anything the session already has open, it does itself: a
  sub-agent starts cold and re-reads everything.
- **Never delegate money or sign-in judgement to a cheaper model.** A scout may FIND the charge paths; deciding whether
  one can double-charge stays with the lane session (or `security-auditor`).
- **A sub-agent's answer is a claim to check,** not a finding: verify it before it goes in a report.
- **At most 1 sub-agent at a time** (Security: 2), each with a narrow, complete brief.

## Build
- Works LAUNCH_PLAN_SPEC.md in order for the dashboard; since Cam 2026-11-10 ("let's get 4 lanes going: the homepage, the dashboard, the admin and the golfer booking page") plan sections 1–4 run at once, one lane each, then the decision files (e.g. STRESS_1110_SPEC.md), one PR at a time.
- Every push: a PASS from the reviewer its files call for (above) first; merge only on green GitHub CI (Vercel preview is not a gate).
- Money, sign-in, tenant isolation and schema are done by Build's main session only, never a cheaper model.
- Picks up findings from `lanes/*/` after they merge: confirmed bugs are fixed, product questions go to Cam.

## Testing (read-only)
- **Job:** drive the real app end to end as a course or a golfer would, and find what a course wouldn't like:
  wrong numbers, dead ends, confusing steps, phone layout, slow screens.
- **One flow per session**, e.g. "book online → check in → pay → receipt", "a course's first day: log in → open the
  register → tee sheet → close out", "member pays dues", "an event from setup to the day".
- **Runs bursts, not all day:** after a launch-plan page is finished, or when Build asks.
- **Output:** `lanes/testing/<YYYY-MM-DD>-<flow>.md` — Must fix / Should fix / Polish, each with steps, what happened,
  evidence (file:line or screenshot path) and a suggested fix; then "What's good" and "Not tested". One docs-only PR
  per report, then a short `send_message` to Build.
- **Never** edits app code, never pushes to Build's branch, never merges.

## Security (read-only)
- **Job:** the SEC-1 promise — "security has to be insane". Sweep one area per session: route access
  (`requirePermission` / `areaGate`), course data isolation, payment paths (double charges, refunds, the ledger),
  sign-in doors (`securityEvent`), headers and packages, secrets in code or logs.
- **Use** the `security-auditor` agent definition as the checklist; verify each finding by tracing a real path.
- **The repo must stay private** while a report names an unfixed path; Build fixes Critical/High before the report merges.
- **Output:** `lanes/security/<YYYY-MM-DD>-<area>.md` ranked Critical / High / Medium / Low, each with the path to
  exploit, evidence and the smallest fix. A Critical or High finding is also sent to Build at once with
  `send_message`.
- **Runs:** a full sweep before outreach (Nov 30), then after any money or sign-in change.
- **Never** exploits production, never edits app code.

## Company (no app code)
- **Job:** the business side of the launch plan: the Nov 30 outreach (course list, first emails and texts, follow-ups),
  homepage and `/for-courses` copy drafts, demo script, FAQ answers, run-the-company docs.
- **Rules:** fee wording only from `legal/LQ-2_FEE_COPY.md`; email addresses only as `src/lib/contact.ts` names them;
  no published agreement file is ever edited; homepage copy follows HOMEPAGE_SPEC.md §0 (no durations, no contract
  terms). Nothing is sent to a real person — drafts only; Cam sends.
- **Output:** files under `company/`, one docs-only PR per piece, merged on green CI by Build; Cam reviews the drafts.

## Running the app locally (Testing and Security)
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
