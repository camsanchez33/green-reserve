# OPERATOR_REWORK_SPEC — the operator dashboard rework (launch walk 2)

Cam's notes from walking the operator pages, kept word-for-word in spirit and
numbered so each can be decided and built. Nothing here is built yet. Decisions
are recorded under each item as Cam makes them. Order of the rework (Cam
2026-10-19): login → 2FA → dashboard (Tee Sheet first) → Analytics → the rest.

## 1. Operator login — DECIDED (HOMEPAGE_SPEC §0a, 2026-10-19)
Keep it minimal; a photo/brand panel beside the form (form only on phones); a
"Need help signing in?" line pointing to support. Not built yet.

## 2. Two-step code page — /dashboard/login/2fa (Cam 2026-10-19)
- The wording is wrong: it says "send to email" but the code is sent
  automatically. Rewrite it to say the code was sent, and where.
- Offer sending the code to the phone number on the account (SMS) as an option.
- "Also needs to be better" — a cleaner page overall.
- Claude note: SMS codes need Twilio A2P registration (already a launch
  dependency, RUN_QUEUE SETUP) and a verified phone on the login.

## 3. Dashboard chrome (every dashboard page)
- **The icon in the corner** "looks stupid, doesn't do anything" — remove it or
  give it a job.
- **The top banner** (an admin announcement — "Operator agreement" — rendered by
  `AnnouncementBanner.tsx`) doesn't go away after the agreement is accepted, and
  doesn't look urgent; it looks weird at the top. Claude note: it is a broadcast
  from Admin with only a small X to dismiss; nothing ties it to signing. Options:
  auto-clear an agreement announcement once the course has signed the current
  version, and give urgent notices a real urgent look (the 3px left-border
  attention style) instead of a thin white strip.
- **Tabs across the top** (Tee sheet, Analytics, Schedule, Members, Money,
  Messages, Settings): keep — Cam likes them.
- **Course alert** (top right): good spot; rethink what it does, what it says
  and what it shows.
- **Your page** and **Sign out**: fine.
- **Multiple tee sheets:** a course should NOT be able to make multiple tee
  sheets, unless it is a facility with more than one course — and that feature
  must be much more organized and built out.

## 4. Tee Sheet page — /dashboard (Cam 2026-10-19)
- **Header line:** keep the date and the booked / checked-in counts; ADD
  "awaiting check-in".
- **"18 holes · $70 + $10 cart"** (the product/price line): Cam doesn't see the
  point — remove it or replace it with something useful.
- **Find golfer** (right side): keep; make it more organized, not floating in
  space.
- **Refresh button:** not needed as a button — a small refresh icon somewhere
  sensible.
- **Weather** and **Message golfers:** rethink whether they're needed and what
  they say — today they don't explain what they do.
- **Add time:** fine, but needs thinking through. Courses add a time to fit
  someone in, so: warn when it's within ~5 minutes of another group; and maybe
  a separate "Ring someone up" action for a quick sale (Cam: "really needs to
  be thought through").
- **Date picker** ("Sun October 18"): the calendar popup is cut off by the
  side of the screen — it must open fully on screen.
- **The empty bar under the date:** use it for small live warnings/alerts —
  e.g. "2 groups not checked in from the last hour" — what needs doing now.
- **Times listed in hour order:** keep, it's organized.
- **Bottom of the page:** probably nothing needed; think about it.
- **The 3 colored dots (legend)** are too small and sit at the bottom where no
  one sees them. Make the whole square take the color, and move the key into
  the empty bar near the top.
- **Birdie:** needs a better look, and it must be obvious that this is where
  you ask questions — that it's there at all.

**Decisions (Cam 2026-10-19):**
- The price line ("18 holes · $70 + $10 cart") leaves the header and goes
  where staff use it — in the time slot's detail.
- The side panel needs a complete rework. DECIDED (Claude's proposal, Cam
  2026-10-19 "do your idea"): on a laptop, a wide card that opens over part of
  the sheet with the surrounding times still visible (staff keep seeing who's
  next and can still drag groups); on a phone, a full-screen sheet that slides
  up. It shows everything for that time in one place: each group, players,
  paid or not, the price, and check in / pay / move / cancel.
- "Ring someone up" waits for the card reader (POS-1b, after launch). For
  launch: "Add a walk-in" with fit-in warnings (within ~5 minutes of another
  group, slot capacity).

**Decisions, round 2 (Cam 2026-10-19):**
- The corner icon is the TOP-LEFT one: the course's uploaded logo in a small
  white box beside the course name (OperatorSidebar.tsx). It does nothing —
  remove it (or give it a job).
- Weather: keep, rename and explain ("Weather delay / cancel": delay the
  morning's start, or cancel a range of times and email those golfers). Cam
  also doesn't like how it works today — "fix that and ways it can be better".
- Message golfers: keep, rename and explain ("Message today's golfers": who
  gets it — everyone booked on that date — and how: email, and text once
  texting is approved).
- Course alert: a notice on the course's booking page (e.g. "Cart path only
  today", "Back nine closed") until it ends, AND optionally emails everyone
  booked that day.

**Built (PR, branch claude/teesheet-1, 2026-10-19):** header "awaiting
check-in" and no rate; Find golfer + refresh icon in the sheet bar; late
groups and the color key in the bar under the date; tinted squares; calendar
on screen; agreement announcement clears once signed and looks urgent; "Mark
no-show" and "Still coming" on a late group's row in the panel.

## 5. Next from Cam: Analytics (notes to come)
