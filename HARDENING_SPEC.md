# Hardening Run — concurrency, tenant isolation proof, sessions, backend map

Read CLAUDE.md first. ONE long run (~1 hour, unattended). No mass file moves — the
build ignores TS errors, so import breakage from reorganizing folders can deploy
silently. Organization is achieved via documentation + consolidation, not relocation.

Prereq: the SECURITY fixes run must be committed first (this run builds on it).

---

## A. Booking concurrency — no double-booking, ever

The race: two golfers submit the same tee time in the same second. Player capacity
makes it subtler — a slot holds up to 4 players, so the invariant is
SUM(players across confirmed bookings for a teeTimeId) <= slot capacity.

1. Make the claim atomic. Inside a prisma $transaction with Serializable isolation
   (or a conditional updateMany guard): re-read the tee time's remaining capacity,
   reject if insufficient, create the booking, and flip TeeTime.status to 'booked'
   only when full. No check-then-write across two round trips.
2. Same guard on EVERY path that consumes capacity: golfer booking, operator manual
   booking from the dashboard tee sheet, member booking (if it books), admin paths.
   One shared claimTeeTime() in src/lib — no duplicated logic.
3. Handle the loser gracefully: API returns 409 with "That time just filled up" and
   the booking UI refreshes the slot list instead of showing a raw error.
4. PROVE it: scripts/concurrency-test.ts — seeds a test course + one 4-player slot,
   fires 20 simultaneous booking requests (mixed 1–3 player parties) at a local dev
   server, asserts total booked players == 4 and every other request got 409.
   Document how to run it in the script header. It must pass before this run ships.

## B. Tenant isolation — prove it, don't assert it

scripts/isolation-test.ts — integration test against local dev with seeded fixtures
(2 courses + their operators, 2 golfers with bookings, 1 member, admin accounts in
all 4 roles). Every case asserts the status code:

- Operator A hitting every /api/operator and /api/dashboard route with course B's
  ids in body/query → 403/404, never data.
- Golfer A reading/cancelling golfer B's booking → 403/404.
- Member of course A hitting course B's member portal endpoints → rejected.
- viewer role hitting transactions/activity/employees/broadcasts → per the Phase 4b
  + security-run matrix (viewer gets NO financial ledger or golfer PII).
- Expired/na session token and cross-type token replay (golfer token on admin route,
  member token on operator route) → 401 everywhere.
- Token endpoints with a wrong token (checkin, details, pay) → 401/404 + rate limit
  kicks in after repeated misses.
Print a pass/fail matrix. Fix any failure found — a failing case here is a real
vulnerability, treat it as part of this run.

## C. Card data + Stripe surface (verify + document)

- Verify no card number ever touches our server: card entry must be Stripe Elements /
  SetupIntent only; grep for any handler reading PAN-like fields from request bodies.
  Document the money flow in ARCHITECTURE.md (booking → SetupIntent; check-in →
  direct charge + application fee; refund path; webhook events consumed).
- Verify STRIPE_SECRET_KEY and all secrets appear only in server code (no 'use
  client' file imports them, none in NEXT_PUBLIC_*).
- Webhook: assert every handled event type is idempotent (replaying the same event
  twice must not double-write).

## D. Session policy — explicit per surface

Decide, implement, and write into CLAUDE.md one table:
- Admin employees: 12h absolute; owner sessions 12h (2FA already at login).
- Operators/staff dashboard: 7 days sliding (activity refreshes it).
- Golfers: 90 days sliding.
- Members: 90 days (exists — verify).
Implement sliding renewal where listed (reissue JWT when >50% elapsed). All cookies:
httpOnly, secure, sameSite=lax (verify, from audit these are fine). Logout endpoints
clear their own surface's cookie only.

## E. URL surface + backend map (the "easy to find stuff" part)

1. Generate ARCHITECTURE.md at repo root — the backend map, kept honest by a script:
   - scripts/route-inventory.ts walks src/app/api/**/route.ts and src/app/**/page.tsx,
     emits a table: route, methods, auth surface (public/golfer/operator/member/
     admin+role), purpose (one line, from a leading comment in each file — add the
     comment where missing).
   - ARCHITECTURE.md embeds that table plus: model relationship summary from
     schema.prisma, the money flow (from C), the session table (from D), and a
     src/lib file index (one line per lib file).
   - Script is re-runnable; note in CLAUDE.md to re-run after adding routes.
2. URL surface review: every page route classified public vs authed. Admin +
   dashboard pages: verify middleware/layout redirects unauthenticated hits (not
   just client-side checks). Add robots noindex on /admin, /dashboard, /checkin,
   /account, member portal paths. Public pages list must be exactly: home,
   /for-courses (+details token page), /courses, /courses/[slug], /contact,
   /privacy, /terms, login pages — anything else found public is a finding to fix.
3. Consolidation WITHOUT moving files: find copy-pasted logic between API routes
   (session resolution boilerplate, course ownership checks, JSON error responses)
   and extract into existing src/lib modules. Imports change, files don't move.

---

## Ground rules

- Work A → B → C → D → E; commit after each section so a failure can't lose the run.
- babel-parse every touched file; line-count check after large writes.
- Both test scripts must PASS before their section is committed.
- No folder restructuring, no renames, no route path changes.
- Schema changes: none expected. If A truly needs a constraint/index, it's allowed
  but must be additive (new index only), noted in the commit message.
