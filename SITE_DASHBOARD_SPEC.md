# SITE + DASHBOARD SPEC — the two products customers actually touch

Source: full deep dive, Aug 2026 — public homepage + for-courses funnel + legal +
SEO (975 lines) and the operator dashboard (16 pages, 3,978 lines), full source
reads plus a live walkthrough. Companion to ADMIN_MASTER_PLAN.md.

The admin is Cam's cockpit — this is everyone else's GreenReserve: the marketing
site that must turn a cold-emailed GM into a lead, and the dashboard that same GM
lives in at the pro-shop counter.

## PRIORITY NOTE — this outranks the admin campaign

ADMIN_MASTER_PLAN (MP-0…MP-12) is 13 runs on the console ONLY CAM USES. This
document covers the two surfaces a customer touches, and SD-1 contains a live
unauthenticated data leak. Ordering changed 2026-08-27: **SD-1 runs before MP-1.**
The rest interleaves — see §RUN ORDER at the bottom. This is not a re-litigation
of the admin scope; it is new information that changes what is most urgent.

## VERIFIED BY COWORK BEFORE QUEUEING, 2026-08-27

Three ship-blockers checked in source. All three real. #1 is worse than reported:

1. **`GET /api/inquiries` is completely unauthenticated.** Verbatim:
   ```
   export async function GET() {
     // Admin only — check admin secret
     const inquiries = await prisma.courseInquiry.findMany({ orderBy: { createdAt: 'desc' } });
     return NextResponse.json(inquiries);
   }
   ```
   A comment describing a guard, and nothing under it. AND — the audit called
   this a PII leak; it is more than that. `findMany` has NO `select`, so it
   returns EVERY column, and `CourseInquiry.detailsToken` is one of them
   (`prisma/schema.prisma:460`). Per the admin audit, `/api/inquiries/details`
   authenticates on that token ALONE with no session. So an anonymous request to
   a public URL yields every lead's name, email, phone, address, adminNotes and
   detailsJson **plus a working write credential for each one** — the reader can
   then rewrite onboarding sheets and upload files. This is an unauthenticated
   read AND write path into the entire pipeline, live on the internet.
   FIX (do not wait for a full run): add the same admin-session guard the other
   admin routes use, and replace `findMany` with an explicit `select`. Two lines.
2. **The dashboard has no mobile breakpoint.** `src/components/OperatorSidebar.tsx:104`
   is `<aside className="w-56 shrink-0 bg-white border-r border-line flex flex-col h-full overflow-y-auto">`
   — verified: `w-56` (224px) fixed, and the file contains ZERO `sm:`/`md:`/`lg:`
   prefixes anywhere. Every page wraps it in `flex h-screen overflow-hidden`. On
   a 390px phone that leaves ~150px for the tee sheet.
3. **UTC "today" in the dashboard.** `src/app/dashboard/page.tsx:39` —
   `const today = () => new Date().toISOString().split('T')[0];`. Confirmed.
   Operational, not cosmetic: at 5pm Pacific the sheet flips to tomorrow and the
   date strip clamps backward navigation to zero, so today's sheet becomes
   unreachable while golfers are still on the course.

`giftCardUrl` appears in the settings PATCH key whitelist with no validation
alongside it — consistent with finding #8; the run should confirm the render site
on the golfer-facing course page before fixing.

## §1 — TWO MARKETING PROMISES THE PRODUCT CANNOT KEEP

Pre-launch honesty is a conversion asset; a skeptical GM smells overclaiming.

1. **"Your dashboard lets you manually add bookings for walk-ins or phone
   reservations anytime"** — live homepage FAQ. FALSE. `/api/operator/bookings`
   has GET and PATCH only; there is no endpoint that puts a golfer's name on a
   tee time. "Add Time" creates an empty slot, not a booking. For a municipal
   course walk-ins and phone calls are the MAJORITY of business, so the first
   thing a real operator tries — on the strength of this exact sentence — is the
   one thing the product cannot do. This is the biggest functional gap in the
   dashboard, and the site actively promises it. Build the walk-in POST (SD-5)
   before the sentence is true; until then the sentence changes.
2. **"a public course listing page"** (What You Get) vs **"Your booking page is
   unlisted until you share the link"** (FAQ) — same page, four sections apart,
   and the TRUE one is the reassuring one: there is no golfer-facing directory
   (`/api/courses` has the listing logic and zero callers; `/courses` redirects
   home). Delete the listing clause — it also undercuts the private-club pitch.
   Smaller contradictions in the same pass: the homepage says the details sheet
   takes "about 5 minutes" while the sheet and its confirmation email say
   "10–15" and it is realistically 50–90 fields (align on 10–15); and "No
   contract — leave anytime" conflicts with Operator Agreement §5, which requires
   30 days' written notice (pick one, make the other match).

