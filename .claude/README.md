# The GreenReserve agent system

Three layers. Each has exactly one job, and the boundaries between them are the
whole design.

```
CLAUDE.md            the facts        what is true about this codebase
.claude/commands/    the rituals      main-thread work that writes and commits
.claude/agents/      the judgments    read-only investigations, run in parallel
```

## The one rule

**Agents and commands carry behavior. They never carry facts.**

A fact is anything that could change without anyone thinking about this folder: a
color token, a route path, a model name, a session TTL, a banned class. Facts live in
`CLAUDE.md`, the `*_SPEC.md` files, and `ARCHITECTURE.md`. Every agent's first action
is to *read* the fact it needs, not recall it.

Behavior is how to work: what order to check things in, what counts as evidence, when
to stop, what to report and in what shape. That's what belongs in these files, because
it doesn't rot.

This rule is not theoretical. The previous command files hardcoded `emerald-600`,
`bg-gray-950` and `font-black` as the house style. Five weeks later all three were on
the BANNED list in `CLAUDE.md`, and `/gr-build` was actively instructing Claude to
violate the project's own design system. Copies rot. Pointers don't.

## The roster

### Commands — main thread, can write

| Command | Purpose |
|---|---|
| `/gr-run <item>` | Execute one queue item end to end: commit dirty docs, restate the plan for veto, build, validate, push, update the queue. |
| `/gr-review <item>` | Fan the auditors out over the run's diff, collate, and produce blockers / queue candidates / manual checks. Never fixes. |
| `/gr-debug <bug>` | Fix one bug, smallest change, nothing else. |

Builds stay in the main thread on purpose. A builder subagent hands back a summary
and takes away the ability to steer mid-run — and the summary is exactly the thing
that most needs auditing.

### Agents — own context window, read-only, run in parallel

| Agent | Answers |
|---|---|
| `design-auditor` | Does this UI obey the Clubhouse system as `CLAUDE.md` defines it *today*? |
| `security-auditor` | Can a valid session reach data or money that isn't its own? |
| `admin-ux-auditor` | Can a user click something and not be able to tell what happened? |
| `spec-conformance` | Does the shipped code actually do what the spec block said, item by item? |

None of them can edit. That's deliberate: an agent that fixes what it just judged is
how unreviewed changes ship. They report, Cam decides, `/gr-run` builds.

## Two rules every agent shares

**Evidence.** No finding from a grep hit alone. Open the file, read the context,
confirm it's live code. This project has burned build runs on confident findings that
evaporated on inspection — a false positive costs more than a miss.

**`UNVERIFIED` is a valid answer.** Anything that can't be judged from code — visual,
timing, live-data, third-party — comes back as a named manual check, not a guess
promoted to a verdict.

## When to add a fifth agent

Only when the answer to all three is yes:

1. Is this a judgment CI genuinely cannot make? Migrations, perf budgets and type
   safety already have deterministic gates (`schema-check.yml`, `perf-audit.yml`,
   `typecheck.yml`). An agent that duplicates a CI check is strictly worse than the
   check — non-deterministic, no red X, no history.
2. Does it need its own context window, or is it two greps inside an existing agent?
3. Is its `description` narrow enough to dispatch correctly? Claude Code picks
   subagents by description. A broad one gets picked for everything and does every
   job badly.

## Maintenance

These files are read by every run, so drift in them is expensive. Re-read this folder
whenever the **BANNED** list, the **session policy** table, or the
**no-silent-failures** rule in `CLAUDE.md` changes — those are the three sections the
agents lean on hardest. If an agent restates something instead of reading it, that's
the bug.

## The batch layer (added 2026-09-11)

A fourth piece, sitting on top of the three above:

```
.claude/commands/gr-batch.md   the dispatcher   plans, spawns, gates, merges — never builds features
.claude/agents/reskin-worker.md the one builder  write-capable, worktree-isolated, allowed-list-scoped
scripts/batch-plan.mjs          zero-token gate  file ownership: overlap + reserved-path check
scripts/reskin-guard.mjs        zero-token gate  "zero behavior": added fetch/prisma/useState/... on a range
.claude/hooks/parse-on-edit.js  zero-token gate  parse check after every Edit/Write, everywhere
```

### Why a builder subagent exists now, and exactly where it stops

The 2026-08-25 rule stands: builds stay in the main thread because a builder returns a
summary and takes away mid-run steering. The exception is narrow and mechanical:

**A worker may build an item only if it lives in a spec section explicitly labeled
zero-behavior** (today: `UI_REVISE_SPEC.md` §3) **and both deterministic guards pass.**
Reskins are the one class of work where steering has little value (the design is already
decided on the canvas), the failure mode is scriptable (`reskin-guard.mjs` greps the diff
for behavior signatures and files outside the allowed list), and the items touch disjoint
surfaces so they can run at once. Behavior items, schema, bugs and "small" items go through
`/gr-run` as before. If an item's text argues for an exception, the section it lives in
wins.

What a worker cannot do, by construction: touch a reserved path (shared `ui/`,
`globals.css`, layouts, `src/lib`, `src/app/api`, prisma, queue/spec/status files — the
list is in `batch-plan.mjs`), push, merge, or reach `main`. It works in
`.claude/worktrees/<name>/` on a `batch/<ITEM>` branch and hands back a branch plus a
fixed-shape report. The dispatcher re-runs every check itself before merging; the report
is a claim, not evidence.

### Why this saves Cam's time but not tokens

Parallel workers cut wall-clock: four reskins land in the time of one. They do not cut
tokens — each worker loads `CLAUDE.md` and its files in a fresh context, so a batch of
four costs roughly four runs. The token savings in this layer come from elsewhere:

- the parse hook replaces an LLM step with a process, on every edit, for free
- `tsc` and the status board run once on the merged tree, not once per item
- one `/gr-review` over the batch instead of four
- workers are told to read §1 + their own block, not the queue or the whole spec
- every agent pins its model explicitly; none inherits. Fable is reserved for the main
  thread (where Cam steers). `design-auditor` and `admin-ux-auditor` run on `sonnet` —
  their checks are mechanical (banned classes, swallowed catches). `security-auditor`,
  `spec-conformance` and `reskin-worker` run on `opus` — judgment work, but never the
  main-thread model. No agent runs on `haiku`: the evidence rule (open the file, confirm,
  false positives cost more than misses) is what a small model is worst at, and the
  haiku-shaped jobs are already scripts

### Worktree mechanics worth knowing

- Worktrees are created from `HEAD` (`worktree.baseRef: "head"` in `settings.json`), so
  the tree must be clean and on `main` before a batch — the doc-file commit rule runs first.
- A worktree has no `node_modules`, and does not need one: it lives inside the repo, so
  `require()` walks up and finds the main install. `npx tsc` is run once on the merged
  tree in the main checkout, not inside worktrees.
- The worker's branch survives even if its worktree is removed; merges use the branch ref.
  Clean up with `git worktree remove .claude/worktrees/<name>` after Cam's merge.
- The batch lands on `batch/<date>-<slug>`, Cam pushes it for a Vercel preview, walks the
  `UNVERIFIED` lists, then fast-forwards `main`. Four surfaces changing at once never go
  straight to production.

### When to widen the exception

Only when a new spec section can be labeled zero-behavior *and* `reskin-guard.mjs` can
express its safety condition. If the safety condition is "use judgment", it is not a
worker item.
