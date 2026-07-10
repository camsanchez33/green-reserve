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

### Phase V5 — Inquiry full page, kill the drawer (medium, no migration)
Cam's ruling after seeing V1 deployed: the side panel is cramped — everything
stacks on top of everything. Replace it with a real page per inquiry, modeled
on /admin/courses/[id].

- **New route: /admin/inquiries/[id]».** Clicking a list row navigates there
  (no more drawer). Back link to the list preserving active filters.
- **Page layout, not a stack:**
  - Header row: course name, StatusDot + stage, city/state, days-in-stage.
  - Right side of header: the actions as a compact toolbar (Move stage,
    Send/Resend sheet, Reject, Build) — actions live in ONE place, never
    interleaved with content.
  - Below: the tabs as real page-width sections — Contact (editable, from V1),
    Answers, Sheet, Activity. Full width means Sheet answers can render in a
    readable two-column grid instead of a squeezed column.
- The V1 work (tabs, editable contact, hidden empty fields) carries over —
  this phase re-houses it, don't rebuild it.
- The setup-sheet link box, "sheet sent" status, and build box fold into the
  relevant tabs/toolbar instead of stacking above everything.
- Delete the drawer code once the page exists.

**Sheet tab must be HUMAN-readable, not raw JSON keys.** Currently renders
`NINEREPLAY: no`, `LAYOUT27: three_9s`, `NINE27NAMES: , ,` — unusable for the
person deciding how to build a client's course. Requirements:
- One label map + value map for every sheet field: `nineHoleWhich` → "Which
  nines can be booked", `three_9s` → "Three 9s", etc. Never show a camelCase/
  UPPERCASE key or a raw enum to the admin.
- Group into the sheet's own sections with headings: Course basics,
  Playability, Tee sheet, Green fees, Memberships & passes, Cancellation,
  Facilities, About. Two-column grid within sections.
- **Render only coherent answers**: filter by the final holes/layout answer —
  an 18-hole course never shows layout27/layout36 leftovers; hide keys from
  branches the course toggled away from. (Render-side filtering; don't mutate
  the stored JSON.)
- Empty-but-relevant answers (e.g. nine names left blank) render as an
  amber "not provided" — these are exactly the gaps V4 turns into build notes.

**"Next steps" card (top of page, above tabs).** Stage-driven: tells the admin
exactly where this client is and the one action to take:
- pending/in_review → "Review answers → send the setup sheet" (button)
- details_requested → "Waiting on the course — sent X days ago" (resend)
- details_submitted → "Review the Sheet tab, then create the draft course" (button)
- building/draft exists → "Review the draft course → go live" (link to course)
- live → "Live since {date}" (link to course + public page)
Same buttons as the toolbar — the card just makes the current one obvious.

### Phase V6 — Inquiries LIST: one clean tab system (small/medium, no migration)
The list currently stacks two control systems: Active/Archived tabs PLUS a row
of stage filter chips ("Your move", "New", …). Cam: mumbo-jumbo, clunky.
Replace both with ONE tab bar.

- Single underline-style tab bar (same pattern as the detail page tabs):
  **Your move · New · In review · Waiting on them · Building · All · Archived**
  — each with a count badge. No chip row, no second system.
- Under the tab bar, one line of muted description text for the ACTIVE tab:
  - Your move: "Inquiries that need your action next."
  - New: "Just submitted — not yet reviewed."
  - In review: "You're evaluating these."
  - Waiting on them: "Setup sheet sent — waiting on the course."
  - Building: "Draft created — being built/reviewed before go-live."
  - All: "Every active inquiry, all stages."
  - Archived: "Rejected or closed — kept for records."
- Search and sort stay, applied within the selected tab.
- Selected tab lives in the URL (?tab=your-move) so the detail page's back
  link (V5) restores it, and refresh doesn't reset it.
- Rows: keep the current data but align columns consistently (name/location,
  contact, stage + days-in-stage, date) — no layout changes beyond cleanup.

### Phase V7 — Multi-nine courses: par, combos, and ratings done right (medium, no migration)
From Cam's retest. When a course isn't a single 18, "overall par" and single
ratings stop making sense. Fix the data model the sheet collects:

1. **Course basics par adapts to hole count.** 18 holes → overall par as today
   (optional front/back split). 27/36 holes → REMOVE the overall-par field from
   basics; show muted note "Par is set per nine in Playability." Never ask for
   a single par on a multi-nine course.
2. **Structured combo builder (replaces the free-text combos field).** For
   three 9s: after naming the nines, show the three possible pairings
   (North+South, South+West, North+West) as toggles — course turns ON the ones
   actually played as 18. Optional note per combo (e.g. "mornings only").
   For 36 (two 18s or four 9s): same pattern, pairings generated from layout.
   Par per nine is asked here (one small field per named nine).
3. **Per-combo ratings & yardages in the tee-set step.** For each tee set:
   - Yardage per NINE (as V3b specced — verify it works)
   - Combo yardages auto-computed (sum of the two nines) and shown per active
     combo — editable override if the course says different
   - Rating/slope (optional) entered PER ACTIVE COMBO per tee set, labeled
     with the combo name ("Blue — North+South: 71.4 / 128")
   Keep it collapsible so a simple 18-hole course never sees any of this.
