# Admin walkthrough V1 (Cam 2026-10-20)

Status: QUEUED — Cam: "save this for when everything else is done and we can go
over it then". Nothing here is built. Go over it with Cam (questions first)
after Walkthrough 2 (OPERATOR_REWORK_SPEC / HOMEPAGE_SPEC "Walkthrough 2") is done.
Earlier admin specs: ADMIN_REBUILD_SPEC, ADMIN_V2..V4_SPEC.

## Cam's notes, verbatim

> First u type in greenreserve.app/admin brings u into admin cosole access the whole thing just looks weird and then it says are u in owner go to sign on it shouldnt ahve that thw owner should know his own thing and it shouldn t be the same thing as the admin cause that is where theoretical workers would go
>
> quick thing/fix 404 pages or we couldnt find that maybe do a litte rework just say this doesnt exist what are u look for or return home its honestly fine and can just be kept
>
> My owner sign in should be /cam and should be unbelievably secure
>
> Wow so this is a lot this first page first thoughts are do we really want a side bar as opposed to top and how can we make this whole side bar shit be more organized and easy with all the admin pages since it is our company its not so much about impressing or looking good but the functionality and ease needs to be icredibly thought out this is how all issues and problems are going to be fixed
>
> starting with platform overview it fucking sucks i mean u have green reserve fees today who gives a fuck what does that help us with unread sitting there doing nothing and then waiting i mean its awful needs complete rework
>
> Then the action que this also sucks so combobled no clue what to look at and what to do this jsut sucks all around makes no sense no functionality or ease to it u have the refresh word in the top that should be symbol
>
> You scroll down and see the revenue boc with day week month just so unorganized with live courses bookings and green reserve fees FUCKING THINK what do we actually need there as the owner of the website think and then u have three random tabs pipleine todays sheet and course health watch list i mean it just sucks all around maube some things need seperate tabs but it just needs to be better also there should be AI integrated into the admin doing checks hourly with updates making sure things are running wel that they are notiying of any problems messages etc
>
> moving down into inquiries
> - THIS IS GENuiniely one of the worst tabs ive ever seen complete wework
>
> Courses tab
> - This sucks to complete rework just so unorganized and functionality is terrible rework
>
> Messages
> - I geuss messages is alright still not organized and the announcments thing shouild probaly be its own thing and make it actually organized an functionally sound
>
> Revenue
> - GENUINELY TERRIBLE complete rework
>
> Golfers
> -DO WE REALLY NEED TO KNOW WHO EVERY FUCKING GOLFER IS
>
> EMPLOYEES
> - NEED THIS TO BE A GOOD TAB AND IT sucks we have the change password tab on just htis page makes no fucking sense
>
> ACtivity
> - IS every fucking thing going to be here on this activity page that sounds retarded fix it with rework and ask me questions
>
> Manual build
> -LETS THINK are we REally doing this dumb shit fucking from like V1
>
> System
> - SO MUCH ON THIS TAB IS important and it is so fucking disorganized
>
> COmpany docs
> - Again important needs to be organized
>
> My profile
> - Just rework make more organized
>
> OVERALL
>
> THINK about how to make this way better because it sucks ask me questions about how and what to change maybe some more tabs are needed Expense tab? MArketing tab? LEads Tab? Advertising Tab? The employees thing also im  the owner so i can see everything but workers are going to have there own log in and are going to only see certain  portals etc so that needs to be built out

## Items (nothing built; questions to Cam first)

