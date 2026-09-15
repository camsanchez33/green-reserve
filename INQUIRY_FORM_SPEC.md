# Inquiry Form Spec — what we actually need when a course first inquires

Source: Cam, 2026-09-15. "What do we really need to know and have on there when a
course first inquires?"

The discovery call changed the answer. Every question the form asks that the call
also asks is a question you pay for twice: once in form abandonment, once in a
dropdown answer you re-ask on the phone anyway. The form's only jobs now are

1. let you reach them,
2. tell you which course this is and roughly what shape it is,
3. give you the one fact that changes how you open the call,
4. hand them straight to picking a call time.

Everything else moved to `CALL_SCHEDULING_SPEC.md` and the agenda in
`src/lib/inquiry-call.ts`.

Decisions (Cam, AskUserQuestion 2026-09-15): keep "how do you take bookings today."

Assumptions (flagged):
- F1. Removing the branch questions does NOT remove them from the record — they
  simply stop being asked. `needsJson` stays on the model, old inquiries keep
  their answers, and every reader must already tolerate an empty object (it
  already does: `needsJson String @default("")`).
- F2. The call-time preference is optional. A course that skips it still gets the
  booking link; the preference only pre-filters which slots are shown first.
- F3. No migration. `bookingToday` lands in the existing
  `CourseInquiry.currentBookingMethod` column, which the form has never written.

---

## Phase IF-1 — The form (small, no migration)

`src/app/for-courses/ForCoursesContent.tsx` + `POST /api/inquiries`.

### 1. The fields, in order

| field | control | required | stored |
|---|---|---|---|
| First name · Last name | two inputs | yes | `firstName`, `lastName` |
| Your title | select: General Manager · Head Professional · Owner · Superintendent · Other (+free text) | yes | `contactTitle` |
| Email | input | yes, validated | `email` |
| Phone | input | yes | `phone` |
| Course name | input | yes | `courseName` |
| Town · State | input + select | yes | `city`, `state` |
| Course type | segmented: Public · Semi-private · Private | yes | `courseType` |
| **How do you take tee times today?** | select: Phone and a paper sheet · Phone and a spreadsheet · GolfNow or a similar site · Our own website · Something else | yes | **`currentBookingMethod`** (new use of an existing column) |
| When's good for a 20-minute call? | two chip rows, multi-select, optional: **Mornings · Afternoons · Evenings** and **Weekdays · Weekends** | no | `needsJson.callPreference = { times: [], days: [] }` |
| Anything we should know? | textarea | no | `additionalNotes` |

Ten inputs, eight required. The honeypot (`_website`) stays exactly as is.

### 2. What comes out

Delete from the form and from the `needs` object built in `submit()`:
`residentRates`, `hasMemberships`, `roundsPerMonth`, `publicTeeTimes`,
`memberCount`, `outsideOutings`, `memberBookingToday`, `chargesMembersPerRound`
— and the whole `courseType` branch that renders them. All eight are agenda items
on the discovery call, where they get a real answer instead of a guess.

If a visible "Website" input exists, remove it too (verify first — `_website` is
the honeypot and must NOT be touched). The `website` column stays on the model,
filled later from the details sheet.

### 3. Success screen and confirmation email

Both change from "we'll be in touch" to "pick a time." The success screen's
three-step explainer becomes:

> **Thanks — check your email.**
> We've sent [email] a link to pick a 20-minute call. On it we'll go through your
> green fees, your tee sheet, and what going live looks like. Most courses are
> live within a week of that call.

The applicant confirmation email (V2 item 1) keeps its shape but its primary
button becomes **Pick a call time** pointing at the invite link from
`CALL_SCHEDULING_SPEC` SC-2. If that link cannot be generated for any reason, the
email falls back to today's copy and the admin alert says so — an inquiry is never
lost because the scheduler failed.

### 4. Downstream: three things that read the answers we're deleting

**(a) The agenda.** `inquiry-call.ts` pre-checks any item whose `answered()`
returns null. With the branch questions gone, `resident_member` is always open —
correct, that is the point. Change `booking_today` to `always: true` and have its
row show the form's answer as context ("They said: GolfNow or a similar site") so
it reads as *confirm and dig*, not *ask*.

**(b) The details sheet — the real risk.** `for-courses/details` branches its
sections off the inquiry's answers (ONBOARDING_V2 V3). With `needs` empty it will
either show everything or show nothing. Fix, in this phase, in this order:
1. branch off the **call answers** (`Call.answersJson` of the latest `talked`
   call) when they exist — IC-2 §5 already passes them to this page as hints;
2. otherwise ask the branching question inline at the top of the section
   ("Do town residents get a different rate?" → reveals the resident block);
3. never silently hide a section because an answer is missing.
Acceptance for (b) is its own walk: open a details sheet for an inquiry with no
`needs` and no call, and confirm every section is reachable.

**(c) The admin Answers tab** already hides empty fields (V1 item 2) — verify it
renders cleanly with an empty `needs` rather than an empty box.

### 5. Verify

Submit the form as a public course with each of the three course types: three
inquiries, each with `currentBookingMethod` set, `needsJson.callPreference`
present when chosen and absent when skipped, and no dead branch questions
anywhere. Then open each in admin: the agenda pre-checks the eight moved items,
`booking_today` shows the form's answer as context, the Answers tab is clean, and
the details sheet is fully reachable.

---

## Not in this spec
- The booking link, availability and emails — `CALL_SCHEDULING_SPEC.md`.
- Any change to the details sheet's own questions (only its branching).
- Removing `needsJson` from the model. Old records keep their answers.
