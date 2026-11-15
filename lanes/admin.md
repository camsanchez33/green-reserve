# Admin lane — `/admin/*`

Read this and CLAUDE.md only. Approved decisions, word for word: `ADMIN_REDO_SPEC.md` (sections named below, plus
"ADMIN FORMAT — every admin page follows this"). Older admin rules (areas AW-11, no-silent-failures, Problems):
`docs/DECISIONS.md`.

## Look
Dark green glass only (no Light). Full width, frosted panels over the ribbon backdrop. One glass Filter button,
search without words, colour only with meaning, one line per item, tap opens full page with "‹ back". White icon
buttons with no box. The alert bell has no box. Admin never charges, retries, refunds or cancels a golfer's booking.

## Done (merged)
Overview (problems now in Needs attention, no take/assign/snooze) · Golf courses · Onboarding (+ launch date) ·
Bookings (+ GR refs) · Revenue (+ revenue goal card with "On track for about $X") · Expenses (+ pace, red when
known costs are already over) · Financial analytics · Business analytics · Course support (iMessage-style chats) ·
Announcements. Dark only.

## Approved, to build: Platform activity (Cam 2026-11-15, "approved, build the platform activity page")
Mockup `lanes/admin/system-mockup.html` (https://claude.ai/artifact/Pmh83iVc62Gqbroq9Y3ygD). `/admin/system`, title "Platform activity". A status board BY SERVICE: a summary line ("2 need a look" / "All 11 services running"), then sections, each its own box, the section with a problem first: Running the site (Scheduled jobs, Vercel, Neon, GitHub) · Email, texts and calls (Twilio, Resend, Cal.com) · Payments (Stripe) · Errors, assistant and files (Sentry, the assistant, Blob storage) · Owner tools (Data check, Agreement versions, Before launch: clear test data). One line per service: dot, name, what it does, state. Tap → full page with "‹ back", today's detail and the existing actions. Every amber or red row has a "How to fix" block: numbered plain steps plus the button that does it (Open Vercel env vars, Re-run job, Open Stripe webhooks, Re-check…). Every feature of today's System page is kept, folded into its service. Wordless search, one Filter (Failing / Needs a look / Working / Can't see here), white refresh. The assistant is never called "Birdie". SHARED ADMIN TOP BAR (every admin page): the search is slimmer (~34px) and clicking it or Ctrl K opens the search palette (courses, bookings, pages).

## Next (menu order)
Settings (My profile) → Team → Goals → Audit → Security → Company docs, one page at a time,
mockup first ("as it works today"), nothing built until Cam approves.

## Small follow-ups
- `admin-areas.ts` Problems help text still says "take, note and hand off" (Build's file; Build does it).