- **AW-1 Owner sign-in at /cam, separate from employees.** /admin is the employees' door; the "are you the owner?" prompt goes. The owner signs in at /cam — "unbelievably secure" (auth: overseer only, never delegated).
- **AW-2 404 page.** Small rework: says the page doesn't exist, asks what they were looking for, offers home. Low priority ("honestly fine").
- **AW-3 Navigation.** Sidebar vs top bar; organise every admin page around how problems get found and fixed. Function over looks.
- **AW-4 Platform overview.** Complete rework — what the owner actually needs to see and act on (not "GreenReserve fees today", not an unread count that sits there). Includes the action queue (unclear what to look at; refresh should be an icon), the revenue box, and the Pipeline / Today's sheet / Course health tabs.
- **AW-5 AI checks.** An assistant in the admin that runs hourly checks that things are running well and reports problems and messages.
- **AW-6 Inquiries.** Complete rework.
- **AW-7 Courses.** Complete rework.
- **AW-8 Messages.** Organise; announcements become their own area.
- **AW-9 Revenue.** Complete rework.
- **AW-10 Golfers.** Question whether the admin needs a list of every golfer at all.
- **AW-11 Employees.** Make it a good tab; change-password does not belong only here. Employee logins with per-person access to only some areas (owner sees everything) — needs building out.
- **AW-12 Activity.** Rework; decide what belongs there (not "every single thing"). Questions to Cam.
- **AW-13 Manual build.** Question whether it should exist at all (from V1).
- **AW-14 System.** Important but disorganised — reorganise.
- **AW-15 Company docs.** Organise.
- **AW-16 My profile.** Rework, more organised.
- **AW-17 New areas?** Cam asks whether to add Expenses, Marketing, Leads, Advertising.

## Decisions (Cam 2026-10-21)

- **AW-1 /cam:** passkey as the second factor (authenticator app + recovery codes as backup; email codes off for the owner once a passkey exists); owner session 4 hours, risky actions re-confirmed with the passkey; an email on every sign-in; new devices approved from an emailed link; the owner's own cookie; /admin never mentions the owner and /cam is linked nowhere and not indexed. Built in three parts: AW-1a (/cam, devices, sessions, alerts), AW-1b (passkeys), AW-1c (step-up on risky actions, plus a device list to revoke one).
- **AW-3 navigation:** the LEFT RAIL, grouped by job — Today · Courses (Leads, Inquiries, Courses, Course groups, Messages) · Money (Revenue, Expenses, Marketing) · People (Employees, Golfer lookup) · System (Health, Company docs). Mockups: https://claude.ai/artifact/LymjV9nP8oEqeutpdb7eb7 (option A chosen).
- **Search on top of the rail (Cam: "I do like that search bar AI feature where I can find anything"):** typing a name, email, phone or id is an instant plain search across courses, inquiries, golfers, bookings, messages and admin pages; asking a question ("which courses had no bookings this week") goes to an AI answer that reads data through read-only tools and links to what it found — it never changes anything.
- **AW-4 Today (overview):** four sections only — Needs you now (each item with its one fix button), Platform health (red/green), Money this month vs the same point last month (volume through courses, GreenReserve fees, net after Stripe and expenses), Onboarding by stage with stuck courses flagged. No daily fee tile, no unread count, no ticker.
- **AW-5 AI checks:** hourly; a morning digest email plus an immediate alert for anything urgent (payments failing, site errors, a course stuck).
- **AW-17 new areas:** Expenses gets its own page (today a drawer in Revenue); Leads (courses being chased before they inquire, feeding Inquiries); Marketing & advertising (campaigns, spend, what each brought in).

