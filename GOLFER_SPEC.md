# Golfer Side Spec — the course page IS the product

Read CLAUDE.md first. One phase per run. The course page (/courses/[slug]) is the
course's OWN booking site — courses link it from their website and Google profile.
It should feel like the course's page with GreenReserve in the background
(powered-by footer exists). Golfers never need an account to book; member sign-in
is a per-course side door, never in the main booking path. Mobile-first everywhere —
golfers book from phones.

---

## Phase G1 — Course page: identity + About + photos (schema change, run attended)

Layout: hero (course photo, name, city/state) → tab bar: **Tee Times** (default) ·
**About** · **Photos** (only if photos exist).

- **About tab**: course description, address with a "Get directions" link
  (google.com/maps/search/?api=1&query=<encoded address> — no API key needed),
  phone, website, holes/par, walking/cart policy, facilities list, and optional
  **"Gift cards" button** → external URL the operator sets (v1 is a link-out to
  wherever they already sell them; native gift cards are a separate future spec —
  stored value = real liability, do not build here).
- **Photos**: operator uploads their own (dashboard Settings → Photos): hero photo +
  up to 8 gallery photos. STORAGE: Vercel Blob (@vercel/blob) — Vercel's filesystem
  is ephemeral, never write uploads to disk. Validate type/size (jpeg/png/webp,
  5MB), operator scoped to own course. Schema: Course.heroPhotoUrl String?,
  CoursePhoto model (courseId, url, sortOrder) → migrate via `prisma db push`
  (NO migrate dev — this project has no migrations history).
  MANUAL STEP for Cam: enable Blob in Vercel dashboard → BLOB_READ_WRITE_TOKEN env.
- No photos yet → current gradient stays as the hero fallback.
- Schema fields: Course.giftCardUrl String?, description exists — verify it renders.

## Phase G2 — Tee sheet UX: corresponding filters (no migration)

The grid always shows what's real; filters narrow it and stay in sync:

- **Filters**: date picker (default today, 7-day strip), time of day
  (Morning / Afternoon / Twilight / All), party size (Any / 1 / 2 / 3 / 4).
  Filters correspond: party size 4 → only slots with 4 open seats; time filter
  alone → all party sizes in that window; both → intersection. Filter state in the
  URL query so links are shareable.
- **Slot cards**: time, price per player, seats remaining ("2 spots left").
  Tap slot → party size picker capped at remaining seats (pre-set from the filter
  if chosen) → itemized total: green fee × players, cart fee if applicable, $1.50 ×
  players service fee, total — BEFORE any personal info is asked.
- Guest checkout stays the default path: name, email, phone, card (only if the
  course has a cancellation fee — no-card flow exists, keep it). No account wall,
  ever.
- Sold-out slots render greyed with "Full — get an alert" (wires to G3; until G3
  ships, hide the alert button).
- Empty states: no times today → next day with availability surfaced ("Next
  available: Thursday").

## Phase G3 — Tee time alerts (schema change, run attended)

"Notify me" for golfers, two entry points:

- **Full slot** → "Alert me if this time opens" (email + the specific teeTimeId).
- **Alerts button** on the tee sheet → criteria alert: date, time window, party
  size, email. Schema: TeeTimeAlert (courseId, email, date, windowStart/End,
  players, teeTimeId?, notifiedAt?, createdAt, token for one-click unsubscribe).
- Fires when capacity frees (cancellation path) or new times generate for a
  matching window: send ONE email per alert (mark notifiedAt, done — no repeat
  spam), link straight to the filtered tee sheet. Unsubscribe link in every email.
- Rate limit creation per IP/email. Fold the existing Waitlist model in: migrate
  its rows to TeeTimeAlert and delete the old model if nothing else uses it.

## Phase G4 — Member experience on the course page (no migration)

Members are per-course (CourseMembership) — a member of Course A is nobody at
Course B, and that's correct at 100s of courses. The gap is the experience:

- Course page gets a quiet "Member? Sign in" text link (footer of the tee sheet,
  NOT a button in the booking path). Goes to the existing per-course member portal
  login (OTP). Regular golfers should be able to book without ever noticing it.
- Signed-in member on THEIR course's page: badge ("Signed in as member"), member
  pricing applied in slot cards and the itemized total (MembershipTier rates),
  access to member-only tee times (protected windows show for them, hidden or
  locked for the public).
- Member session is per-course (gr_member cookie exists) — verify a member session
  for course A changes NOTHING on course B's page (isolation test case to add to
  scripts/isolation-test.ts).
- Booking as a signed-in member records the membership on the booking (field
  exists? verify) so the course sees member vs public rounds in the dashboard.

---

## Ground rules

- One phase per run. G1 + G3 schema changes → `prisma db push`, attended.
- D3 Clubhouse styling for golfer pages; course brandColor personalization exists —
  respect it.
- Booking capacity invariant from HARDENING A applies to every new path (member
  booking included) — use claimTeeTime(), never a parallel implementation.
- Emails: baseTemplate, unsubscribe links on all alert mail. No emoji.
- CLAUDE.md gotchas: parse-check big files, no sed, no `? [` JSX openers.
