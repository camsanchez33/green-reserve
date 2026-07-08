# Onboarding Funnel Spec — inquiry → details → build → live

Read CLAUDE.md first. One phase per run. Clubhouse style on admin pages; public pages
follow the D3 golfer-facing sweep. This spec rebuilds the entire get-listed journey so
every step feeds the next with zero re-typing.

The funnel: for-courses form (60s) → admin approves → type-aware details sheet →
admin reviews → wizard builds (fully pre-filled) → activate → welcome email + video.
Pipeline stages (existing, from Phase 2b): pending → in_review → details_requested →
details_submitted → building → live. Emails fire on stage transitions.

---

## Phase O1 — Inquiry form: short lead capture (small run)

Rebuild /for-courses form to ~60 seconds. Three tight sections:

1. **You**: first name, last name, title/role (select), email, phone.
2. **Your course**: course name, city, state, course type (Public / Municipal /
   Semi-private / Resort — same values the Phase 5 wizard uses).
3. **Optional**: one free-text "anything we should know?" field.

DELETE from the inquiry form (they move to the details sheet): booking method, tee
times/day, green fee range, resident/member/caddie toggles, pricing notes, facilities
notes, lookingFor checkboxes, needs textarea. Keep the CourseInquiry schema fields —
they'll be populated by the details sheet instead.

