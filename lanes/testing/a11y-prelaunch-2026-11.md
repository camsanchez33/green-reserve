# Testing lane — accessibility pass on the golfer booking flow (2026-11-16)

Cam asked for one accessibility pass before launch (Nov 26). Golfers skew older and mostly book on phones.

**How it was run.** Run locally against `main` at `8139943` (#431): a throwaway Postgres on 5499 (`gr_ci`, `migrate deploy`), the seeded course `perf-audit` (`scripts/perf-seed.ts`), and `next dev` on 3100 with the CI env values. I drove the flow with Playwright and Chromium at **390×844** and **1280×900**. Each screen got `@axe-core/playwright` 4.10 (WCAG 2.0/2.1 A+AA rules), a Tab walk that records focus order and the focus style, the accessibility tree (`ariaSnapshot`), a measure of every tap target, and a **200% zoom** check (a 195 px wide viewport, which reflows the same way 200% zoom on a 390 px phone does). Steps walked:

- the course page
- choosing a time with the keyboard
- `/book`: as a guest, an empty submit, then a real booking
- the confirmation
- `/courses/perf-audit/account` (sign-in)
- `/manage`: the main view, Change time, Change players and Cancel
- `/checkin` (the pay page), both before the day and on the day
- `/receipt`

The Design plugin's accessibility-review skill and the UI Design Review skills were not available in this session.

**Severity.**

- **Blocks booking:** a golfer using a screen reader, the keyboard or zoom cannot finish booking or paying.
- **Hard:** they can finish, but with real difficulty, or a WCAG 2.1 AA failure that our audience will feel.
- **Polish:** worth fixing, not before launch.

**Owner.** Golfer owns the golfer pages and `src/components/golfer/**`. Build owns `globals.css`, `src/components/ui/**` and the shared `Footer`.

**What's already good.** Every time tile, date, player and walking/riding button is a real `<button>` with `aria-pressed` and a clear name ("9:00 AM $65 a player 4 spots"). Focus rings show on every button and link through the global `:focus-visible` rule. The agree checkbox's label holds the whole sentence. The pay button says the amount ("Check in · pay $133.00"). Prices always carry their unit ("$65 a player"). Nothing scrolls sideways at 390. The only motion is skeleton shimmer and spinners.

**Counts:** blocks booking 2 · hard 8 · polish 7.

---

## Blocks booking

### B1. Booking errors are silent to a screen reader, and focus stays on the button
- **Page:** `/book` (Your details).
- **Steps:** tick the agree box with the name or email empty (or invalid) and press **Confirm tee time**.
- **What happens:** "Please enter your name and email." appears above the button as a plain `<p>`. It is not announced, and focus stays on the button. The same is true of every server error ("That tee time was just taken", rate limit) and of the card error on a card course. A VoiceOver user presses Confirm and hears nothing at all.
- **Where:** `src/app/book/BookClient.tsx:812` (`{error && <p className="text-bad text-sm">…`). Compare the promo error at `:518`, which does have `role="alert"`.
- **Smallest fix:** add `role="alert"` to the `<p>` at `:812`. Also set `aria-invalid` on the field that's wrong and move focus to it.
- **Owner:** Golfer.

### B2. Pay page errors are silent the same way
- **Page:** `/checkin/[id]` (pay on the day).
- **What happens:** a declined card or a failed check-in shows `{error && <p className="text-bad text-sm mb-4">…` with no announcement. The golfer is told nothing and does not know whether they paid. I could not trigger a real decline because there is no Stripe key here (see Not tested), but the markup is the same as B1.
- **Where:** `src/app/checkin/[bookingId]/page.tsx:364`.
- **Smallest fix:** add `role="alert"`.
- **Owner:** Golfer.

---

## Hard

### H1. The booking and sign-in fields have no label, only a placeholder
- **Pages:** `/book` (Full name, Email, Phone) and `/courses/[slug]/account` (Email or phone).
- **What happens:** the `<label>` elements have no `htmlFor` and the inputs have no `id`, so a screen reader reads the fields as **"John Smith, edit text"**, **"john@example.com, edit text"**, **"(555) 555-5555"** and **"you@example.com"**. Axe does not flag this because a placeholder counts as a name, but the name is wrong. Tapping the visible label also doesn't focus the field. For older golfers the grey "John Smith" also looks like a field that's already filled in.
- **Where:** `src/app/book/BookClient.tsx:764`, `:769`, `:773` (labels) and `:765`, `:770`, `:774` (inputs). `src/app/courses/[slug]/account/AccountPortalClient.tsx:89-92`.
- **Smallest fix:** give each input an `id` and its label a matching `htmlFor` (or wrap the input in the label). Add `autoComplete="name"`, `"email"` and `"tel"`, which helps phones autofill. Optional: drop the example-name placeholders.
- **Owner:** Golfer.

### H2. The text and card fields have almost no visible focus
- **Pages:** `/book`, sign-in, and the pay page card field.
- **What happens:** the inputs use `outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10`. Focused, the border is about **2.3:1** against the page and the ring is pine at 10% opacity. A keyboard user can't tell which field they're in. This fails 1.4.11, which needs 3:1 for the focus indicator.
- **Where:** `src/app/book/BookClient.tsx:147` (`iCls`); the card wrapper at `BookClient.tsx:805` and `src/app/checkin/[bookingId]/page.tsx:151` (`focus-within:ring-pine/10`); `src/components/ui/field.ts:7` (`INPUT_COMPACT`, the promo code).
- **Smallest fix:** change `focus:ring-pine/10` to `focus:ring-pine/60` and `focus:border-pine/40` to `focus:border-pine`, in each place.
- **Owner:** Golfer for `BookClient` and `checkin`; Build for `field.ts`.

### H3. On a phone, the course name sits on the dark green band
- **Page:** the course page, 390 px, any course without a hero photo.
- **What happens:** the logo and the `<h1>` are both pulled up 48 px (`-mt-12`). On a phone the heading sits beside the logo with `pt-0`, so the first line ("Perf Audit") is drawn in dark ink on the accent band at **1.98:1**. It's the first thing a golfer sees. At 200% zoom the same row, with `min-w-[240px]`, also pushes the page 61 px wider than the screen.
- **Where:** `src/components/golfer/CourseFrame.tsx:87` (`min-w-[240px] pt-0 sm:pt-16`).
- **Smallest fix:** `pt-14 sm:pt-16`, and `min-w-0 basis-[240px]` (or `min-w-[min(240px,100%)]`).
- **Owner:** Golfer.

### H4. Focus is dropped on every view change, and nothing announces the new view
- **Pages:** the `/book` confirmation; `/manage` Change time, Change players, Cancel and the "modified" screen; the sign-in "Send me a code" step.
- **What happens:**
  - After **Confirm tee time** succeeds, the page swaps to "You're all set", but focus falls to `<body>` and the tab title still says "Confirm your tee time". A screen-reader user is not told the booking worked. The likely next move is to press Back or book again.
  - The same happens on `/manage`: opening any of the three actions leaves focus on `<body>` (measured at both widths), so a keyboard user starts again from the top of the page.
- **Where:** `src/app/book/BookClient.tsx:243-249` (the confirmed view), and `src/app/manage/[bookingId]/page.tsx` (views at `:341`, `:438`, `:294`, and the cancel confirm after `:560`).
- **Smallest fix:** give each new view's heading `tabIndex={-1}` and a ref, then `focus()` it on mount. On the confirmation, also set `document.title = "Booked — <course>"`.
- **Owner:** Golfer.

### H5. Manage "Back" is an 18×18 icon
- **Page:** `/manage`, the Change time and Change players headers.
- **What happens:** the only way back is an 18 px arrow, below even WCAG 2.2's 24 px minimum. It is also white at 70% on the course colour.
- **Where:** `src/app/manage/[bookingId]/page.tsx:349` and `:438`.
- **Smallest fix:** add `p-3 -m-3` (a 42 px hit area), or a text "Back" button.
- **Owner:** Golfer.

### H6. The party-size stepper reads as "minus" and "plus", and the count isn't announced
- **Page:** `/manage` → Change players.
- **What happens:** the buttons' names are the glyphs "−" and "+". The number between them is a plain `<span>`, so pressing + says nothing about the new count. "Change party size" is plain text, not a heading.
- **Where:** `src/app/manage/[bookingId]/page.tsx:439` and `:445-458`.
- **Smallest fix:**
  - Add `aria-label="Fewer players"` and `aria-label="More players"` to the buttons.
  - Wrap the count in `<span aria-live="polite">` so "3 players" is read out.
  - Make the title an `<h2>`, and do the same for "Choose a new time" at `:350`.
- **Owner:** Golfer.

### H7. Tap targets under 24 px through the flow
- **Pages:** the course page, `/book`, `/manage`, `/checkin`, `/receipt`.
- **What happens:** these targets are shorter than 24 px (sizes at 390 px):

  | Target | Page | Size |
  |---|---|---|
  | "Member? Sign in" | course page | 94×15 |
  | "Get directions" | course page | 93×20 |
  | "Back to tee times" | `/book` | 114×20 |
  | "Back to {course}" | confirmation, `/checkin`, `/manage`, `/receipt` | ×20 |
  | Footer links: support email, Privacy, Terms | all pages | ×16 |
  | "Terms of Service" and "Privacy Policy" inside the agree sentence | `/book` | ×16 |

  The agree checkbox itself is 16 px, but its whole label is clickable, so that one is fine.
- **Where:** `src/app/courses/[slug]/CourseBookingClient.tsx:1422`; `src/app/book/BookClient.tsx:419`, `:329`; `src/components/Footer.tsx:24-25`.
- **Smallest fix:** add `inline-block py-2` (or `min-h-[44px] inline-flex items-center`) to these links. On the footer, `py-2` on each link.
- **Owner:** Golfer for the pages; Build for `Footer.tsx`.

### H8. Two text colour tokens sit just under 4.5:1
- **Pages:** every page.
- **What happens:** axe flags these at both widths:

  | Token | Where it shows | Background | Ratio |
  |---|---|---|---|
  | `--color-ink-faint` `#70756F` | footer, "Member? Sign in" | paper `#FAFAF7` | **4.49:1** |
  | `--color-ink-muted` `#6B706A` | weekday on the selected date | `#EDF1EF` | **4.43:1** |
  | `--color-ink-muted` `#6B706A` | "4 spots" on the selected time | `#E9ECE8` | **4.24:1** |
  | `#6E6D64` | the "Add cart" toggle | `#F0EDE2` | **4.44:1** |

  This text is all 12 px, which is the hardest size for this audience. The comment at `globals.css:15` says ink-faint is 4.5:1; it rounds to 4.49.
- **Where:** `src/app/globals.css:14-15` and `:199`. The Add cart colour is hard-coded at `src/app/book/BookClient.tsx:454` and the range-ball buttons at `:472`.
- **Smallest fix:** set `--color-ink-muted` to `#62675F` (≥4.86:1 on all three backgrounds) and `--color-ink-faint` to `#6B706A` (4.84:1 on paper). Both tokens are also used by the dashboard Light look, so check `scripts/glass-test.ts`. Golfer: change `#6E6D64` to `#626158` at `BookClient.tsx:454` and `:472`.
- **Owner:** Build for the tokens; Golfer for `BookClient`.

---

## Polish

### P1. On a phone, "Continue to Book" comes after every tee time in the tab order
- **Page:** the course page, 390 px.
- **What happens:** the phone bar is rendered at the end of the list, so a keyboard user who picks 7:00 AM tabs through up to 29 more times to reach Continue. Picking a time also isn't announced (the bar appears silently).
- **Where:** `src/app/courses/[slug]/CourseBookingClient.tsx:786`.
- **Smallest fix:** add `role="region" aria-label="Your booking" aria-live="polite"` to the bar. Optionally move focus to Continue after a pick on a phone.
- **Owner:** Golfer.

### P2. Toggles on `/book` don't say whether they're on
- **Page:** `/book`.
- **What happens:** "Add cart"/"Added" and the range-ball size buttons change their label and colour but have no `aria-pressed`, unlike the course page. The Add cart button is also 28 px tall.
- **Where:** `src/app/book/BookClient.tsx:450`, `:467`.
- **Smallest fix:** add `aria-pressed`, and `py-2.5` on Add cart.
- **Owner:** Golfer.

### P3. Sub-44 px controls on the course page
- **Page:** the course page.
- **What happens:** players 1–4 and Walking/Riding are 36 px tall, "Set alert" is 30, the header "Sign in" is 28, and "More dates" is 38. These pass WCAG AA but are small for older thumbs.
- **Where:** `src/app/courses/[slug]/CourseBookingClient.tsx:1106` (`py-2`), the Walking/Riding buttons at `:1134`, and Set alert at `:1180`.
- **Smallest fix:** `py-2.5` or `min-h-[44px]`.
- **Owner:** Golfer.

### P4. Change-time slot names run together
- **Page:** `/manage` → Change time.
- **What happens:** read aloud as "7:00 AM18 holes · 4 spots left $130.00". There's no space before "18", and nothing says the $130.00 is the new total.
- **Where:** `src/app/manage/[bookingId]/page.tsx:364-380`.
- **Smallest fix:** add `aria-label={\`${time}, ${holes} holes, ${spots} spots left, total $${amount}\`}` to each slot button.
- **Owner:** Golfer.

### P5. Loading states are silent
- **Pages:** `/book` before it loads; the tee-time skeletons on the course page.
- **What happens:** the spinner (`Loader2`) and the skeleton have no text or `aria-busy`. The skeleton's `animate-pulse` also runs for people who asked for reduced motion.
- **Where:** `src/app/book/BookClient.tsx:339`; `src/app/courses/[slug]/CourseBookingClient.tsx:563`, `:1257`.
- **Smallest fix:** add `role="status"` with a visually hidden "Loading tee times", and `motion-safe:animate-pulse`.
- **Owner:** Golfer.

### P6. Date buttons don't say the month
- **Page:** the course page.
- **What happens:** they read as "Today 16" and "Tue 17". At a month boundary, "Mon 1" is ambiguous.
- **Where:** `src/app/courses/[slug]/CourseBookingClient.tsx:1022` group.
- **Smallest fix:** add `aria-label="Tuesday, November 17"` to each.
- **Owner:** Golfer.

### P7. Receipt "Print / Save as PDF" is 38 px tall
- **Page:** `/receipt`.
- **Where:** `src/app/receipt/[bookingId]/page.tsx:155`.
- **Smallest fix:** `py-3`.
- **Owner:** Golfer.

---

## Checked and fine

- **Time and price read clearly** at both widths and at 200%:
  - "9:00 AM", "$65 a player"
  - a two-line summary: "You'll pay at check-in $133.00 / Charged today $0.00"
  - the pay button carries the amount
  - the manage, pay and receipt breakdowns match ($130 + $3 = $133)
- **200% zoom:** `/book`, `/manage`, `/checkin` and `/receipt` reflow with no sideways scroll. The course page overflows (H3).
- **Motion:** no parallax, no auto-scroll, and no framer-motion on golfer pages. The skeleton pulse is P5.
- **Keyboard:** every control on every step can be reached and pressed. The issues are lost focus (H4), weak input focus (H2) and tab order (P1), not traps.

## Not tested

- **Card entry and Apple/Google Pay.** There is no Stripe key here, so the card field never loaded and the pay button stayed disabled. The Stripe iframe brings its own labels. Our side is only the wrapper's focus ring (H2) and the error (B2).
- **A paid receipt.** The receipt was checked in its "Due at course" state only.
- **The member path, a signed-in golfer booking, and the code-entry step of sign-in.** No SMS or email provider here.
- **A real screen reader.** VoiceOver and TalkBack were not run; this pass used the accessibility tree and axe. One VoiceOver run on an iPhone over B1, H1 and H4 before launch would confirm them.
- **The dashboard Light look**, for the effect of the H8 token change.

Cost: Testing lane alone, no sub-agents · M
