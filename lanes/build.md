# Build lane — coordinator and shared code

Read CLAUDE.md, LANES.md and this. Build owns `src/lib`, `src/app/api`, `prisma`, `globals.css`, CI, `.claude/`,
CLAUDE.md, LANES.md and the specs; makes every mockup; answers Cam's comment threads; writes approved decisions into
the lane files; merges every PR in dependency order after Cam's review sitting; regenerates `STATUS.*`.

**Control Room** (Cam watches it): Build alone writes https://claude.ai/artifact/CWmgjgJHTZaTr4XThBuvZL with `ArtifactData`: its own `sessions/<id>` row at start, after each push/merge/blocker and before ending (a `working` row silent 30 min shows as Silent), and the web (`areas`, `items`, `questions`, `lookat`) after every merge, answer and change of plan. Full protocol: `docs/DECISIONS.md` → "Control Room".

## Queued (not started)
- Business analytics limits: a lead with only a logged reply isn't in any cohort; a pay-separately part's green fee
  drops out of "booked online".
