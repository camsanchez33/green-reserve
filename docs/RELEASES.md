# Releases: how an update reaches live courses (PROPOSAL, not in force)

Status: Build OK'd the proposal 2026-11-18 (all five points in §13). Stage 1 is in place with this doc,
`CHANGELOG.md` and `scripts/release.mjs`. The CI and `migrate-prod.js` changes are a separate PR, held for Cam.
Nothing here changes branch protection or Vercel settings: those are Cam's steps in §12.

Cam's decision (2026-11-18): once real courses are live, updates ship smoothly and never interfere with them.
Versions are GRV 1.0 at launch, then 1.1, 1.2 for planned updates and 1.0.1 for urgent fixes.

## 0. Where we are today, and what that costs

A merge to `main` deploys straight to production, and `scripts/migrate-prod.js` runs `prisma migrate deploy` on the
production database inside that build. There is no environment between a PR and the live site: Vercel previews have
failed on every PR since at least PR #10 (Sep 29). The repo-side cause is that `next build` needs `JWT_SECRET` and
Preview most likely doesn't have it (diagnosis sent to Build 2026-11-18). Before Nov 30 this is fine, because no real
course is live. After Nov 30, every merge is a release to paying courses during their working day.

## 1. Timing: don't change the flow during launch week

Launch is Nov 26 and about twenty PRs merge on a busy day. Putting a staging hop in front of that now would double
every merge and move every lane's PR base mid-sprint. The proposal goes in two stages.

**Stage 1, now until Nov 29 (no flow change):** fix previews (Cam's dashboard steps), add this doc, `CHANGELOG.md`
and `scripts/release.mjs`, practise one rollback on production while no course is live, and tag the launch build
`GRV-1.0`.

**Stage 2, from Mon Nov 30 (first real courses):** the `staging` branch and environment go live, lane PRs target
`staging`, and production changes only through release PRs in the release window.

If Stage 2 isn't ready by Nov 30, the fallback is Stage 1 plus the release window applied to merges into `main`.
That alone removes most of the risk of breaking a course mid-round.

## 2. Branches and environments

| Branch | Vercel environment | Database | Who merges into it |
|---|---|---|---|
| feature branches (`build/*`, `dashboard/*`, …) | Preview (per-PR URL) | none, or the shared preview Neon branch (see below) | — |
| `staging` | Preview, branch-pinned, at `staging.greenreserve.app` | Neon branch `staging`, created **schema-only** and seeded | Build (lane PRs, after review, same as today) |
| `main` | Production, `greenreserve.app` | Neon `main` (prod) | Build, only through a release PR or a hotfix PR |

**Staging must never hold production data.** A normal Neon branch made from `main` is a full copy of prod: every
golfer email, phone and booking. So staging is created with Neon's *schema-only* branch option (or as a separate
Neon project), then filled with `scripts/perf-seed.ts` plus a staging seed of one or two test courses. Every course
on staging is a test course.

