---
description: Decide what to work on next from the status board alone — no arguments, no building. Reports, recommends, waits for Cam's pick.
---

# GR Next

This command picks the work. It does not do the work. It ends by waiting.

## 0. Before anything else

`git status`. Apply the **Doc-file commit rule** in `CLAUDE.md` exactly as written.
Do this first: the board is generated from the queue files, so a dirty queue means
the board you are about to read is about to change.

## 1. Regenerate the board

```bash
node scripts/status.mjs
```

The board is derived, so a stale one recommends work that shipped hours ago. If the
script fails, stop and say so — do not fall back to reading the queue by hand, which
is the exact cost this command exists to avoid.

## 2. Read the board, and only the board

Read `STATUS.md`. **Do not read `RUN_QUEUE.md`** — not in full, not in part. Its
line refs are what you report, not what you open. Reading the queue here burns the
context that the item you recommend is going to need.

The one exception: if `STATUS.md` has a drift section saying git and the queue
disagree, report that first and recommend nothing until it is resolved. A board
that knows it is wrong is not a board.

## 3. Report

Three groups, in this order, each item with its `RUN_QUEUE.md:<line>` ref so
whatever Cam picks can be opened directly:

1. **In flight** — everything the board lists as started and unfinished, with the
   one line that says what is actually left.
2. **Built but not signed off** — shipped code whose review has not run. Include
   how long it has been sitting; age is the argument.
3. **Next 3 not started** — the top three only. A longer list is a menu, not a
   recommendation, and Cam already has the queue if he wants the menu.

For each, one line. If the board's own summary line is uninformative, say that
rather than inventing a better one from memory.

## 4. Recommend exactly one

In this order, first match wins:

- **Unreviewed work outranks new builds.** Something built and unaudited is an
  unknown in production. Starting a second build on top of it compounds the
  unknown. If the "built but not signed off" group is non-empty, the
  recommendation is a review — the oldest one — unless something in flight is
  half-finished and leaving it half-finished is worse.
- **Skip anything blocked on Cam.** The board names these; a blocked item cannot
  be finished by this session no matter how well it is picked, so it is not a
  candidate. Say which ones you skipped and why, in one line, so a stale block
  gets noticed rather than silently inherited.
- Otherwise the first not-started item.

State the recommendation as one sentence with a reason. If the honest answer is
that nothing is a good next move — everything left is blocked, or the board is
unreliable — say that instead of picking the least-bad item.

## 5. Stop

Ask which one, then wait. **Do not start building.** The whole value here is the
pause; a command that picks and then immediately runs is just `/gr-run` with a
worse spec.

On Cam's pick, hand off:

- work to build → `/gr-run <item>`
- work to audit → `/gr-review <item>`

Hand off by invoking it, not by describing it.
