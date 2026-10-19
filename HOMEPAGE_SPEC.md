# HOMEPAGE_SPEC — the approved homepage (and session handoff)

Written 2026-09-30 → 2026-10-01 so a fresh session can pick up without the
history. Read this, then open `docs/design/home/index.html` in a browser (the
approved mockup, self-contained).

Live mockup: https://claude.ai/artifact/XBgbV4HHBTuDM4B6sRQEHq

---

## 0a. Cam's homepage notes — 2026-10-18 (launch walk 1) — OPEN, nothing changed yet

Cam walked greenreserve.app and wrote these. Cam: "dont make changes make
suggestion save this information". Decisions go here as they are made.

1. **Hero ("first slide").** Keep the logo and a tagline, but the tagline itself
   and what else sits there are undecided. Likes Operator login in the corner;
   Book a demo there "maybe, maybe not". Unsure the photo is the right one (the
   links-green-at-dusk photo, picked 2026-10-17).
2. **Top bar?** Open question: a bar with About / information etc., or leave it plain.
3. **About section (first scroll).** Likes the format and look. Open: what it
   should say, and whether it should have pictures.
4. **"What your course gets."** Open: the wording, and what else belongs in it.
5. **"See how it works."** Really likes the look. Open: wording. Idea: make the
   golfer side look like a phone.
6. **Book a demo / Ask a question.** Likes the Book a demo section. Asks whether
   "Ask a question" is needed, or should be an inquiry form or similar.
