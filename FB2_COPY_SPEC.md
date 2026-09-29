# FB-2 — homepage copy (DRAFT for Cam's approval)

Source: Cam's walk-through notes, 2026-09-29. Status: **DRAFT — nothing below is
live.** Marketing fee copy is frozen behind LQ-2 (CLAUDE.md), so the build run
applies exactly the approved sentences, the way legal/LQ-2_FEE_COPY.md worked.
Mark each block ✅ / ✏️ (with your edit) / ❌.

Facts checked against the code before writing (2026-09-29):
- Green fees are charged at **check-in**, not at booking (checkin-booking.ts).
  The current FAQ says "after each booking" — wrong today.
- Walk-ins **can** be added on the tee sheet (dashboard "Walk-in"). The current
  FAQ says "coming" — wrong today.
- Setup time is stated three ways today (1–2 business days / days not months /
  "within a week of that call"). Pick one; the draft uses **"about a week"**.
- "No contract" is untrue — the operator agreement is a contract. The honest
  line is the one /for-courses already uses: no long-term commitment, leave
  with 30 days' notice.
- GreenReserve has **no sales-tax logic**. The fee/tax lines below state only
  what the code does; see the open question at the end.
- If FB-3 ships (the $1.50 charged at booking), blocks marked **[FB-3]** change
  wording on the same day — both versions are given.

---

## 1. Hero

**Headline (keep):** The tee sheet your course deserves.

**Blurb — current:** Golfers book on a page that looks like your course. You run
the sheet, take check-ins and payments, and keep your members' rules. Live in days.

**Blurb — draft:**
> Online tee times for your course, on a booking page with your name, colors and
> photos. Add a "Book a tee time" button to your website — golfers book and pay
> securely, and your staff run the day from one tee sheet.

**Buttons:** "List your course" · "See how it works" (Cam: smoother — build run
makes it a smooth scroll to the steps, respecting reduced motion).

## 2. "Your page" beat

**Current:** Golfers book on a page that looks like your course. / Your logo,
your color, your photo. Our name is one small line at the bottom. Nobody feels
like they left your website.

**Draft:**
> **It works with the website you already have.**
> Your booking page gets its own secure link. Put it behind a "Book a tee time"
> button on your site, your Google listing and your social pages. It carries
> your logo, colors and photos — golfers never feel they left you.

**"Secure" line (Cam's note — draft):**
> Every page is served over HTTPS, and card details go straight to Stripe — they
> never touch your computer or ours.

## 3. "Your money" beat

**Current:** A card holds the time. Golfers pay when they check in, and it
lands in your own Stripe account on its normal schedule.

**Draft (today's behaviour):**
> **Green fees go to your own Stripe account.** A card holds the time; the
> golfer is charged when they check in, and Stripe pays you out on its normal
> schedule.

**[FB-3] if the $1.50 moves to booking:**
> …The golfer's $1.50 per player is charged when they book; the green fee is
> charged when they check in and paid out to you.

## 4. "Your rules" beat (Cam: shorter)

**Draft:**
> **Members keep their rules.** Member rates, booking windows and guest pricing,
> set by tier. Members sign in with a code — no app, no password.

## 5. Course cards — "Every course gets its own page."

Cam: remove this section. **Draft: delete it** (cards + heading + its CTA). The
"works with your website" point moves into beat 2. Note: this also removes the
example-course cards — the "see it work" demo stays.

## 6. Steps (Cam: more in-depth — the real process is longer than four lines)

**Heading — draft:** From first call to first booking.
**Sub — draft:** We set it up with you. Most courses are live in about a week.

1. **Tell us about your course** — a two-minute form, then a 20-minute call to
   go through your green fees, tee sheet and how you take bookings today.
2. **Fill in your setup sheet** — your tee times, prices and cancellation
   policy (about five minutes); the rest — scorecard, passes, facilities — can
   wait or be done on the call.
3. **Approve your page** — we build your booking page and tee sheet and send
   you a private preview to approve or mark up.
4. **Sign the operator agreement and connect Stripe** — about ten minutes, in
   your course's name. Payouts go straight to your bank.
5. **Go live** — add the link to your website and Google listing. Your staff
   log in to the tee sheet; golfers start booking.

## 7. Pricing — "Free for courses."

**Current:** No setup fee, no monthly fee, no contract. Golfers pay $1.50 per
player on each online booking, added to your price…

**Draft:**
> **No setup fee. No monthly fee. No long-term commitment** — leave with 30
> days' notice. Golfers pay a $1.50 per player booking fee on each online
> booking, shown to them before they book and added to your price, never taken
> out of it. Stripe's card-processing fee applies to the payment, the same as
> any card you take today.

**Tile bullets — draft:** Bookings your staff enter: $0 · Setup and your
preview page: $0 · Monthly: $0 · Leave anytime with 30 days' notice.

**Fees & taxes (Cam: "explain fees / taxes") — draft, pending the question below:**
> **Taxes.** Your prices are shown to golfers exactly as you set them.
> GreenReserve doesn't add or collect sales tax on green fees — if tax applies
> at your course, include it in your price.

## 8. FAQ (Cam: better questions) — draft set of eight

1. **What does it cost?** Nothing to your course: no setup fee, no monthly fee.
   Golfers pay a $1.50 per player booking fee on online bookings.
2. **How does it connect to our website?** Your page has its own link. Add a
   "Book a tee time" button that opens it — we send you the link when you go
   live. *(There is no copy-paste button snippet today; promise only the link.)*
3. **When do we get paid?** Green fees are charged when the golfer checks in
   and paid out to your Stripe account on Stripe's normal schedule.
   *[FB-3: unchanged — only the $1.50 moves to booking.]*
4. **Can we still take phone and walk-in bookings?** Yes. Add them on the same
   tee sheet so online golfers only see what's really open.
5. **What happens when a golfer cancels or doesn't show?** Before your
   cancellation window, the time just opens back up. After it, your
   cancellation fee (if you set one) is charged automatically.
6. **Do members get their own rates?** Yes — rates, booking windows and guest
   pricing by membership tier.
7. **How long does setup take?** About a week from your first call. We build
   everything; you approve it.
8. **Can we leave?** Yes, with 30 days' notice and no cancellation fee. Your
   data is yours.

---

## Open questions for Cam

1. **Taxes:** is the draft line true for your courses — do they build tax into
   the green fee, or do some need tax shown separately at checkout? (Separate
   tax is a feature, not copy.)
2. **Setup time:** "about a week" everywhere? (Changes the /for-courses thanks
   page and FAQ too.)
3. **Section 5:** deleting the example-course cards — OK, or keep the cards and
   drop only the heading?
