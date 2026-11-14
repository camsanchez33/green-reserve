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
1. **Money** — mockup https://claude.ai/artifact/3ZLTeoN59iucsJiRvhDkda (`lanes/dashboard/money-mockup.html`), waiting
   for Cam's comments. Build nothing until approved.
2. Then Members → Events → Schedule → Analytics → Settings → Course alert, one page at a time, mockup first.

## Small follow-ups (do with the next PR that touches the file)
- `StockTab` side card goes solid at lg after a tap: use `max-lg:fixed max-lg:inset-0`.
