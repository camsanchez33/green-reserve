# GreenReserve — Legal Operations

Created 2026-09-02. This folder is the legal counterpart to `RUN_QUEUE.md`:
it holds obligations, findings, and a prioritized action queue. It does not
hold legal advice.

## What this system is

A **legal operations** system. It tracks what GreenReserve owes, to whom,
under what trigger — and turns that into work items with the same discipline
the build queue uses.

## What this system is not

Not a substitute for counsel. Nothing in this folder was written by a lawyer.
Every document here is a careful draft or an operations checklist. Where a
question needs a licensed attorney, it is marked `⚖️ COUNSEL` and stays marked
until a real attorney signs off — a Claude session cannot clear that flag.

## The attorney line

Escalate to a licensed attorney (do not self-serve) when:

1. A course threatens or files a claim, or a golfer does.
2. A course wants to negotiate the Operator Agreement rather than accept it.
3. Anyone asks GreenReserve to sign a document it did not write.
4. Aggregate green-fee volume routed through the platform passes **$250k/yr**,
   or the platform passes **10 live courses** — whichever comes first.
5. GreenReserve starts holding funds, issuing gift cards or credits, or taking
   money before the round in any form other than a Stripe direct charge on the
   course's own connected account.
6. GreenReserve hires anyone, including a paid intern.
7. Any regulator, state AG, or Stripe risk team makes contact.

## Files

| File | What it is |
|---|---|
| `LEGAL_REGISTER.md` | Standing obligations: what applies, why, current status |
| `LEGAL_QUEUE.md` | Prioritized action items (LQ-n). Source of truth for what to do next |
| `FINDINGS_2026-09-02.md` | The audit that produced the initial queue |
| `ENTITY_BRIEF.md` | Formation decision brief — the gating item |

## Working rules

- **Docs and code must agree.** Every claim in `/terms`, `/privacy`, or
  `/operator-agreement` must be traceable to a code path that does it. A
  promise the code does not keep is a breach, not a typo. This is the single
  most common failure mode found in the first audit.
- **Marketing copy is a legal document.** `HomeContent.tsx` and
  `ForCoursesContent.tsx` make fee and payout claims. They are audited on the
  same pass as `/terms`.
- **Version, never silently edit.** `src/lib/terms.ts` holds
  `CURRENT_TERMS_VERSION`. Bump it on any material change; bookings stamp
  `termsVersion` at creation so old bookings keep an honest record.
- **Never assert a fact about the entity that is not true.** No entity name,
  no formation state, no "LLC" on any public page until the filing is stamped.
- **One register, one queue.** New obligations go in the register; new work
  goes in the queue. Findings files are historical and are not edited after
  they are written.