Status (2026-10-21): AW-1a shipped (camsanchez33/green-reserve#161), AW-1b passkeys shipped (#162, SimpleWebAuthn 13.3.x pinned). AW-1c built: `OwnerSession.stepUpAt`; `stepUpRequired()` (admin-session.ts) refuses an owner whose last confirmation is over 5 minutes old with 403 `code: step_up` on: adding/removing a passkey, removing a device, creating/changing an employee, refunds, retrying a charge, publishing an agreement version; `/api/cam/step-up` confirms with the passkey, an authenticator code (replay-guarded) or a recovery code; `stepUpFetch` + `StepUpDialog` ask and retry; My profile → Your devices (remove = signs it out); email on passkey add/remove. Next: AW-3/AW-4.
AW-1c also covered (AW-1b review notes): adding or removing a passkey re-confirms and emails the owner; isolation-test checks that the passkey step on a trusted device without the password step returns the start-over 400, and that a stale / fresh owner session is refused / let through a risky route. Step-up's authenticator replay guard reads the used step on either marker (`totp-used:` or carried on `totp-pending:`), and keeps a sign-in in flight pending.
AW-3a built (2026-10-21): the rail is grouped by job (Today · Courses · Money · People · System), no icons and no collapse (TYPE-3), My profile + Sign out at the foot; a visible "Search anything" box on top opens the palette, which now also finds a booking by id (or its first 8+ characters), a course group, and a conversation by a word in it, with the pages under their new names. Leads, Expenses and Marketing join the rail when built (no dead links); Activity and Manual build sit under System until AW-12/AW-13. AW-3b built: in the same search box, a question (or the "Ask" row under any search) goes to `/api/admin/ask` (support+, 30 an hour per admin, Opus 5.5 at low effort) which answers only from four read-only tools in `src/lib/admin-ask.ts` — list_courses, bookings_by_course, list_inquiries, money_problems — each re-checking the gate of the page that shows the same data; names in the answer link to their admin page (only /admin paths become links). Needs ANTHROPIC_API_KEY on the server; without it Ask says it isn't set up.
AW-4 built: /admin is "Today" (`/api/admin/today`), four sections — Needs you now (the old action queue, moved unchanged to `src/lib/admin-action-queue.ts`, all rows with their fix button, 8 shown then "Show all"; support+), Platform health (scheduled jobs from the cron log, Stripe webhook receipts, live courses that can't take payments; manager+), Money this month vs the same point last month (volume through courses and GreenReserve fees from paid rounds by paidAt, plus net after Stripe and expenses for the owner; support+), Onboarding (inquiries per stage, stuck = 7+ days in one stage and not snoozed, each named; viewer+). Refresh is an icon. The old /api/admin/stats (fee tiles, ticker, unread count, watchlist) is deleted; `src/lib/admin-today.ts` holds the money/health/onboarding rules.
AW-5 built: the hourly cron ends with `runAdminChecks` (`src/lib/admin-checks.ts`). Urgent problems are rules, not the model — a card declined at check-in (per course), an open chargeback, a failing scheduled job, Stripe events failing or silent for a week, a live course that can't take payments, an inquiry stuck 7+ days — each keyed in the new `AdminAlert` table, emailed to the admin inbox once when it starts, resolved when it clears, emailed again if it returns; a failed email retries next hour. The morning digest goes on the first run after 7am Eastern (one `digest:YYYY-MM-DD` row claims it; a failed send releases it): urgent still open, Needs you counts, money this month vs last (incl. net), onboarding with stuck counts — the same numbers as Today — under a two-sentence AI summary that is dropped if it carries any number not in the facts (monthly-review's check). Site errors aren't checked: nothing records them yet (no error tracker is wired).
AW-6 decisions (Cam 2026-10-21): Inquiries becomes a BOARD by stage; the inquiry page leads with the ONE next step; Leads join the same pipeline; four stages — Lead → Talking (inquired, call booked/done) → Setting up (sheet out, sheet in, building) → Live; each card shows the next step (a button), the next call time, and the contact's name + phone. Cam's complaints: can't tell what to do, too cluttered, detail page too long, stages wrong, "super disorganized, not efficient or easy to navigate". Built in three PRs: AW-6a the board, AW-6b the detail page, AW-6c Leads.
AW-6a built: the default Inquiries view is the board (`src/components/admin/InquiryBoard.tsx`, rules in `src/lib/inquiry-board.ts`): Talking · Setting up · Live (went live in the last 30 days); statuses underneath are unchanged. A card: course (opens it), contact · phone (tap to call), the booked call, and one next step — Book a call / Get ready for the call / Call at <time> / Log the call / Send the setup sheet / Resend the sheet (in place, manager+) / Build the course / Make their changes / Resend the preview (in place) / Finish and go live. Stuck (7+ days, not snoozed, no call booked — Today's rule) carries the amber edge. All and Closed keep the table; bulk Send sheet / Archive moved to All (in-pipeline rows only). Refresh is an icon.
AW-6b built: the inquiry page leads with ONE next-step button — the same step as its board card (`nextStep`, now keyed) — wired to the page's existing actions (book/log the call, send/resend the sheet, build behind the call gate, send/resend the preview, make changes, go live). Everything else is in ⋯ (added: Mark in review, Send the setup sheet now, Set up a call…/The call…, Go live now). The call card moved into a dialog (opened by the step, ⋯, the build gate or ?call=1). The tracker is Talking → Setting up → Live with the sub-step under the current one; the guidance line says the same as the button. The Lead tab is one card of label/value rows (contact, email, phone, course, address, website, source, submitted) and one "What they told us" card, instead of a box per field.
AW-6c built: Leads are the board's first column — a new `lead` status on CourseInquiry (a string, no migration). "Add a lead" (manager+) takes the course name (required), contact, title, phone, email, city, state, website, where it came from and a note; a course already on the board (same name, and town when given) is flagged with a link before a second is added. A lead is outside every list the public form, Cal.com, the call-invite page, the action queue and Today read, so it never matches a submission, gets an email or counts as onboarding; on a lead the route allows only notes, contact edits, source, snooze, close (never a decline email) and Move to Talking, which asks for an email when there is none (everything in Talking emails them) and makes it an ordinary in-review inquiry. Closing and restoring a lead brings it back as a lead. If a lead's course later fills in the interest form, that creates its own inquiry: close the lead as Duplicate.

## AW-4b Today, second pass (Cam 2026-10-21)

Cam on the AW-4 page: "I don't think it does anything … as the owner what do I really need to see". Decisions (asked by form):

- **Layout:** one line on top, then Needs you now, then Courses. No Money card (it lives on Revenue). No Onboarding card (Inquiries has it; the inquiry rows that need a person are in Needs you).
- **Health is one line:** "Everything's running." when green. When something is wrong the line turns red and says what (a failing job, Stripe events stopped or failing, live courses that can't take payments) with a link to Health.
- **Needs you now holds only what is NOT about one course:** the inquiry rows (new inquiries, calls to make or log, stuck onboarding). Course problems sit on their course's card, never twice.
- **Courses:** one card per live or draft course. Courses with a to-do sort first. Each card: the name (opens the course), "Staff seen …" and "$X in fees this month", then that course's to-dos, each with its one fix button (failed charges, can't take payments, draft not live, unanswered message, check-in call due, agreement overdue — the same rules as before, from `lib/admin-action-queue.ts`). Bookings detail lives on the course page, not the card.
- **Staff seen** = the last time anyone from the course (owner or staff) used the dashboard (`Course.staffLastSeenAt`, written at most every 15 minutes from `resolveDashboardSession`). It turns amber after 3 days ONLY when the course had tee times on those days — a course closed for winter stays quiet.
- **Fees this month** = GreenReserve's fees from that course since the 1st (platform month): booking fees on paid rounds plus fees charged on their own (late/no-show), minus those refunded — the same definition as the platform total (`paidWindow()`). Revenue's per-course table counts only the round fees, so a course with a no-show fee reads higher here.
- **Staff seen** falls back to the owner's last sign-in until staff next open the dashboard, so launch day isn't a wall of amber.
- **Goals tab (Cam chose it over dropping goals):** `/admin/goals`. A goal is a measure, a target and a date: live courses (counted now), online rounds booked, or GreenReserve fees (counted from the goal's start to its date). The owner adds and removes goals; support+ can see them. Each shows progress against the target and whether it is on pace for the date. Cam's first two: 1 live course by Dec 31 2026, 10 by Dec 31 2027.

## AW-7 course page (Cam 2026-10-21, decided with AW-4b; built after it)

Admin → Courses → a course leads with four tabs: **Bookings** (online vs counter/phone by week, online share) · **Money** (fees, cash rounds with no fee collected, failed charges with retry) · **Setup** (Stripe, agreement, schedule, staff, each with a dot; a ✓ on the tab when all done) · **Contact & notes** (owner, phone, messages, notes). It opens on the tab that has a problem, otherwise Bookings.

AW-7 built (course page): four tabs (`lib/admin-course-tabs.ts`), opening on the one with a problem — Money (a failed charge) before Setup (any of the four checks not done) before Contact & notes (an unread message, or a check-in call due) — else Bookings; `?tab=` and `?checkin=1` still pick one. A tab with a problem carries a dot; Setup gets a ✓ when all four checks are done. **Bookings:** players on rounds played per week for 8 weeks, online vs counter/phone (`Booking.source`), the online share, then recent bookings. **Money:** GreenReserve fees this month vs the same point last month (Today's `paidWindow`, now per course), online bookings paid in cash with their fee uncollected (this month and all time, `counterFeesUncollected`, now per course), failed charges at what the card is asked for with the same charge-only retry as Revenue, then the transactions. **Setup:** Stripe · Agreement · Schedule · Staff (owner verified or signed in), each with a dot and its one action (email a reminder, open the schedule, mark verified); going-live steps for a draft; build notes and sheet-vs-live drift; reminders; the settings; Documents (was Records); Tee sheet and schedule (was Operate), opened on demand. **Contact & notes:** messages, notes, calls and history, with the owner, the course's phone (editable), where, last seen, origin and staff (resend login) beside them; the check-in card leads when the call is due. Overview, Records and Operate are gone as tabs; nothing they did was dropped. The Courses list is unchanged.

## BRAIN — the admin's foundation (Cam 2026-10-22)

Cam: "this is the brain of a whole operation … it will only compound and get more important". Research (marketplace consoles, golf tee-sheet vendors, startup operating systems, an inventory of this admin) is written up in the doc "GreenReserve Admin: The Brain" (https://claude.ai/artifact/Q2ZRPmUsMVfVE7vW3SmtwN). Decisions (asked by form):

- **No sixth rewrite.** Keep the inquiry board/page and the course page (AW-6, AW-7); build the foundation under them: the admin is short of memory, not pages.
- **One session owns the admin from here** (the one that ran this research). The walkthrough session's admin work stops after AW-7; AW-8 onward and everything below are built by the owning session, so two sessions never build the same page.
- **Sentry now.** BRAIN-0: `src/instrumentation.ts` loads `sentry.server.config.ts` (it never ran before — Sentry 8 on Next 15 starts the server SDK only from that hook) and reports every uncaught server error through `onRequestError`. Cam creates the Sentry project and sets `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG`, `SENTRY_PROJECT` for Health's deep link) in Vercel.

Build order (each its own PR; money, audit and auth are overseer-only):

1. **BRAIN-1 Foundation.** Audit trail on EVERY admin write (actor, action, target, before/after, required reason) through one helper — refunds, retries, employee changes, course settings, archive, cancel-on-behalf, step-ups included. One course timeline (`lib/course-timeline.ts` extended) merging booking events, payment events, messages, calls, notes, staff sign-ins, settings changes, alerts and inquiry stage moves; the course page leads with it.
2. **BRAIN-2 Problems queue + money ops.** `AdminAlert` rows become a queue page with counts, an owner and history (started, who fixed it, how); payouts per course from Stripe; disputes with an evidence pack (booking time, the `describePolicy()` text accepted, the confirmation sent); a monthly match against Stripe's platform earnings report.
3. **BRAIN-3 Health over time.** A weekly saved health score per course (online share, bookings vs the same week last season, staff activity, pay link vs cash, no-shows, cancellations, disputes); each course's season open/close dates so a closed course is never "quiet"; read-only "view as course", logged with a reason and bannered.
4. **BRAIN-4 Weekly review + cleanup.** One weekly review page (fixed numbers, fixed order, definitions written once — see the doc); fold Activity into the course timeline; hide Manual build; split Revenue (P&L / problems → the queue / an expenses page).

Buy, don't build: Sentry, an uptime/status page, accounting with a bookkeeper; a shared support inbox at the first support hire; a CPA on sales tax for the $1.50.

BRAIN-1a built (#175): every admin write records who/what/before→after (lib/admin-audit.ts; AdminAuditLog gained reason, before/after, courseId, actorName); money, access and deletes refuse without a reason, asked by ReasonDialog through stepUpFetch; owner-only /admin/audit, Employees → "What they did"; failed scheduled jobs reported to Sentry.
BRAIN-1b built: every email and text is logged in `SentMessage` (kind, recipient, course/booking/inquiry, sent or failed — never the subject or body) from the one email choke point (lib/email.ts getResend, each sender passes `meta`) and lib/twilio.ts. The course page leads with a **Timeline** tab (lib/course-timeline.ts `buildCourseFeed`, /api/admin/course-feed, support+): bookings & payments (BookingEvent, PaymentEvent), messages & emails (SentMessage — by course, booking, or the course's own people — and the message thread), admin & staff changes (audit record, staff permission changes, the operator's settings edits), problems & onboarding (alerts started/cleared, stage moves, calls, notes, agreement, reminders); filter by any of the four, page back with "Show older". It opens on Timeline unless a tab has a problem. Admin → Health has "Send a test error" to prove Sentry reports from the server. Not yet: staff sign-in history (only the latest is kept).