7. **Ending.** Likes the logo at the bottom with a tagline and the footer below.
8. **Section dividers.** Dislikes the line that separates the sections ("in
   between each page there is like a line").
9. **/teesheet ("Overview", the product page).** Same question as the
   homepage: what it should say and what information it shows; whether it needs
   pictures (screenshots of the tee sheet etc.). Dislikes the dividing lines
   here too.
10. **Feature pages (idea).** Cam: maybe an information page for everything we
    provide (analytics, the AI assistant, …), or all of it on one page —
    "something to think about". Undecided.

11. **/contact.** Cam: is "Get in touch" + one email button enough, should it
    look different or have a different button; look at how other companies do
    it. Claude's proposal (2026-10-19, not built): three paths — a course
    thinking about GreenReserve (Book a demo + a short form), a course already
    on it (support), a golfer with a booking (contact your course; their
    booking email has the course's details). Open: phone number? branded inbox?

12. **Operator login (/dashboard/login).** Cam: straightforward but can look
    better and say different things; rethink it. Today: "Sign in / Your tee
    sheet, your bookings and your settings.", email, password, Forgot password,
    "Ask a question →".
13. **The email link in the nav (thegreenreserve@outlook.com)** just opens an
    email — same as /contact; Cam agrees with the /contact proposal (11).
14. **How Cam wants to work these notes:** not through the punch-list sheet —
    Claude asks questions in the session, and the answers decide what changes,
    what gets added, what stays.

**Decisions, round 1 (Cam 2026-10-19):**
- Audience: course owners and GMs ("our only product is the tee sheet and the
  things that come with it").
- Tagline: simple and clear, makes the reader want to read on; highlight that
  it's FREE and that it has a ton of helpful features — lean on what's big now (AI).
- Top bar: Operator login + Book a demo only.
- "Free" is LOUD — e.g. "Free tee sheet. Stop spending money to run your sheet."
  Cam: "it is so important this is our whole business". (Fee sentences still
  come from legal/LQ-2_FEE_COPY.md.)

**Decisions, round 2 (Cam 2026-10-19):**
- Hero: logo, tagline, and a Book a demo button right there.
- Features to show off: Birdie (AI assistant), the AI monthly review +
  analytics, payments (text-to-pay, Apple Pay / Google Pay, card-protected
  late/no-show fees). Memberships were NOT picked for the homepage.
- About section: combine "the problem, then the fix" with "what it is, plainly".
- Pictures: real product screenshots in device frames; no stock photos.

**Decisions, round 3 (Cam 2026-10-19):**
- See how it works: fine as is; make the golfer side look a bit more like a
  phone, or size it better.
- "Or ask a question" becomes "Not ready for a call? Send us a note" — a short
  form (name, course, role, message) that lands in admin inquiries.
- /teesheet: ONE page, "very in depth and explained" — a section per feature.
- /contact: split into 3 paths (interested course / existing course / golfer
  with a booking, sent to their course); a phone number on the site; a branded
  support@greenreserve.app address forwarding to the Outlook inbox. (No
  separate contact form picked — the "send us a note" form covers it.)

**Legal decisions (Cam 2026-10-19):**
- Entity: GreenReserve LLC, a New York LLC; governing law and venue New York.
  Courses re-sign the agreement once.
- 1% membership fee applies to dues AND initiation fees (keep the code; fix the
  agreement wording).
- No lawyer before launch: Claude makes Terms / Privacy / Operator Agreement
  accurate to the product and flags what is unreviewed (texting consent,
  card-on-file wording).
- Cash at the counter: NO GreenReserve fee on cash, card on file or not (the
  code must stop charging a saved card on "paid at counter"). Abuse is watched
  on Admin → Revenue ("Not collected, paid at the counter", per course), not
  prevented. Rejected: a $1 cash fee (it could only be billed to the course,
  breaking "free for courses") and a cashless rule.

**Operator login (Cam 2026-10-19):** keep it minimal; add a photo/brand panel
beside the form (homepage feel; form only on phones) and a "Need help signing
in?" line pointing to support. ("Ask a question" was not swapped for Book a demo.)

**About section — DRAFT sent to Cam 2026-10-19 (not approved yet).** See the
session for the copy; record it here once approved.

**Round 5 (Cam 2026-10-19):** hide Test Course 3 from the public site and the
sitemap; the site phone number is Cam's cell (number to come from Cam);
REMOVE durations and contract terms from /for-courses too; fix link previews
before launch (course pages preview with the course's name and photo).

## 0. HOME-2 — Cam's own layout (Cam 2026-10-07) — CURRENT

Cam scrapped the "why switch" rewrite and wrote the page himself. Where §1–§3
below conflict with this section, THIS section wins; they stay as history.

**Homepage, top to bottom:**
1. **Hero:** ONE full-screen photo (`public/home/hero-coast.jpg`: since 2026-10-17 a
   real photo, a links green above the ocean at dusk, flag on the horizon,
   Unsplash photo-1646204221936 (Cam picked it from 18), free under the Unsplash License (no credit required);
   a placeholder until a partner course's own photo, Cam 2026-10-17) with the cream logo
   centred in the upper third. Under it (Cam 2026-10-19, option A — "free"
   as the headline sounded cheap): the line "The tee sheet your course
   deserves.", one sentence "Online booking, payments and an AI assistant that
   knows your course. GreenReserve charges your course nothing: golfers pay a
   small booking fee instead." (LQ-2-safe wording), and a Book a demo button. A dark top-to-bottom scrim so the logo reads. The nav has no logo
   on `/` (the hero's logo replaces it): Operator login + Book a demo, top right.
2. **What it is** (`#about`): headline, one long paragraph, four bullets, and
   two cards: "See how it works" (scrolls to the demo) and "Learn more about the
   tee sheet" (→ `/teesheet`).
3. **What your course gets** (`#why`): four highlights, only features that
   exist today: Free, Birdie, Analytics, Your money / your account. **Pro-shop
   access is NOT on the page until it is built** (Cam wants it; it is a
   separate item to scope).
4. **See how it works** (`#see`): the working demo, the operator tee sheet on a
   laptop and the golfer's booking page on a phone beside it, one store behind
   both. Then Book a demo + "Or ask a question".
5. **End:** the logo again with "Ready when your course is." (the old closing
   line moved up to the hero, Cam 2026-10-19)
6. Footer: "© {year} GreenReserve. All rights reserved." + The tee sheet,
   Terms, Privacy, Operator agreement, Contact, Operator login, email.

**`/teesheet`**: the long version: everything a course gets (booking page, tee
sheet, payments, cancellations and no-shows, members, staff, Birdie,
analytics), how setup works, what it costs, the FAQ (the FAQPage JSON-LD moved
here from `/`), about, contact. Add a walkthrough video here once one exists.
The "About" paragraph is a first draft; Cam to rewrite it.

**The demo must match the product (Cam: "it needs to actually be accurate").**
Every label, status word and button in `src/components/home/TeeSheetDemo.tsx`
copies the real dashboard tee sheet and the real booking flow (Pay for
phone/walk-in groups, Check in for online, Walk-in on open slots, "N left" /
"Full" / "Blocked" / "Checked in", Next up, the header line; the golfer side's
two-line day chips, "$52 / player", Select, the itemized total with the
$1.50/player booking fee, "Continue to Book →", "Confirm your tee time",
"You're all set"). Change the product, check the demo. The planned next step
(after the rest of the site is finished) is a REAL read-only demo course
instead of this copy.

**Rules that change:**
- The photo ban in §1.2 is lifted for this one hero photo. The scroll-driven
  golf-hole concept and an aerial course behind the WHOLE page stay rejected.
- Fee copy: the LQ-2 freeze was lifted 2026-09-14; homepage and `/teesheet`
  use only the allowed sentences in `legal/LQ-2_FEE_COPY.md` ($1.50 per player
  is fine). Never "keep 100%", never "costs your course nothing" (the course
  bears Stripe's fee on the $1.50); say "GreenReserve charges your course
  nothing".
- Still in force: no durations, no contract talk, CTAs Book a demo + Ask a
  question, realistic names (no Smith/Johnson/celebrities).

---

## 1. What Cam decided (in order, so nobody re-litigates it)

1. The old homepage (cream Clubhouse, Fraunces) and the first redesigns looked
   "AI-made" to Cam. What NOT to do: card grids, big rounded corners on
   everything, gradients, heavy shadows, pill buttons everywhere, fake-looking
   data (John Doe / Smith / Johnson), oversized heroes, fade-ins everywhere,
   identical buttons, perfectly symmetric 50/50 layouts.
2. **Rejected, never revive:** Direction B (Figtree, white, pills — "THAT LOOKS SO
   FUCKING AI"); the printed-scorecard look (too blocky / presentation-like); the
   golf-hole concepts — a ball played down a hole by scrolling, then an aerial
   course behind the page (Cam 2026-10-01: "that looks terrible lets go back to
   the plain background").
3. **Approved: the plain-background mix** (`docs/design/home/index.html`):
   near-white ground #FAFAF7; a 46/54 hero, text left; right, a WORKING demo on the
   plain ground (Cam 2026-10-01: "get rid of the green block behind it and make
   those interactive") — the staff tee sheet (6 rows, 3 columns, Tee sheet/Bookings
   tabs, day arrows, Check in buttons on today's due groups) and, overlapping its
   bottom-left corner, a larger golfer phone (300px: day chips, open times, player
   stepper, green fee total, Reserve → "You're booked"). Labels "What your staff
   see" / "What golfers see" and a one-line "Try it" hint. A booking on the phone
   lands on the sheet as "Rivera · n — Booked online", highlighted. The setup band
   and the end band run edge
   to edge while text stays in a ~1240px column. Cam liked the overlap of the tee
   sheet and phone from the start — keep it.

## 2. Content rules (Cam, 2026-09-30)

- A homepage says what we are, what we do, answers general questions, and
  leaves them wanting more. Calls to action: **Book a demo** (primary, nav +
  hero + end) and **Send an inquiry** (quiet link). "Book a call" = the demo;
  do not add a third button.
- **No durations or time promises** anywhere on the homepage: no "52 minutes",
  no per-step minutes, no "live within a week", no "reply within one business day".
- **No contract talk:** no "no long-term commitment", no "30 days' notice",
  no "Can we leave?" FAQ.
- Pricing is one line: "Free for courses. No setup fee and no monthly fee.
  Golfers pay a small booking fee when they book online. We'll walk you
  through the details on a call." (Never "keep 100%" — LQ-2.)
- Keep the product pictures: the compact tee sheet (5 rows, 3 columns) with the
  golfer's phone overlapping below it; the "Built for the course" fragments
  (course website with a Book a tee time button, a walk-up added at the counter,
  the same page in three course colors).
- Realistic data only (Marino · 4, Okafor · 2, Men's league held, Delgado · 3,
  $52 green fee, 8-minute intervals). Numbers must agree between the sheet and
  the phone (the phone shows only the sheet's open times).
- Hero copy: eyebrow "Free online tee sheet for golf courses"; H1 "The tee sheet
  your course deserves."; "GreenReserve gives your course an online booking page
  with your name and colors, and one tee sheet your staff run the day from.";
  under the buttons "Free for courses."
- Sections, top to bottom: hero (text + working demo) · Built for the course (three
  staggered rows, each with its product fragment; "Keep your brand" shows three
  mini booking pages for made-up courses — Hollow Creek, Stonebridge, Lake Wren —
  each with its OWN course photo, crest, colour and a Reserve button, not colour
  swatches) · How it works (3 steps, no times, on the
  forest band) · Price line · FAQ (6 general questions, all printed, no accordion)
  · **See it work** (Cam wants it as the preview to booking a demo): centred, one
  screen at a time behind a "What golfers see / What your staff see" toggle, a
  420px golfer booking page with course-colour swatches, the larger tee sheet, then
  Book a demo · end band "See it with your course's tee sheet." + CTAs + email.
- Both demos share ONE state: a booking, check-in or colour change in one shows in
  the other. Realistic data per day (Sat 4 today with check-in; Sun 5; Mon 6 at the
  weekday rate $44). Never fake names like Smith/Johnson.


- **No stock photo section, and never "your course, not ours"** (Cam 2026-10-01:
  "green reserve doesnt have a course so this doesnt even make sense"). The brand
  point lives in "Keep your brand". Photos appear only inside product mockups,
  as a course's own header photo.

## 3. Look (from the mockup)

- Type: SUPERSEDED 2026-10-05 by TYPE-1 — headlines EB Garamond (`--font-serif`), everything else Libre Franklin (`--font-sans`). The original rule follows for history.
  Type: Archivo only, using its width axis — 118 for headlines (700), 100 for
  body, 75–87.5 for table labels and eyebrows. Hero H1 on two lines on desktop
  (`white-space: nowrap` per line above 1180px).
- Palette: ground #FAFAF7, forest #173B2A (fields, primary button), ink #141814,
  muted #6B706A, line #E3E4DE, sage #D6E0D1 (one light accent), due amber #9A5B13.
  Green is used for fields, not sprinkled on everything.
- Buttons 6px radius; ONE primary per area (forest), the second action is a quiet
  grey text link. Product pieces 6–8px radius; only the product pieces and the
  phone carry a shadow. No gradients except the scrim inside the phone's header photo.
- Deliberate asymmetry: 40/60 hero, 30/70 section heads, staggered feature rows
  (the middle one indented). No fade-in animations.

## 4. Build plan (next session)

1. **UI-H-1 homepage.** Replace `src/app/HomeContent.tsx` + `home.module.css`
   with the mockup. The page stays a server component; the demo is ONE small
   client island (the mockup's script is ~6 KB unminified, no libraries) that
   renders the hero demo and See it work from one state — note the bundle
   justification in the PR per the perf rules. The old `SeeItWork`/`HomeDemo`
   components can be retired once this replaces them. Archivo via next/font (variable, wdth axis) replacing
   Fraunces/Inter for the PUBLIC look — check `/for-courses`, legal and golfer
   pages still read right, and that `.staff-look` is untouched. Nav: logo
   top-left corner, Operator login + Book a demo top-right.
2. **Book a demo → Cal.com, and it must create an inquiry.** Today a Cal.com
   booking is only tied to a course via the inquiry token (`/call/[token]`,
   `src/lib/calcom.ts`, `/api/calcom/webhook`). A demo booked straight from the
   homepage has no inquiry, so it would never show in admin. The webhook must
   create a pending Inquiry from the attendee (name, email, course-name answer)
   when no token matches. Additive only; a new column = a real migration,
   verified locally (CLAUDE.md schema rules).
3. **Verify:** local prod build, screenshots at 1440 and 390, Lighthouse home
   median of 3 under budget (LCP ≤ 2.5s, TBT ≤ 300ms, CLS ≤ 0.1).
4. Then `/for-courses` in the same language (its "1–2 days typical setup time"
   breaks the no-durations rule).
5. Dashboards: undecided. Do not touch the staff look until Cam decides.

## 5. Everything else still open (from this session)

Waiting on Cam: LLC approval (then the legal name/state/address into the Terms
and operator agreement) · Twilio A2P registration on the 607 number, then the
Twilio env vars · private-club prices · the fee sentence · Birdie API-key
rotation plan (his key expires every 30 days) · one real test booking to
confirm SEC-1 in production.

Queue backlog (RUN_QUEUE.md): EV-1 booking event log (schema, local verify) ·
SD-9c(2) 2FA backup codes · MP-4f · MP-7b · MP-8b · calcomUid column · ~15
shipped-but-unreviewed items for /gr-review · the orphan-banner bug.

## 6. Local verification setup that worked in the sandbox

Postgres 16 at `/var/tmp/grpg/data` port 5499 (start as the postgres user:
`su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/grpg/data -l /var/tmp/grpg/pg.log -o '-p 5499' start"`),
`DATABASE_URL=postgresql://postgres@localhost:5499/gr`, a 64-char dummy
`JWT_SECRET`, `NEXT_PUBLIC_URL=http://localhost:3900`, `next build` then
`next start -p 3900`. Playwright: `/opt/node22/lib/node_modules/playwright/index.mjs`,
plain `chromium.launch()` for localhost (the proxy breaks plain-HTTP localhost;
next/font self-hosts fonts so no proxy is needed). A new sandbox may not have
`/var/tmp/grpg` — recreate it.
