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

### Phase V4 — Wizard prefill parity (medium, no migration)
Every new V3 field must flow into the build wizard prefill (the O3 handoff):
tee sets/yardages prefill the TeeSet step, 9-hole answers prefill pricing
options, resident/membership sections prefill their steps, photos carry over,
facilities prefill the facilities step. Rule: if the course typed it in the
sheet, admin never retypes it in the wizard. Update the ready-to-build
checklist to reflect the richer sheet.

### Ground rules
- No migrations; JSON fields only. No new packages. Clubhouse design system.
- The sheet's est. completion time will grow — update the confirmation email's
  "takes about 5 minutes" copy to match reality (say 10–15 minutes, savable).
- Validate changed .tsx with @babel/parser; update RUN_QUEUE.md per phase.