**Staging environment variables** (Vercel → Settings → Environment Variables, scope *Preview*, branch `staging`):
`DATABASE_URL`/`DIRECT_URL` for the staging Neon branch, its own `JWT_SECRET` (never prod's), Stripe **test** keys
with their own test webhook endpoint pointing at staging, `RESEND_API_KEY` set to a Resend key limited to the test
domain or left out (staging must never email a real golfer), and no Twilio keys, so `sendSms()` refuses.
`NEXT_PUBLIC_BASE_URL=https://staging.greenreserve.app`.

**Migrations on staging.** Today `migrate-prod.js` only migrates when `VERCEL_ENV=production`, so staging would run
new code against an old schema. Change (PR `build/release-ci`): set `MIGRATE_ON_BUILD` to the staging database's
**host** (the host in staging's `DIRECT_URL`), scoped to Preview + branch `staging` only. The build migrates only
when it is a preview of branch `staging` and `DIRECT_URL`'s host equals that value. So the production URL pasted
into staging's variables by mistake fails the staging build instead of applying unreleased migrations to
production, and the variable leaking to other previews does nothing. A plain `=1` switch wouldn't catch that paste.

**Crons don't run on staging.** Vercel runs crons only in production. To test a cron on staging, call its route
by hand with staging's `CRON_SECRET`. Nothing else in this proposal depends on staging crons.

**Per-PR previews** (once Cam's fix lands) get no database by default: pages that need data show their error state,
which is still enough to check layout and copy. If Build wants data in previews, one shared schema-only Neon branch
`preview` is cheap. Per-PR Neon branches via the Neon–Vercel integration are possible too, but they copy from a
parent, so the parent would have to be the schema-only `preview` branch, never prod.

## 3. The flow

1. Lane or Build opens a PR **into `staging`**. Same review rules as today (final-reviewer / light-reviewer), same
   CI, same one-PR-per-lane cap. Build merges it into `staging` after Cam's review sitting, squash as now.
2. Staging redeploys and migrates its own database. Build runs `node scripts/release.mjs smoke --url
   https://staging.greenreserve.app`, and Cam clicks through what changed on staging.
3. Build opens a **release PR `staging` → `main`** titled `Release GRV-1.1`, with the `CHANGELOG.md` section in the
   body. Cam OKs it.
4. In the release window, Build merges it as a **merge commit, not a squash**. Squashing a release creates a new
   commit on `main` that `staging` doesn't have; the next release PR then shows old changes again and conflicts on
   every file both touched. Lane PRs into `staging` stay squash.
5. Production builds and migrates prod. Build runs `node scripts/release.mjs check` (health plus smoke against
   greenreserve.app), then `node scripts/release.mjs tag GRV-1.1`, which tags the merge commit on `main` and pushes
   the tag.
6. Build posts the result to the Control Room.

## 4. Versions and the changelog

Tags are `GRV-1.0`, `GRV-1.1`, `GRV-1.0.1` on `main` only, never on `staging`. A planned release bumps the minor
(1.1, 1.2); a hotfix bumps the patch on the version that is live (1.1 live → `GRV-1.1.1`).

`CHANGELOG.md` at the repo root is written for courses, not developers: what a course will notice, in plain words,
newest first. No PR numbers, file names or internal names. A change no course would notice goes under one line,
"Behind-the-scenes fixes". Example:

```
## GRV 1.1 (Dec 3, 2026)
- Tee sheet: you can now move a group to another tee time by dragging it.
- Golfers get one reminder text the evening before their round, if they agreed to texts.
- Behind-the-scenes fixes.
```

`release.mjs changelog` drafts the section from the PR titles merged since the last tag. Build rewrites the draft in
course words; the script never writes the final text itself.

## 5. Release window

The request was "overnight US Eastern". I'd argue for **late evening instead: Sunday to Thursday, 10:15 PM to
11:30 PM Eastern** (03:15–04:30 UTC while on EST), for three reasons:

1. At 2 AM nobody is awake to roll back. Cam is the only approver. A bad release at 10:30 PM is caught and rolled
   back the same evening; one at 2 AM sits broken until the first course opens.
2. Courses aren't operating at 10:30 PM ET, including West Coast courses (7:30 PM PT, past last tee time most of the
   year). Online golfer bookings at that hour are few.
3. It avoids the crons: `generate-tee-times` runs at 03:00 UTC (10 PM ET) and `hourly` on the hour, so a release
   merged at :15 never lands mid-cron. `send-reminders` (03:00 ET) and `cancellation-cutoff` (04:00 ET) are well
   clear. Before a release that touches a cron's code, Build checks the cron's next run.

No releases Friday or Saturday night (weekend mornings are peak tee times and a bad Friday release ruins the
busiest days), and none the night before a holiday. A **hotfix** can go out at any hour when production is already
broken. Waiting for the window would leave it broken longer.

The window applies to `main` only. Merges into `staging` happen whenever, as today.

## 6. Rollback

**Code:** Vercel → Deployments → the previous production deployment → **Instant Rollback**. That takes seconds and
needs no build. Three catches Build must know:

1. After an instant rollback, Vercel stops auto-assigning new production deployments. The next merge to `main` builds
   but does **not** go live until someone clicks *Undo Rollback* or promotes it. `release.mjs check` warns when the
   live deployment isn't the newest one.
2. A rollback doesn't undo environment-variable changes or the database.
3. It doesn't undo migrations. That is why the next rule exists.

**Database:** migrations stay additive (the existing CLAUDE.md rule: new tables, nullable or defaulted columns), so
the previous code always runs against the newer schema. Two clarifications for release safety:

1. **No removals in the release that stops using something.** Removing or renaming a column or table takes two
   releases. Release N stops reading and writing it; a later release drops it, at least one release after N has
   been live. Otherwise rolling back to N−1 brings back code that reads a column that's gone.
2. **A new column the new code relies on gets a default** or is nullable and handled when null, because rows written
   by the old code after a rollback won't fill it.

A migration that is not additive needs Cam, a written plan for rolling forward instead of back, and its own release.

**Rollback drill:** once before Nov 26, while no course is live: promote the previous deployment, check
`/api/health`, undo. Ten minutes, and the first real rollback isn't the first time anyone has clicked the button.

## 7. Post-deploy check and smoke script

`/api/health` returning `{"ok":true,"db":"up"}` proves the app answers and reaches the database. It doesn't prove
the release works. `release.mjs check --url <base>` runs read-only requests, writes nothing and books nothing:

| Check | Pass |
|---|---|
| `GET /api/health` | 200, `ok:true`, `db:"up"`, retried for up to 2 minutes after the deploy |
| `--expect-sha <merge commit>` (optional) | `/api/health`'s `commit` matches, so a rolled-back or stale build is caught |
| `GET /` | 200, no error page |
| `GET /courses/<test course slug>` | 200 **and** the test course's name in `<title>` (an unknown slug also answers 200 with the generic title, so status alone proves nothing) |
| `GET /dashboard/login`, `GET /admin/login` | 200, no error page |
| `GET /api/cron/hourly` without the secret | 401 (503 means `CRON_SECRET` is missing on that deployment) |

Usage: `node scripts/release.mjs check --url https://greenreserve.app --slug <test course> --course-name "<its
name>" --expect-sha <sha>`. The defaults (`perf-audit`, "Perf Audit Golf Club") exist on the staging seed and in
CI, **not on production**. Build needs to name the production test course once and put it in the command here.

It uses a test course only (`REAL_COURSE` filters keep it out of platform numbers), never a real course's pages. A
failure means rolling back first and debugging after.

The CLAUDE.md "after `migrate deploy`, `/api/health` must return ok" rule stays as is; `check` runs it.

**Question for Build:** should `/api/health` also return the short commit SHA (`VERCEL_GIT_COMMIT_SHA`), so `check`
can prove the live site runs the release just merged and not a rolled-back build? SEC-1 hides the framework and
version, and a 7-character SHA reveals little, but it's Build's call. Without it, `check` can't catch catch 1 in §6.

## 8. Hotfix flow

1. Branch from the live tag: `git switch -c hotfix/1.1.1 GRV-1.1`.
2. Smallest possible fix (`/gr-debug`), final-reviewer, PR **into `main`**.
3. Cam OKs, Build merges, `release.mjs check`, tag `GRV-1.1.1`, one `CHANGELOG.md` line.
4. **Merge `main` back into `staging`** the same day (a merge, not a cherry-pick), so the fix isn't lost in the next
   release and the two branches don't drift.

A hotfix contains the fix and nothing else. If staging holds a fix that is already reviewed, the hotfix can't carry
it along; it waits for the next release.

## 9. Half-built work and feature flags

The first rule is simpler than flags: **`staging` must always be releasable.** A page that isn't finished stays on
its branch. The current one-PR-per-page lane flow already mostly does this.

Flags are for one case: work that has to merge in pieces across Build and a lane (data PR, then page PR) where the
first piece would show something half-done. For that:

1. `src/lib/flags.ts` (Build) holds a typed list of flag names. A flag's state is a row in a small `FeatureFlag`
   table (additive migration, in `KEPT_TABLES`), on or off globally, optionally on for named test courses only. No
   env-var flags: changing those needs a redeploy, which is the thing we're trying to avoid.
2. Checked **on the server** (the route refuses, the page doesn't render the part). Hiding in the client only isn't
   enough, the same as permissions.
3. Each flag has an owner and a removal date in the list. A flag that has been fully on for one release is deleted in
   the next.
4. Money and sign-in behaviour never sits behind a flag that a course can see half of.

I'd build this only when the first real need appears after Nov 30, not ahead of time.

## 10. What changes for the lane sessions

From Nov 30 (Stage 2):

1. **PR base is `staging`, not `main`.** Lanes branch from `origin/staging`, and LANES.md rule 6 becomes "merge
   `origin/staging` into your branch".
2. Lanes never open PRs into `main`. Only Build opens release and hotfix PRs.
3. Before a lane PR is held for Cam, the lane looks at its Vercel preview URL (once previews work), at phone and
   desktop width, as part of the existing `ui-review` step.
4. Nothing else changes: same reviews, same caps, same Control Room updates.

## 11. CI and branch protection changes (need Build's OK, none made yet)

The CI gates must not get weaker when PRs move to `staging`. Today:

| Workflow | PRs | Pushes | Change |
|---|---|---|---|
| `tests.yml` | every PR | every branch | none |
| `typecheck.yml` | every PR | every branch | none |
| `schema-check.yml` | every PR touching `prisma/` | — | none |
| `security.yml` | every PR | `main` (+ daily) | push also on `staging` |
| `codemap.yml` | every PR | `main` | push also on `staging` |
| `perf-audit.yml` | **PRs into `main` only** | — | PRs into `staging` too |

(An earlier draft of this table said security and codemap only ran on PRs into `main`. They run on every PR; only
their push runs are main-only.) The one real gate gap is `perf-audit.yml`: without the change, lane PRs into
`staging` would skip the Lighthouse budget, and it would first run on the release PR, after the code is on staging. Branch protection on `staging` should copy
`main`'s required checks. `main` keeps its protection, and its required checks run on the release PR as well.

Each of those is a workflow change that gates merges, so: Build's OK, then final-reviewer PASS, then Cam merges.

## 12. Steps that need Cam (Vercel and Neon dashboards)

1. Fix previews (diagnosis message to Build): read one failed preview's log, add a Preview-only `JWT_SECRET` with a
   new value, and make sure no Preview-scoped variable points at the production database.
2. Neon: create branch `staging` with **schema only** (no data).
3. Vercel → Settings → Domains: add `staging.greenreserve.app`, assigned to Git branch `staging`.
4. Vercel → Environment Variables: the staging set in §2, plus `MIGRATE_ON_BUILD` = the staging Neon host, all
   scoped Preview + branch `staging`.
5. Stripe (test mode): a webhook endpoint for `https://staging.greenreserve.app` and its signing secret in the
   staging scope.
6. Do the rollback drill (§6) once before Nov 26.

## 13. Decisions (Build, 2026-11-18: yes to all five)

1. Two stages, with staging live Nov 30 rather than before launch: yes or no?
2. Release window 10:15–11:30 PM ET Sun–Thu instead of overnight: yes, or keep overnight with someone awake?
3. Commit SHA in `/api/health`: yes or no?
4. OK to write `scripts/release.mjs` (`tag`, `changelog`, `check`/`smoke`) and an empty `CHANGELOG.md` now? These
   are docs and scripts only and change no gate.
5. OK to prepare the CI changes in §11 and the `MIGRATE_ON_BUILD` change to `migrate-prod.js` as one PR for
   final-reviewer, held for Cam?
