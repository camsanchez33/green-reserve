# GreenReserve — Legal Queue

Source of truth for legal work, in order. Same convention as `RUN_QUEUE.md`:
an open box is work not done; a checked box is work verified done, not merely
attempted. `⚖️` cannot be closed by a Claude session.

---

## NOW — before another course signs

- [ ] **LQ-1 — Stop claiming to be an LLC.**
      Replace `{{COMPANY_LEGAL_NAME}}` + "a limited liability company formed in
      the state of New Jersey" in `src/app/privacy/page.tsx` and
      `src/app/operator-agreement/page.tsx` with *"Cam Sanchez, sole proprietor,
      in New Jersey."* Bump `CURRENT_TERMS_VERSION`.
      *Two-line change. Removes a live misrepresentation. Do it today.*
      → Findings L-2 · Register PD-1/PD-2/PD-3

- [ ] **LQ-2 — Decide the fee-flow question, then make words and code agree.**
      Read `ENTITY_BRIEF.md` §"the fee question" and `FINDINGS_2026-09-02.md`
      L-1. Pick (A) rewrite the promise or (B) split the charge. Then change
      `/terms`, `/operator-agreement`, `HomeContent.tsx:219,338,341`,
      `ForCoursesContent.tsx:559,572`, and `Footer.tsx:61` in one pass.
      *Blocked on Cam's decision, not on research.*
      → Findings L-1 · Register PM-4, CC-6

- [ ] **LQ-3 — Refund the application fee on full refunds.**
      Add `refund_application_fee: true` to `stripe.refunds.create` in
      `src/lib/stripe.ts:66-76`, or delete the promise from the Operator
      Agreement. The contract currently says one thing and the code does another.
      → Findings L-3 · Register PM-5

- [ ] **LQ-4 — Disclose or delete the $0.50 membership fee.**
      `MEMBERSHIP_FEE_CENTS` at `src/lib/stripe.ts:12` is undisclosed and
      contradicts the "only fee" clause.
      → Findings L-4 · Register PM-4

- [ ] **LQ-5 — Form the entity.** ⚖️ optional but cheap
      See `ENTITY_BRIEF.md`. NJ LLC, registered agent, EIN, bank account,
      operating agreement, Stripe account transfer. Nothing else in this queue
      protects personal assets; this is the only item that does.
      → Register E-1..E-6

## NEXT — before scale

- [ ] **LQ-6 — Record booking assent server-side.**
      `termsAccepted: true` is a hardcoded client literal
      (`src/app/book/page.tsx:399,497`). Derive it server-side instead; keep the
      existing `termsVersion` stamp as the audit record. *Notice placement is
      already correct — do not "fix" it.*
      → Findings L-6 · Register PD-1

- [ ] **LQ-7 — Build the SMS consent + revocation path.**
      Schema field for comms consent and revocation timestamp; own `STOP`/`HELP`
      handler; honor a revocation received by *any* means within 10 business
      days, including email to hello@greenreserve.app.
      → Findings L-5 · Register CC-1, CC-2, CC-3

- [ ] **LQ-8 — Fix the self-contradicting amendment clause** in the Operator
      Agreement and re-prompt operators on material version changes. You already
      have the version machinery.
      → Findings L-7 · Register PD-3

- [ ] **LQ-9 — Disclose Sentry in `/privacy`.** It captures request data and is
      named nowhere in the sub-processor list.
      → Register DP-5

- [ ] **LQ-10 — Add an express license clause** letting GreenReserve display a
      course's name, logo, and photos. The white-label promise runs one way only
      right now.
      → Register IP-4

- [ ] **LQ-11 — USPTO clearance search on "GreenReserve"**, classes 042 and 043,
      before any further brand spend.
      → Register IP-1

- [ ] **LQ-12 — Write the deletion-request and breach runbooks.** One page each.
      `/privacy` promises both; neither has a procedure.
      → Register DP-2, DP-3, DP-4

- [ ] **LQ-13 — Sales/amusement tax read on the $1.50 service fee.** ⚖️/CPA
      NJ and SC first. Unexamined and it compounds silently.
      → Register PM-6

- [ ] **LQ-14 — Baseline WCAG 2.1 AA on golfer-facing pages.**
      Overlaps `ADMIN_V4_SPEC.md` MP-9 accessibility work — do them together
      rather than twice.
      → Register AX-1

## LATER — gated on a trigger

- [ ] **LQ-15 — Attorney review of all three documents.** ⚖️
      Trigger: 10 live courses or $250k annual routed volume.
- [ ] **LQ-16 — Tech E&O + general liability insurance.**
      Trigger: first course goes live. The §4 indemnity is uninsured until then.
- [ ] **LQ-17 — Trademark application in the entity's name.** ⚖️
      Gated on LQ-5 and LQ-11.
- [ ] **LQ-18 — State privacy compliance program.**
      Trigger: 50k golfer records or $10M revenue. Not before — see DP-1.