## §2 — FIX-NOW, 14 RANKED

| # | Where | Bug | Severity |
|---|---|---|---|
| 1 | public | `GET /api/inquiries` leaks every lead's PII **and detailsToken**, unauthenticated | SHIP-BLOCK |
| 2 | dashboard | Sidebar has no mobile breakpoint — unusable on the one device it is for | SHIP-BLOCK |
| 3 | dashboard | UTC "today" — afternoon rollover makes today's sheet unreachable | SHIP-BLOCK |
| 4 | dashboard | Analytics revenue selects `confirmed` only → every paid round vanishes at check-in, unpaid future bookings count in; utilization has no date bound or status filter so it includes the future 8 generated days and blocked slots | Money truth |
| 5 | dashboard | Check-in reports "fee refunded" when the refund FAILED — the return value says a refund was attempted, not that Stripe accepted it. The operator is made to lie to someone standing in front of them | Money truth |
| 6 | dashboard | Declined card at the counter is a dead end: native alert, booking stays `confirmed`, row looks unchanged, failure reason written to DB but shown only on the admin side. No "retry with a new card" (the modal exists, it is never offered), no "mark paid in person" | Counter UX |
| 7 | settings | "Staff (tee sheet access)" is a fiction — the role is enforced NOWHERE. A staff login can PATCH every course setting, add/delete staff, change the late-cancellation fee, and flip the course inactive via raw API — and staff bypass 2FA entirely, so it is a 2FA-free path to a near-fully-privileged session | Security |
| 8 | settings | `giftCardUrl` not validated as http(s) and rendered as a raw href on the golfer-facing course page — a `javascript:` URL saved here executes in golfers' browsers, reachable via the unprivileged staff login above | Security |
| 9 | public | Homepage FAQ promises walk-in booking the dashboard cannot do | Marketing lie |
| 10 | public | listing-page vs unlisted contradiction; "5 min" vs "10–15"; "no contract" vs 30-day notice | Marketing lie |
| 11 | public | Honeypot present but wired to nothing (payload hardcodes it empty) + no rate limit on lead intake | Spam |
| 12 | public | `robots.txt` advertises a sitemap that 404s and no `sitemap.ts` exists; zero OG/Twitter/JSON-LD; the token-gated details sheet is indexable; legal pages render a literal `{{COMPANY_LEGAL_NAME}}` | SEO/legal |
| 13 | settings | `save()` never checks `res.ok` so "Saved" can be a lie; focus-refetch replaces in-progress edits wholesale; zero server-side validation (a negative or $10,000 cancellation fee saves and becomes a real card charge) | Data loss |
| 14 | auth | Orphaned public `register` endpoint (no callers, no rate limit, creates operator + Course + session with no 2FA); password change does not revoke other sessions; 2FA has no backup codes and goes to the same inbox as the password reset; staff have no 2FA, no recovery, and no owner-facing reset | Security |

## §3 — WHAT WEEK ONE WILL DEMAND (gaps, not bugs)

- **Walk-in / phone booking entry** — the single biggest functional gap, already
  promised on the site. A muni runs on walk-ins; without it the sheet is wrong
  all day and double-booking is guaranteed.
- **Partial-party check-in** — 2 of 4 show; today the operator overcharges or
  eats it. Editable player count before the charge.
- **Mark no-show / mark paid-in-person** — two one-tap resolutions that let a
  booking's lifecycle end honestly. No-show does not exist as a state today, yet
  the Cancellations tab claims "no-shows are charged automatically."
- **Close-a-day / weather flow** — block remaining slots, list affected bookings,
  bulk-cancel with no fee, notify golfers. Frost delays and aeration weeks are
  the most common real GM action. NOTE: the existing blackout endpoint
  `deleteMany`s tee times for a date before blocking it — on any day with
  bookings it either 500s or, with a cascade, destroys paid bookings.
- **Printable tee sheet** — an hour of print CSS; pros ask for it week one.
- **Cancellation notification to the operator** — a foursome freeing up Saturday
  9am is the event that most needs to reach a pro, and it is currently silent
  (only the golfer and the waitlist are emailed).
- **The demo course** — the highest-leverage marketing asset available at zero
  courses. `DEMO_COURSE_SLUGS` is empty, so the homepage's "Live demo" section
  says "Demo course coming soon" — the weakest section where the strongest one
  belongs.
