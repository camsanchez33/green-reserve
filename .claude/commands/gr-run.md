---
description: Execute one GreenReserve queue item end to end — commit dirty docs, restate the plan, build, validate, push, update the queue.
argument-hint: <queue item or spec phase, e.g. "REVISE A-07" or "ONBOARDING_V2 V13">
---

# GR Run — $ARGUMENTS

This runs in the main thread so Cam can steer mid-run. Do not delegate the build to
a subagent.

## 0. Before anything else

`git status`. Apply the **Doc-file commit rule** in `CLAUDE.md` exactly as written —
it distinguishes doc files (commit, never discard) from everything else. Do this
before reading the queue, because Cowork edits the queue between runs.

If the tree is dirty in a way the rule doesn't cover, stop and ask. Never guess at
discarding work.

## 1. Load context

Read, in this order:

1. `CLAUDE.md` in full. Everything you need to know about architecture, the design
   system, build validation, shipping rules and known gotchas lives there. **This
   file is the source of truth — nothing in this command restates it, because a copy
   would rot.**
2. `RUN_QUEUE.md` and `REVISE_QUEUE.md` — find the item named in $ARGUMENTS and read
   its full spec block. If it points at a `*_SPEC.md` phase, read that too.
3. `git log --oneline -10` — know what shipped recently.

## 2. Restate before building

Before touching code, output:

- the item you're running, and the atomic claims you extracted from its spec
- the files you expect to touch
- **whether this item requires a schema change** — if it does, stop here and say so.
  Schema changes follow the migration checklist in `CLAUDE.md` and are run attended,
  never swept into a batch.
- anything in the spec that is ambiguous or that conflicts with current code

Then build. Cam can interrupt at this point, which is the entire reason this step
exists.

## 3. Build

- Read every file fully before editing it. Never edit blind.
- Match the patterns in adjacent code before inventing new ones.
- Design system: obey the Clubhouse section of `CLAUDE.md`, including its BANNED
  list. If the spec asks for something that section forbids, surface the conflict
  rather than silently picking one.
- Respect the **no-silent-failures rule** on every admin/dashboard action you add.
- Follow the **Known gotchas** section of `CLAUDE.md` for file-writing hazards —
  especially the rules on `sed -i`, large-file truncation, and JSX ternaries.
- Stay inside the spec. Anything the spec did not ask for becomes a new queue item,
  not a bonus commit.

## 4. Validate before committing

- Run the `@babel/parser` SWC-parity check from `CLAUDE.md` on **every** `.tsx` you
  touched. `ignoreBuildErrors: true` means type errors won't stop a broken deploy —
  parse errors are the only thing that will.
- `npx tsc --noEmit` — CI runs this, so a red type-check is a red PR.
- Confirm the line count of every file you wrote matches what you intended. Truncation
  is silent.

## 5. Ship and record

- Commit with a message naming the queue item.
- Push. Vercel auto-deploys `main`.
- Update the item in the queue file: check the box and append the commit sha. Commit
  that as `queue/spec update`.

## 6. Hand off

Finish with:

- one line per thing you changed
- the parse/type-check results
- **the manual checks Cam must do on the live site** — be specific about URL and what
  to look at
- `Next: /gr-review <this item>` — the box does not get checked until review passes
