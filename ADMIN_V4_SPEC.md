# ADMIN_V4_SPEC — the audit campaign

Source: full admin console audit, 27 Aug 2026 — 19 pages and 42 API routes walked
live at greenreserve.app/admin signed in as owner, cross-read against source.
Cam chose the full ten-phase campaign over a cut list on 2026-08-27, with the
cost (weeks of admin work while no course is live) stated and accepted.

## READ THIS BEFORE TRUSTING A LINE NUMBER

The audit states its source read was taken at **cb9bcb7**, which is two commits
behind: `b07c6d0` (ADMIN AUTH BOUNDARY) and `1a80fce` landed after it. So:

- Every `file:line` citation below may be off by one commit. **Re-locate by
  symbol, never by line number.** If a cited line does not contain what the
  finding claims, the finding is not thereby disproved — find the symbol.
- The audit's "Owner 2FA is not bypassable — false alarm" entry is WRONG IN
  FRAMING. It was not a false alarm. It was a real hole, closed by `b07c6d0` on
  2026-08-26 (owner rejected at `/api/admin/login`, `mfa` claim asserted by
  `requireOwner`). The audit probed the live site post-deploy while reading
  pre-fix source and concluded the design had always been correct. Do not repeat
  that conclusion anywhere. Its UX point underneath it is valid and is folded
  into Phase V4-5.
- Four things the audit cleared and nobody should spend a run on: admin is NOT
  slow (112–440ms, 235KB bundle, zero long tasks); the Overview date header was
  correct (UTC vs Eastern); the Clubhouse sweep left no dark-theme debris —
  though CLAUDE.md:43-44 still calls admin and dashboard "(dark theme)", which
  is stale and is corrected in Phase V4-1.

## THE LAW — how owner and employee views stay identical

Cam's question, 2026-08-27: "if the owner changes how the overview looks it
should be the same for said employee." The answer is not coordination, it is
construction — make divergence impossible rather than remembered. Four rules;
every phase below upholds them and no phase may violate one.

1. **ONE PAGE PER SURFACE, NEVER TWO.** Role differences are gated SECTIONS
   inside a single implementation. There is no owner Overview and employee
   Overview — there is the Overview, with sections that resolve by role. A
   second parallel page for a second audience is forbidden.
2. **ROLE IS RESOLVED ONCE.** In `admin/layout.tsx`, server-side, passed down as
   a prop (Phase V4-7). Never re-fetch the session per page; never re-declare a
   role array client-side. `admin/page.tsx` currently redeclares
   SUPPORT_PLUS_ROLES / MANAGER_PLUS_ROLES as local copies instead of importing
   them from `admin-session.ts` — that duplication is the mechanism by which
   owner and employee views drift, and it is deleted, not documented.
3. **SHARED COMPONENTS OR IT DIDN'T HAPPEN.** Phase D1 shipped seven components
   under `src/components/ui/`. Verified 2026-08-27: there is exactly ONE import
   of anything in that directory across all of `src/` — StatusDot, 10 files.
   Card, Eyebrow, PageHeader, Btn, StatGroup, SidebarShell: zero. Their markup
   was hand-typed instead (`bg-white border border-line rounded-lg` 78 times,
   the eyebrow string 121 times, the input class redefined in 13 files in 6
   variants). Phase V4-6 adopts them and adds a lint guard so it cannot regress.
4. **ONE FORMATTER.** `fmtMoney` is defined six times with four different
   behaviours; the same amount renders `$1234.50` on Activity and `$1,234.50` on
   Revenue. `fmtDate` has seven definitions and three output formats. On a
   product whose business model is a $1.50 fee. `src/lib/format.ts` in V4-6.

## CHECKPOINT

After Phase V4-3, stop and reassess before continuing. Three phases in, the
security holes are closed, the shell is fixed and the indexes are down — the
highest-value work is banked and the remaining seven are increasingly about a
future scale that does not exist yet. If anything has changed (a real course
going live, a customer, a funnel-test failure), the rest of this campaign is
outranked and should yield. Cam decides; this note exists so the decision gets
made deliberately rather than by momentum.

