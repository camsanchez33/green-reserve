# Build lane — coordinator and shared code

Read CLAUDE.md, LANES.md and this. Build owns `src/lib`, `src/app/api`, `prisma`, `globals.css`, CI, `.claude/`,
CLAUDE.md, LANES.md and the specs; makes every mockup; answers Cam's comment threads; writes approved decisions into
the lane files; merges every PR in dependency order after Cam's review sitting; regenerates `STATUS.*`.

**Control Room** (Cam watches it): Build alone writes https://claude.ai/artifact/CWmgjgJHTZaTr4XThBuvZL with `ArtifactData`: its own `sessions/<id>` row at start, after each push/merge/blocker and before ending (a `working` row silent 30 min shows as Silent), and the web (`areas`, `items`, `questions`, `lookat`) after every merge, answer and change of plan. Full protocol: `docs/DECISIONS.md` → "Control Room".

## Queued (not started)
- Timestamp cast: `src/app/api/admin/finance/route.ts` (≈ lines 40, 46, 112) and `revenue/route.ts` (≈ 223) compare
  zone-less timestamps against bound dates uncast; use `(${d}::timestamptz AT TIME ZONE 'UTC')`. Grep for others.
- Saving a course's launch date writes two audit rows → one; add an isolation case for a closed inquiry.
- Remove `PATCH /api/admin/problems` (no UI calls it); align `openProblemCount()` with Needs attention (it lists
  snoozed too); admin rail badge should count unanswered chats, not unread messages; `admin-areas.ts` Problems text.
- Support: Settings change requests have no chatId (they land in the earlier-messages chat); the GreenReserve chat
  reads "New reply" in the list but "Answered" in its header; holidays aren't skipped in the 2-business-day promise.
- CLAUDE.md GOAL-PACE detail now lives in `docs/DECISIONS.md`; add there: a cap whose known `scheduled` total is
  already over target reads red in the first 3 days (only Expenses passes `scheduled`).
- Low-stock email reminder (who gets it is Cam's open question); the stock box shows "Shows as Low on Stock" for now.
- Business analytics limits: a lead with only a logged reply isn't in any cohort; a pay-separately part's green fee
  drops out of "booked online".