4. Everything flows through: sheet JSON → V5 Sheet tab renders combos
   readably → V4 draft build stores per-nine/per-combo data in build notes +
   TeeSet rows where the model allows (no schema change — anything that
   doesn't fit TeeSet goes in build notes for the admin).

### Phase V8 — Memberships & passes step refinements (small, no migration)
From Cam's retest of the merged step:

1. **BUG: tier FEE input rejects typing** — the small "$" fee field on a tier
   row won't accept input at all. Same money-input disease as the V3c resident
   bug; fix it AND write down what the root cause was in the commit message so
   we stop reintroducing it. Re-audit every money input on the sheet.
2. **Type dropdown gets "Other"** → reveals a free-text "what is it?" field.
3. **Member per-round pricing built out.** "Do members pay per round → $25"
   is too thin. When yes:
   - Is it a DISCOUNTED GREEN FEE or a SEPARATE FEE on top? (two-option toggle)
   - Weekday rate + Weekend rate (weekend often costs more) + optional twilight
   - Cart included or extra?
   All per tier, collapsed until per-round = yes.
4. **BUG: fee displays as garbage** — a tier renders "Fee: $32110.01 / annual"
   for a value that was never entered as that. Almost certainly a cents↔dollars
   round-trip bug (stored in cents, rendered as cents-with-decimal, or the
   broken input saving raw keystrokes). Fix the full round trip and add a
   sanity test: enter $1,200 → sheet JSON → Sheet tab → draft build all show
   $1,200.00.
5. **Pro shop captures a phone number** (used as the default contact for
   rental/lessons follow-ups).
6. **Club rental "how to arrange" allows BOTH** — "come into pro shop" and
   "call ahead" are not mutually exclusive; make it multi-select (checkboxes,
   not a dropdown) + phone number field when "call ahead" is checked
   (prefilled from the pro shop number if given).

### Phase V9 — Draft build: operator reuse + real error UI (small, no migration)
1. **Existing operator must never block a draft build.** create_draft_course
   currently fails with "operator account already exists for this email."
   Correct behavior: look up CourseOperator by email — if found, ATTACH the new
   draft course to that operator (multi-course operators are a feature, and
   deleted courses leave operators behind). Only create a new operator when
   none exists. Add a line to the build result ("Attached to existing operator
   account") so admin knows.
2. **Course deletion hygiene:** when a course is deleted and its operator has
   no other courses, surface that in admin (the operator row shows "no
   courses") rather than silently stranding records. Do NOT auto-delete
   operators (they may have Stripe accounts).
1b. **(follow-up after V9 shipped)** The existing-course guard is too blunt:
   it blocks whenever the operator has ANY course. Correct behavior:
   - Operator has a course with a DIFFERENT name → no block at all; attach the
     new course (multi-course operator).
   - Same name (case-insensitive) but ARCHIVED → no block; create fresh.
   - Same name and ACTIVE → banner with two inline actions: "View existing
     course" (link) and "Create anyway" (proceeds with a -2 slug suffix).
   Never a dead-end.
3. **Kill the browser alert().** Admin actions (this page and the inquiries
   list) show errors/successes as inline Clubhouse-styled banners near the
   action button, not window.alert dialogs. Audit /admin/inquiries* for other
   alert()/confirm() calls — confirm() for destructive actions may stay for
   now, alert() goes.

### Phase V10 — Draft preview: send the page to the course BEFORE go-live (medium, no migration)
Cam's ruling: there must be a review loop — admin sends the draft page to the
course, they talk it over, changes get made, THEN go-live. The course's first
sight of their page must not be the live launch.

1. **Token-gated preview URL** — /preview/[courseId]?token=... renders the
   course's PUBLIC page exactly as it will look (photos, rates, tee sheet with
   generated times) with a slim banner: "Preview of your GreenReserve page —
   not live yet. Booking is disabled. Reply to our email with any changes."
   - Token: STATELESS — sign { courseId, purpose: 'preview' } with the
     existing JWT secret (jose, already a dependency), 30-day expiry. No
     schema change, no new column.
   - Works for draft/inactive courses (bypasses the live-only check WHEN the
     token is valid). Booking flow visible but confirm blocked client+server
     (reuse the Phase E demo-intercept pattern). noindex.
2. **"Send preview" action** — on the inquiry page (Building stage) and the
   draft course detail header. Sends an email to the inquiry contact:
   "Your page is ready for a look" + preview button + "reply to this email
   with anything you want changed" (reply-to: hello@greenreserve.app). Can be
   re-sent after edits ("Send updated preview") — each send logged to the
   inquiry status timeline ("Preview sent by Cam").
3. **Next-step card update** for Building stage: primary action becomes
   "Send preview to course"; once at least one preview was sent (timeline
   check), primary becomes "Go Live", with "Re-send preview" secondary.
4. Email follows baseTemplate conventions; no email fires automatically —
   only on the button.

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