---

## Phase V4-1 — shell fixes (small, no migration)

Findings 1, 2, plus two papercuts. Everything here is visible on every screen.

1. **The 64px dead band.** `src/components/MainOffset.tsx` — the `noNav` test is
   `isCourseWorld(pathname) || isBookingMode(pathname) ||
   pathname.startsWith('/for-courses')`. `/admin` and `/dashboard` render no Nav
   either, but were never added, so both reserve 64px for a bar that is not
   drawn. Verified 2026-08-27: `main.pt-16`, computed `padding-top: 64px`, zero
   nav elements rendered, on `/admin`, `/admin/courses/[id]` and `/dashboard`.
   It also desynchronizes the shell — the sidebar is `fixed; top:0` while content
   starts at 64px, and `sticky top-0` page headers stick 64px down leaving a
   cream band above them on scroll. Add both prefixes to `noNav`. One line.
   `src/lib/booking-mode.ts:3` already states the Nav "must return null entirely
   here, the same as it does on /admin and /dashboard" — the offset simply never
   learned the same rule. Extend the component's comment to say so.
2. **Course detail scrolls sideways and the sidebar covers the content.**
   `src/app/admin/courses/[id]/page.tsx` — measured clientWidth 912 /
   scrollWidth 1077, a 165px overflow. The floor is the sticky page header:
   five action buttons + a ten-tab strip + two inline group labels = 1021px,
   unwrappable. Minimum usable width is 1077px collapsed / 1245px with the
   sidebar open, so any 13" laptop, split screen or open devtools gets a broken
   page — and scrolling right to reach the cut-off controls leaves the FIXED
   sidebar sitting on top of the content. Fix: give the tab strip its own
   `overflow-x:auto` container so it scrolls independently instead of pushing
   the document; collapse Feature / Take offline / View page / Refresh into the
   existing ⋮ menu below ~1200px; drop the inline business/operations labels
   (the gap already communicates the grouping). Do NOT solve this by widening
   `max-w-6xl` — that moves the cliff, it does not remove it.
3. Two table wrappers use `overflow-hidden`, which CLIPS instead of scrolling —
   change to `overflow-x-auto`. Find them by searching admin table containers;
   the audit counts two of three.
4. CLAUDE.md:43-44 still describes admin and dashboard as "(dark theme)". Both
   have been light Clubhouse since D1/D2. Correct it — a stale fact in CLAUDE.md
   misleads every future agent that reads top-down, which is the exact failure
   mode the .claude/ agent system was built to prevent.

VALIDATE: tsc + babel parse-check. Then measure in a real browser at 1024px,
1280px and 1440px: `document.documentElement.scrollWidth` must equal
`clientWidth` on `/admin`, `/admin/courses/[id]`, `/admin/revenue` and
`/dashboard`, and computed `padding-top` on `main` must be 0px on admin and
dashboard. Screenshot the sticky header at 1024px to confirm no cream band.

## Phase V4-2 — close the token leaks (small, no migration)

Findings 3, 4, 5. These are live credential leaks, not theory. Verified in source
2026-08-27, both confirmed exactly as reported.

1. **`/api/admin/verify-operator` GET hands out live verification tokens.** The
   handler is gated on `if (!await resolveAdminSession())` and NOTHING ELSE — no
   `requireRole` — while its own POST is `MANAGER_PLUS`. The select explicitly
   pulls `verificationToken`, then the response maps each operator to
   `{...op, setupLink: base + '/dashboard/verify?token=' + op.verificationToken}`.
   That token is the ONLY credential `/api/auth/verify` needs to flip an account
   to `emailVerified: true`, which is a go-live precondition. So the role
   designed to be read-only can mark arbitrary operator accounts verified.
   Fix: gate the GET to MANAGER_PLUS; drop `verificationToken` AND `setupLink`
   from the list payload entirely — return `emailVerified` only. Mint a fresh
   link from the MANAGER_PLUS POST when one is actually needed. Invalidate the
   token in `/api/auth/verify` after successful use (it is currently long-lived
   and never rotated).
