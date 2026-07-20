# Birdie AI Assistant — spec

Birdie (the mascot) becomes an in-app assistant. Three personas, one system,
strictly scoped: it helps with GreenReserve things on the page it lives on,
and politely refuses everything else. "Birdie fetches tee times, not
calculus homework."

## Architecture (all phases)
- Server-side only: /api/birdie/chat proxies to the Anthropic API
  (ANTHROPIC_API_KEY env — Cam adds to Vercel; costs money, so guardrails
  below are also cost controls). Model: Haiku-class by default (fast/cheap),
  streaming responses.
- PERSONA PER SURFACE: the route derives persona + allowed tools from WHERE
  the request comes from and WHO is asking (session), never from client-sent
  config. Client cannot ask for a different persona than its surface.
- TENANT ISOLATION IS LAW: every tool call is scoped server-side by the
  session (operator → their courseId only; golfer → public data + their own
  bookings via verified session; admin → admin session required). The model
  NEVER receives another tenant's data in context. Reuse the isolation test
  matrix pattern — cross-tenant prompts are vulnerabilities, test them.
- SCOPE GUARDRAILS: system prompt defines the narrow job + hard refusal
  style for off-topic (friendly, one line, offers what it CAN do). Server
  also caps: max tokens per reply, rate limit per session/IP (e.g. 20
  msgs/hour), daily platform cap with a kill-switch env (BIRDIE_ENABLED).
  Conversations logged (minus nothing — they're ours) for review/tuning.
- KNOWLEDGE: curated markdown knowledge packs per persona (how-tos, policies,
  FAQ — seeded from the V13 tab intros and existing docs), injected by
  persona; live data via typed server tools, not raw DB access.
- UI: floating Birdie button (birdie-head mark) → chat panel, per-surface
  greeting + 3-4 suggested question chips, streamed replies, "Birdie can
  help with X, Y, Z" disclosure. Dismissible, remembers closed state.

## Phase B1 — Foundation + OPERATOR helper (dashboard)
The pro-shop owner's guide dog. Tools/knowledge:
- Answer "how do I…" for every dashboard task (block a tee time, change
  weekend rates, add a member, set cancellation fee, connect Stripe, read
  payments) with short steps + a DEEP LINK button to the exact tab.
- Read-only awareness of THEIR course state to answer "what's my current
  cancellation window?" or "is my Stripe connected?"
- NO WRITES in B1 — it instructs and links, never changes anything.
- Refusals: anything not about running their course on GreenReserve.

## Phase B2 — GOLFER helper (course pages + portal)
- Find tee times: "got anything Saturday morning for 4?" → queries that
  course's tee-times API (same filters the sheet uses), replies with slots +
  a Book button per slot (deep link into the booking flow — Birdie never
  books on their behalf).
- Explain THIS course's policies (cancellation, member rates, 9-hole rules)
  from course data; portal questions ("how do I cancel?") link the golfer to
  their own manage flow.
- WHITE-LABEL NOTE (Cam's call to include Birdie here — soften the seam):
  panel wears the course's brandColor with "Birdie · course assistant"
  attribution; stays off the page until the golfer opens it.
- Anonymous-friendly: no session needed for tee-time search; personal
  questions require the portal session.

## Phase B3 — ADMIN copilot
- Pipeline questions answered from real data via admin-scoped tools: "which
  inquiries are stalled?", "how much did we make this week?", "which courses
  have Stripe problems?" — with links into the right admin page.
- Knows the admin's own docs (runbook summaries, how the pipeline works).
- Admin session required; SUPPORT_PLUS minimum for money/PII answers,
  mirroring existing role gates.

## Phase B4 — Operator ACTIONS (propose-and-confirm, later)
- "Change my weekend rate to $70" → Birdie drafts the change and shows a
  confirm card (old value → new value); NOTHING happens without the
  operator clicking Confirm; every applied change hits the same validated
  APIs the UI uses and is logged. Small allowlist of low-risk actions first
  (rates, windows, blackouts). This phase ships only after B1 proves itself.

## Explicitly out of scope (all phases)
- General chat/anything-goes Q&A, calculus and friends
- Birdie booking/cancelling/charging on anyone's behalf
- Cross-course questions from non-admin personas
- Training on golfer PII; answers never reveal other users' data

## Prereqs / notes
- ANTHROPIC_API_KEY in Vercel (Cam) + BIRDIE_ENABLED flag
- Budget note: Haiku + caps ≈ cheap; monitor via logged usage counts on
  /admin/system
- Phase order B1 → B2 → B3 → B4; each phase includes its isolation tests
