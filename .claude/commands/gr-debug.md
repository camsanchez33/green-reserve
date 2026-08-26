---
description: Fix one GreenReserve bug. Smallest possible change, nothing else — no refactors, no improvements, no scope.
argument-hint: <the bug — symptom, URL, or error>
---

# GR Debug — $ARGUMENTS

Fix the bug. Nothing else. Do not refactor, do not redesign, do not improve things
that aren't broken. Every extra line you change is a line nobody asked for and nobody
will review.

## 1. Load context

Read `CLAUDE.md` — specifically the **Known gotchas** section and the
**CRITICAL: build validation** section. Those two explain most of the confusing
failures in this codebase, including why a broken deploy can pass a build. Do not
work from memory of how this project behaves; read it.

If the bug is in a route, `ARCHITECTURE.md` maps the backend.

## 2. Reproduce before touching anything

State, in one line each:

- what the user does
- what happens
- what should happen
- **your evidence for the cause** — the file and line, read, not guessed

If you cannot get to a specific line, say so and ask rather than changing code
speculatively. A speculative fix that appears to work is worse than no fix, because it
closes the investigation.

## 3. Fix

- Read the file fully first.
- Change the fewest lines that resolve the cause. If the minimal fix is ugly, ship the
  minimal fix and note the cleanup as a queue item.
- Do not fix adjacent bugs you notice. List them at the end instead.

## 4. Validate

- Run the `@babel/parser` check from `CLAUDE.md` on every `.tsx` you touched.
- `npx tsc --noEmit`.
- Confirm the written file's line count is what you expect — truncation is silent.

## 5. Report

- **Cause:** one sentence.
- **Fix:** one sentence.
- **Blast radius:** what else calls this code path and why it's still fine.
- **How Cam verifies it on the live site:** URL and exact steps.
- **Noticed but not fixed:** anything else you saw, as candidate queue items.

Commit and push with a message naming the bug.