2. **`/api/admin/inquiries` GET hands out `detailsToken`.** Same session-only
   gate, and the list branch is `findMany({ orderBy, include: { events } })` —
   whole rows, 34 keys, including `detailsToken`, `email`, `phone`, `address`,
   `adminNotes`, `detailsJson`. `/api/inquiries/details` authenticates on that
   token alone with no session, so a viewer reads tokens from an endpoint they
   may call and then rewrites onboarding sheets and uploads files with them —
   read-only escalating to write on the pipeline. Fix: replace `include` with an
   explicit `select` of the columns the list actually renders, omitting
   `detailsToken`. It is already returned properly from the MANAGER_PLUS
   `request_details` action, which is the only place it is needed. The client
   type at `inquiries/page.tsx` already marks it optional, so the UI should not
   break — verify that rather than assuming it.
3. **The strong-password rule is bypassable.** `/api/admin/set-password` runs
   `validatePasswordStrength` (10 chars, upper, lower, number).
   `/api/admin/change-password` — the self-service path used by BOTH
   `/admin/profile` and `/admin/employees` — checks only
   `String(newPassword).length < 8`. Anyone who just cleared the strong gate can
   immediately weaken their password and keep it, and both UIs advertise "Min 8
   characters", i.e. the console publishes the weaker of its own two rules.
   Fix: import and call `validatePasswordStrength` in change-password; update
   both placeholder strings to state the real rule (reuse
   `PASSWORD_REQUIREMENTS_HINT` from `@/lib/password`, which already exists and
   is already used on the set-password page).
4. While in these routes: audit EVERY admin GET for a `include:`/no-select that
   returns a token, hash, or secret column. `course-detail` was fixed for this
   in the earlier security run; these two prove the class was not swept. Report
   what you find even if you do not fix it in this run.

VALIDATE: tsc + babel parse-check. Then, against a dev server, `curl` each
changed endpoint with (a) no session → 401, (b) a viewer session → 403 on
verify-operator, (c) a manager session → 200 with NO `verificationToken`,
`setupLink` or `detailsToken` anywhere in the JSON. Assert on the absence of the
key names, not on eyeballing the payload. Add those assertions to
`scripts/isolation-test.ts`.

## Phase V4-3 — the index migration (SCHEMA CHANGE, ATTENDED)

Finding 9. The audit calls this the single highest-value hour in it, and that is
correct: it silently multiplies the cost of findings 10 through 13, and it is
pure additive DDL with no application change.

Postgres does not auto-index foreign keys and Prisma does not add them.
`Booking` carries ONE unique on `checkInToken` and nothing else, so every admin
query touching bookings is a sequential scan — across stats, revenue,
transactions, activity, golfers and the orphan sweep. Verified against
`prisma/migrations/**`: the only indexes that exist anywhere are
`Course_operatorId`, `CourseProduct_courseId`, `Nine_courseId`,
`TeeTime_courseId_date`, `TeeTimeAlert_courseId_date`, `Expense_startedAt`.

Add: `Booking @@index([courseId, createdAt])`, `([status, createdAt])`,
`([teeTimeId])`, `([golferAccountId])`, `([cancelledAt])`, `([checkedInAt])`;
plus `Message.threadId`, `InquiryStatusEvent.inquiryId`,
`CourseInquiry.builtCourseId`, `TeeTime.date` — all unindexed, all in hot admin
paths.

MIGRATION DISCIPLINE — follow the CLAUDE.md checklist exactly, attended:
`migrate dev --create-only`, then READ the generated SQL and confirm it is
purely `CREATE INDEX` with zero `ALTER` touching an existing column, then
`migrate deploy`. Never `db push`, never `reset`. Index creation locks writes
briefly; on a live table prefer `CREATE INDEX CONCURRENTLY` — if Prisma will not
emit that, say so at the restate step rather than silently taking the lock. At
current data volume the lock is microseconds, so this is a habit being formed,
not a present risk.

