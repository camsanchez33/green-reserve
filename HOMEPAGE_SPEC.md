# HOMEPAGE_SPEC — the approved homepage (and session handoff)

Written 2026-09-30 → 2026-10-01 so a fresh session can pick up without the
history. Read this, then open `docs/design/home/index.html` in a browser (the
approved mockup, self-contained).

Live mockup: https://claude.ai/artifact/XBgbV4HHBTuDM4B6sRQEHq

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

- Type: Archivo only, using its width axis — 118 for headlines (700), 100 for
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
