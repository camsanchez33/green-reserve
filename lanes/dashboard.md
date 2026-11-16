# Dashboard lane — the course dashboard (`/dashboard/*`)

Read this and CLAUDE.md only. Approved decisions, word for word, are in `ADMIN_REDO_SPEC.md` (sections named below);
older dashboard rules (tee sheet DENSE-4, VIEWS-1, TEES-1, Home board, AN-1 "no stats on operational tabs") are in
`docs/DECISIONS.md` → "Design system".

## Look
Charcoal glass by default; Light is glass too (dark ribbons on a light page). Every change ships in BOTH looks —
screenshot both before review (`scripts/glass-test.ts` fails a charcoal-only rule). Pages use tokens, never typed hex.
The rail: Today (Home, Tee sheet, Pro shop) · Business (Money, Members, Events, Schedule, Analytics) · Settings ·
Support (last, with its unread count). Search without placeholder words.

## Done (merged)
Home · Tee sheet + time card · Pro shop (Register, Sales, Stock, Close out; blind count) · Pro shop stock box ·
Support (chats) · Light parity. Specs: ADMIN_REDO_SPEC "Course dashboard Home", "Tee sheet + time card",
"Course dashboard Pro shop", "Pro shop item stock box", "Course dashboard Support", "Rule: Light and Charcoal".

## Next (launch-plan order)
1. **Revenue (was Money) — APPROVED, build it** (Cam 2026-11-15, "after those 2 comments go you can commit that page"). Mockup `lanes/dashboard/money-mockup.html` (https://claude.ai/artifact/3ZLTeoN59iucsJiRvhDkda) is the spec: build exactly what it shows, in both looks. Rail item renamed Revenue. The GreenReserve $1.50 fee is never in course revenue (one muted Totals line only); "Net revenue", never "profit". Both Stripe buttons are the small Stripe logo square (white mark on #635BFF); the "Open in Stripe" button inside a payout's detail stays as words. Data the page needs that the API doesn't return yet (30-day average-by-time-of-day line, Food & beverage from shop categories, Stripe-mismatch detail) comes from Build; agree the shape with Build before wiring it.
2. **Memberships (was Members) — APPROVED, build it** (Cam 2026-11-16, "that page is good to go"). Mockup `lanes/dashboard/members-mockup.html` (https://claude.ai/artifact/7Xg3rPg8RWJn78erp8emb3) is the spec, in both looks. Rail item renamed Memberships.
   - The top three numbers are Memberships offered, Season passes offered and Dues collected this year.
   - "Your memberships" and "Season passes" lists each show colour, name, price and count, most first, and each has a bare plus. Beside them, "Dues this year" is broken down by each membership and pass, aligned under the third number.
   - A row opens that membership's or pass's own page: three numbers (members, dues, overdue renewals), every member, and Details. There is a plus to add a member, and a member opens their card (photo, number, dues, payments, renew, change, edit, auto-renew, end).
   - Add a member: photo, name, email and phone, an auto member number, and payment by Card reader, Cash or Type a card (Stripe's own fields). They are a member only once paid.
   - The membership setup runs Name and colour → Joining → Payment (yearly or one time, optional initiation fee, length) → Booking and rates (the public window or further ahead; rates against the course's own price list, blank = public and 0 = free, or % off).
   - The season-pass setup runs Name and colour → Price and dates (buy online and/or at the course) → What it gives (price list per round, booking window).
   - Tiles, step bar, normal-size fields, Cancel and Back as plain links.
   - Joining-online requests, import and reminders move to each membership's page.
   - Wire only what Build's data supports; hide the rest, never fake it.
3. **Events**: mockup `lanes/dashboard/events-mockup.html` (https://claude.ai/artifact/BVqXkiviwzu8ktCdyNNR9H), waiting for Cam's comments. Build nothing until approved.
4. **Schedule**: mockup `lanes/dashboard/schedule-mockup.html` (https://claude.ai/artifact/ANSdTS9cjrJwxsQ1TLFynU), waiting for Cam's comments.
5. Then Events → Schedule → Analytics → Settings → Course alert, one page at a time, mockup first.

## Small follow-ups (do with the next PR that touches the file)
- `StockTab` side card goes solid at lg after a tap: use `max-lg:fixed max-lg:inset-0`.