VALIDATE: `prisma migrate status` clean against the target DB; `EXPLAIN` one
representative query per new index and confirm an Index Scan replaced a Seq
Scan. Record the before/after in the queue entry.

**STOP HERE AND REASSESS — see CHECKPOINT above.**

## Phase V4-4 — server-side pagination (medium, no migration)

Findings 10, 11. NOTE HONESTLY: nothing here is slow today — the audit measured
112–440ms across every endpoint. This is insurance against a scale that does not
exist yet, and it was specced because Cam chose the full campaign with that
stated. Run it after V4-3 or not at all; do not run it before the index
migration, which is what makes the paged queries cheap.

1. **Inquiries** returns every inquiry with its entire event history and no
   `take` — 28KB for 3 records, ~9KB each, so 1,000 inquiries is a 9MB payload
   on every page load. The client does all filtering, sorting and paging in the
   browser. Push `take`/`skip`, search and the status filter into the query; use
   `count()` for the total. The UI already renders pagination — it just needs to
   trust a server-supplied total instead of `data.length`.
2. **Activity** runs four unbounded `findMany`s, concatenates them in lambda
   memory and calls `.slice()`, with a caller-controlled date range and no
   server-side cap. Cap the range server-side (90 days hard maximum, reject
   wider with a clear 400 rather than silently clamping).
3. **Transactions** defaults to no date filter at all, so opening the tab pulls a
   course's entire booking history to display fifty rows. Default to 90 days.
4. **The orphan sweep runs on Courses page mount.** `/admin/courses` fires
   `GET /api/admin/orphan-sweep` on mount, which dry-runs `sweepOrphanCourses` —
   a serial loop doing `booking.count` and `courseMembership.count` PER ORPHAN.
   Batch those into two `groupBy` calls keyed by orphan id, and stop running it
   on mount — make it an owner-triggered check with a button. The same page also
   runs `booking.groupBy({ by: ['courseId'], _max: { createdAt } })` with NO
   `where` — a full aggregate over every booking ever, to compute "last booking
   at". Bound it to 90 days, or denormalize `Course.lastBookingAt` at booking
   time (the denormalization is a schema change — if you prefer it, it does NOT
   happen in this run; it becomes its own attended item).

VALIDATE: seed a dev DB with ~1,000 inquiries and ~5,000 bookings and measure
each endpoint before and after; record both numbers in the queue entry. A
performance fix with no before/after measurement is a guess.

## Phase V4-5 — truth in status (medium, no migration)

Findings 6, 7, the Revenue percentage bugs, and the vocabulary drift. This phase
is about the console telling you the truth about your own business.

1. **"Healthy" is what zero bookings looks like.** A course reports Healthy —
   "Live, taking payments, booking volume steady or growing" — while the same
   card says Last activity: Never and the stat row beneath reads 0 bookings /
   $0.00 / 0 all-time. The verdict defaults green when there is no data to
   judge, and the Courses LIST shows that green pill with none of the underlying
   numbers, so the list cannot do the one job it exists for. Add a fourth state
   — **Dormant**, neutral dot — for live courses with no bookings and no
   operator login. "No data" is not "healthy" and that distinction is the entire
   value of the signal. Then surface last-booking and 30d trend on the list row
   so the pill has visible evidence behind it.
2. **Messages does not show what the Overview knows.** The Overview action queue
   correctly flags "Message from Green Reserve, unanswered · 38d". Open
   `/admin/messages` and the threads are visually identical — no unread dot, no
   age, no needs-reply state, no sort by staleness. Two systems disagreeing
   about what needs attention trains you to trust neither, and Messages is where
   you would actually go to act. Carry the SAME unanswered/stalled computation
   into the thread list (import it, do not reimplement it — see LAW rule 2):
   warn dot, "38d unanswered", default sort by staleness. Relative time under 7
   days, calendar date beyond.
