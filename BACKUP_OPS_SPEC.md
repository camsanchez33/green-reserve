# Backup & Production Ops Spec — one run

Read CLAUDE.md first. Goal: nothing about GreenReserve depends on Cam's laptop, and
updating a live product becomes a safe, written routine. Three sections, commit each.

---

## A. Nightly database backup (GitHub Actions)

The repo is on GitHub (camsanchez33/green-reserve); use a scheduled Action — no new
services needed.

1. `.github/workflows/db-backup.yml`:
   - cron: nightly 08:00 UTC (3–4am ET, quiet hours).
   - Runs on ubuntu-latest with postgres-client 17 (match Neon's version).
   - `pg_dump "$DATABASE_URL" -Fc` → compress → encrypt with
     `openssl enc -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE`.
   - Upload as workflow artifact, retention 90 days, name `db-backup-YYYY-MM-DD`.
   - On failure: the workflow fails loudly (GitHub emails the repo owner by default —
     verify notification settings note in the doc below).
2. Secrets the workflow needs (Cam adds in GitHub → Settings → Secrets → Actions):
   `DATABASE_URL` (the Neon pooled or direct URL — use DIRECT_URL) and
   `BACKUP_PASSPHRASE` (new; Cam generates, stores in his password manager).
   The run must print clear instructions for this manual step and STOP short of
   touching secret values itself — never write real secrets into any file.
3. `docs/RESTORE.md`: exact restore steps — download artifact, decrypt
   (`openssl enc -d ...`), `pg_restore` into a fresh Neon branch first, verify, then
   promote/point the app. Include the "restore drill": do this once per quarter
   against a throwaway branch to prove backups actually restore.
4. Also document Neon's built-in point-in-time recovery: where to find the
   retention window for the current plan and how to restore from it (it's the
   first-choice recovery; the pg_dump is the independent second copy).

## B. Production update discipline (docs + guardrails)

1. New CLAUDE.md section "## Shipping to production" (and mirror in docs/RESTORE.md's
   sibling docs/SHIPPING.md if CLAUDE.md is getting long):
   - Small, no-schema changes: push to main is acceptable (current flow).
   - Schema changes or risky features once ANY course is live: branch → Vercel
     preview deployment (automatic per-branch) → create a Neon DB branch, run the
     migration against it, point the preview at the branch DB
     (DATABASE_URL override in Vercel preview env) → verify on the preview URL →
     merge to main → migration runs against prod.
   - NEVER `prisma migrate reset`, never `db push --accept-data-loss`, on prod.
   - Rollback story: Vercel instant rollback to previous deployment (UI, one
     click) for code; Neon PITR/branch for data. Write exactly where to click.
2. `vercel.json` / project settings sanity: confirm preview deployments get
   non-prod env (preview-scoped DATABASE_URL if set) — document what IS currently
   configured, flag gaps as instructions for Cam rather than guessing.

## C. Secrets inventory + laptop-loss runbook

`docs/RUNBOOK.md`:
- Table of every secret from CLAUDE.md's env list: name, where it lives (Vercel env
  / GitHub Actions / password manager), where to regenerate it (Stripe dashboard,
  Resend, Twilio, Neon, etc.). NO VALUES — names and locations only.
- "Laptop lost" recovery: re-clone repo, pull env values from Vercel dashboard
  (`vercel env pull` or dashboard copy), restore .env, done.
- "Secret leaked" rotation steps per provider, one line each.
- Note that RUN_QUEUE.md/specs are in the repo and therefore already backed up —
  the doc-commit rule (queue header) is what guarantees this; restate it here.

---

## Ground rules
- Never print or commit a real secret value anywhere, including in shell output.
- Workflow YAML: validate syntax (actionlint if available, or careful review).
- Section A's workflow can't be fully tested locally — after committing, print the
  exact GitHub URL where Cam can "Run workflow" manually to verify the first backup,
  and list the two secrets he must add first.
- Commit after each section (A, B, C).
