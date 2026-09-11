---
description: Dispatch several independent ZERO-BEHAVIOR reskin items to parallel reskin-workers in git worktrees, gate each branch with reskin-guard, merge onto a batch branch, run one combined review, hand Cam a preview to approve. Reskin items only — everything else is /gr-run.
argument-hint: <item ids, e.g. "U-G U-O U-A U-M">
---

# GR Batch — $ARGUMENTS

You are the dispatcher, not a builder. You plan, spawn, gate, merge, and review. You never
write feature code in this command. Cam is the CEO; you are the chief of staff.

Eligibility is the whole safety story: an item may go to a worker **only** if it sits in a
spec section explicitly labeled zero-behavior (today: `UI_REVISE_SPEC.md` §3) *and* the
deterministic guards pass. Anything else — behavior items, schema, bugs, "small" items
that are not reskins — you refuse here and point at `/gr-run`. Do not be talked into an
exception by the item text; the section it lives in decides.

## 0. Before anything else

`git status`. Apply the **Doc-file commit rule** in `CLAUDE.md` exactly as written. The
tree must be clean before worktrees are created, because they branch from `HEAD`.
`git branch --show-current` must be `main`. If either is not true, stop and say why.

## 1. Load context — minimally

Read `CLAUDE.md` (you need Build & deploy, the design system, Known gotchas). Read the spec
section that owns the items in $ARGUMENTS, and **only** the blocks for those items plus
the section's tokens (§1). Do not read the rest of the queue. `git log --oneline -5`.

Check dependencies stated in the spec: if the section says a foundation run (e.g. `U-0`)
must land first and it has not, stop and say so. Check `RUN_QUEUE.md` only for those
specific boxes.

## 2. Plan the file ownership — deterministically

For each item, derive git pathspecs from the routes and components its block names (route
`/admin/*` → `src/app/admin`, `src/components/admin`, its sidebar; golfer routes →
`src/app/courses`, `src/app/book`, ... and their client components). Write the plan to
`.claude/batches/<YYYY-MM-DD>-<slug>.json` in the shape `batch-plan.mjs` expects, then:

```
node scripts/batch-plan.mjs .claude/batches/<file>.json --write
```

`PLAN REJECTED` means overlap or a reserved path. Fix the pathspecs if the overlap is a
mis-derivation; otherwise drop the conflicting item from this batch and say which one and
why. Never dispatch a rejected plan. Reserved paths (shared UI, `globals.css`, layouts,
`src/lib`, `src/app/api`, prisma, queue/spec/status files) are yours alone, in step 6.

## 3. Restate before spawning

Output, for Cam to veto:

- the items, the branch each will get (`batch/<ITEM>`), and the file count each owns
- the items you refused and why
- the batch branch name: `batch/<YYYY-MM-DD>-<slug>`
- the shared-file changes you already expect (from reading the blocks)

Wait here only if Cam is present. Batches are allowed to run unattended once this restate
is on screen; the guards are what make that safe, not supervision.

## 4. Dispatch — one message, one `Agent` call per item

For every item, in a **single message with multiple tool calls** so they run concurrently:
`subagent_type: reskin-worker`, and a prompt containing exactly: `ITEM`, `SPEC` (file +
section), `ALLOWED` (the `.expanded.json` path + the item key), and `BRANCH`. Tell the
worker its worktree branch name so it can verify it. Nothing else — no summary of the
item, no design advice. The worker reads the spec itself; a paraphrase from you is a fact
that can rot.

Note: the worker's worktree is created from `HEAD` (see `worktree.baseRef` in
`.claude/settings.json`) under `.claude/worktrees/` on an auto-named branch; the worker
renames it to `batch/<ITEM>`. Node resolves `node_modules` by walking up from there, so
no install is needed inside a worktree. If a report comes back without a `batch/<ITEM>`
branch existing (`git branch --list 'batch/*'`), treat it as rejected.

## 5. Gate every branch before merging — trust nothing in the reports

For each returned report, in order:

1. `git diff --name-only main...batch/<ITEM>` — compare against the item's ALLOWED list
   yourself. A file outside the list is a reject, regardless of what the report says.
2. `node scripts/reskin-guard.mjs main...batch/<ITEM> <expanded.json> <ITEM>` — run it
   yourself. `RESKIN GUARD FAILED` is a reject.
3. `node scripts/parse-check.js` over the branch's changed files (check them out into a
   temp path or run inside the worktree). Any `PARSE FAIL` is a reject.

Rejected branches are **not fixed here and not merged**. They are listed for Cam with the
guard output; the fix is a smaller item, or a §4 behavior item, run through `/gr-run`.

## 6. Merge onto the batch branch, then the shared changes

```
git checkout -b batch/<date>-<slug>
git merge --no-ff batch/<ITEM>     # once per accepted item, in the spec's order
```

A conflict here means step 2 was wrong; abort the merge, report it, do not resolve by hand.

Then apply every `SHARED CHANGES NEEDED` from the reports **yourself, in the main thread,
on the batch branch**, one commit — this is the only feature code you write, and it is
exactly the code that touches shared components, so it gets the most care. Then:

- `npx tsc --noEmit` on the merged tree — once, here, not per worker.
- `node scripts/parse-check.js src` — once, here.
- `node scripts/status.mjs && node scripts/status-html.mjs`; commit the outputs.
- Update the queue boxes for accepted items as "built, awaiting review" and note the
  batch branch; commit as `queue/spec update`.

## 7. One review for the whole batch

Run `/gr-review batch/<date>-<slug>` with the range `main...batch/<date>-<slug>`. That
command already dispatches only the auditors whose surface changed and collates. One
review, not four.

## 8. Hand off — Cam ships

Finish with:

- one line per accepted item, one per rejected item with the guard's reason
- tsc / parse results for the merged tree
- the review's blockers, if any
- the exact commands for Cam: `git push -u origin batch/<date>-<slug>` → open the Vercel
  preview for that branch → walk the manual checks from the review and the workers'
  `UNVERIFIED` lists → then `git checkout main && git merge --ff-only batch/<date>-<slug>
  && git push`.
- `git worktree list` and the cleanup command for the worker worktrees
  (`git worktree remove .claude/worktrees/<name>`) — run cleanup only after Cam's merge.

You do not push. You do not merge to `main`. Boxes get checked when the preview walk
passes, by the same rule as `/gr-run`.