3. **Percentage deltas that are not information.** "-152% vs prior" on a Net
   that crossed from profit to loss is arithmetically consistent and
   communicatively useless. When net crosses zero, render "swung from +$35.83 to
   −$17.20". When the prior base rounds to zero, render "— no prior" and never a
   percentage — the same card currently shows "-100% vs prior" on the headline
   and "— no prior" two lines below it, one comparison in two conventions.
   Suppress percentage deltas whose prior base is below a small absolute floor;
   "+1940%" on $18.36 of expenses (prior ≈ $0.90) is noise. Cam saw all three of
   these live on 2026-08-27 and they are the first thing on the page.
4. **All four Revenue column headers show a sort arrow simultaneously**, so the
   active sort is unreadable. Dim the inactive ones.
5. **One vocabulary, everywhere.** Courses says "2 courses" (Live filter),
   Revenue says "3 courses · archived hidden", Inquiries says "1 active · 1 needs
   you · 2 live all-time · 1 closed" with tabs reading "All 3". Four screens,
   four definitions of the same set. Settle on **Live / Offline / Archived** and
   use it in the UI AND the API response keys. Archived is currently handled
   three ways — a tab on Courses, a checkbox on Revenue, an inline "(archived)"
   suffix in the Activity filter — pick one control shape and repeat it.
6. Papercuts in the same sweep: the Courses page is titled "All Courses" while
   the Live filter is active (title tracks the filter, or the filter stops
   defaulting to a subset); Money-in-Motion is forward-looking and ignores the
   period picker while sitting under an August MTD header, so it must say so on
   screen; Activity's empty state is a dead end ("No events found" for a 30-day
   default when every real event is in July) and should offer to widen the
   range; the sidebar says "Manual build" while the page says "Add New Course";
   six identical $10.00 late-cancellation rows carry no booking reference or
   time, so a duplicate is indistinguishable from a legitimate repeat.
7. **The intake typo that survives to production.** An inquiry says "Mahwah, AL";
   the course built from it says "MAHWAH, NJ". Nothing reconciles an inquiry
   against the course created from it. Add a diff on the build step that flags
   field-level disagreement for review rather than silently preferring one.

VALIDATE: tsc + parse-check, then walk each changed surface live and confirm the
counts on Courses, Revenue, Inquiries and Activity reconcile to the same numbers
using the same words.

## Phase V4-6 — adopt the design system (BIG, no migration)

Findings 15, 16, 18. This is LAW rules 3 and 4 made real, and it is the phase
that stops the next audit from finding the same class of defect again. A0 and A6
were both lists of individual defects and both were fixed; this is the condition
that manufactured them.

1. **Codemod to the shared components.** Migrate to `Card`, `Eyebrow`,
   `PageHeader`, `Btn` — the four that cover most of the duplication. Verified
   2026-08-27: `grep -rhoE "from '@/components/ui/[A-Za-z]+'" src --include=*.tsx`
   returns exactly one distinct import, StatusDot × 10. Everything else was
   hand-typed. Do this mechanically, file by file, committing per page — NOT as
   one giant commit, because a codemod that breaks something must be bisectable.
   If a component does not fit a site, CHANGE THE COMPONENT and re-run, do not
   fork the markup inline. Drift already visible: five different stat-number
   sizes, three unrelated tab designs, two overlay colours, buttons at py-1.5 /
   py-2 / py-2.5.
2. **Add the guard.** ESLint `no-restricted-syntax` banning the raw duplicated
   strings (`bg-white border border-line rounded-lg`, the eyebrow class string,
   the input class literal) inside `src/app/admin`. Without the rule this
   regresses within two phases. This converts "audit every page when the design
   changes" into "edit one file", which is the entire point.