- **A founder note on the homepage** — a solo founder is a liability only when
  hidden. A name, face and phone number converts a wary 55-year-old GM far better
  than anonymous "our team" copy.

## §4 — PAGE VERDICTS, ABBREVIATED

**Homepage** — RESHAPE, mostly asset + honesty fixes. PROTECT what is right: no
fake "500 courses trust us" counts, fee disclosed in the hero, the founding-cohort
section turning zero social proof into honest scarcity, a clear public/private
split that pre-selects the funnel. BROKEN: the three "What you get" screenshots
do not exist (`/public/screenshots/` is empty, so a skeptical GM sees three grey
placeholders — worse than no images); the Live-demo section promises a real course
and delivers "coming soon"; the two most persuasive sentences — the hero fee line
and the "4-player round = $6" worked example — render at `text-white/20`–`/35`
over a photo and are effectively invisible; the hero image is hotlinked from
Unsplash (licensing, reliability, and a render-blocking 2MB third-party
dependency). PROPOSED ORDER: Hero → Founding courses (moved UP, it is the
differentiator) → How it works → Live demo (only once seeded) → Feature rows
(only with real shots) → Public/private split → Comparison → Pricing → FAQ (+
"who's behind this" + "what happens to my data if you shut down") → Final CTA,
plus a founder note.

