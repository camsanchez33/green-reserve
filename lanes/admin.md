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

## Approved, to build: Settings → Team (Cam 2026-11-16, "approved, build the team page")
Mockup `lanes/admin/team-mockup.html` (https://claude.ai/artifact/VJUXa2N27e8NDs8sNtpo8j) is the spec. `/admin/employees`, title "Team", the shared top bar, built like My profile's cards. No numbers on top (Cam removed them).
- One "Team" card listing everyone with an admin login: initials, name, "· you" on your own row, email, role, and status (green when signed in recently, amber "Never signed in", grey "Turned off"). Owners get a bare plus top right to add someone.
- Clicking a person opens them beside the list:
  - status, plus "Hasn't set their own password yet" when that applies;
  - Role as three tiles (Manager / Support / Viewer, each with what it can do), changed by tapping one;
  - "Can open" areas as check tiles behind a "Change" link, with Save and Cancel;
  - links "What they did" (the audit trail), "Reset password", and a red "Turn off" (or "Turn back on"), each confirming first;
  - a reset shows the one-time password once, with Copy and Dismiss.
- Add someone (owner only): name, email, role tiles, area check tiles (at least one), then a screen with their one-time password to give them.
- A manager sees the list and a person's details read-only. The owner can't change themselves; an owner has no areas.
- Keep every existing behaviour and API call, step-up included.

## Approved, to build: Settings → Goals (Cam 2026-11-16, "approved, build the goals page")
Mockup `lanes/admin/goals-mockup.html` (https://claude.ai/artifact/62wRP5X7nS5kMe26X8j7ir) is the spec. `/admin/goals`, the shared top bar and the My profile card style.
- One "Goals" card for goals still running, plus a "Finished" card for reached or missed ones. The owner gets a bare plus to add a goal: tiles for Live courses, Online bookings and GreenReserve fees, then a target and a date. The owner also gets a red Remove link, which confirms and steps up.
- Each goal shows:
  - the measure as its title, with "10 by Dec 31, 2026" under it and a big percent on the right;
  - a progress bar with a thin mark where it should be by today;
  - one line with the pace word, "4 of 10", "Should be at 5 by today (1 behind)" and the days left;
  - four boxes: Started, Still to go, Needed each week, and At today's rate it ends at.
- Pace colour (Cam): green when ahead of where it should be by today, amber when within 10% under it, red when further behind. Finished goals show "Reached" in green or "Missed" in red.
- Work the pace out on the page from what /api/admin/goals already returns (start, due, current, target). Don't change the API. Show "Reached on <date>" only if the date is already returned, otherwise just "Reached".
- Support and up can see goals; only the owner adds or removes.

## Next (menu order)
Audit → Security → Company docs, one page at a time,
mockup first ("as it works today"), nothing built until Cam approves.

## Small follow-ups
- `admin-areas.ts` Problems help text still says "take, note and hand off" (Build's file; Build does it).