- Success screen = "what happens next" in 3 steps (we review → you get a details
  sheet → we build your page, you approve, you're live). Set expectations: reply
  within 1 business day.
- **New email: inquiry confirmation to the applicant** (currently only the admin gets
  notified). Short, warm, restates the 3 steps. Reuse baseTemplate.
- sendInquiryNotification to admin unchanged.

## Phase O1b — Course type: Public/Private + branch questions (small run)

TWO course types only: `public` and `private`. No semi_private, no municipal, no
resort as types — every nuance is a flag/answer on one of the two. (Finalized with
Cam 2026-07-07.)

- Course type control: two large radio cards, **Public** / **Private** (replace the
  4-option select). Selecting one slides in its branch questions:
- **Public branch** (3 quick questions):
  1. Do you offer discounted rates for town/county residents? (yes/no)
  2. Do you offer memberships or season passes? (yes/no)
  3. Average rounds per month: under 500 / 500–1,500 / 1,500–3,000 / 3,000+
- **Private branch** (5 questions — private leads are high-touch, worth the depth):
  1. Do you allow non-member tee times? — Yes, regularly / Limited windows /
     No, members only
  2. Roughly how many members? — under 100 / 100–300 / 300+
  3. Do you host outside outings or tournaments? (yes/no)
  4. How do members book today? — pro shop or phone / sign-up sheet /
     booking software / other
  5. Do you charge members per round? (yes/no)
- Storage: courseType = 'public' | 'private'; branch answers go into structured
  needsJson keys (residentRates, hasMemberships, roundsPerMonth, publicTeeTimes,
  memberCount, outsideOutings, memberBookingToday, chargesMembersPerRound).
- **Migration of existing values**: municipal → public + residentRates note;
  semi_private → private + publicTeeTimes='limited'; resort → public + note. Update
  the Phase 5 wizard's type step and the O2 details sheet sections to branch on the
  same two types + flags (wizard: same fields, reorganized under two types).
- Admin inquiry detail panel renders the branch answers as structured rows.

## Phase O6 — Private course page mode (medium run, after O5)

A `private` course with NO public tee times must not get the standard booking page:

- Its page shows: course info, photos, description, and a single "Members sign in"
  action into the existing per-course member portal. NO public tee times, no public
  pricing, no book button.
- A `private` course WITH public/limited tee times keeps the public booking page
  (protected member windows apply).
- /courses directory: private courses listed with a "Private" marker, or hidden —
  decide at build time with Cam (default: listed, no booking).
- Booking API: reject public bookings for `private` courses server-side (the page
  hiding is not the enforcement).

## Phase O2 — Type-aware details sheet (big run)

The token-gated details form (/for-courses/details?token=) becomes the ONE place a
course tells us everything, structured to map 1:1 onto wizard/schema fields.

- **Sections adapt to the two types + O1b branch answers**:
  - Both types: holes/par, season open/close months, desired first-tee/last-tee
    times, interval minutes, cancellation policy (window hours + late fee or none),
    facilities checkboxes (range, pro shop, restaurant, lessons...), website,
    course description (2–3 sentences, shown on their public page).
  - Public: green fees weekday/weekend, twilight (optional), cart fee, walking
    allowed. If residentRates → resident weekday/weekend rates + how residency is
    verified. If hasMemberships → starter membership tier (name + annual fee).
  - Private: member booking rules (advance window, protected times). If
    publicTeeTimes yes/limited → public green fees + protect-member-times window.
    If chargesMembersPerRound → member rate. If outsideOutings → note field for
    outings volume (feeds future outings feature).
  - Both: "anything else" free text → lands in admin notes, never lost.
- **Server-side draft save**: PATCH by token on every section advance — operators fill
  this on phones between nines; they must never lose progress. Progress bar, one
  section per screen, mobile-first.
- Answers stored structured in detailsJson (keyed fields, not prose).
- Admin detail panel renders the answers grouped exactly like the sections.
- sendDetailsRequestEmail copy rewrite: what the sheet is, ~5 minutes, saves as you
  go, link. sendDetailsSubmittedNotification unchanged (admin side).

## Phase O3 — Build handoff: wizard consumes the sheet (medium run)

- "Build course" from an inquiry pre-fills the Phase 5 type-aware wizard from the
  STRUCTURED detailsJson — every field that has a wizard home lands in it (fees,
  schedule prefs → TeeTimeSchedule draft, policies, facilities, tier seed,
  description). Target: for a completed sheet, the wizard is review-and-click-through,
  zero typing.
- Anything without a home → course internal notes, flagged on the wizard completion
  screen (existing Phase 5 rule — verify it works with the new structured data).
- Admin review sheet view gets a "ready to build" checklist: which wizard fields are
  filled vs missing, so gaps are visible before starting the build.

## Phase O4 — Go-live moment: welcome email + video (small run)

When a course is activated (every code path that sets active=true + liveStatus='live'):

- **Welcome email to the operator** — the single most important email in the product:
  - "Your course is live" + link to their public page.
  - Embedded thumbnail → **one generic dashboard walkthrough video** (env var
    WALKTHROUGH_VIDEO_URL; Cam records once). Not per-course.
  - How money works in 3 lines: golfers pay a $1.50 booking fee, you keep 100% of
    green fees, payouts via your Stripe account.
  - First-week checklist: log in, check your tee sheet, do a test booking, how
    check-in works, where Messages lives (admin ↔ you).
  - Support: reply-to hello@greenreserve.app or the dashboard Messages thread.
- Send exactly once per course (guard: welcomeEmailSentAt DateTime? on Course →
  small migration, run attended).
- The existing sendOperatorWelcomeEmail (credentials email) is a DIFFERENT moment
  (account creation) — keep it, but cross-reference copy so they read as a sequence.

## Phase O5 — Homepage redesign pass: editorial, not template (medium run)

Goal: kill the generic-landing-page look. The tells to remove, by name: pill badge
floating over a centered hero, symmetric numbered-box step grids, and uniform
icon+title+blurb card grids. Direction: editorial layout, real product screenshots,
specific numbers. Keep the golf photo hero background — Cam likes it.

- **Hero**: keep the photo, lighten the dark overlay (grass should read green, not
  gray). LEFT-align the text block. Headline in Fraunces serif (matches Clubhouse).
  Delete the pill badge — fold "Free for courses" into the subhead. ONE primary CTA
  ("List your course"); Operator Login becomes a quiet text link, not a twin button.
  Replace the three-item divider row with one specific sentence: "Golfers pay a
  $1.50 booking fee. You keep 100% of your green fees. $0/month."
- **How it works**: replace the 4 numbered boxes with a vertical editorial timeline
  (numbers in the margin, generous whitespace) using the O1 funnel steps VERBATIM —
  promise and process must use the same words. 3 steps, not 4.
- **Public / Private split section**: two side-by-side panels with distinct imagery
  and pitch — "For public courses" (online tee times, $1.50/golfer, you keep green
  fees) and "For private clubs" (member booking, protected times, outside-play
  windows). Each panel's CTA lands on the /for-courses form with that type
  pre-selected (query param → O1b radio pre-set).
- **What you get**: DELETE the 6-icon-card grid. Replace with 3 alternating
  screenshot-left/text-right feature rows using real dashboard screenshots
  (public/screenshots/, retake in Clubhouse style if stale): the tee sheet, the
  live dashboard, payouts/Stripe. Each row: Fraunces heading, 2 sentences, one
  concrete number. Remaining small facts become a single plain-text line under the
  rows — no cards, no icons.
- **Copy rules**: no superlatives, no "everything you need", no "professional".
  Specific beats general: $1.50, 1 business day, Stripe, 100%. Sentence case
  headings.
- /for-courses page: form (from O1) + proof section + short FAQ (what it costs:
  nothing; who charges the golfer; how long to go live; can I leave anytime).
- Video on homepage stays behind SHOW_VIDEO flag until Cam records it (same video
  as O4's walkthrough or a shorter cut).

---

## Ground rules

- One phase per run. O4 has a migration → attended.
- Every stage transition already logs InquiryStatusEvent (Phase 2b) — new emails hook
  those same transitions, never parallel logic.
- Emails: reuse baseTemplate, sharp corners, no emojis. Max one email per recipient
  per transition.
- CLAUDE.md gotchas apply (parse-check large files, no sed -i, no `? [` JSX lines).