3. **`src/lib/format.ts`** — `formatMoney` / `formatDate` / `formatDateTime` /
   `formatRelative`. Delete the six `fmtMoney` copies (four genuinely different
   behaviours: one `toFixed(2)` with no thousands separator, one comma regex,
   one `toLocaleString` with sign handling), the seven `fmtDate` definitions
   (three output formats), and the eight inline `toLocaleDateString` calls that
   bypass all of them. There is no formatting module in 43 files under
   `src/lib`, on a product whose business model is a $1.50 fee.
4. **Promote the Modal.** `ModalShell` / `ModalActions` already exist, private,
   inside `inquiries/[id]/page.tsx`. Move them to `components/ui/Modal.tsx` with
   real dialog semantics — `role="dialog"`, `aria-modal`, focus trap, focus
   return, Escape handler — and migrate all seven modal sites plus the drawer.
   One component closes about ten separate accessibility defects.
5. **Baseline accessibility, since 4 opens the door.** Across all of
   `src/app/admin` and `src/components/admin`: zero `aria-label`, zero
   `role="dialog"`, 77 `<label>` elements with no `htmlFor` and none wrapping
   their input (so no admin form field has an accessible name), `focus-visible`
   zero times against `outline-none` 36 times. Add `htmlFor` throughout and one
   global `focus-visible` style. Sidebar nav items are `<button
   onClick={router.push}>` — make them `<Link>` so middle-click, cmd-click and
   open-in-new-tab work. The collapsed rail's sign-out control renders the bare
   glyph `↪` as its only content; give it a label.
6. Also kill, per CLAUDE.md's own BANNED list: 133 `/N`-opacity colour washes and
   the surviving tinted pill badges.

VALIDATE: tsc + parse-check after EVERY file, not at the end. Screenshot each
migrated page before and after and diff them — a codemod that changes appearance
has failed. Keyboard-only walk of one modal: open, tab through, Escape, confirm
focus returns to the trigger.

## Phase V4-7 — auth guard into the layout (medium, no migration)

Findings 14, 17. This is LAW rule 2 made real, and it is the phase Cam's
owner-vs-employee question actually depends on.

1. **Resolve the session once.** `admin/layout.tsx` is currently five lines that
   set `robots` and nothing else. Make it a server component that resolves the
   admin session and passes `role` down. Twelve pages each currently fetch
   `/api/admin/session`, await it, THEN fetch their data — two full round trips
   before the first query, plus a blank flash on every page load. The Golfers
   page re-fetches the session before every search. The data routes already
   authenticate themselves, so the check buys nothing.
2. **Delete the local role arrays.** `admin/page.tsx` re-declares
   `SUPPORT_PLUS_ROLES` and `MANAGER_PLUS_ROLES` instead of importing them from
   `admin-session.ts`. Import them. Grep for any other client-side copy and kill
   those too. This duplication is the mechanism by which owner and employee
   views drift — see LAW rule 2.
3. **The redirect bug dies with it.** Six pages end their session check with
   `.catch(() => router.push('/admin/login'))`, so any transient fetch failure
   ejects you mid-task. CLAUDE.md already forbids exactly this: "Never silently
   redirect away on a fetch failure." Folding the check into the layout removes
   all six call sites.
4. **`useResource`.** Roughly a dozen loaders are `if (r.ok) setData(...)` with
   no `else`, so a 403 or 500 renders as "no inquiries" / "no events" / "no
   members". The Overview has no error branch at all — a failed stats call
   produces a title and nothing beneath it. There are 14 swallowed
   `.catch(() => {})` blocks and 10 surviving `alert()` calls. The CORRECT
   pattern already exists in this codebase at `courses/[id]/page.tsx` (the
   `docsError` state) — extract it into a small `useResource` hook with error
   state, 401 handling and abort-on-unmount, and use it for the ~100 hand-rolled
   fetches in admin. Replace every `alert()` with an inline error surface.

