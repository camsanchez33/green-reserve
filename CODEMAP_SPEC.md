# Codemap Spec — a generated map of the code, so agents stop reading files to find things

Source: Cam, 2026-09-16. "I want to create a code map and brain type of thing to be
looked at so that code doesn't need to always be read through completely."

The cost today: every run and every audit re-derives the same facts by grepping and
reading whole files. `ARCHITECTURE.md` and `CLAUDE.md` cover some of it but are
hand-written, so they drift — `CLAUDE.md`'s tech-stack tree already lists
`src/app/account/`, which does not exist.

Rule, same as `STATUS.md`: **generated, never hand-edited.** A map that can lie is
worse than no map, because it is trusted.

---

## Phase CM-1 — `scripts/codemap.mjs` → `docs/CODEMAP.md` + `docs/codemap.json`

### 1. What it reads

Every `.ts` / `.tsx` under `src/`, plus `prisma/schema.prisma`. No network, no DB.
Parse with the babel parser already vendored for `scripts/parse-check.js` — regex
will drift on this codebase's syntax.

Per file, emit:

| field | from |
|---|---|
| `path` | relative |
| `lines` | line count — tells an agent what reading it costs |
| `purpose` | the first sentence of the top-of-file block comment, if present |
| `exports` | exported names + kind (`fn` · `const` · `type` · `component` · `route`) |
| `route` | for `src/app/**/page.tsx` and `route.ts`, the URL it serves and its HTTP methods |
| `usedBy` | reverse import index — which files import this one |
| `brain` | see §2 |

`codemap.json` is the machine copy. `CODEMAP.md` is the readable one.

### 2. `@brain` — the part that earns its keep

This codebase's recurring failure is two places answering the same question and
drifting (four overlapping "waiting on us" SQL heuristics; two derivations of whose
move it is; a hand-written agreement page beside a versioned one). Every fix has
written the same sentence into a comment: *this is the one source of truth for X.*

Make that a tag. A file's header comment may carry:

```
@brain whose-move-is-it
```

`codemap.mjs` collects them into a **Single sources of truth** table at the top of
`CODEMAP.md`: concept → file → exports. Two files claiming the same concept is a
**hard error** — the script exits non-zero and names both. That is the check the
codebase has needed all along and has only ever enforced by comment.

Tag at least these on the first run: `queueSignal` (whose-move-is-it),
`computeCourseHealth` (course-health), `inquiry-needs` (still-need-from-them),
`inquiry-call` (call-agenda), `call-availability` (when-cam-is-free),
`agreements` (agreement-versions), `stripe` (money-movement),
`inquiry-status` (inquiry-statuses), `course-timeline` (course-events).

### 3. Layout of `CODEMAP.md`

1. **Single sources of truth** — the `@brain` table. First thing anyone reads.
2. **Routes** — every URL, its file, its auth level (public · golfer · operator ·
   admin, derived from which session helper the file imports), and for API routes
   the methods. This replaces the sitemap that keeps being hand-maintained.
3. **Libraries** — everything in `src/lib/`, with purpose, exports, and `usedBy`
   count. Sorted by `usedBy` descending, so the load-bearing files are at the top.
4. **Components** — same shape.
5. **Schema** — every model, its fields, and which files query it (grep
   `prisma.<model>`). Answers "what writes to Call?" without opening anything.
6. **Orphans** — files nothing imports and no route serves. Dead code, listed.

### 4. When it runs

- A line in `/gr-run` after the build step, beside `node scripts/status.mjs`.
- CI check: regenerate and fail if the working copy differs, same as a lockfile —
  otherwise it rots exactly like `ARCHITECTURE.md` did.
- Not on the PostToolUse hook. Too slow per edit.

### 5. `CLAUDE.md` changes in the same commit

- Add, near the top: **"Read `docs/CODEMAP.md` before grepping or reading source.
  It names every route, every export, and the one file that owns each concept.
  Read a file only after the map tells you which one."**
- Delete the hand-written tech-stack tree (it is already wrong) and point at the
  map instead. That is also a token saving on every agent spawn, since CLAUDE.md
  auto-loads into each one.

### 6. Verify

Run it twice — byte-identical output. Delete a `@brain` tag and duplicate it onto
two files — the script exits non-zero and names both. Pick three routes at random
and confirm the auth level shown matches the session helper the file actually
imports. Confirm `src/app/account/` does not appear (it does not exist) and that
`src/app/courses/[slug]/account` does.

---

## Not in this spec
- A dependency graph image. The `usedBy` index answers the same question in text,
  which is what an agent can actually use.
- Anything that summarizes what code *does* beyond its own header comment. A
  generated paraphrase is a thing that can be wrong; a copied comment is not.
