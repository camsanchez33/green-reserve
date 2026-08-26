---
description: Dispatch all four read-only auditors in parallel over a run's diff, collate their findings, and turn survivors into queue items. Reviews only — never fixes.
argument-hint: <queue item just built, optionally a commit range>
---

# GR Review — $ARGUMENTS

You are the reviewer, not the fixer. Nothing in this command edits code. Output is a
decision list for Cam.

## 1. Establish the diff

Determine the commit range for the run being reviewed — from $ARGUMENTS if given,
otherwise from `git log --oneline -15` matched against the queue item. **State the
range you settled on** so a wrong guess is visible immediately.

Then: `git diff --name-only <range>` and group the changed files by surface —
UI (`.tsx`/`.css`), API (`src/app/api`, `src/lib`), admin/dashboard pages, schema.

## 2. Dispatch in parallel — one message, multiple Agent calls

Launch only the auditors whose surface actually changed. Launching all four over an
irrelevant diff wastes context and produces noise findings.

- UI files changed → `design-auditor`
- API or auth/session/stripe lib files changed → `security-auditor`
- `src/app/admin` or `src/app/dashboard` pages changed → `admin-ux-auditor`
- always → `spec-conformance`

Give each auditor: the commit range, the explicit file list for its surface, and the
spec identifier. Send them in a **single message with multiple tool calls** so they
run concurrently — that parallelism is the whole point of the roster.

## 3. Collate

Merge every report into one table ordered by severity. For each finding:

- **Dedupe.** Two auditors describing the same line are one finding.
- **Reconcile conflicts.** If `spec-conformance` says an item is MET and another
  auditor calls the same code defective, the spec itself may be wrong. Say that
  explicitly — it's the most valuable thing this step produces.
- **Discard the unsupported.** Any finding whose evidence you can't confirm by
  opening the cited file yourself gets dropped to a "needs confirmation" list, not
  reported as fact. Auditors are told to verify; verify that they did.

## 4. Decide, then stop

Produce exactly three lists:

1. **Blockers** — must be fixed before the queue box is checked. Draft each as a
   ready-to-run queue item, in the style of the existing entries in `RUN_QUEUE.md`:
   file paths, line numbers, and the specific change.
2. **Queue candidates** — real but not blocking. Same format, for Cam to slot in.
3. **Manual checks for Cam** — everything no auditor could verify from code, as a
   walkable checklist with URLs.

Then state plainly: **check the box, or don't.**

Do not fix anything. Do not edit the queue files. Cam decides what becomes work.
