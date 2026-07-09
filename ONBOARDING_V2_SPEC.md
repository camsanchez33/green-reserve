# Onboarding V2 Spec — from Cam's full test run (inquiry → sheet → wizard → live)

Source: Cam ran the whole funnel as a fake course (2026-07-08) and found the gaps.
Theme: answers given ONCE at inquiry must drive everything downstream (sheet
questions, wizard prefill), the admin must be able to fix human errors, and the
details sheet must gather enough real course detail that building the course is
mechanical.

**Constraint: NO schema migrations in any phase.** All new answers go into the
existing JSON fields (needsJson / the details sheet's JSON). If something truly
needs a column, STOP and leave a note in RUN_QUEUE.md instead.

Messaging rule used throughout the sheet: every pricing/config question carries a
short reassurance — "You can change this anytime after launch." Courses stall when
they think an answer is permanent.

---

## Phase V1 — Admin inquiry fixes (small, no migration)

1. **Editable contact info.** On the inquiry detail panel (src/app/admin/inquiries),
   contact name / email / phone / course name / city / state get an Edit affordance
   (pencil icon → inline inputs → Save). PATCH via the existing admin inquiries
   route. Use case: "someone emails saying their phone number is wrong."
   Log the change in the inquiry's status timeline ("Contact updated by admin").
2. **Stop showing empty detail boxes.** The DETAILS grid currently renders every
   box even when the value is "—" (tee times/day, green fees, website, booking
   method are usually empty at inquiry stage since the short form doesn't ask).
   Render ONLY fields that have values. If everything in a section is empty, hide
   the section.
3. **Tabbed detail panel.** Split the panel into tabs: **Contact** (editable),
   **Answers** (branch answers + anything-we-should-know), **Sheet** (submitted
   details sheet, once it exists), **Activity** (status timeline + messages).
   Keeps the panel flippable/searchable instead of one long scroll.

## Phase V2 — Emails (small, no migration)

1. **Applicant confirmation email** (sent on inquiry submit): keep the 3-step
   structure but rewrite copy to feel like a person, not a system: address the
   contact by first name, name their course, state the actual reply window, sign
   from hello@greenreserve.app. Include their submitted answers at the bottom
   ("What you told us") so they have a record.
2. **Details-sheet follow-up email**: when a course submits the details sheet,
   they currently get nothing. Send "We got your details — here's what you told
   us" with ALL their sheet answers rendered in the email, plus "reply to this
   email to correct anything." (Also notifies admin already — keep that.)
3. Both use baseTemplate + email conventions from CLAUDE.md.

## Phase V3 — Details sheet v2: branch-driven + deep (big, no migration)

The sheet (src/app/for-courses/details) must be driven by the inquiry's branch
answers (needsJson) and go much deeper. Sections appear ONLY when relevant —
depth without length. Save-as-you-go and mobile-first behavior stay.

### Branching (inquiry answer → sheet section)
- Resident rates = Yes → **Resident pricing** section: which residents qualify
  (town / county / city — free text + examples), verification requirement
  (ID, utility bill, resident card…), cost to obtain verification if any,
  resident weekday/weekend/twilight rates.
- Memberships/season passes = Yes → **Memberships** section: tier names, annual
  cost each, what each includes, do members pay per round? (if yes: how much /
  cart included?), season pass vs membership distinction if both.
- Private type → **Access** section: do they allow non-member tee times (when /
  how many / rate)? outings & tournaments (do they host, typical size, contact)?
  member per-round charges?
- Public type without memberships → membership section hidden entirely.

### Deeper course detail (all courses)
- **Playability:** can golfers book 9 holes? front nine / back nine / both?
  separate 9-hole rate? par per nine.
- **Tee sets & yardages:** for each tee set (name/color): total yardage, par,
  rating/slope if known. Repeatable rows, add/remove. (Feeds TeeSet at build.)
- **Green fees:** weekday/weekend/twilight (+ 9-hole if enabled above), cart fee,
  walking policy — each with the "changeable anytime" reassurance.
- **Cancellation policy:** short plain-English explainer of HOW it works on
  GreenReserve (card saved not charged; free cancel before window; fee after;
  fee refunded at check-in) THEN ask for their window (hours) and fee. They
  should understand the machine before they configure it.
- **Facilities (rebuild — current version is too thin):** structured checklist
  with per-item detail where it matters: driving range (grass/mats, lights?),
  putting/chipping green, pro shop, lessons/pros, club & cart rental, food —
  restaurant / bar / snack bar / beverage cart, event space, locker rooms.
  Each checked item can take a one-line note.
- **About + photos:** description (existing) + photo upload (reuse the Vercel
  Blob upload built in GOLFER_SPEC G1 for operator photos) — up to ~6: hero,
  clubhouse, signature holes. Store blob URLs in the sheet JSON.

### Phase V3b — Playability must follow the hole count (small, no migration)
The Playability section currently assumes an 18-hole course (front/back nine)
regardless of what was answered in Course basics. Make it conditional on the
NUMBER OF HOLES answer:
- **9 holes** → skip "can golfers book 9?" entirely (it IS a 9-hole course).
  Instead ask: can golfers replay for 18 (and is there an 18-hole rate)?
- **18 holes** → current behavior: book 9? which nine (front / back / either)?
  9-hole par + rate.
- **27 holes** → first ask the LAYOUT: "three 9s" or "an 18 plus a separate 9".
  - Three 9s → name each nine (e.g. North/South/West), which combos are played
    as 18, can each nine be booked alone, par per nine.
  - 18 + 9 → treat the 18 like an 18-hole course (front/back questions) and ask
    about the separate 9 (name, par, bookable alone?, rate).
- **36 holes** → ask layout: "two 18s" (name each course) or other; per-18
  front/back questions apply to each.
Par should also stop being a single number where layout makes that wrong —
capture par per nine / per course as the layout dictates.

**Tee sets follow the layout too.** The Tee sets & yardages step currently
captures one total yardage per tee — wrong for anything but a single 18. Per
tee set, capture yardage (and par if it differs) PER NINE as dictated by the
layout answers (e.g. three 9s → Blue tees: North 3,250 / South 3,180 / West
3,090). For 18-hole courses keep it simple: total yardage, with optional
front/back split. Rating/slope stay optional and apply per 18 (or per named
combo) — label them so courses know which 18 they describe.

More structure per tee set (all optional beyond name + yardage):
- Designation dropdown: championship / back / middle / forward / senior /
  junior / combo
- Men's and women's par + rating/slope separately (USGA rates them
  differently) — collapsed behind an "add women's ratings" toggle so the
  common case stays two fields
- A one-line note field per tee (e.g. "combo of Blue front, White back")
NOTE: this phase only fixes what the SHEET captures (and what V4 drafts from
it). Actual tee-sheet support for rotating nines (A+B / B+C combos as separate
booking sheets) is a future feature — if the layout answers reveal a course
needs it, that lands in the ready-to-build notes for admin, not in this run.

### Phase V3c — Sheet refinements from Cam's full walkthrough (small/medium, no migration)
Running list from Cam testing the V3 sheet end to end:

1. **BUG — resident rate validation:** step 6 shows "Please enter resident
   weekday rate" even when the field is filled (e.g. $30 entered, error still
   fires). Likely the number input's state or parsing ("$ 30" vs 30). Find and
   fix; audit the other money fields on the sheet for the same bug.
2. **Merge Resident pricing + Memberships into ONE step: "Memberships &
   passes".** A resident card is often just another tier, and courses can have
   both. Unified tier list; each tier has:
   - Type: membership / season pass / resident card / punch card
   - Name, annual (or per-term) fee, what's included
   - Do holders pay a green fee per round? (yes → how much)
   - If type = resident card: who qualifies (town/county/etc.) + verification
     (see #3)
   The old standalone resident-rates fields (resident weekday/weekend/twilight
   rates without a card) remain possible: a "resident rates without a
   card/pass" option inside the same step. Branching from the inquiry answers
   still applies (section hidden if both inquiry answers were No).
3. **Residency verification detail:** for resident tiers/rates, ask HOW the
   resident credential works: automatic/free (just show ID at the counter) OR
   purchased (they buy a resident card) → if purchased: cost, where/how they
   buy it, how often it renews.
4. **Cancellation: explicit "no policy" choice.** The step currently implies a
   window is mandatory ("leave blank for no fee" is easy to miss). Lead with a
   clear question: "Do you charge for late cancellations / no-shows?" —
   **No** → skip window + fee entirely, note shown: "Golfers book without
   entering a card and pay at the course." (maps to the existing no-card flow).
   **Yes** → window (hours) + fee as today. The explainer box adapts to the
   answer instead of always describing the card-on-file flow.

5. **Facilities step — exact structure (replaces the current thin checklist):**
   - Driving range: yes/no → bucket sizes offered with price AND ball count
     each (e.g. Small $6 / 35 balls; repeatable rows), grass or mats
   - Putting green: yes/no
   - Chipping / short-game area: yes/no
   - Pro shop: yes/no
   - Lessons: yes/no → pro's name + contact number
   - Club rental: yes/no → contact number OR "come into pro shop" option
   - Push/pull cart rental: yes/no → cost
   - Bag storage: yes/no — ONLY shown for private-type courses
   - GPS on carts: yes/no
   - Caddies: OMIT for now (Cam: too complex, deliberately deferred — do not
     add a caddie question)
   - Event / banquet space: yes/no → contact number for interested parties
   - Locker rooms: yes/no
   - Hosts tournaments & outings: yes/no → if yes, how often (e.g. weekly /
     monthly / a few per season)
   - Food & drink items from V3 (restaurant/bar/snack bar/bev cart) stay

### Phase V4 — One-click draft build from the sheet (medium, no migration)
REPLACES the old "wizard prefill parity" plan. Cam's ruling: the wizard is an
IN-PERSON tool only (admin sitting with a course). The normal pipeline must not
route through it.

1. **New flow:** on an inquiry with a submitted details sheet, the build action
   becomes **"Create draft course"** — one click, server-side: create the Course
   (liveStatus='draft', active=false) fully populated from the sheet JSON +
   inquiry data (basics, schedule, fees, resident rates, membership tier(s),
   tee sets/yardages, facilities, about, photos, cancellation policy). Then
   redirect admin to the existing /admin/courses/[id] detail page to review and
   edit BEFORE anything is sent to the course. Nothing goes live and no email
   fires on draft creation.
2. Missing sheet fields → sensible defaults + a "Needs review" note listed on
   the course detail page (e.g. "No twilight rate provided"). Draft creation
   must never fail because a field is blank.
3. The existing go-live step (welcome email, O4) stays where it is — after
   admin review, unchanged.
4. **Fix the broken build entry point:** the build/wizard action reachable from
   the admin courses/inquiries UI currently errors out ("bugs out") when
   clicked from the course row. Trace that click path, find the bug, and fix
   it as part of rewiring these buttons: inquiry with sheet → "Create draft
   course"; wizard remains reachable only from a separate, clearly-labeled
   "Manual build (in person)" link.
5. Wizard itself: leave functionally untouched.

### Ground rules
- No migrations; JSON fields only. No new packages. Clubhouse design system.
- The sheet's est. completion time will grow — update the confirmation email's
  "takes about 5 minutes" copy to match reality (say 10–15 minutes, savable).
- Validate changed .tsx with @babel/parser; update RUN_QUEUE.md per phase.
