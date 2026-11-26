# Golfer lane — booking, check-in, manage, pay

Read this, CLAUDE.md and `GOLFER_REDO_SPEC.md`. Every
price, fee and charge is Build's (`src/lib/**`, `src/app/api/**`); policy wording only from `describePolicy()`.

## Approved (Cam 2026-11-18: "after all those comments are fixed we are good to merge that")
The mockups are the spec, with every comment thread on them: `lanes/golfer/booking-page-mockup.html` (the booking
page, Option A, https://claude.ai/artifact/9WAXcybTUBCGCMZ86uKoFb v12) and `lanes/golfer/login-alerts-mockup.html`
(log-in, alerts, range balls, https://claude.ai/artifact/RvrSoiQbmeerBa2pHSrrut v6). Mockup-only controls (look
switch, group toggles, "first log-in" toggle, range on/off) are not built. Build only what they show.

1. **Booking page (Option A).** It's the approved page as drawn: the course header, picking a day, filters (calendar,
   Morning / Mid day / Afternoon time tiles (choose any; Cam removed the time and price sliders in threads 1bf6acc7 and 9cdc0e4d), players stepper, tiles for holes and for walking or riding), tee time
   cards grouped by part of the day, and "No times match" with a reset. Picking a tee time opens the booking on its
   own page. It wears the course look (Light or Dark plus one preset accent: Black, Green, Blue, Yellow; never red;
   `lanes/build.md` "Booking page look").
2. **Log in (per course only).** There's one "Log in" in the header and no GreenReserve golfer account anywhere
   (retired 2026-11-18). It is the per-course `gr_member` session, 7 days absolute (R-AUTH-009).
   - The page is titled "Log in to <Course>". The line under it is built from the groups the course has: "For
     <Course> members." / "For <Course> members and residents." / a comma list ending in "and" for three or more,
     then "No account needed to book a tee time."
   - After the email it always says "If this email is on <Course>'s list, we sent a 6-digit code.", whether or not it
     is. Below that: "Not set up? Ask the pro shop."
   - A golfer's first log-in at a course shows an unticked box: "I agree to GreenReserve's Terms of Service and
     Privacy Policy, and that <Course> and GreenReserve keep my booking history." Log in stays greyed out until it's
     ticked (error: "Tick the box to agree before you log in."). It's recorded with the terms version, and later
     log-ins don't show it.
   - Member emails and pages from #477 still say "sign in as a member"; reword all of them to "Log in". The invite
     says: "<Course> set you up as a Member. Log in at <course page> with this email to get your rates." (With Members pricing off: "...with this email to book. You can book 9 days out.", no rate.)
   - A golfer whose session expired who opens a booking's emailed link to move it would drop to the public rate, so
     the manage page says "Log in first to keep your member rate".
   - Once logged in, the header reads "Logged in · <Name> · <Group>", "Your <Course>", "Log out".
3. **Logged-in prices.** Each tee time card shows the public price struck through next to the golfer's price. Days
   opened by the longer booking window are outlined and read "members only". A golfer in two groups gets the lower
   price and the longer window. There are no guest passes (GUEST-PASS-OFF, Cam 2026-11-24): no "Guest passes left", no
   tick per guest.
4. **Book page.** There's no guest-or-log-in choice: the form opens straight away, empty for guests. Logged in, Name
   and Email are filled and read-only ("From your <Course> log-in."), so the member keeps the cart and member rate at
   check-in.
   - The agree box stays, unticked, just above Book: "I agree to GreenReserve's Terms of Service and Privacy Policy
     and to <Course>'s cancellation policy shown on this page, including that <Course> and GreenReserve keep my
     booking history." Book is greyed out until it's ticked ("Tick the box to agree to the terms before you book.").
   - Name and email are checked together with the box.
5. **Range balls add-on.** It shows only when the course turns on "Sell range balls with tee times". It's titled
   "Range balls" and sits between the cart choice and the price box.
   - It lists the course's own buckets (e.g. "Small · 35 balls · $6"), each with −/+ from 0, and they appear as their
     own "Range balls" line in the price box.
   - They're paid with the round, the same way and at the same time; that wording comes only from `describePolicy()`.
6. **Your <Course>.** It shows only the membership (group, StatusDot, renews or expires date, one line of benefits)
   and the upcoming bookings, each opening its manage page. There are no statements and no dues.
7. **Tee time alerts on the booking page.** No log-in is needed.
   - They open from three places: a "Tell me when a time opens" row at the end of each day; "Tell me if it opens" on
     a full tee time (pre-filled with that time, with a tick for other times in that part of the day); and the main
     button on a fully booked day or under "No times match".
   - The sheet opens over the booking page (a right panel on desktop, sliding up on a phone), pre-filled with the
     day, the time of day and the players. Focus returns to whatever opened it.
   - **Logged in:** "We'll email d•••@example.com when a time opens." There's an optional "Also text me" phone with
     its own unticked consent box for alert texts (separate from booking texts). One tap turns it on.
   - **Guests:** they type an email (plus the optional phone and its consent) and confirm by an emailed link.
   - Under the button: "Every alert email has a link to stop alerts. Privacy Policy."
   - First come, first served; nothing is held. Texts only through `sendSms()` to numbers that agreed.
   - It shows only when the course turns on "Let golfers set tee time alerts".