VALIDATE: tsc + parse-check. Then, in a browser, throttle to offline mid-session
and confirm you are NOT redirected to login — you see an error with a retry.
Force a 403 on one loader and confirm the page says so instead of rendering an
empty state.

## Phase V4-8 — CRON HEARTBEAT (SCHEMA CHANGE, ATTENDED)

The audit's "gap I'd worry about most", and it is right. The System page is five
cards, four of which say some version of *we don't track this — go look at
GitHub / Vercel / Stripe / Sentry*. That is honest, and it was the correct call
when A-01 shipped it. It is now the most expensive honest placeholder in the
app, because **the crons are what charge cards** — late-cancellation fees and
no-show fees both fire from scheduled jobs. If one silently stops, the platform
quietly stops collecting money and the first signal is Cam noticing revenue
looks low. The Stripe webhook card is explicit that its timestamp is
"approximate — we don't log raw webhook receipts, this is the course record's
own updatedAt": a proxy for a proxy.

Build `CronRunLog` (already flagged in the System page copy as a candidate for
the next migration batch — it should jump the queue): each cron writes a row on
completion with job name, started/finished, outcome, and a short result summary.
The System page turns green/amber/red on last-successful-run age per job. The
same table gives real webhook receipts instead of the updatedAt proxy.

Additive table only — create-only, review the SQL, deploy, attended, per the
CLAUDE.md checklist. Alerting (email on a red job) is NOT in this run; a page
that tells the truth when you look at it is the deliverable. Note in the queue
entry that alerting is the obvious follow-up.

## Phase V4-9 — split courses/[id] (BIG, no migration) — RUN AFTER V4-6

Finding 20. `courses/[id]/page.tsx` is 1,900 lines, 52 `useState`, 29 inline
fetches, a 1,380-line JSX return holding nine tab panels, zero extracted
components. Every gotcha listed in CLAUDE.md — JSX ternary breakage, cascading
missing `</div>`, write truncation — is a symptom of files this size. It is too
large to edit safely, which makes every change to it a coin flip.

Each tab panel is already cleanly bounded by a `{tab === 'x' && …}` guard, so the
split is near-mechanical: nine files under `courses/[id]/tabs/`, each owning its
own state and loader, plus a `useCourseDetail` hook for what genuinely is shared.
Parent drops to roughly 300 lines and about 40 of the 52 `useState`s move with
their panels. `inquiries/[id]/page.tsx` (1,821 lines) is healthier — it already
has eight local sub-components that just need promoting out of the file; do that
in the same run.

MUST run after V4-6 so the extracted tabs are built on the shared components
rather than inheriting nine copies of hand-typed markup. Commit per tab.

VALIDATE: tsc + parse-check per file. Walk all nine tabs live and confirm each
still loads, saves, and shows its error states — this is a refactor, so ANY
behaviour change is a bug.

## Phase V4-10 — broadcast safety (small, no migration)

Finding 8. Live in the broadcast history, both marked Email sent, both Jul 7
2026: "Maintnence this weekend" (misspelled subject) with the body "From 5-9
fuck you", and "Maintenance this week q" with a stray character. Both went to
every operator with an active course.

CONFIRMED BY CAM 2026-08-27: every recipient was a test account — nothing has
gone to a real company. So this is not incident response; it is preventing the
same thing when the recipients are real. Delete those two history rows as part
of this run.

A0 added preview-and-confirm, which addresses the wrong-recipient mistake. It
does not address the mistake that actually happened. Add:
1. **"Send test to me"** beside the confirm button — costs almost nothing and
   catches this entire class.
2. **A 15-minute soft hold** before the email fan-out fires, so a mistake is
   recoverable, with a Cancel control on the history row during the hold.
3. **Correction notes** — a sent broadcast can carry a follow-up annotation, so
   the history records what actually happened rather than only what was sent.
   The only feedback metric today is "dismissed".

VALIDATE: send a test to yourself; queue a broadcast and cancel it inside the
hold window; confirm the fan-out did not fire.
