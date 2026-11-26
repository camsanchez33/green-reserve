# Build coordinator handoff (2026-11-26)

Read this, CLAUDE.md, LANES.md, lanes/build.md. Keep this file current; it replaces reading old chat history.

## How to merge
- `gh api repos/camsanchez33/green-reserve/pulls?state=open` → for each PR on main whose body records a final-reviewer PASS (or light-reviewer for UI-only, none for docs): wait for GitHub checks green (Vercel preview red is a known setup issue, ignore), then squash-merge with the full head sha. Stacked PRs: retarget to main after the parent merges; conflicts → a small worker merges origin/main in (no rebase).
- After a merge with a migration: `curl https://greenreserve.app/api/health` must say `"ok":true,"db":"up"`.
- Standing approval (Cam): merge approved work when green. Never merge unapproved designs.

## Usage rules (Cam 2026-11-26: usage too high)
- At most 4 worker sessions at once. Queue the rest.
- Opus only for money, sign-in, tenant isolation, crons, schema, security. Sonnet for UI-only, docs, mockups, conflict merges, screenshot captures.
- No forks from a long coordinator chat (a fork copies the whole chat). Use a fresh session or a subagent with a tight brief.
- Briefs point to files instead of pasting history. Workers report only the PR number and a one-line verdict.

## In flight (2026-11-26 ~20:15 UTC)
- Security fixes for lanes/security/AUDIT-2026-11-24.md (H1, M1–M9, M11 + lows). Merged so far: #530 #531 #534.
- Security M10: fees/failed charges visible only with the Money area (MONEY-VIEW-1).
- #532 PWA installable app: conflicts with main; a worker is merging main in.
- AI assistant parts 2–6 (part 1 #533 merged). Golfer bot OFF by default; current model; 300 golfer questions/course/day.
- UI style overhaul (approved, spec in lanes/build.md "UI style overhaul — APPROVED", PR #541): worker 1 = tokens + dashboard + admin; worker 2 = golfer + homepage.
- SMS: whole-word course names, shorter opt-in wording, fresh public/sms-opt-in.png; its PR body carries the FINAL Twilio console list for Cam.
- UI kit v2 mockup (next phase after style ships): https://claude.ai/artifact/JVGVg9cZEQPjeHyyASp6oh — Cam reviews, then a build plus an automatic guard against hand-made buttons, text sizes and search fields (approved).

## Waiting on Cam
- Run "Before launch: clear test data" (admin → Systems) — overdue; also clears test golfer data tied to audit H1.
- Paste the final Twilio list (from the SMS PR) into the Twilio console; refresh the opt-in screenshot there.
- PO box / virtual mailbox address for the outreach footer (outreach won't send until set; outreach starts Dec 1).
- Vercel previews: untick Preview on DATABASE_URL, DIRECT_URL, Resend and Twilio keys FIRST, then add a new JWT_SECRET for Preview only.
- Confirm ANTHROPIC_API_KEY is set in Vercel production with a spend limit.
- company/ORGANIZATION.md: LLC + EIN + bank, accounts on admin@greenreserve.app, accountant call.

## Decided recently (see docs/DECISIONS.md for the full record)
Per-course log-in only (no GreenReserve golfer accounts); residents log in; Join online retired; guest passes off; alerts with separate text consent; emails Look C (Letter), golfer emails from the course via noreply@, short links on greenreserve.app; homepage Hero A + seven feature pages + Cal.com + Contact us; Dark = glass, Light = solid.
