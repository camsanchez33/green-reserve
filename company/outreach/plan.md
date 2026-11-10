# Outreach plan — starts Mon Nov 30, 2026

## The honest starting position

GreenReserve has no live course yet. Every course on it today is test data, cleared by the launch wipe
before Dec 1. So the first pitch is not "join the courses already on it" — it is "be the first course,
set up by the founder himself, live for opening day." That is a real advantage with a small course
(they get Cam's personal attention) and a real weakness with a big one (no references). Pick targets
to match.

The second thing to face: **Nov 30 is the off-season in the Northeast.** Many of the target courses
close mid-November. That cuts both ways:

- For: the GM is not running a busy counter. December to February is when courses change systems,
  because nothing is at stake until the first warm weekend.
- Against: nobody will see real golfers booking for weeks. "Week 4 success" cannot be measured in rounds.

So the goal of the winter push is **signed courses, set up and ready for opening day**, not bookings.
The success numbers below are written for that.

## Who to contact first, and why

Order of priority, highest first:

1. **Town- and village-owned courses (one course, one manager).** A town muni with 9 or 18 holes, a pro
   or manager who runs the counter, and a parks or recreation director above them. Usually still on the
   phone, a basic online tee sheet, or a marketplace that sells their times. "Free" lands hardest here,
   because their budget is a line in a town budget. The decision is one or two people, not a
   committee. Examples in the pilot list: Town of Fallsburg (Tarry Brae, Lochmor), Town of Haverstraw
   (Rotella), Town of Rockland (Twin Village), City of Poughkeepsie area (McCann, College Hill).
2. **Independent daily-fee courses, owner-operated.** The owner answers the phone and signs. Fast yes or
   fast no. Good for references.
3. **County systems with several courses** (Orange County's two, Westchester's six, Bergen County's six).
   This is where the course-group page (`/g/[slug]`: one golfer page for every course in the group, and
   one shared resident list) is a genuine differentiator. But counties buy through procurement, often
   with an existing vendor contract, and move slowly. Treat them as a **relationship to start in
   December for a spring or next-season decision**, not a December close. Lead with one email to the
   golf or parks director asking how they choose a system, not a pitch.
4. **Not yet:** private clubs (member-billing needs we don't cover end to end), resort courses, and any
   course that already runs a full golf POS it likes (foreUP, Lightspeed/Chronogolf, Club Caddie).
   Note them, come back after the first references.

Why the pilot region is the Hudson Valley (Orange, Dutchess, Rockland, Ulster, Sullivan, Putnam,
Westchester) with Bergen County NJ next door: Cam is there (the public phone is an 845 number), so a
course that wants a face-to-face setup can get one, and the first courses can be visited. The first ten
courses should be within a drive. Expand only once a course is live and willing to be a reference.

## How many a day

| Week | New first emails / day | Calls / day | Why |
|---|---|---|---|
| Nov 30 – Dec 4 | 10 | 10 (the same courses, next day) | Slow start: check replies, fix the email, learn which objection comes first |
| Dec 7 onward | 15 | 15 | Steady pace one person can follow up on properly |

Cap it at what Cam can **follow up and demo** himself. Twenty demos booked and ten dropped is worse
than eight booked and eight done. 15 a day is ~75 a week; at a typical 5–10% reply rate that is
4–8 conversations a week, which is about the demo capacity of one founder who is also building.

Send in the morning, Tuesday to Thursday when possible. Call the next day around mid-morning, when
the pro shop is quiet.

## Follow-up timing (internal — never written in course-facing copy)

| Day | Touch |
|---|---|
| 0 | Email 1 |
| 1 | Call (opener, or voicemail) |
| 4 | Email 2 (reply in the same thread) |
| 11 | Email 3, the last one |
| — | Stop. Mark "closed — no reply" and re-check in March, when the season starts |

A reply of any kind takes the course out of the sequence. A "not now" gets a note and a March date;
a "no" gets a thank-you and nothing more. Never email a course that said no.

## Tracking

Keep it in the admin Pipeline, which already has the stages (`pending → in_review → details_requested →
details_submitted → building → live`). A spreadsheet is fine for the "not yet replied" list before a
course becomes an inquiry. A demo booked through `/demo` (Cal.com) opens a pending "Demo booking"
inquiry automatically when it matches no existing one.

Per course, record: date of each touch, who answered, current booking system, the objection raised,
next step and its date.

## What success looks like

**After one week (Dec 4):**
- 50 courses contacted by email and phone, every one logged.
- At least 3 real conversations (a reply or a call that got past the opener).
- At least 1 demo booked or held.
- A written list of the objections heard, in the order heard — that tells us whether email 1 is wrong.

**After four weeks (Dec 25):**
- 250+ courses contacted.
- 10+ demos held.
- 2–3 courses who said yes and are in the Pipeline at `details_requested` or later.
- 1 course fully built (`building` → ready for opening day), with Stripe connected.
- 1 county or course-group conversation open with a named person and a known decision process.

If week one has zero replies, change email 1 before sending more — don't just send more of the same.

## Questions for Cam

1. **The $1.50 and your Nov 9 note ("we don't need to be as transparent with the GreenReserve fees").**
   The outreach says the fee in LQ-2 words, because a GM's first question is "how do you make money",
   and the golfer sees it at booking anyway. *Recommendation:* keep the LQ-2 sentence in outreach; hide
   GreenReserve's take on the course dashboard if you want, not in sales. Hiding it in sales makes "is
   it really free" impossible to answer honestly.
2. **Launch wipe timing vs. demos.** The wipe closes at midnight Dec 1. If it runs after Nov 30, any
   demo course set up for Nov 30 calls disappears. *Recommendation:* run the wipe before Thanksgiving,
   then make "The GreenReserve Test Course" and fill it with a believable week of tee times for demos.
3. **Municipal money.** A course cannot go live without its own connected Stripe account — the go-live
   step refuses, no exceptions. A town or county may not be allowed to open one, or its
   treasurer may need the money in a specific bank account with specific reports. *Recommendation:*
   ask the first two municipal courses directly in the demo, before promising anything; it may decide
   whether municipal courses are first or third.
4. **Moving existing bookings.** There is an import for members and shop items, but none for a course's
   future tee-time bookings from another system. *Recommendation:* say it plainly — we enter them with
   you during setup — and switch over in the winter, when few bookings are on the books.
5. **Phone number in the email signature.** `(845) 499-3515` is already public on `/contact`.
   *Recommendation:* use it — a founder's number is the strongest trust signal we have.
6. **Where demos run.** "Simulate a tap" on the card reader only exists with test Stripe keys, which are
   site-wide; on greenreserve.app a saved-card check-in is a real charge. *Recommendation:* a separate
   test-key demo deployment, or demo on production with a refunded test card and no reader tap.
7. **Pilot region.** Hudson Valley + Bergen County is assumed because that is where you are.
   *Alternative:* add a warm-weather region (Florida, Arizona) in parallel, where courses are busy now and
   could show real bookings in December. The cost is that you can't visit them. *Recommendation:* stay
   local for the first ten; decide on a warm region after week two's numbers.
