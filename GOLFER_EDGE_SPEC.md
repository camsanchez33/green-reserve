# Golfer Edge Spec — speed, taps, and trust as measurable features

The pitch is "free for courses" — but the retention story is the golfer
experience. This spec turns performance, ease, and trust from vibes into
numbers we enforce. No new features; sharpen what exists.

No schema changes in any phase. Unattended OK.

---

## Phase E1 — Speed alarm (medium)

1. `scripts/perf-audit.ts`: runs Lighthouse (or equivalent, e.g.
   `lighthouse` npm CLI in CI) against the golfer-facing pages on the
   PRODUCTION build with mobile emulation + slow-4G throttling:
   - `/` (home), `/courses`, a course page, the booking flow page, `/receipt`
     sample, `/manage` sample
2. Budgets (fail = nonzero exit):
   - Performance score ≥ 85 per page
   - LCP ≤ 2.5s, TBT ≤ 300ms, CLS ≤ 0.1
3. Wire into GitHub Actions on PRs (like schema-check.yml) against the Vercel
   preview URL. Red X on the PR if a budget fails, with the numbers printed.
4. First run WILL find problems — fix the worst offenders in this phase
   (common Next.js wins: image sizing/next-image, font loading, client JS on
   server-renderable pages, unneeded client components in the golfer flow).
5. Document budgets + how to run locally in CLAUDE.md (short section).

## Phase E2 — Tap budget on the booking flow (medium)

Target: **course page → confirmed tee time in ≤4 taps** for a returning
golfer (returning = has the 90-day gr_golfer session), ≤6 for a first-timer
excluding typing.

1. First: WALK the current flow and write the actual tap count into the PR
   description (before/after). Count every tap: filters, slot, players,
   holes, cart, form fields focus not counted, buttons counted.
2. Known reductions to evaluate (implement the ones that hold up):
   - Slot card → booking: carry date/players/holes context so it's never
     re-asked on the booking page
   - Returning golfer: name/email/phone prefilled from session → skip
     straight to review + confirm
   - No-fee courses: no card step at all (exists — verify zero extra taps)
   - Smart defaults: 18 holes, 2 players (most common) preselected
   - Kill any interstitial that only has one meaningful action
3. Hard rule kept: NO account creation required anywhere in the golfer
   booking path. Guard with a comment + test if possible.

## Phase E3 — Trust copy at the hesitation points (small)

Three messages, placed at the three moments golfers hesitate:
1. **Slot pick** (tee sheet, near price): "Green fees go 100% to the course."
2. **Card entry** (directly above/beside the card element): "Nothing is
   charged now — you pay at the course when you check in." (Cancellation
   terms one line below, as configured.)
3. **Confirm button** (final review): itemized total (R1 work) + "No charge
   until check-in" restated on/near the button.
Copy is short, ink-soft, never a modal or tooltip. One shared component so
wording stays consistent. Audit for contradictory leftovers ("pay now",
"order", etc.).

### Ground rules
- No schema changes, no new heavy dependencies in the app itself
  (lighthouse lives in devDependencies/CI only).
- Clubhouse design system on all golfer-visible changes.
- Validate changed .tsx parses; update RUN_QUEUE.md per phase.
