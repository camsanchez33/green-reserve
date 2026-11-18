# GreenReserve — Claude Code Context

This file is loaded into EVERY session and every helper agent, so it holds only what all of them need. Keep it short (Cam 2026-11-14): a new rule goes here only if every session must know it; everything else goes in `docs/DECISIONS.md` (the full decision history, verbatim, by ID and date) or in a lane file under `lanes/`.

## What this is
GreenReserve is a golf tee sheet platform: courses list for free, golfers book online. Revenue is a $1.50/player booking fee paid by the golfer; courses keep 100% of green fees; membership dues paid through us carry a 1% fee. Live at https://greenreserve.app. Launch: Thanksgiving (Nov 26 2026); outreach starts Mon Nov 30 (`LAUNCH_PLAN_SPEC.md`).

**Stack:** Next.js 15 (App Router), TypeScript, Prisma on Postgres (Neon), Stripe Connect (Express, direct charges on the course's account), Resend (email), Twilio (SMS), Vercel.

## How work runs — READ `LANES.md`, then your lane file
One Build session (the coordinator) plans, owns all shared code (`src/lib`, `src/app/api`, `prisma`, `globals.css`, CI, `.claude/`), and merges every PR. Page lanes (Dashboard, Admin, Homepage, Golfer) each read ONLY `lanes/<lane>.md` for their pages, look and approved decisions. Before changing behaviour in an area, grep `docs/DECISIONS.md` for that area. Questions to Cam go through Build.

## Where things are
`docs/CODEMAP.md` (and `docs/codemap.json`) maps every route with its auth, every lib with its exports and importers, every model with its writers. It is generated, not committed: a SessionStart hook runs `node scripts/codemap.mjs`, but a copy on disk can be stale, so run it again before relying on the map after code changes (it takes ~2 s). Read the map before grepping or opening files.

## Rules that never bend
- **Money and sign-in.** Admin never charges, retries, refunds or cancels a golfer's booking; the course is the seller. Every dollar that moves goes through `recordMove()` (`src/lib/money-ledger.ts`). Deferred payments: card saved at booking only when the course's policy can charge it; charged at check-in. Cash goes through the register (`settleAtCounter` skips `performCheckIn()`, so anything every check-in needs must cover it). Never delegate money, auth, tenant isolation, charging crons or schema to a cheaper model.
- **Every staff route** gates with `requirePermission(session, key)`; every admin route with its role check plus `areaGate(session, '<area>')`. The client only hides. A test course never counts in platform numbers (spread `REAL_COURSE` / `ON_REAL_COURSE`). A new model goes in `WIPED_TABLES` or `KEPT_TABLES`.
- **Every sign-in or second-factor path** writes `securityEvent()`. No sign-in reveals whether an email has an account.
- **Schema:** real Prisma migrations only, additive (new tables, nullable or defaulted columns), tested from scratch on a local Postgres; never `db push`, `migrate reset` or direct writes on prod. A backfill needs Cam. Merging to main runs `migrate deploy` on prod; after it, `/api/health` must return `{"ok":true,"db":"up"}`.
- **Never fire-and-forget in a route** (await it or use `after()`); send email only through `getResend()`; addresses only from `src/lib/contact.ts`; texts only to numbers that agreed (`sendSms()`). Golfer-facing policy wording only from `describePolicy()`. A new cron uses `cronRoute()` and goes in `vercel.json`.
- **Build validation:** TypeScript errors don't fail the Vercel build, only SWC parse errors do. Before pushing: `npx tsc --noEmit` and `node scripts/parse-check.js <files>` (the edit hook covers Edit/Write, not Bash edits).
- **Review before every push** by an agent that didn't write it: `final-reviewer` for anything touching money, sign-in, `src/lib`, `src/app/api`, `prisma`, crons, pay pages or config; `light-reviewer` for UI, copy or tests only; none for docs or generated files. BLOCK → fix → re-review.
- **Commits and PRs:** never push to main; one PR per job; PRs are held for Cam unless he says merge. Commit doc edits (`*.md`, `lanes/`, `company/`, `.claude/`, `scripts/*.mjs`, `legal/`) as "queue/spec update", but never edit a published agreement file under `legal/` (its hash is the signature record; add a new version); never discard code you didn't write; ask.
- **Never** paste secrets or customer data anywhere (chat, specs, Control Room). `AUDIT_MASTER.md` is gitignored and private.

## Look (every page)
Course dashboard: charcoal glass by default with a Light look that is glass too (dark ribbons on a light page); BOTH looks get every change (LIGHT-PARITY, `scripts/glass-test.ts`). Admin: dark green glass only. Fonts: EB Garamond for headlines only, Libre Franklin for everything else. Colour only where it means something: green paid/good, amber soon/close, red problem/unpaid, blue rain. No subheadings above headings, one Filter button instead of chip rows, search bars without placeholder words, `<StatusDot>` not pills, no emojis or decorative icons, no gradients behind pages, no `rounded-xl/2xl/3xl`, `font-black`, `tracking-widest`. Pages and tokens: `lanes/<lane>.md` and `docs/DECISIONS.md` → "Design system".

## Session policy (per surface)

| Surface | Cookie | JWT TTL | Renewal |
|---------|--------|---------|---------|
| Admin employees (viewer/support/manager) | `admin_session` | 12h absolute | None — re-authenticate after 12h |
| Admin owner | `gr_owner` → an `OwnerSession` row | 4h absolute | None — signs in only at `/cam` (password → approved device → second factor); `/admin` refuses the owner |
| Operator/staff dashboard | `gr_operator` | 7 days sliding | Reissued when >50% elapsed |
| Golfer | none (retired Cam 2026-11-18) | — | No GreenReserve golfer sign-in; guests manage a booking by its emailed link |
| Member (per-course) | `gr_member` | 7 days absolute (R-AUTH-009, Cam 2026-10-26) | None |

## Known gotchas
Large tool writes can truncate (check line count and parse). Use Python, not `sed -i`, for edits on these files. JSX: no multi-line `? [...]` ternaries; a parse error usually means a missing `</div>` earlier. Do NOT run `scripts/route-inventory.ts`.

## People and preferences
Cam is the founder and the only one who approves. Concise, direct answers in plain words; challenge ideas instead of agreeing; no bullet lists in conversation; no emojis.