**/for-courses → details sheet** — RESHAPE, split the sheet. The lead form is
genuinely good on a phone (chip radios, blur validation, scroll-to-error, a
private-club reassurance card). The sheet is 50–90 fields and 15–25 minutes; the
tee-sets step alone sends a GM hunting for a scorecard. SPLIT: a required core
(schedule, green fees, cancellation — the server's only hard requirements) that
FINISHES the lead, and a "polish" pass (tee sets, facilities, photos) to finish
later or delegate, where "upload a scorecard photo" replaces the tee-sets grid
for most courses. Add a "prefer to do this on a call?" escape hatch at the top.
Neither submit path has a try/catch, so a dropped connection leaves "Submitting…"
stuck forever; the sheet does not restore step position; and the optional
qualifier radios SILENTLY gate whole sections (skip "memberships or season
passes?" on the lead form and a muni with resident cards is never asked about
them) — default the sections in, or make the qualifiers required.

**Dashboard tee sheet** — RESHAPE, this is the product. Good bones: date strip,
"Next up" ring, open/filling/full colour coding, inline check-in with the
late-fee-refund message, walk-up card entry, golfer search. It multiplexes three
concerns — daily sheet, get-live onboarding chrome, analytics behind a query
param — and the onboarding banner/checklist/agreement modal should vanish once a
course is live. Destructive slot buttons fail silently (Del/Block do not check
`res.ok`; deleting a booked slot 500s and the row just stays). The tee-sheet
"Revenue" stat shows rack-rate list price while Payments shows actual collected
cents — two different numbers on pages that deep-link to each other.

**Payments + Cancellations** — MERGE into one "Money" page. They query the same
endpoint; the route comment literally says "one endpoint, filtered by query
param." Payments already has a Cancelled filter; Cancellations re-renders the
same rows as cards and bolts on the cancellation-policy editor, which is a
settings concern. One ledger with tabs (All / Paid / Upcoming / Cancelled /
Failed), policy editor to Settings, and KEEP Payments' fee vocabulary ("charged
to golfers on top — not deducted from you") as the header — it is the best
writing in the dashboard. Add the literal "$1.50/player" figure so an operator can
answer a golfer at the counter, and move the Stripe payout balance + dashboard
link here from Settings, which is not where someone wondering "where's my money"
looks.

**Schedules / Members / Messages** — KEEP. Schedules is the best-explained page
in the app (a real edit path unlike the admin copy, a "how this works" recipe
card, an explicit Apply to Tee Sheet button); two soft spots — editing a
schedule's price does not regenerate tee times (only creating one does), so an
edited weekend rate silently does not apply until Apply is re-hit or the nightly
cron runs, and the overlap check is client-side only. Members is polished, arguably
over-polished for pre-launch — fine as-is, do not invest more until a course asks,
though it sits at the same nav weight as the daily tee sheet for a monthly task.
Messages is right-sized; its "Cmd+Enter to send" hint is a desktop-ism on a page
the persona uses from a phone. Tournaments/Outings are honest stubs — make the
sidebar rows link to them (today they are URL-only), and delete the empty
`dashboard/tee-times/` directory.

**Settings** — RESHAPE. Nine jobs behind one horizontally-scrolling tab strip
with THREE different save models under one "Save Changes" button (whole-form
PATCH, instant-save photos, per-section staff/2FA). Split into My Course ·
Policies · Payments · Team · Account, each with its own save. Beyond fix-now #7,
#8 and #13: changing the cancellation WINDOW moves the goalposts on existing
bookings (the fee amount is snapshotted per booking — good — but the window is
read live, so raising 24h→48h on Tuesday puts Monday's golfers, who were emailed
"free until 24h before", inside the fee window with no notice; needs a
`cancellationHoursAtBooking` snapshot). And some fields should not be
self-service under a concierge brand: course `active`, `name` and `address` are
free-text editable, so renaming or re-addressing a course changes golfer-facing
info with zero review — make them read-only rows with a "Request a change"
affordance (the change-request lib already exists).

**Onboarding + auth** — KEEP, fix the recovery dead-ends. Forgot/reset is
textbook (non-enumerating, 1-hour expiry stated, distinct expired-link screen)
and Verify handles all four states. But onboarding step 1 never persists — the
endpoint that would bump `onboardingStep` exists and is called by nobody, so a GM
who gets pulled away re-lands on step 1 and each re-submit logs a DUPLICATE
agreement acceptance. Stripe connect has a multi-course bug: settings resolve the
active course via a session cookie but connect/dashboard-link use `findFirst`
with no ordering, so a two-course operator clicking Connect on course B can
attach the Stripe account to course A.

**Corrections the deep dive verified live, do not chase these:** the public site
has NO horizontal-overflow problem at mobile widths (the `pt-16`/overflow issues
are admin- and dashboard-only); `/courses` redirects home cleanly rather than
404ing; the honeypot IS present in the markup, it is just never sent.

## §5 — RUN ORDER

**SD-1 runs before MP-1.** After that the two campaigns interleave: ship-blockers
and money truth on the customer-facing side outrank console polish, but MP-3 (the
big admin migration) and SD-3/SD-5 (the two dashboard migrations) should be
sequenced deliberately so three schema runs do not collide.

- **SD-1 · Plug the leaks.** Auth the inquiries GET (+ explicit `select`, no
  `detailsToken`), wire the honeypot + rate-limit the intake, DELETE the orphaned
  public register endpoint, validate the settings PATCH server-side (ranges +
  https-only `giftCardUrl`), enforce the staff role. All security, all small.
  *medium · no migration · FIRST, ahead of MP-1*
- **SD-2 · The mobile shell.** Bottom nav below `md`, drop `h-screen
  overflow-hidden` from the ten page shells, responsive stat grids, touch-visible
  controls with real error toasts. One component plus ten one-line edits. The
  change that decides whether the product works at a real course.
  *medium · no migration*
- **SD-3 · Course-local time.** `Course.timezone` migration; every "today" in the
  dashboard and the crons derives from it (the crons already have a timezone to
  copy); backward date navigation unclamped. *attended · migration*
- **SD-4 · Money truth.** Analytics counts `completed` bookings by play date;
  utilization bounded and status-filtered; check-in reports REAL refund success;
  declined-card path gets retry + paid-in-person; the tee-sheet stat matches
  Payments. *medium · pairs with SD-5's migration*
- **SD-5 · Lifecycle states.** Migration: walk-in booking POST, `checkedInPlayers`,
  `noShowAt`, `paidOffline`, `cancellationHoursAtBooking`, session versioning.
  Then the UI: walk-in entry, partial party, no-show, close-a-day.
  *attended · migration + big UI*
- **SD-6 · Marketing honesty.** Fix the walk-in FAQ (AFTER SD-5 makes it true),
  the listing-page / "5 min" / contract contradictions, contrast on the two fee
  lines, self-host the hero image. *small · no migration*
- **SD-7 · SEO + assets.** `sitemap.ts`, OG/Twitter meta + `metadataBase`,
  FAQPage JSON-LD, noindex the details sheet, real screenshots, the seeded demo
  course, `{{COMPANY_LEGAL_NAME}}` → plain text. *small-medium · BLOCKED ON CAM:
  screenshots + a demo course slug*
- **SD-8 · Merge + split.** Payments+Cancellations → one Money page (+ payout
  card); Settings → 5 focused tabs with per-section save + `res.ok` + a
  dirty-guard; gated fields become read-only "request a change" rows. *medium*
- **SD-9 · Funnel + auth polish.** Split the details sheet into core + polish (or
  scorecard upload), "do it on a call" escape hatch, persist step position,
  try/catch both submits; onboarding step persistence, 2FA backup codes, staff
  recovery, the Stripe multi-course fix. *medium*
