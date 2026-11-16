# Build lane — coordinator and shared code

Read CLAUDE.md, LANES.md and this.

Build owns `src/lib`, `src/app/api`, `prisma`, `globals.css`, CI, `.claude/`,
CLAUDE.md, LANES.md and the specs; makes every mockup; answers Cam's comment threads; writes approved decisions into
the lane files; merges every PR in dependency order after Cam's review sitting; regenerates `STATUS.*`.

**Control Room** (Cam watches it): Build alone writes https://claude.ai/artifact/CWmgjgJHTZaTr4XThBuvZL with `ArtifactData`: its own `sessions/<id>` row at start, after each push/merge/blocker and before ending (a `working` row silent 30 min shows as Silent), and the web (`areas`, `items`, `questions`, `lookat`) after every merge, answer and change of plan. Full protocol: `docs/DECISIONS.md` → "Control Room".

## Queued (not started)
- Outreach (Cam 2026-11-16): see `lanes/outreach.md`. Emails start Dec 1. Prep starts Nov 23, sending from admin@greenreserve.app through Google Workspace Gmail (decided).
- Memberships data (Cam 2026-11-16 approved the page; money and schema, Opus, final-reviewer, one PR each, in this order):
  1. Every dues and season-pass payment recorded once via recordMove, so it shows in Revenue as Membership dues. Cash for dues and passes goes through the register: requireRegisterOpen, counted in the close-out's expected cash, shown on the register. Adding a member takes payment first (reader, cash, or a typed card through Stripe Elements) and they are a member only once paid.
  2. Member numbers: an automatic per-membership prefix and sequence, never reused. A member photo upload (private blob, the same pattern as shop item photos).
  3. Member rates set against the course's own price list (each round type and cart; blank = public, 0 = free, or % off), plus a booking window of "public" or N days.
  4. Season passes: a membership kind with fixed start/end dates (every pass ends on the end date), buy online and/or at the course, rates per price-list line, and the 1% fee golfers pay on top.
  5. AFTER LAUNCH (Cam agreed): resident cards become a membership type, with proof of residency checked by staff and the card good at every course in the group. Move existing residents onto it and retire the separate resident pricing path and switch.
  Anything in 1–4 not merged by Nov 23 waits until after launch.
- My profile data: IN PR (branch `build/my-profile-password-date`), held for Cam. `AdminUser.passwordChangedAt` on `AdminSessionView`; see `docs/DECISIONS.md` → "Password date".
- Revenue data (for the Dashboard lane's Revenue page, approved 2026-11-15): the 30-day average-by-time-of-day line, Food & beverage from shop categories, the Stripe-mismatch detail (a refund made in Stripe directly, per day and per payment). Course-scoped, `requirePermission`, test courses excluded only where platform numbers are concerned. Agree the shape with the Dashboard lane first.
- Platform activity data (for the Admin lane's page): whatever the board needs that `/api/admin/system` doesn't return yet — Neon (up + last backup), Resend (key set, sending domain), Twilio (each key set), Vercel (commit live), GitHub (CI/backup runs link), per-service state; a "Re-run job" route for a cron (manager+, audited, same `cronRoute` wrapper); "Re-check" = re-read the same status. Agree the shape with the Admin lane first.
- Business analytics limits: a lead with only a logged reply isn't in any cohort; a pay-separately part's green fee
  drops out of "booked online".
