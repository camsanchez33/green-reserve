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

## Approved, to build: Settings → My profile (Cam 2026-11-15, "approved, build the my profile page")
Mockup `lanes/admin/profile-mockup.html` (https://claude.ai/artifact/2uRAQpAe1k1WVwxfRasS1G) is the spec; build exactly what it shows. `/admin/profile`, title "My profile", the shared top bar. Every card has the same build: a head (title, one plain line, at most one action top right as a plain underlined link or a bare plus icon, never a boxed button), rows of equal height (dot only where it means something), and a foot only where the actions need one. Two-column grid, equal heights; one column on a phone.
- Your account: Name, Email, Role rows. The owner has NO change button. An employee has "Request a change", a link to the employee contact page, which doesn't exist yet: hide the link until that page exists (Build's default; Cam can overrule).
- Password: closed by default. Rows "Password ••••" and "Changed <date>" (date from Build; hide the row if unknown). "Update password" link top right opens Current / New / Confirm with Update password and Cancel; it closes on success with "Password updated". Same route and the same errors as today.
- Owner only, under the heading "Owner security" with the line "How you prove it's you at /cam, and which devices are signed in.":
  - Passkeys: a bare plus top right adds one ("Name it" → Add → "Waiting for your device…"; disabled until the authenticator app is set up). Rows: name, added date and last used, with Remove (confirm).
  - Your devices: rows with "· this device" on the current one, approved date and last sign-in, with Remove (confirm; removing this device signs you out).
  - Two-factor, full width: an "Authenticator app" row (set up / not set up) with a plain link "Move to a new phone" (or "Set up"), and a "Recovery codes" row ("N of 10 left · each works once") with "Make new codes". These open the same flows as today: QR + secret + 6-digit confirm; current app code → the ten new codes, Copy all / I saved them.
  - Sign out everywhere: not a card. One plain sentence under the cards, "You stay signed in for 4 hours at a time, only on devices you approved, and we email you every time you sign in. Lost a device or see a sign-in you don't recognise?", with a red link "Sign out everywhere" that confirms first.
- Employees never see the owner items in the menu (Audit, Security, Company docs).
Keep every existing behaviour of OwnerPasskeysCard, OwnerDevicesCard, OwnerTwoFactorCard and OwnerSignOutEverywhere (re-skin; their API calls and step-up stay as they are).

## Next (menu order)
Team → Goals → Audit → Security → Company docs, one page at a time,
mockup first ("as it works today"), nothing built until Cam approves.

## Small follow-ups
- `admin-areas.ts` Problems help text still says "take, note and hand off" (Build's file; Build does it).
