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
