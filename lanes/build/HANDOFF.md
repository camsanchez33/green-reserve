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

## In flight (2026-11-26 ~22:15 UTC)
- Merged today: #535 (test fix) #536 #538 #539 #542 #545 #544 #547 #556 #540 #554 #550 #532 #549 #555 #553. Main CI green; prod healthy.
- #558 (UI style 4/4): main merged in at 5a619dd5 (net diff identical to the reviewed one); merge when green.
- Security #548 #559 #557 #551: Test scripts red; an Opus worker is finding root causes and merging main in. Merge order 548, 559, 557, 551 (551's conflicts with 542/548 per its PR body). The security session (session_014ceBnz9xqRxzipaDXVP2DN) also works these; Build can't message it.
- #537 (Assistant 3/6 settings): main merged in at ec3bc746; light-reviewer earlier PASS; check green and merge.
- #552 homepage bot: HELD until after outreach starts (Cam).
- UI kit: options mockups part 1 https://claude.ai/artifact/Ac11jzwJeT8cmAWQnqeVoL (answered, see UI-KIT-3 in DECISIONS) and part 2 https://claude.ai/artifact/1uT1Rncv1qgaZPAWaiC3de (picks pending). Next: v4 mockup with all picks, then build + guard.
- #435/#436 are 10-day-old branches ~1500 commits off main: stale, left alone. Dependabot (#218 #219 #291 #292 #417): hold until after launch.
- Other sessions push to the UI style and golfer branches too; fetch before merging main into a branch, or two workers race.

## Waiting on Cam
- Update the Twilio console with #544's final opt-in list (merged; texts now differ from the registered samples) before outreach Nov 30.
- Resend any owner setup link sent Nov 19-26 once #551 merges.
- UI kit: re-answer palette 1A vs 1C and the button cap; pick part 2 options.
- Run "Before launch: clear test data" (admin → Systems) — overdue; also clears test golfer data tied to audit H1.
- Paste the final Twilio list (from the SMS PR) into the Twilio console; refresh the opt-in screenshot there.
- PO box / virtual mailbox address for the outreach footer (outreach won't send until set; outreach starts Dec 1).
- Vercel previews: untick Preview on DATABASE_URL, DIRECT_URL, Resend and Twilio keys FIRST, then add a new JWT_SECRET for Preview only.
- Confirm ANTHROPIC_API_KEY is set in Vercel production with a spend limit.
- company/ORGANIZATION.md: LLC + EIN + bank, accounts on admin@greenreserve.app, accountant call.

## Decided recently (see docs/DECISIONS.md for the full record)
Per-course log-in only (no GreenReserve golfer accounts); residents log in; Join online retired; guest passes off; alerts with separate text consent; emails Look C (Letter), golfer emails from the course via noreply@, short links on greenreserve.app; homepage Hero A + seven feature pages + Cal.com + Contact us; Dark = glass, Light = solid.
