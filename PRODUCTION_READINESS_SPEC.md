# Production Readiness Spec — 100 live courses without fear

Read CLAUDE.md first. This is the run that turns "works for daisylinks" into "won't
crash with 100 paying courses mid-booking on a Saturday." The app's multi-tenant
model is already sound (per-courseId rows, isolation tests exist). The gaps are:
(1) schema changes are manual `db push` and easy to forget — the exact bug that 404'd
every course twice; (2) serverless DB connection limits are unproven under load;
(3) nothing stops a broken schema from deploying; (4) no visibility when things break.

ONE long run, but SECTIONED — commit after each. Sections A and E are attended
(they touch migrations and env). B, C, D can run through.

---

## A. Baseline onto real migrations — kill the db push footgun (ATTENDED)

The project has NO prisma/migrations history; every change went via `db push`. That's
why schema and DB drift silently. Baseline it properly:

1. Generate a baseline migration from the CURRENT schema WITHOUT reapplying it to the
   live DB (the live DB already has these tables):
   - `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma
     --script > prisma/migrations/0000_baseline/migration.sql`
   - `prisma migrate resolve --applied 0000_baseline` against production (marks it as
     already-applied so Neon is NOT rebuilt).
   - Verify `prisma migrate status` shows a clean, up-to-date history.
2. From now on, schema changes use `prisma migrate dev --name <x>` locally against a
   DEV/branch DB, commit the generated migration file, and `prisma migrate deploy`
   promotes to prod. Document this in CLAUDE.md, REPLACING the "always db push, no
   migrations history" note. This is a real reversal — make it unambiguous.
3. Shadow DB: `migrate dev` needs one. Use a Neon branch as the shadow
   (SHADOW_DATABASE_URL env, documented, added to .env by Cam — manual step, print it).
4. MANUAL STEPS for Cam printed at end: the resolve command to run against prod, and
   the two env vars to add. NEVER run migrate deploy/resolve against prod from an
   unattended context — hand Cam the exact commands.

## B. Serverless connection safety (verify + harden)

Neon pooled endpoint is already in DATABASE_URL (good). Prove the app can't exhaust it:

1. Confirm prisma.ts is optimal for serverless: single client per lambda, cached on
   globalThis in ALL environments (currently only non-production — in production each
   invocation risks a new client; cache it globally regardless of NODE_ENV, the
   standard Vercel+Prisma pattern). Add `connection_limit` tuning via the pooled URL
   query param, documented.
2. Audit for connection leaks: any `new PrismaClient()` outside the singleton (grep),
   any long-lived transactions, any route that opens a client and doesn't reuse the
   singleton. Fix all.
3. Confirm Neon pooler mode is transaction pooling (works with Prisma) and that
   migrations use DIRECT_URL not the pooler (they do — verify).
4. Document in ARCHITECTURE.md: pooled vs direct, connection_limit chosen, and the
   Neon plan's connection ceiling — flag to Cam if the free/current tier ceiling is
   too low for target concurrency (this may require a paid Neon tier — a
   recommendation, not a code change).

## C. Load test — prove it at 100-course scale

scripts/load-test.ts (documented, run against a local dev server or a Neon branch,
NEVER prod):

- Seed 100 courses, each with a day of tee times.
- Simulate a Saturday-morning spike: N concurrent booking requests spread across
  many courses AND heavy contention on a few hot slots (same-slot races).
- Assert: no double-books (capacity invariant holds — reuses claimTeeTime), no 500s
  from connection exhaustion, p95 latency under a stated threshold, every request
  resolves (200 or a clean 409, never a hang/crash).
- Print a summary: requests, successes, 409s, errors, latency percentiles, peak DB
  connections observed. Tune connection_limit from what this reveals.
- This is the evidence behind "won't crash with 100 courses." It must pass.

## D. Deploy guardrail — drift can never silently ship again

The root cause of today's outages: code that reads new columns deployed before the DB
had them. Prevent it structurally:

1. `.github/workflows/schema-check.yml` — on every push/PR: run
   `prisma migrate status` against a check DB (or `prisma migrate diff` between
   committed migrations and schema) and FAIL the build if schema.prisma has changes
   not captured in a committed migration. This makes "forgot to migrate" a red X
   before deploy, not a 404 after.
2. Add a lightweight runtime health check: /api/health returns 200 only if a trivial
   DB query succeeds (SELECT 1) AND schema is reachable. Vercel can watch it.
3. CLAUDE.md: "schema change" checklist — migration committed, status clean,
   health green post-deploy.

## E. Observability — know before your courses tell you (ATTENDED, env)

1. Error tracking: integrate Sentry (or Vercel's built-in) for server + client errors
   — capture the Server Component crashes that currently show as opaque "Course Not
   Found"/"application error". Manual step: Cam adds SENTRY_DSN. Print it.
2. Structured logging on the money paths (booking create, check-in charge, cancel-fee
   cron, webhook): course id, booking id, outcome — so a failed charge is traceable
   without guessing. No PII, no card data, no secrets in logs.
3. Uptime: document setting a free uptime monitor (e.g. on /api/health) — instructions
   for Cam, external service, not code.
4. A "what to check when a course reports a problem" runbook in docs/RUNBOOK.md:
   health endpoint, Sentry, the transaction ledger, Neon status.

---

## Ground rules
- Sections A and E are attended (prod migration resolve + env vars). STOP and hand Cam
  exact commands; never touch prod migrations or secrets unattended.
- Load test (C) and schema check (D) must PASS/GREEN before their section commits.
- No PII/secrets in any log or script output.
- Reuse claimTeeTime() and the existing isolation/concurrency scripts — extend, don't
  duplicate.
- Commit after each section so a stop can't lose the run.
- CLAUDE.md migration note gets REVERSED in section A — this is intended; call it out
  in the commit message so it isn't mistaken for a mistake.
