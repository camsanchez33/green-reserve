# Build lane — coordinator and shared code

Read CLAUDE.md, LANES.md and this.

Build owns `src/lib`, `src/app/api`, `prisma`, `globals.css`, CI, `.claude/`,
CLAUDE.md, LANES.md and the specs; makes every mockup; answers Cam's comment threads; writes approved decisions into
the lane files; merges every PR in dependency order after Cam's review sitting; regenerates `STATUS.*`.

**Control Room** (Cam watches it): Build alone writes https://claude.ai/artifact/CWmgjgJHTZaTr4XThBuvZL with `ArtifactData`: its own `sessions/<id>` row at start, after each push/merge/blocker and before ending (a `working` row silent 30 min shows as Silent), and the web (`areas`, `items`, `questions`, `lookat`) after every merge, answer and change of plan. Full protocol: `docs/DECISIONS.md` → "Control Room".

## Queued (not started)
- My profile data: IN PR (branch `build/my-profile-password-date`), held for Cam. `AdminUser.passwordChangedAt` on `AdminSessionView`; see `docs/DECISIONS.md` → "Password date".
- Revenue data (for the Dashboard lane's Revenue page, approved 2026-11-15): the 30-day average-by-time-of-day line, Food & beverage from shop categories, the Stripe-mismatch detail (a refund made in Stripe directly, per day and per payment). Course-scoped, `requirePermission`, test courses excluded only where platform numbers are concerned. Agree the shape with the Dashboard lane first.
- Platform activity data (for the Admin lane's page): whatever the board needs that `/api/admin/system` doesn't return yet — Neon (up + last backup), Resend (key set, sending domain), Twilio (each key set), Vercel (commit live), GitHub (CI/backup runs link), per-service state; a "Re-run job" route for a cron (manager+, audited, same `cronRoute` wrapper); "Re-check" = re-read the same status. Agree the shape with the Admin lane first.
- Business analytics limits: a lead with only a logged reply isn't in any cohort; a pay-separately part's green fee
  drops out of "booked online".
