# HOMEPAGE_HOLE_SPEC — the homepage is one golf hole (and session handoff)

Written 2026-09-30 at the end of a long session so a fresh session can pick up
without the history. Read this, then `docs/design/hole/index.html` (the approved
mockup: open it in a browser and scroll).

Live mockup: https://claude.ai/artifact/KU2aJBhanuRQqkbB5fWQdY

---

## 1. What Cam decided (in order, so nobody re-litigates it)

1. The current homepage (cream Clubhouse, Fraunces) and every redesign since
   looked "AI-made" to Cam. His checklist of what NOT to do: card grids, big
   rounded corners on everything, gradients, heavy shadows, pill buttons
   everywhere, fake-looking data (John Doe / Smith / Johnson), oversized heroes,
   fade-ins everywhere, identical buttons, symmetric 50/50 layouts, generic
   dashboard layouts.
2. **Direction B (Figtree, white, pills) was REJECTED** ("THAT LOOKS SO FUCKING
   AI"). It was never merged. PR camsanchez33/green-reserve#28 no longer carries it.
3. A pure "printed scorecard" look was rejected as too blocky / presentation-like.
4. **Approved direction:** the whole homepage is played over ONE par-4 hole,
   seen straight down, pinned behind the entire page. Scrolling IS the shot:
   ball on the tee → drive with a TV-style tracer → lands in the fairway →
   approach onto the green (camera pushes in slightly) → putt that slows,
   circles the lip and drops at the last line → "3 · Birdie." → Book a demo.
   (Tee shot + approach + one putt on a par 4 = birdie; the assistant is
   named Birdie — deliberate tie-in, not a mascot. No dog art anywhere.)
5. Cam: "i dont mind if it looks AI but i want it to look like an actual golf
   course." The course image is AI-generated (Cam made it):
   `docs/design/hole/course.webp`, 667×2000, straight down, tee top, green
   bottom, fairway on the right half, trees on the left half.

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
- Sections, top to bottom = the phases the ball uses: 0 hero (tee) · 1 Built for
  the course (drive) · 2 Golfers see your course, not ours (approach) · 3 How it
  works, 3 steps, no times · 4 Price line · 5 FAQ (5 general questions) · 6 end
  (drop, "3 · Birdie.", "See it with your course's tee sheet.", CTAs, email).

## 3. How the mockup works (port this, don't reinvent it)

- `.course` is `position: fixed` full-viewport behind everything; `#img` holds
  the course at its native 667×2000 and is moved with ONE `transform:
  translate() scale()` per frame (cover-fit scale, camera keeps the ball at
  ~58% of the viewport height, clamped to the image edges).
- Ball, ball shadow, tracer (`<svg id="fx">` path) and the HUD readout sit in
  screen space above the image, so the image layer is never repainted.
- Waypoints are in image pixels (read off a grid over the photo — if the image
  changes, re-read them): tee (458,72) · drive lands (468,990) → rests
  (474,1036) · approach lands (336,1766) → rests (328,1779) · cup (341,1811).
  HUD distances: 464 yds hole, 256 drive, 198 approach, 12 ft putt.
- Phase = which section's top has passed ~55% of the viewport (anchors are
  measured, last anchor = max scroll, so the drop always completes at the bottom).
  Rendered phase eases toward the scroll phase (lerp .14) for a cinematic feel;
  `prefers-reduced-motion` snaps instead and hides the tracer.
- Words sit over the tree side under a left-to-right dark wash (a photo scrim —
  allowed; not a background gradient). Product pieces are the only surfaces.
- Phones (≤900px): the course is a strip pinned at the top (40svh, `inset:auto`
  BEFORE `top:0` — the reverse order silently un-pins it); content scrolls
  below on #0E1F16.
- Type: Archivo only (wdth axis: 118 headlines, 100 body, 75–87.5 labels).
  Palette: deep #0E1F16, forest #173B2A, cream #F6F4EC, sage #CFDCC8. Buttons
  6px radius; cream primary on dark.

## 4. Build plan (next session)

1. **UI-H-1 homepage.** Replace `src/app/HomeContent.tsx` + `home.module.css`
   with the hole page. Keep it a server component; the scroll engine is ONE
   small client island (~3 KB, plain rAF — **no GSAP / framer-motion**, see the
   perf rules). Course image → `public/brand/course-hole.webp` via next/image
   or CSS with `fetchpriority` low (the hero TEXT must stay the LCP element).
   Archivo via next/font (variable, wdth axis) replacing Fraunces/Inter for the
   public look — check `/for-courses`, legal and golfer pages still look right,
   and that `.staff-look` is untouched. Nav: logo-cream top-left on the course,
   Operator login + Book a demo top-right.
2. **Book a demo → Cal.com, and it must create an inquiry.** Today a Cal.com
   booking is only tied to a course via the inquiry token (`/call/[token]`,
   `src/lib/calcom.ts`, `/api/calcom/webhook`). A demo booked straight from the
   homepage has no inquiry, so it would never appear in admin. Webhook must
   create a pending Inquiry from the booking's attendee (name, email, course
   name answer) when no token matches. Additive only; if it needs a column it is
   a real migration, verified locally (CLAUDE.md schema rules).
3. **Verify:** local prod build, screenshots at 1440 and 390 at several scroll
   points, the drop completes at the very bottom, Lighthouse home median of 3
   under budget (LCP ≤ 2.5s, TBT ≤ 300ms, CLS ≤ 0.1), reduced-motion pass.
4. Then `/for-courses` in the same language (its "1–2 days typical setup time"
   also contradicts everything else — remove per the no-durations rule).
5. Dashboards: undecided. Do not touch the staff look until Cam decides.

Image quality: 667 px wide is soft at 1440 (≈2.2× upscale). Free fix Cam can
do: upscale 2–4× with Upscayl (free, open source) and replace the file; the
waypoints scale with it (multiply by the factor).

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
