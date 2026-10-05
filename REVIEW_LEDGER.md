# Review ledger

Generated 2026-10-05 from the full-site review workflow (REVIEW_SPEC.md Phase 1): 8 lanes, each finding re-checked by an independent skeptic told to refute it. Static code review only. Nobody clicked through the site, so anything that needs a live walk is listed under "Manual checks".

**89 verified findings** (91 reported, 2 refuted): 8 S1 · 26 S2 · 39 S3 · 16 S4 by raw count. Many are the same root cause found by more than one lane, so the groups below are the real work list.

Caveat: the skeptics agreed with 89 of 91. That is a high agreement rate, so every S1 below was also opened and confirmed by hand before this ledger was written. Treat S3/S4 as likely-but-unverified until fixed.

## Progress (2026-10-05)

| group | finding(s) | status |
|---|---|---|
| G1 no-show then cancel charged the late fee again | R-PAY-002, R-BOOK-003 | **fixed** #71 · test `cancel-after-noshow-test.ts` |
| G2 "still coming" re-marked and re-charged by the hourly cron | R-CRON-001 | **fixed** #72 · test `still-coming-test.ts` |
| G3 check-in of a no-show keeps the no-show fee | R-PAY-001, R-OPS-001 | waiting on Cam: should a late arrival who checks in get the no-show fee back? |
| G4 cutoffs used the course's current window | R-CRON-002, R-GOLF-001, R-PAY-003 | **fixed** #74 · test `cutoff-window-test.ts` |
| G5 golfer sign-in code crackable offline | R-AUTH-001 | **fixed** #73 · tests `golfer-otp-test.ts`, isolation single-use check |
| G6 party-size change keeps old per-player fees | R-GOLF-002, R-PAY-007, R-BOOK-010 | waiting on Cam: needs one nullable column (fee basis copied onto the booking) |
| G7 DST: tee times an hour off on clock-change Sundays | R-BOOK-001 | **fixed** #70 · DST cases in `course-time-test.ts` |

Also landed: #69 runs every `scripts/*-test.ts` in CI (Tests workflow) and repaired three stale tests.

## Fix first: S1 (money, security)

Fixed one per run, each with a regression test, in this order.

### G1 · A golfer marked no-show who then cancels is charged the late fee a second time

Findings: R-PAY-002, R-BOOK-003. Where: `src/lib/cancel-booking.ts:104`

**Impact:** The golfer is charged the late fee twice for one missed round, which contradicts describePolicy's 'Never both'. Or GreenReserve's fee is refunded on a no-show that the course kept.

**Fix:** In performCancellation, return 409 once noShowAt is set or the tee time has passed (a no-show is undone with "still coming", not cancel).

### G2 · "Still coming" clears a no-show, then the next hourly run marks it and charges it again

Findings: R-CRON-001. Where: `src/app/api/cron/hourly/route.ts:197`

**Impact:** A late golfer whom staff explicitly cleared gets charged the course's no-show fee and GreenReserve's booking fee again, possibly more than once. Staff only see this if they open the ledger, and the refund has to be done by hand in Stripe.

**Fix:** The auto no-show query must skip bookings with a still_coming event, or still_coming must stamp a field the query excludes.

### G3 · Checking in a group already marked no-show charges the round but keeps the no-show fee

Findings: R-PAY-001, R-OPS-001. Where: `src/lib/checkin-booking.ts:314`

**Impact:** A golfer who played and paid for the round is also charged the course's no-show fee, with no prompt to refund it. Anyone who arrives after the auto no-show window can hit this. Analytics also counts a completed round as a no-show.

**Fix:** chargeBooking(): call refundNoShowFee() next to refundSeparateAccessFee() and clear noShowAt; same in the paid_offline branch. (The PAY verifier rated this S2, arguing describePolicy says late arrivals count as no-shows; the code's own comment at checkin-booking.ts:311 says the opposite, so it stays S1 unless Cam decides late arrivals keep the fee.)

### G4 · The hold charge, the warning email and the manage page use the course's CURRENT cancellation window, not the one copied onto the booking

Findings: R-CRON-002, R-GOLF-001, R-PAY-003. Where: `src/app/api/cron/hourly/route.ts:66`

**Impact:** Golfers who cancel inside their agreed free window are charged a fee that is then kept. This breaks the CLAUDE.md rule that the policy is copied at booking and a later change never reaches existing bookings.

**Fix:** One cutoffMs(booking) helper in cancel-policy.ts using cancellationHoursAtBooking ?? course.cancellationHours, used by both crons, the warning email, the manage GET and performCancellation.

### G5 · Golfer sign-in code is recoverable offline: the bcrypt hash of the 6-digit code ships inside the readable challenge token

Findings: R-AUTH-001. Where: `src/lib/golfer-otp.ts:51`

**Impact:** Any golfer account, or a new account for any email or phone, can be taken over without access to the inbox or phone. A gr_golfer session exposes the victim's bookings and checkInTokens through /api/courses/[slug]/account, which allow cancel (late fees on the victim's card), swap or check-in. linkGuestBookings (verify:124) also attaches all guest bookings under that identifier.

**Fix:** Port the inquiry-signin.ts fix: an HMAC with a server secret instead of a hash in the payload (or store the challenge server-side), and make the challenge single-use.

### G6 · Changing party size on the manage page leaves per-player late and no-show fees at the old party size

Findings: R-GOLF-002, R-PAY-007, R-BOOK-010. Where: `src/app/api/manage/[bookingId]/change-players/route.ts:65`

**Impact:** Example: a course charges $10 per player. A golfer books 4 and drops to 2 on the manage page. The policy they were shown says $10 per player, but the hold or late fee charged is $40, not $20. Growing the party undercharges the course in the same way.

**Fix:** change-players must recompute cancellationFeeTotal and noShowFeeTotal; the basis (per booking / per player) needs to be on the Booking to do it.

## Next: S2 groups (a real flow broken)

- **G7** Time zone math is off by one hour on DST Sundays. The first one is Nov 1, 2026: holds, cutoffs and auto no-shows fire an hour early. R-BOOK-001. Fix teeToUtcMs in src/lib/tee-time-utils.ts and add a DST case to scripts/course-time-test.ts. Has a deadline.
- **G8** The hourly cron's 30-minute send windows miss about half of bookings, so the pay link and the cutoff warning never go out. R-CRON-003. For a no-card course the pay link is the whole payment path (CARD-1). Use a "due and not yet sent" query instead of a time window.
- **G9** Changing time or party size has no server-side rules: past slots, any date, after the cutoff (dodges late fees). R-PAY-008, R-BOOK-007, R-GOLF-006. 
- **G10** Swapping times re-prices a member at the public rate and hard-codes the $1.50. R-PAY-006, R-GOLF-007, R-BOOK-013. 
- **G11** Members of a private club can never book online. R-BOOK-005, R-GOLF-004. 
- **G12** /book loads the tee time with the public window, so member advance bookings fail. R-BOOK-006, R-GOLF-005. 
- **G13** A signed-in golfer opening a valid emailed manage link for a booking not on their account gets "Invalid or expired link". R-AUTH-003, R-GOLF-003. 
- **G14** "Still coming" has no state guard and refunds GreenReserve's fee on bookings that were never no-shows. R-OPS-002, R-PAY-005. 

## Needs Cam

- **G3 severity:** does a group that arrives after the auto no-show window keep the no-show fee when staff check them in? The code comment says no; one verifier read describePolicy as yes.
- **Course alert permission:** R-AUTH-005 says any staff login, even Starter, can publish text on the public booking page; the OPS verifier refuted the same point because STAFF_POLICY_SPEC A1 leaves `conditions` open to staff on purpose. Keep it open, or gate it?
- **R-AUTH-009:** the member cookie lives 7 days; CLAUDE.md says 90 days absolute. Which is intended?
- **R-GOLF-014:** the Lighthouse check audits production (greenreserve.app), not the PR build, so it can never catch a PR regression. Point it at the PR build, or accept it as a production monitor?

## All verified findings

| id | sev | group | where | what |
|---|---|---|---|---|
| R-AUTH-001 | S1 | G5 | `src/lib/golfer-otp.ts:51` | Golfer OTP challenge token carries a bcrypt hash of the 6-digit code in a readable JWT payload, so the code is recoverable offline and the rate limits do not protect it |
| R-BOOK-003 | S1 | G1 | `src/lib/cancel-booking.ts:104` | A no-show booking can still be cancelled, which charges the late fee again on top of the no-show fee |
| R-CRON-001 | S1 | G2 | `src/app/api/cron/hourly/route.ts:197` | Automatic no-show re-marks and re-charges a booking that staff cleared with "still coming" |
| R-CRON-002 | S1 | G4 | `src/app/api/cron/hourly/route.ts:66` | Both cutoff crons use the course's CURRENT cancellationHours, not the window copied onto the booking |
| R-GOLF-001 | S1 | G4 | `src/app/api/cron/hourly/route.ts:66` | The cutoff a golfer agreed to (cancellationHoursAtBooking) is ignored by both crons, the manage page and the booking-time warning email. They use the course's CURRENT window |
| R-GOLF-002 | S1 | G6 | `src/app/api/manage/[bookingId]/change-players/route.ts:65` | Changing the party size on the manage page does not re-price a per-player late fee or no-show fee |
| R-OPS-001 | S1 | G3 | `src/lib/checkin-booking.ts:314` | Checking in a group already marked no-show keeps the course's no-show fee and charges the full round as well |
| R-PAY-002 | S1 | G1 | `src/lib/cancel-booking.ts:104` | Cancelling after a no-show charges the late fee on top of the no-show charge ('never both' broken) |
| R-ADM-001 | S2 |  | `src/app/api/admin/inquiries/route.ts:521` | Pipeline emails sent via after() report success to the admin even when the email fails; resend_welcome rotates the operator's password first |
| R-AUTH-002 | S2 |  | `src/app/api/golfer/auth/accept-invite/route.ts:50` | Member accept-invite writes an unverified phone onto the new GolferAccount, and phone OTP sign-in then routes that number's owner and their guest bookings into that account |
| R-AUTH-003 | S2 | G13 | `src/app/api/manage/[bookingId]/route.ts:36` | Manage, cancel and change routes ignore a valid emailed token whenever a golfer session exists, so logged-in golfers get 'Invalid or expired link' for bookings not attached to their account |
| R-BOOK-001 | S2 | G7 | `src/lib/tee-time-utils.ts:34` | teeToUtcMs is off by one hour on DST Sundays, so auto no-show, the hold charge and the late-fee cutoff fire an hour early (Nov 1 2026) |
| R-BOOK-002 | S2 |  | `src/lib/cancel-booking.ts:155` | Two cancels of the same booking at once both free its seats, so the slot can be oversold |
| R-BOOK-004 | S2 |  | `src/lib/cancel-booking.ts:155` | Cancel, time swap and party-size change overwrite a blocked slot's status to 'available', reopening a closed tee time |
| R-BOOK-005 | S2 | G11 | `src/app/api/bookings/route.ts:108` | Members of a private club can never book: /api/bookings rejects every private course before it checks membership |
| R-BOOK-006 | S2 | G12 | `src/app/book/page.tsx:22` | /book loads the tee time with the PUBLIC window, so member advance bookings beyond it fail |
| R-BOOK-007 | S2 | G9 | `src/app/api/manage/[bookingId]/swap-time/route.ts:55` | Swap-time and change-players enforce no time rules on the server: past slots, any date, after the cutoff |
| R-BOOK-008 | S2 |  | `src/lib/tee-sheet-engine.ts:122` | The nightly generator deletes every empty slot, including staff-added walk-in slots, and gives the others new ids |
| R-BOOK-009 | S2 |  | `src/app/api/operator/blackouts/route.ts:23` | Blocking a day fails with a 500 when any booking on that date was cancelled |
| R-BOOK-010 | S2 | G6 | `src/app/api/manage/[bookingId]/change-players/route.ts:65` | Change-players never recomputes per-player late or no-show fees copied onto the booking |
| R-BOOK-011 | S2 |  | `src/lib/schedule-service.ts:142` | A schedule interval of 0 or below hangs tee-time generation, stalling the nightly cron for every course after it |
| R-CRON-003 | S2 | G8 | `src/app/api/cron/hourly/route.ts:164` | Hourly 30-minute send windows miss about half of all bookings, so the pay link and the cutoff warning never go out |
| R-GOLF-003 | S2 | G13 | `src/app/api/manage/[bookingId]/route.ts:36` | A signed-in golfer opening a valid emailed manage link for a booking not linked to their account gets 'Link not recognized'. Session auth replaces token auth instead of being an alternative |
| R-GOLF-004 | S2 | G11 | `src/app/api/bookings/route.ts:108` | Members of a private club can never book online: the member portal hands off to /book, and POST /api/bookings refuses every private course |
| R-GOLF-005 | S2 | G12 | `src/app/book/page.tsx:22` | /book loads the tee time through the PUBLIC loader, so a member booking a date only members can reach gets 'This tee time is no longer available', and members are shown the public price |
| R-GOLF-006 | S2 | G9 | `src/app/api/manage/[bookingId]/swap-time/route.ts:44` | swap-time has no server-side cutoff, date, past-time or booking-window checks. 'Change time' is restricted only in the client |
| R-GOLF-007 | S2 | G10 | `src/app/api/manage/[bookingId]/swap-time/route.ts:64` | Changing tee time re-prices a member's round at the public green fee |
| R-OPS-002 | S2 | G14 | `src/app/api/operator/bookings/route.ts:137` | 'still_coming' has no state guard, so it refunds GreenReserve's fee on bookings that were never no-shows |
| R-OPS-003 | S2 |  | `src/app/dashboard/page.tsx:236` | The card check-in modal cannot prorate a partial party, and a decline throws away the headcount |
| R-PAY-001 | S2 | G3 | `src/lib/checkin-booking.ts:314` | Checking in a no-show (staff Check in or golfer self check-in) charges the full round but keeps the course's no-show fee and leaves noShowAt set |
| R-PAY-003 | S2 | G4 | `src/app/api/cron/hourly/route.ts:66` | The cutoff crons and the manage page use the course's CURRENT cancellationHours, not the window copied onto the booking |
| R-PAY-006 | S2 | G10 | `src/app/api/manage/[bookingId]/swap-time/route.ts:166` | Golfer swap-time reprices at the standard rate (member tier lost) and both manage routes hard-code the $1.50 fee |
| R-PAY-007 | S2 | G6 | `src/app/api/manage/[bookingId]/change-players/route.ts:65` | change-players does not rescale the per-player late fee and no-show fee copied onto the booking |
| R-PAY-008 | S2 | G9 | `src/app/api/manage/[bookingId]/swap-time/route.ts:139` | Swap and change-players have no cutoff check, so late_cancel fees can be dodged by moving the round and then cancelling |
| R-ADM-002 | S3 |  | `src/app/admin/revenue/page.tsx:172` | Admin revenue page: saveExpense and loadExpenses have no try/catch, so a dropped connection leaves the Save button stuck with no message |
| R-ADM-003 | S3 |  | `src/app/admin/courses/[id]/_parts/useCourseDetail.tsx:278` | Course detail loadDocuments has no catch; documents panel spins forever on a network failure |
| R-ADM-004 | S3 |  | `src/app/admin/forgot-password/page.tsx:17` | Admin forgot-password: fetch is not in a try/catch and the error body is parsed unguarded; the form can freeze with no message |
| R-ADM-005 | S3 |  | `src/app/admin/inquiries/page.tsx:379` | Bulk inquiry actions report 'N failed' with no reason except the one needsBookingDecision case |
| R-AUTH-004 | S3 |  | `src/app/api/operator/preview-link/route.ts:9` | Staff can approve the course page or request changes through the preview token, getting around STAFF_FORBIDDEN on approve-page and request-changes |
| R-AUTH-005 | S3 |  | `src/app/api/operator/conditions/route.ts:5` | Course notice (conditions) write has no permission gate, so any staff login, even Starter, can publish text on the public booking page |
| R-AUTH-006 | S3 |  | `src/app/api/member/[courseSlug]/send-code/route.ts:57` | Member magic-link send-code has no rate limit |
| R-AUTH-010 | S3 |  | `src/app/api/operator/settings/route.ts:99` | Settings and course PATCH return the raw Course row, including adminNotes and stripeAccountId, which operatorSafe() strips on GET |
| R-BOOK-012 | S3 |  | `src/app/api/member/[courseSlug]/tee-times/route.ts:73` | The member price shown on the member tee sheet uses a different precedence from the price /api/bookings stores |
| R-BOOK-013 | S3 | G10 | `src/app/api/manage/[bookingId]/swap-time/route.ts:67` | Swapping times reprices a member's round at the standard rate |
| R-BOOK-014 | S3 |  | `src/lib/booking-window.ts:71` | Booking windows count days from the UTC date, not the course's local date |
| R-BOOK-015 | S3 |  | `src/lib/tee-sheet-engine.ts:131` | Changing a schedule leaves partially-booked slots on sale at the old time and price, and refreshes only 8 days |
| R-BOOK-016 | S3 |  | `src/lib/cancel-booking.ts:172` | Slot-opened alerts are matched on the cancelled party size, not on the seats now open |
| R-BOOK-017 | S3 |  | `src/app/api/bookings/route.ts:85` | The course's Min/Max players per booking settings are saved but never enforced |
| R-BOOK-018 | S3 |  | `src/lib/tee-sheet-engine.ts:41` | Past tee times are deleted, despite AN-1, by the nightly generator and by blocking today |
| R-BOOK-019 | S3 |  | `src/app/api/bookings/route.ts:105` | /api/bookings does not check that the course is live, so a stale page can book at an offline or archived course |
| R-CRON-004 | S3 |  | `src/lib/email.ts:308` | Cutoff warning tells late-cancel-timing golfers a fee will be charged automatically, with policy wording hard-coded outside describePolicy() |
| R-CRON-006 | S3 |  | `src/app/api/cron/send-reminders/route.ts:86` | Cron failures don't reach Admin → System: several jobs never report failure counts |
| R-CRON-007 | S3 |  | `src/app/api/cron/hourly/route.ts:169` | Check-in/pay-link email: paymentStatus is flipped before the send, so a failed send is never retried |
| R-CRON-008 | S3 |  | `src/app/api/cron/send-reminders/route.ts:23` | Day-before reminder is sent to placeholder walk-in/phone addresses |
| R-GOLF-008 | S3 |  | `src/app/manage/[bookingId]/page.tsx:302` | Golfer-facing policy wording outside describePolicy() ignores late-fee timing and the GreenReserve fee, and contradicts what is charged |
| R-GOLF-009 | S3 |  | `src/app/book/BookClient.tsx:205` | A booking made after the cancellation cutoff has already passed is told '$0 today' and 'free to cancel until <a time already past>', then the hold is charged within the hour |
| R-GOLF-010 | S3 |  | `src/app/receipt/[bookingId]/page.tsx:177` | The receipt misstates money: it says 'Nothing has been charged yet' after a hold or no-show charge, and a late-cancel receipt never shows the amount charged |
| R-GOLF-011 | S3 |  | `src/app/checkin/[bookingId]/page.tsx:157` | Self check-in shows a pay form for a cancelled booking, says 'charged to your card' for counter-paid rounds, and passes staff-voiced errors to golfers |
| R-GOLF-012 | S3 |  | `src/app/manage/[bookingId]/page.tsx:243` | Golfer error screens for an expired or invalid link, or a failed load, are dead ends with no link, retry or way forward |
| R-GOLF-013 | S3 |  | `src/app/book/BookClient.tsx:285` | On /book, 'That time just filled up. Please refresh' leads nowhere: the refresh re-shows the full slot with the party silently cut to 1 |
| R-GOLF-014 | S3 |  | `.github/workflows/perf-audit.yml:36` | The perf budget gate audits PRODUCTION, not the PR build, and audits /book only as its error shell |
| R-OPS-004 | S3 |  | `src/components/OperatorSidebar.tsx:126` | On mobile there is no way to reach Members or Analytics, or to create a Course alert |
| R-OPS-005 | S3 |  | `src/components/dashboard/money/CancellationsPanel.tsx:64` | Staff 'Cancel' confirmation says nothing will be charged, but under late_cancel timing the late fee and GreenReserve's fee are charged at that moment |
| R-OPS-006 | S3 |  | `src/app/dashboard/page.tsx:474` | Late-group alert and Cancellations 'upcoming' list use the browser clock, not the course's timezone |
| R-OPS-007 | S3 |  | `src/app/api/operator/tee-times/route.ts:130` | Deleting a future tee time whose only booking was cancelled returns a 500 |
| R-OPS-009 | S3 |  | `src/app/dashboard/page.tsx:141` | Tee sheet ignores a failed permissions load and silently drops every action button |
| R-OPS-010 | S3 |  | `src/app/api/operator/settings/route.ts:109` | Settings PATCH returns the whole Course row, including adminNotes and stripeAccountId, to staff |
| R-PAY-004 | S3 |  | `src/lib/cancel-booking.ts:104` | hold_at_cutoff: cancelling after the cutoff but before the cron charges (or after a declined hold) is free |
| R-PAY-005 | S3 | G14 | `src/app/api/operator/bookings/route.ts:137` | still_coming has no state guard: staff can refund GreenReserve's fee on paid_offline or late-cancelled bookings |
| R-PAY-009 | S3 |  | `src/app/api/stripe/webhook/route.ts:53` | Webhook records hold and late-fee refunds as round 'refund' rows, so a later admin refund under-refunds and the export is wrong |
| R-PAY-010 | S3 |  | `src/app/api/cron/hourly/route.ts:140` | Declined fee charges are invisible: a cutoff hold decline is never ledgered, and charge_failed rows only appear in one golfer's timeline |
| R-PAY-011 | S3 |  | `src/app/api/membership/[id]/route.ts:78` | Membership pay route charges dues again when the membership was marked paid at the pro shop (paid_offline) |
| R-UI-001 | S3 |  | `src/components/dashboard/money/PayoutsPanel.tsx:120` | Payouts panel says "You keep 100% of your green and cart fees" - phrase banned by LQ-2 and contradicts CLAUDE.md fee copy freeze |
| R-ADM-006 | S4 |  | `src/app/api/admin/inquiries/route.ts:471` | request_details / resend_details has no server-side status guard; only the client limits it to pending (bulk) or modal-eligible states |
| R-ADM-007 | S4 |  | `src/app/admin/messages/page.tsx:116` | Messages and course-thread 'mark as read' PATCH failures are swallowed |
| R-AUTH-007 | S4 |  | `src/lib/staff-permissions.ts:49` | Permission catalog offers 'Issue refunds', 'Charge a fee by hand' and 'See payouts' that no route enforces; the Payouts tab 403s for staff, and payouts is Stripe, which CLAUDE.md says is never grantable |
| R-AUTH-008 | S4 |  | `src/app/api/operator/tiers/route.ts:67` | 'Manage members' (members.edit) also lets staff rewrite tier prices and dues |
| R-AUTH-009 | S4 |  | `src/app/api/member/[courseSlug]/verify/route.ts:52` | Member session cookie lives 7 days, but CLAUDE.md's session table says 90 days absolute |
| R-AUTH-011 | S4 |  | `src/app/api/operator/my-courses/route.ts:11` | Routes that call getOperatorSession() directly skip the sessionVersion and multi-course checks in resolveDashboardSession |
| R-AUTH-012 | S4 |  | `src/app/api/auth/2fa/resend/route.ts:20` | Operator 2FA resend has no rate limit |
| R-AUTH-013 | S4 |  | `src/app/api/member/[courseSlug]/tee-times/route.ts:31` | Member tee-times endpoint doesn't check membership status for gr_member sessions |
| R-CRON-005 | S4 |  | `src/app/api/cron/send-reminders/route.ts:23` | Day-before reminders and cutoff warnings have no sent-once record, so a rerun or duplicate invocation sends them again |
| R-CRON-009 | S4 |  | `src/app/api/admin/resend-staff-setup/route.ts:20` | Admin staff-login email bypasses getResend() and the shared template (no logo) |
| R-GOLF-015 | S4 |  | `src/app/checkin/[bookingId]/page.tsx:10` | The check-in page loads Stripe.js on import, even when the golfer will pay with their saved card |
| R-GOLF-016 | S4 |  | `src/app/api/courses/[slug]/account/route.ts:29` | The account portal splits upcoming from past on the UTC date, so evening tee times in US timezones drop out of 'Upcoming' (and lose Check in/Manage) before they are played |
| R-GOLF-017 | S4 |  | `src/app/api/manage/[bookingId]/change-players/route.ts:17` | Manage 'Change players' is capped at 4, while bookings allow up to 8 |
| R-OPS-011 | S4 |  | `src/components/OperatorSidebar.tsx:120` | No way to cancel a booking from the tee sheet; 'sheet.cancel' without a money.* key has no UI at all |
| R-OPS-012 | S4 |  | `src/app/dashboard/page.tsx:80` | Operator tee sheet status column has drifted from the homepage demo (FLOW-2 'change one, check the other') |
| R-UI-002 | S4 |  | `src/app/admin/revenue/page.tsx:582` | Stat numbers and money set in font-serif on admin pages (serif is reserved for headlines, course names, dates) |

## Refuted

- R-OPS-008: Course alert route has no permission gate, so any staff login can post golfer-facing banners. Why: The route does have no requirePermission call (conditions/route.ts). But STAFF_POLICY_SPEC A1 lists `conditions` as 'open to staff (no gate)', and the A5 route map, which says 'every row is a check in the route', deliberately leaves it ungated. The CLAUDE.md rule covers NEW staff-reachable actions, 
- R-UI-003: Design-guard backlog still carries 164 uppercase, 172 lucide, 37 input and 34 card items across 79 files. Why: This is documented, intentional, tracked debt, not a defect. scripts/design-guard.mjs says outright that it is "A ratchet, not a ban" and that the baseline records the existing counts. CLAUDE.md likewise says design-guard "ratchets" uppercase/<Eyebrow> and each file's lucide imports down. The guard 

## Unconfirmed (suspicions without proof; check before acting)

- [PAY] src/app/api/cron/hourly/route.ts:49-120 vs src/lib/cancel-booking.ts:141-152 — race: the cron reads a confirmed booking, the golfer cancels free (hold gap, fee zeroed), then the cron charges the hold and writes paymentStatus 'cancellation_fee_charged' onto a cancelled booking. Nothing re-reads status before the charge. The window is narrow and I could not prove it from timing alone.
- [PAY] src/lib/stripe.ts:82-84 — refundOnConnectedAccount always passes refund_application_fee:true, including for hold, late-fee and no-show charges created with no application_fee_amount. The code says it is a no-op; whether Stripe accepts it on a direct charge with no application fee needs a test-mode call.
- [PAY] src/app/api/stripe/webhook/route.ts:29 — one STRIPE_WEBHOOK_SECRET. Connected-account events (round, hold, refund, dispute) need a Connect endpoint. The separate GreenReserve fee charges live on the PLATFORM account (access-fee.ts:189), so their refunds and disputes need an account endpoint with a different signing secret. If both point at this URL, one of them always fails signature verification. Depends on how the Stripe dashboard is configured.
- [PAY] src/lib/no-show-fee.ts:56 — the auto no-show candidates (hourly:197) include bookings already paid through admin collectPayment (status confirmed, checkedInAt null), so the course no-show fee can be charged on a round that was already paid. I did not trace whether collect-then-no-show happens in practice.
- [PAY] src/app/api/manage/[bookingId]/change-players/route.ts and swap-time/route.ts on a booking already charged by collectPayment (confirmed + paid) — totalAmount is rewritten after the charge, so refundBooking's remaining (refund-booking.ts:182) no longer matches the PaymentIntent amount. I did not confirm that the UI allows this.
- [BOOK] src/lib/tee-sheet-engine.ts:124-161 — TeeTime has no unique index on (courseId,date,time,productId) (prisma/schema.prisma:389-422; no unique index in migrations). Two generateTeeTimes runs for the same date that overlap could both delete and both create, giving duplicate rows for one tee time, i.e. 8 seats on a 4-seat tee. Possible triggers: a schedule save during the 3am cron, admin and operator saving at once, or the operator 'Regenerate' button (operator/regenerate-tee-times) while a save is running. I did not reproduce it; it needs a concurrent run. The operator POST /api/operator/tee-times can also knowingly create a second row at an existing time; whether that is intended is a product question.
- [BOOK] src/app/api/operator/blackouts/route.ts:36-47 — Deleting a blackout ('reopen a day') neither regenerates the day nor unblocks the booked slots the POST blocked. The day stays empty until the 3am cron, and booked slots stay blocked permanently because the generator skips blocked slots. Lines are confirmed; whether staff are expected to unblock slots by hand is not.
- [BOOK] src/app/api/manage/[bookingId]/change-players/route.ts — Reducing the party inside the cutoff (e.g. 4 to 1, an hour before) under a late_cancel policy is a de-facto late cancellation of 3 players with no fee. Needs a product decision before it is a finding.
- [BOOK] src/app/api/admin/tee-sheet/route.ts:70-97 — Admin manual booking has no past-date check, no checkInToken, no cancellationHoursAtBooking, always charges cart, and sets accessFeeTotal 150*players on a 'manual' (pay-at-counter) booking. That differs from the operator walk-in (accessFeeTotal 0). It is admin-only; whether the $1.50 should apply is a money-lane question.
- [BOOK] src/lib/public-tee-times.ts:60-79 — For a date before the course's today, the list returns every slot (the past filter applies only when date === todayLocal), so a crafted or stale date shows bookable-looking past times that /api/bookings then rejects with 'already passed'. Cosmetic.
- [BOOK] src/lib/tee-sheet-engine.ts:85-87 — A midnight-crossing schedule (end before start, e.g. 22:00–01:00) generates nothing, silently. The operator UI refuses end <= start, but neither the server routes nor the generator do. No real course probably needs this.
- [AUTH] src/lib/rate-limit.ts:61 clientIp() uses the leftmost X-Forwarded-For hop, which the file's own evidentiaryIp comment calls client-writable. If Vercel doesn't overwrite XFF, every per-IP limit (login, OTP verify, 2FA verify, checkin) could be bypassed. Needs confirmation of Vercel header behaviour.
- [AUTH] src/app/api/operator/settings/route.ts: 'timezone' is in the staff-editable allowlist. Changing it moves cutoff and no-show timing for existing bookings (the policy is copied to the Booking, the timezone isn't), so a settings.edit staff login could indirectly change when hold fees charge. Lane 1 should confirm.
- [AUTH] src/app/api/operator/staff/route.ts:73 checks email uniqueness only against CourseStaff. A staff row whose email matches an operator email can never log in, and its failed attempts count against the operator's lockout (login/route.ts tries the operator first).
- [AUTH] src/app/api/golfer/auth/otp/verify: the challenge isn't single-use, so a verified challenge plus code can be replayed until its 10-minute expiry (bounded by the 5-per-10-minutes per-identifier limit).
- [CRON] src/app/api/cron/hourly/route.ts:92: the hold charge has no upper bound (`cutoffMs <= now`). A card_on_file booking left confirmed after its round (e.g. a course that connected Stripe later, `stripeAccountActive` flipping true) would be charged a "hold" days after the tee time, with an email saying "check in now", and the check-in refund can never happen. I couldn't confirm a card can be saved while the course's Stripe is inactive.
- [CRON] src/lib/agreement-required.ts:104-117: noticeSentAt is stamped only after the per-course loop. If the hourly function times out mid-loop, the next run re-sends the bump notice to every course already notified. Courses whose send failed are never retried (they're reported in the admin summary).
- [CRON] src/app/api/cron/send-reminders/route.ts:15-17: 'tomorrow' is computed from the UTC date at 08:00 UTC. For a course in Pacific/Honolulu (22:00 the previous day) or Alaska standard time, the reminder goes out for the day AFTER tomorrow, local time.
- [CRON] src/app/api/cron/hourly/route.ts:156-178: two overlapping hourly invocations can both read `no_payment_method` before either update lands, sending the check-in email twice. There's no conditional updateMany claim.
- [CRON] src/app/api/cron/chase-onboarding/route.ts:28: when a course is far behind (created weeks ago with no reminders logged), isDue fires one reminder per day until the count catches up (3,7,14,21,…), i.e. several consecutive daily chase emails.
- [OPS] src/app/api/operator/analytics/route.ts:18 vs CLAUDE.md AN-1: CLAUDE.md says /dashboard/analytics is 'owner logins only', and the route comment says 'Owner-only'. SP-A instead made 'analytics.view' grantable (Manager preset includes it). This is a decision conflict for Cam, not a proven bug: SP-A is the later decision.
- [OPS] No 'edit a booking' flow exists on the operator dashboard: no route action to change players or move times (the bookings PATCH allows only cancel/checkin/no_show/still_coming/paid_offline/send_pay_link). Staff must cancel and re-book, which can trigger a late fee. CLAUDE.md does not promise editing, so this is logged as a product gap and not a finding.
- [OPS] src/app/api/operator/bookings/route.ts:124 no_show does not refuse a booking already paid by an admin 'collect payment' (paymentStatus 'paid', status still confirmed). markNoShow would then charge the course no-show fee on top of a paid round. I could not confirm that state is reachable from the sheet.
- [OPS] src/app/dashboard/page.tsx:22: the dashboard calls loadStripe() at module scope, not lazily. The perf rule names golfer pages only, so this is probably acceptable, but it loads Stripe JS on every tee-sheet view.
- [OPS] src/app/api/operator/bookings/route.ts:149 paid_offline for an ONLINE no-card booking: the UI only offers it for paymentStatus 'manual', but the API accepts it. GreenReserve's fee then fails with 'no card on file' and is lost, even though SP-B says the fee is collected when the golfer pays. This needs Cam's decision on whether the API should refuse paid_offline for online bookings.
- [GOLF] src/app/api/checkin/[bookingId]/route.ts:62: self check-in has no time gate. The confirmation email's 'Check In & Pay' link works from the moment of booking, so a golfer can pay and be marked completed (and have any hold refunded) days before the round. I can't confirm whether this is intended.
- [GOLF] src/app/api/cron/hourly/route.ts:94-95: at a hold_at_cutoff course whose Stripe account is inactive, the hold is skipped, and section 3 (line 154) also excludes card_on_file bookings with a fee and hold timing. Such golfers may get no check-in/pay-link email at all, despite /book promising 'We'll email you a reminder to check in and pay' (BookClient.tsx:187). Depends on send-reminders, which I did not trace.
- [GOLF] src/app/api/manage/[bookingId]/send-modified-email/route.ts: no rate limit, and the client calls it fire-and-forget. A token holder can trigger unlimited emails to the booking's own address (lane 3/4).
- [GOLF] src/app/courses/[slug]/CourseBookingClient.tsx:547/679: hero_image_url is interpolated raw into `url(...)`, while CourseHeaderBar escapes it. A URL containing ')' or quotes would break the style. Uploads come from our own blob store, so this is likely harmless.
- [GOLF] src/app/book/BookClient.tsx:531: the Email/Phone grid-cols-2 at 360px leaves each input ~134px, so the email placeholder and typed addresses clip. Needs a live check at 360px.
- [ADM] src/app/api/calcom/webhook/route.ts:136-209: the idempotency check (find by createdBy uid) and the create are not atomic, so two concurrent deliveries of the same BOOKING_CREATED could create two Call rows (no unique constraint on Call.createdBy visible in the code). Read prisma/schema.prisma for an @@unique before ruling it in or out.
- [ADM] src/app/admin/page.tsx first-load failure: loadStats sets statsError but I did not read the render block to confirm an inline error with retry shows when stats is still null (only the refresh path was read).
- [ADM] src/app/api/admin/inquiries/route.ts mark_live (593-602): course.update and courseInquiry.update are separate writes, not a transaction, so a failure between them leaves the course active but the inquiry not 'live'. Not proven reachable.
- [ADM] src/lib/cron-log.ts cronHealth: a cron that catches its own errors internally and returns 200 with no failed/error field is judged ok. I did not read each cron body to see whether any does this.
- [UI] src/components/dashboard/CoursePreview.tsx:38 and src/app/courses/[slug]/CourseBookingClient.tsx:554,682 use `bg-gradient-to-t from-black/70 ...` as a scrim on hero photos. CLAUDE.md allows scrims that darken a photo behind text, so I read these as allowed. Cam would have to confirm that his scrim wording covers Tailwind gradient classes on golfer pages.
- [UI] Emoji and glyph sweep: my Unicode-range grep errored (PCRE range too large) and was not re-run. Emoji-free JSX is unconfirmed beyond design-guard passing.
- [UI] Dark-background check: `bg-gray-900/950` has zero hits in src. I did not separately scan for dark hex values in inline styles.

## Manual checks (live walk or Cam)

- [ ] [PAY] Stripe test mode: run the hold, then check in. Confirm that refundOnConnectedAccount with refund_application_fee:true succeeds on a charge that has no application fee.
- [ ] [PAY] Stripe dashboard: confirm which endpoints point at /api/stripe/webhook (Connect and/or account) and that a single STRIPE_WEBHOOK_SECRET can verify both. Otherwise refunds and disputes on the platform-account booking fee, or the connected-account round charges, are dropped.
- [ ] [PAY] Live walk R-PAY-001: set auto no-show to 15 min with a no-show fee, let the cron mark the booking, then press Check in on the tee sheet. Check the connected account for a no-show charge that was never refunded.
- [ ] [PAY] Live walk with 4000000000000341 (attaches, charge fails) at the cutoff hold: confirm nothing appears on the tee sheet, in admin Problems or in the golfer's email (R-PAY-010).
- [ ] [PAY] 3DS card 4000002500003155 saved at booking and then charged off-session at the cutoff or check-in: confirm the result is authentication_required and see what staff are shown.
- [ ] [PAY] Not acted on: the relayed request to merge PR 68 and add a tests workflow to CI is outside this read-only review lane. Nothing was merged, edited or committed.
- [ ] [BOOK] Walk the auto no-show on a DST Sunday: seed a Pacific course with auto no-show at 15 minutes and a 07:00 tee time on 2026-11-01, then run /api/cron/hourly with the clock faked to 2026-11-01T14:20Z (06:20 PST). Per R-BOOK-001 it should mark the booking a no-show and charge the fee before the tee time.
- [ ] [BOOK] Double-cancel live: open the same booking's manage link in two tabs, or click Cancel on the sheet while the golfer cancels, and confirm the slot's playersBooked drops twice (R-BOOK-002).
- [ ] [BOOK] Private club with a real member login: sign in at /courses/<private-slug>/member, pick a time and confirm. Expect a 403 'Online booking is not available' (R-BOOK-005).
- [ ] [BOOK] Member at a public course booking day 10 with the default 7/14 windows: expect 'This tee time is no longer available' on /book (R-BOOK-006).
- [ ] [BOOK] Staff 'add a tee time' for tomorrow on the dashboard, then hit /api/cron/generate-tee-times and confirm the slot is gone (R-BOOK-008).
- [ ] [BOOK] Block a day with a cancelled booking on it from Schedules and confirm the 500 and that no blackout is created (R-BOOK-009).
- [ ] [BOOK] Run scripts/concurrency-test.ts as-is (Phase 0). Then extend it to the operator walk-in, admin manual booking and double-cancel. It currently drives only /api/bookings.
- [ ] [AUTH] Walk each staff preset (Starter, Front desk, Manager, Legacy) against the local seeded app, sending direct requests to every operator route and confirming the 403s, including preview-link, then approve (R-AUTH-004).
- [ ] [AUTH] Confirm whether Vercel overwrites X-Forwarded-For in production, since every per-IP rate limit depends on it.
- [ ] [AUTH] Re-run scripts/birdie-isolation-test.ts with a seeded DATABASE_URL to finish the proposal checks.
- [ ] [AUTH] With a real phone, confirm the phone-OTP linking behaviour described in R-AUTH-002 after the fix.
- [ ] [CRON] Open each golfer email (confirmation, warning, hold charged, check-in/pay link, reminder, cancellation, receipt) in real Gmail web/iOS and Outlook desktop/web. Check the 180px lockup sits top-left and is sharp, and that the emoji entities (&#9971;, &#128205;, &#128336;) in the reminder and check-in emails are acceptable given the no-emoji rule.
- [ ] [CRON] On prod, Admin → System: confirm all 5 crons show a recent run, and that the hourly row's detail line shows the nested agreementPdfs/agreementNotices/callReminders counts.
- [ ] [CRON] Check the Resend dashboard for bounces to *@noemail.greenreserve.app (would confirm R-CRON-008 is happening live).
- [ ] [CRON] Confirm with Cam that the Vercel plan actually runs `0 * * * *` hourly (the cancellation-cutoff comment still says Hobby caps at once/day). If hourly isn't running, every R-CRON-003 email and the auto no-show never fire.
- [ ] [OPS] Real phone at under 768px: confirm the bottom nav, and that the tee-sheet row actions (Check in / Pay / Block / Delete) fit without horizontal scroll on a 375px screen.
- [ ] [OPS] Real Stripe test mode: mark a no-show on a course with a no-show fee, then press 'Check in' on the expanded row. Confirm that both the round and the no-show fee stay charged (R-OPS-001).
- [ ] [OPS] Real Stripe: card-modal check-in of a 4-player no-card booking where 2 show. Confirm the full total is charged (R-OPS-003).
- [ ] [OPS] Real Stripe: at a lateFeeTiming=late_cancel course, cancel inside the window from Money → Cancellations as Front desk staff. Confirm the prompt says 'never be billed' and that the card is charged anyway (R-OPS-005).
- [ ] [OPS] Live walk as the Starter preset and as a custom login with only sheet.cancel, to confirm which doors show (R-OPS-011).
- [ ] [GOLF] Walk /courses/[slug] → /book → confirmation → manage → check-in at 360px width under slow-3G throttling on a real phone, and run scripts/perf-audit.ts against a build of this branch rather than production.
- [ ] [GOLF] Real Stripe: book at a hold_at_cutoff course with a test card that declines on confirmCardSetup, and with a card that declines off-session at check-in. Confirm the golfer-facing messages.
- [ ] [GOLF] Same-day booking at a hold_at_cutoff course: confirm the hold charge and the 'window closes within the next hour' email both arrive after a '$0 today' confirmation (R-GOLF-009).
- [ ] [GOLF] Sign in to a course account on a phone, book as a guest on another device, then open the email's Manage link on the phone (R-GOLF-003).
- [ ] [GOLF] Private-club test course: sign in as a member and try to book (R-GOLF-004).
- [ ] [GOLF] Check the confirmation email in Gmail and iOS Mail for the hold, late_cancel and no-card policy variants and compare it with the /book screen.
- [ ] [ADM] Break a cron locally (make a handler throw, or skip a run), then load Admin → System and confirm its dot goes red with the right note.
- [ ] [ADM] Send the Resend welcome email with RESEND_API_KEY invalid (or Resend rejecting the send) and confirm the admin currently sees success (R-ADM-001).
- [ ] [ADM] Book a real Cal.com demo, then reschedule and cancel it from Cal.com, and confirm the Call row moves and cancels. Cal.com signs with the real secret, so this also proves the signature path.
- [ ] [ADM] Unset CALCOM_BOOKING_URL on a preview or local build and open /call/<token> to confirm the fallback copy and the 'Admin → System → Call booking' status.
- [ ] [UI] Look at /, /for-courses and /dashboard (Money > Payouts) on a phone and confirm no "keep 100%" wording remains after the fix.
- [ ] [UI] Cam rules whether stat numbers may use font-serif (R-UI-002).

## Finding detail

### R-AUTH-001 (S1) Golfer OTP challenge token carries a bcrypt hash of the 6-digit code in a readable JWT payload, so the code is recoverable offline and the rate limits do not protect it

`src/lib/golfer-otp.ts:51`

**Evidence:** otp/request/route.ts:24-39 returns `challengeToken` to the requester, and the token is built by signOtpChallenge(identifier, type, codeHash), where codeHash = bcrypt.hash(code, 10) (golfer-otp.ts:43-55). JWT payloads are signed, not encrypted, so the client holds a verifier for a 10^6 keyspace. The per-identifier and per-IP limits in otp/verify/route.ts:82-83 only bound online guesses. The codebase already records this weakness: src/lib/inquiry-signin.ts:52-57 explains why it moved to an HMAC under a server key for the same pattern. golfer-otp.ts was never moved, and its line-10 comment ('can't be brute-forced') does not hold.

**Impact:** Any golfer account, or a new account for any email or phone, can be taken over without access to the inbox or phone. A gr_golfer session exposes the victim's bookings and checkInTokens through /api/courses/[slug]/account, which allow cancel (late fees on the victim's card), swap or check-in. linkGuestBookings (verify:124) also attaches all guest bookings under that identifier.

**Fix:** Do what inquiry-signin.ts does: put HMAC-SHA256(JWT_SECRET, `${cid}:${code}`) in the challenge instead of a bcrypt hash, key the attempt counter on a random cid inside the token, and make the challenge single-use.

**Verifier:** Confirmed in golfer-otp.ts:43-55 and otp/request/route.ts:24-39: the challenge JWT carries codeHash = bcrypt(code, 10) and is returned to the requester. JWT claims are readable by whoever holds the token. The code space is 900k values, so one GPU cracks it offline well inside the 10-minute TTL. The rate limits in verify/route.ts:41-46 only cap online guesses, and the challenge is not single-use. inquiry-signin.ts:52-57 describes this exact weakness and fixes it with an HMAC; golfer-otp.ts never got that fix. Verify then creates or signs into the account and runs linkGuestBookings. Nothing else guards this path.

### R-BOOK-003 (S1) A no-show booking can still be cancelled, which charges the late fee again on top of the no-show fee

`src/lib/cancel-booking.ts:104`

**Evidence:** Under the 'late_cancel_or_no_show' timing, noShowTotalCents() returns lateFeeTotalCents (cancel-policy.ts:70). markNoShow (no-show-fee.ts:47-76) sets noShowAt and charges that amount, recording it only as a PaymentEvent 'no_show_fee'. It does not change paymentStatus. performCancellation refuses only cancelled and completed bookings (lines 38-39) and never looks at noShowAt or whether the tee time has passed. It sets `feeAlreadyCharged = booking.paymentStatus === 'cancellation_fee_charged'`, which is false here. `isLate` is true, and `chargesOnLateCancel` is true, so it calls chargeOnConnectedAccount again with key `latefee-${id}-...`, a different key from the `noshowfee-` charge. The golfer can reach this path: the manage page works for 24h after the tee time (TOKEN_GRACE_MS, manage/[bookingId]/route.ts:7), and /api/bookings/cancel has no time check. Staff reach it through the cancel action on the sheet (operator/bookings/route.ts:189).

**Impact:** A golfer who was marked a no-show, automatically or by staff, and then cancels from the confirmation link, or whom staff 'cancel' to tidy the sheet, is charged the course's fee twice for one missed round. The cancellation also refreshes GreenReserve's fee handling.

**Fix:** In performCancellation, refuse (or treat as already handled) a booking with noShowAt set or whose tee time is past, and count a live no_show_fee as feeAlreadyCharged. Then make the golfer cancel route enforce the same rule.

**Verifier:** Under late_cancel_or_no_show with noShowFeeCents=0, noShowTotalCents returns the late-fee total (cancel-policy.ts:67-71). markNoShow (no-show-fee.ts:47-100) charges it with key noshowfee-… and records only a PaymentEvent; it never touches paymentStatus. performCancellation guards only cancelled and completed (:38-39). feeAlreadyCharged checks only paymentStatus==='cancellation_fee_charged' (:75). isLate is true after the tee time, and chargesOnLateCancel is true, so it charges again with a different idempotency key (latefee-…). The path is reachable. The manage page keeps the Cancel ActionCard visible with no time gate, the manage GET allows 24h after the tee (TOKEN_GRACE_MS), and /api/bookings/cancel has no time or noShowAt check. The code comment at cancel-booking.ts:230 ('a no-show then cancelled') shows the authors expected this path. The course fee is double-charged to the golfer's card.

### R-CRON-001 (S1) Automatic no-show re-marks and re-charges a booking that staff cleared with "still coming"

`src/app/api/cron/hourly/route.ts:197`

**Evidence:** Hourly candidates: `where: { status: 'confirmed', noShowAt: null, checkedInAt: null, autoNoShowMinutesAtBooking: { not: null }, teeTime: { date: { gte: scanFrom, lte: scanTo } } }`, then `if (dueMs > now) continue; await markNoShow(b.id, { type: 'cron' }, { auto: true })`. The `still_coming` action (src/app/api/operator/bookings/route.ts:137-147) sets `noShowAt: null` and refunds both charges, but leaves the booking confirmed and not checked in, because the group is late and hasn't arrived yet. On the next hourly run the booking matches the filter again (dueMs is still in the past), so markNoShow runs a second time. In src/lib/no-show-fee.ts, `liveNoShowCharge()` now returns null (the last event is `no_show_fee_refunded`), and the idempotency key is `noshowfee-${id}-${attempt}-…` where attempt = count of refunds = 1, so it's a NEW Stripe charge. chargeAccessFeeSeparately (src/lib/access-fee.ts:90,100,113) works the same way: `liveSeparateFee` is false after the refund and `accessfee-${id}-${attempt}-…` with attempt=1 is a new key. Repro: auto no-show at 30 min; tee time 9:00; cron at 10:00 marks and charges; staff press Still coming at 10:10; the golfer is checked in at 11:05; the 11:00 cron has already charged the no-show fee and the $1.50 fee again. This repeats every hour until check-in.

**Impact:** A late golfer whom staff explicitly cleared gets charged the course's no-show fee and GreenReserve's booking fee again, possibly more than once. Staff only see this if they open the ledger, and the refund has to be done by hand in Stripe.

**Fix:** Have the auto-no-show candidate query skip any booking that already has a `no_show_cleared` BookingEvent (or a `no_show_marked` event: one automatic mark per booking ever). For example, add `events: { none: { type: { in: ['no_show_marked','no_show_cleared'] } } }` to the where clause, or pre-filter with a BookingEvent lookup.

**Verifier:** I confirmed this. The hourly:197 query filters only on status confirmed, noShowAt null, checkedInAt null and autoNoShowMinutesAtBooking not null; nothing in it looks at BookingEvents. The still_coming action (operator/bookings:137-147) sets noShowAt back to null and leaves the booking confirmed, so on the next hourly run the booking is a candidate again with dueMs still in the past. markNoShow then charges again. liveNoShowCharge() returns null once the last ledger row is no_show_fee_refunded, and the key `noshowfee-${id}-${attempt}` uses attempt = count of refunds = 1, so Stripe treats it as a new charge. chargeAccessFeeSeparately behaves the same way: refundSeparateAccessFee sets stripePaymentIntentId to '', liveSeparateFee becomes null, and attempt = count of fee_refunded gives a fresh key. At check-in, performCheckIn (checkin-booking.ts:315) refunds only the separate GreenReserve fee and never calls refundNoShowFee, so the course's second no-show charge is kept. This is real money taken from a golfer staff had already cleared.

### R-CRON-002 (S1) Both cutoff crons use the course's CURRENT cancellationHours, not the window copied onto the booking

`src/app/api/cron/hourly/route.ts:66`

**Evidence:** hourly:66 `const cutoffMs = teeMs - booking.course.cancellationHours * 3600 * 1000;` and cancellation-cutoff:58 `const cutoffMs = teeMs - booking.course.cancellationHours * 60 * 60 * 1000;`. The warning email at hourly:81 also passes `cancellationHours: booking.course.cancellationHours`. The booking carries `cancellationHoursAtBooking` (schema: "the course's cancellation window at the moment of booking, so a later policy change never moves this golfer's deadline"), and cancel-booking.ts:102 honours it (`booking.cancellationHoursAtBooking ?? booking.course.cancellationHours`). Repro: a golfer books under a 24h window, then the course changes it to 48h. At T-48h the hourly cron charges the hold and sets paymentStatus 'cancellation_fee_charged'. The golfer cancels at T-30h, which is free under the terms they agreed to. cancel-booking.ts:76 sees `feeAlreadyCharged = booking.paymentStatus === 'cancellation_fee_charged'`, keeps the fee, and the cancellation email says it is non-refundable. The reverse change (48h to 24h) leaves the hold uncharged during the window the golfer agreed to.

**Impact:** Golfers who cancel inside their agreed free window are charged a fee that is then kept. This breaks the CLAUDE.md rule that the policy is copied at booking and a later change never reaches existing bookings.

**Fix:** In both crons and the warning email, use `booking.cancellationHoursAtBooking ?? booking.course.cancellationHours` (the same expression cancel-booking.ts uses), ideally through one shared helper.

**Verifier:** I confirmed this. hourly:66 and cancellation-cutoff:58 both compute the cutoff from booking.course.cancellationHours. cancellationHoursAtBooking exists (schema:497, written in both booking-creation routes), and cancel-booking.ts:102 honours it, but only for the late-cancel charge. The course owner can change cancellationHours in operator/settings (OWNER_ONLY_FIELDS). Once the cron sets paymentStatus to cancellation_fee_charged, cancel-booking.ts:76 sets feeAlreadyCharged and keeps the fee whatever the time (there is no isLate check on that path), and the cancellation email reports it as charged. So a golfer who cancels inside the window they agreed to pays a fee that is kept. I found no guard that blocks policy changes while bookings exist.

### R-GOLF-001 (S1) The cutoff a golfer agreed to (cancellationHoursAtBooking) is ignored by both crons, the manage page and the booking-time warning email. They use the course's CURRENT window

`src/app/api/cron/hourly/route.ts:66`

**Evidence:** The booking stores the window: bookings/route.ts:277 `cancellationHoursAtBooking: teeTimeFull.course.cancellationHours` ("SD-5: the window this golfer agreed to"). Only cancel-booking.ts:102 reads it: `const windowHours = booking.cancellationHoursAtBooking ?? booking.course.cancellationHours`. Everything else uses the live course value. hourly/route.ts:66 `const cutoffMs = teeMs - booking.course.cancellationHours * 3600 * 1000;` then charges the hold at :93-110. cancellation-cutoff/route.ts:58 does the same. manage/[bookingId]/route.ts:49 `const cutoffMs = teeMs - booking.course.cancellationHours * ...; const windowOpen = Date.now() < cutoffMs;`. bookings/route.ts:336 uses course.cancellationHours for the warning email. Recipe: a golfer books under a 24h window and the owner changes it to 48h. At 47h the hourly cron charges the hold and sets paymentStatus cancellation_fee_charged. At 30h the golfer cancels, which is free under their terms: cancel-booking.ts:76 sees `feeAlreadyCharged = true`, keeps the fee, and line 233 also charges the $1.50/player. In the other direction (48h changed to 24h), the manage page says 'Cancel for free' at 30h, but under late_cancel timing cancel-booking.ts:103-104 treats the cancel as late (48h window) and charges the late fee.

**Impact:** A golfer is charged a late fee plus the GreenReserve fee inside the free-cancellation window they agreed to and were shown at booking. Or a golfer told 'free' by the manage page is charged on cancel. Either way it is a chargeback risk for the course.

**Fix:** Add one helper, e.g. `bookingCutoffMs(booking)` = tee time minus `(booking.cancellationHoursAtBooking ?? booking.course.cancellationHours)` hours, and use it in hourly, cancellation-cutoff, the manage GET (windowOpen and cancellationHours) and the booking-route warning email. Add a regression test that changes course.cancellationHours after booking.

**Verifier:** Confirmed. cancellationHoursAtBooking is written at bookings/route.ts:277 and operator/bookings:246, but the only reader is cancel-booking.ts:102. hourly/route.ts:66 and cancellation-cutoff/route.ts:58 compute the cutoff from course.cancellationHours (their selects do not even fetch the snapshot). manage/[bookingId]/route.ts:49 computes windowOpen the same way, and bookings/route.ts:336 does too. With a 24h snapshot and the course moved to 48h, the hold is charged at 47h. A cancel at 30h then sees feeAlreadyCharged (cancel-booking.ts:76), keeps the fee and charges the access fee (:233). The reverse direction also holds: the manage page says free while performCancellation uses the 48h snapshot and charges the late fee.

### R-GOLF-002 (S1) Changing the party size on the manage page does not re-price a per-player late fee or no-show fee

`src/app/api/manage/[bookingId]/change-players/route.ts:65`

**Evidence:** At creation (bookings/route.ts:207-208) `cancellationFeeTotal = lateFeeTotalCents(policy, players)` and `noShowFeeTotal = noShowFeeCents(policy, players)` are multiplied by players when lateFeeBasis/noShowFeeBasis is 'player'. change-players only writes `data: { players: newPlayers, greenFeeTotal, cartFeeTotal, accessFeeTotal, totalAmount, termsAcceptedAt, termsVersion }`: cancellationFeeTotal and noShowFeeTotal are never selected or recomputed. The hold (hourly/route.ts:102 `amountCents: Math.round(booking.cancellationFeeTotal)`) and the late-cancel charge (cancel-booking.ts:113) charge the stale total.

**Impact:** Example: a course charges $10 per player. A golfer books 4 and drops to 2 on the manage page. The policy they were shown says $10 per player, but the hold or late fee charged is $40, not $20. Growing the party undercharges the course in the same way.

**Fix:** In the change-players transaction, read the booking's basis (or recompute from the per-player amount: cancellationFeeTotal / old players when the basis is 'player') and write the new cancellationFeeTotal and noShowFeeTotal. The basis has to be snapshotted on Booking if it isn't already (lateFeeBasisAtBooking).

**Verifier:** Confirmed. change-players/route.ts selects and writes only players, greenFeeTotal, cartFeeTotal, accessFeeTotal, totalAmount and terms. cancellationFeeTotal and noShowFeeTotal are never touched. At creation they come from lateFeeTotalCents(policy, players) and noShow*(policy, players), which multiply by players when the basis is 'player' (cancel-policy.ts:61-71). The hold (hourly:102) and the late charge (cancel-booking.ts:113) charge the stale total. Booking has no basis snapshot (CODEMAP field list), so the fix also needs the basis snapshotted or derived.

### R-OPS-001 (S1) Checking in a group already marked no-show keeps the course's no-show fee and charges the full round as well

`src/lib/checkin-booking.ts:314`

**Evidence:** chargeBooking() undoes only GreenReserve's separate fee: `if (booking.stripePaymentIntentId) { await refundSeparateAccessFee(...) }`. It never calls refundNoShowFee() (src/lib/no-show-fee.ts:88), and its final update (status 'completed', paymentStatus 'paid', ...) never clears noShowAt. The sheet still offers that check-in: the expanded-row 'Check in' button at src/app/dashboard/page.tsx:890 is gated on `b.status !== 'completed' && b.status !== 'cancelled' && b.paymentStatus !== 'manual' && access.can('sheet.checkin')`, with no noShowAt check, and it renders right beside the 'No-show' label. Only the quick row button (`!live[0].noShowAt`) and the 'Still coming' action (route.ts:137-147, which calls refundNoShowFee) handle this case. The golfer self check-in link (/api/checkin/[bookingId]) goes through the same performCheckIn.

**Impact:** A golfer is marked no-show, either by staff or by the auto no-show N minutes after the tee time, and that charges the course's no-show fee. The group then turns up late. Staff press 'Check in' (or the golfer uses their link), and the card is charged the full round on top of the no-show fee, which is never refunded. The booking is also left 'completed' with noShowAt still set.

**Fix:** In chargeBooking, after a successful charge on a booking with noShowAt set, call refundNoShowFee(bookingId) and clear noShowAt in the record update. Report a failed refund the same way feeRefundFailed is reported. Do the same in the paid_offline branch of the operator bookings route.

**Verifier:** Confirmed in src/lib/checkin-booking.ts. chargeBooking refunds only the cutoff hold (refundPendingFee) and GreenReserve's separate fee (line 314). It never calls refundNoShowFee, and the final update at lines 325-335 never clears noShowAt. Nothing guards on noShowAt, either in chargeBooking or in the self check-in route (api/checkin/[bookingId]/route.ts:76). On the dashboard, the expanded-row 'Check in' button (page.tsx ~890) has no noShowAt check; only the quick button (line ~800) does. The code's own comment at line 311 treats 'a no-show that turned up after all' as a case to undo, but it undoes only GreenReserve's fee. STAFF_POLICY_SPEC B2/B4 say the no-show charge is undone when the group is in fact there. So the golfer pays the full round plus the course no-show fee, and the no-show fee is never refunded. Money is taken wrongly, so S1 stands.

### R-PAY-002 (S1) Cancelling after a no-show charges the late fee on top of the no-show charge ('never both' broken)

`src/lib/cancel-booking.ts:104`

**Evidence:** performCancellation() works out `feeAlreadyCharged = booking.paymentStatus === 'cancellation_fee_charged'` (l.76) and charges the late fee when `!waiveFee && !feeAlreadyCharged && isLate && booking.cancellationFeeTotal > 0 && chargesOnLateCancel(booking)` (l.104). It never looks at noShowAt or the live 'no_show_fee' PaymentEvent. markNoShow() does not change paymentStatus. Under late_cancel_or_no_show with no separate no-show fee, noShowTotalCents() = lateFeeTotalCents (cancel-policy.ts:306), so the no-show already charged the late fee. Neither the golfer cancel route (api/bookings/cancel/route.ts) nor performCancellation refuses a booking whose tee time has passed or that has noShowAt set. The manage page shows Cancel for any non-cancelled, non-completed booking (manage/[bookingId]/page.tsx:498-521), and the manage token stays valid 24h after the tee time (api/manage/[bookingId]/route.ts:7,45). Repro: $25 late fee, timing late_cancel_or_no_show, auto no-show 15 min. The cron marks the no-show and charges $25. The golfer opens the manage link and cancels, and latefee-<id>-<pm> charges another $25. Variant: on a no-show-fee-only course, the same cancel calls refundSeparateAccessFee (l.234) and gives back GreenReserve's $1.50/player while the course keeps its no-show fee.

**Impact:** The golfer is charged the late fee twice for one missed round, which contradicts describePolicy's 'Never both'. Or GreenReserve's fee is refunded on a no-show that the course kept.

**Fix:** In performCancellation, refuse to cancel (409) once noShowAt is set or the tee time has passed, because a no-show is resolved with still_coming, not cancel. At minimum, treat a live no-show charge as feeAlreadyCharged.

**Verifier:** Confirmed in src/lib/cancel-booking.ts. There is no guard on noShowAt or a passed tee time, only on cancelled/completed. feeAlreadyCharged only reads paymentStatus==='cancellation_fee_charged', and markNoShow (no-show-fee.ts) never changes paymentStatus. Under late_cancel_or_no_show, noShowTotalCents = the late fee, so the no-show already charged it, and the cancel then charges latefee-<id>-<pm> again (a different idempotency key). The golfer cancel route has no tee-time guard, the manage page always shows Cancel, and the token stays valid 24h after the tee time. This is a double charge of the golfer, which contradicts 'Never both'.

### R-ADM-001 (S2) Pipeline emails sent via after() report success to the admin even when the email fails; resend_welcome rotates the operator's password first

`src/app/api/admin/inquiries/route.ts:521`

**Evidence:** request_details/resend_details (487), resend_welcome (531), send_dashboard_access (556), build_course (1147) and mark_live (614) all do `after(sendX(...).catch(e => console.error(...)))` then `return NextResponse.json({ success: true })`. For resend_welcome/send_dashboard_access the password hash and verificationToken are overwritten (529/554) BEFORE the email is queued, and the JSON deliberately omits the temp password (MP-2c comment 536-538). Compare reject (363-380), schedule_call (186-195), log_call (262-270) and send_call_followup (312-318), which await the send and return emailSent/emailError, and the UI reports it (inquiries/[id]/page.tsx:487). The client for these five actions (page.tsx:480-492) only shows approveResult/success. Admin Overview fireAction (admin/page.tsx:269-277) and the bulk 'send_sheet' (inquiries/page.tsx:375-379) count the same call as 'Sent' / 'succeeded'.

**Impact:** Admin clicks Resend welcome / Send dashboard access / Send setup sheet, sees success, but if Resend rejects the send nothing is delivered and nothing is shown. For the two operator-access actions the operator's previous password is already dead and the new one exists only in the failed email, so the operator is locked out and the admin believes they were sent access. Violates the no-silent-failures rule (admin click, cannot tell what happened).

**Fix:** Await the send in these five actions like reject/schedule_call (try/catch -> emailSent/emailError in the JSON) and have the UI, the Overview quick action and the bulk runner treat emailSent===false as a visible failure with a retry; for the access emails, do not rotate the password until the send has succeeded.

**Verifier:** Opened src/app/api/admin/inquiries/route.ts. request_details/resend_details (~471-490), resend_welcome (~523-540), send_dashboard_access (~546-563), mark_live (~605-612) and build_course (~1147) all queue the send with after(...).catch(console.error) and return { success: true }. In resend_welcome and send_dashboard_access, courseOperator.update overwrites the password and verificationToken before the email is queued, and the JSON leaves out the temp password (MP-2c). The reject branch (~355-380) awaits its send and returns emailSent/emailError. Its own comment says every other email on this page is fire-and-forget and the 'Email failed' UI is dead code. The bulk runner (inquiries/page.tsx:375) and the Overview quick action (admin/page.tsx:269) count r.ok as success. I found no other guard. A failed send leaves the operator locked out of their old credentials while the admin sees success. S2 stands.

### R-AUTH-002 (S2) Member accept-invite writes an unverified phone onto the new GolferAccount, and phone OTP sign-in then routes that number's owner and their guest bookings into that account

`src/app/api/golfer/auth/accept-invite/route.ts:50`

**Evidence:** accept-invite POST creates the GolferAccount with `phone: phone ? String(phone).trim() : null`, taken from the body with no possession proof. otp/verify/route.ts:93-95 resolves a phone sign-in with findUnique({ where: { phone } }) and then runs linkGuestBookings(identifier,'phone', golfer.id) (line 124), matching guest bookings by the last 10 digits.

**Impact:** Whoever holds a member invite can claim someone else's phone number. When the real owner later signs in by phone, they land in the invitee's account, and their phone-matched guest bookings (with checkInTokens) become visible to the invitee. The victim has to sign in by phone for this to happen, which is why it is rated S2.

**Fix:** Don't store a phone from accept-invite (or store it as unverified and exclude it from OTP lookup and booking linkage) until it has passed an OTP.

**Verifier:** accept-invite/route.ts:49-51 stores `phone` from the request body with no check that the sender owns the number. It is the only route that writes GolferAccount.phone; profile and me only read it. otp/verify:53-55 looks up findUnique({phone: identifier}) with the normalized +1 form. An attacker who types the normalized number at accept-invite owns that phone slot. When the victim later signs in by phone, they land in the attacker's account, and linkGuestBookings attaches the victim's guest bookings to it. Exploiting it needs a member invite and a later phone sign-in by the victim, so S2 stands.

### R-AUTH-003 (S2) Manage, cancel and change routes ignore a valid emailed token whenever a golfer session exists, so logged-in golfers get 'Invalid or expired link' for bookings not attached to their account

`src/app/api/manage/[bookingId]/route.ts:36`

**Evidence:** `const authorized = golferSession ? booking.golferAccountId === golferSession.golferId : booking.checkInToken === token;` The same either/or logic appears in manage/[bookingId]/available-times:23, change-players:36, swap-time:38, send-modified-email:21 and bookings/cancel/route.ts:109-118. Counter and phone bookings (operator/bookings POST, claimTeeTime) never set golferAccountId, and guest bookings under another email aren't linked either.

**Impact:** A golfer who has a gr_golfer cookie (90 days, sliding) and clicks Manage or Cancel in a walk-in or phone-booking confirmation email hits a 404 or 403 and can't change or cancel online.

**Fix:** Authorize when EITHER the session owns the booking OR the token matches: `(golferSession && booking.golferAccountId === golferSession.golferId) || (token && booking.checkInToken === token)`. Ideally put this in one shared helper used by all six routes.

**Verifier:** manage/[bookingId]/route.ts:36-38 uses either/or logic: when a session exists, the token is never checked. The same pattern is in available-times:23, change-players:36, swap-time:38, send-modified-email:21 and bookings/cancel:30-39. Bookings that are not linked to the session's account (counter or phone bookings, or guest bookings made under another email) get 404 or 403 from a valid emailed link while a gr_golfer cookie is present. The golfer's only way around it is to sign out.

### R-BOOK-001 (S2) teeToUtcMs is off by one hour on DST Sundays, so auto no-show, the hold charge and the late-fee cutoff fire an hour early (Nov 1 2026)

`src/lib/tee-time-utils.ts:34`

**Evidence:** teeToUtcMs takes the zone offset at the instant `naive` (the local wall time read as UTC) and applies it once: `return naive.getTime() + (naive.getTime() - tzLocal.getTime())`. On a transition day, that instant is on the other side of the change from the real tee time. I ran the function body in node: ('2026-11-01','07:00','America/Los_Angeles') returns 14:00Z, which is 6:00 AM local, not 7:00. ('2026-11-01','08:30','America/Los_Angeles') returns 7:30 local. ('2026-11-01','05:30','America/New_York') returns 4:30 local. ('2027-03-14','07:00','America/Los_Angeles') returns 8:00 local. Affected: Pacific tee times 02:00–08:59 local, Mountain 02:00–07:59, Central 02:00–06:59, Eastern 02:00–05:59. Callers that depend on it: auto no-show `dueMs = teeToUtcMs(...) + autoNoShowMinutesAtBooking*60_000` (src/app/api/cron/hourly/route.ts:201), the cutoff hold charge (hourly/route.ts:65, cancellation-cutoff/route.ts:57), the late-cancel test `isLate` (cancel-booking.ts:101-104, through teeTimeInstant in booking-events.ts:43), the manage page's windowOpen/expiry (manage/[bookingId]/route.ts:44), and booking-time warning emails (bookings/route.ts:335). No script tests DST: grep for DST/11-01/teeToUtcMs in scripts/*test* finds nothing.

**Impact:** Example: a Pacific course with auto no-show at 15 minutes and a 7:00 tee time on Sun Nov 1 2026. The computed due time is 6:15 real time, so the 6:00 hourly run, or at the latest the 7:00 run, marks the group a no-show and charges the no-show fee plus GreenReserve's $1.50. The 6:00 run does this before the group is due to arrive. Hold fees and late-cancel fees also start an hour early, so a golfer who cancels in the last hour before the real cutoff is charged a fee the policy does not allow.

**Fix:** Do a second pass: compute the offset at the first guess (naive + offset(naive)), then recompute it at that guess and use the second offset. Add a course-time-test case for 2026-11-01 and 2027-03-14 in America/Los_Angeles and America/New_York.

**Verifier:** I ran the exact body of src/lib/tee-time-utils.ts:11-35 in node. For ('2026-11-01','07:00','America/Los_Angeles') it returns 14:00Z, which is 6:00 AM PST. 2027-03-14 07:00 returns 8:00 local, and NY 05:30 on Nov 1 returns 4:30. 10:00 LA on Nov 1 is correct. The callers are confirmed: hourly/route.ts:65 and :201, cancellation-cutoff:57, manage route:44, and teeTimeInstant (booking-events.ts:43) used for isLate in cancel-booking.ts:101-103. One correction: with auto no-show at 15 min, the due time is 6:15 PST, so the 6:00 run (14:00Z) does NOT mark it. The 7:00 run marks it at tee time, which is still earlier than the policy allows, and with N=0 the 6:00 run would mark it. I lowered this to S2: it only hits early-morning tee times on two days a year, and the hold and no-show charges are refundable ('still coming' and check-in refunds). The late-cancel fee in the wrong hour is the only part that is not refundable.

### R-BOOK-002 (S2) Two cancels of the same booking at once both free its seats, so the slot can be oversold

`src/lib/cancel-booking.ts:155`

**Evidence:** performCancellation reads the booking outside any transaction and checks `if (booking.status === 'cancelled') return ...` (line 39). It then makes Stripe calls (round refund and late-fee charge, lines 50-120), which can take seconds. Only after that does it run a default-isolation transaction with `tx.booking.update({ where: { id: bookingId }, data: { status: 'cancelled', ... } })` and `tx.teeTime.update({ ..., data: { playersBooked: { decrement: booking.players } ... } })`. Neither write is conditional on the booking still being confirmed. Two requests that both pass the line-39 read will both decrement. Possible triggers: a double-click, the golfer cancelling from the manage link while staff cancel on the sheet, or admin plus operator. The admin route comment (admin/tee-sheet/route.ts:47-51) says exactly this bug, 'two clicks decremented playersBooked twice and overbooked the slot', was fixed, but the guard is still a read-then-write.

**Impact:** After two concurrent cancels of a 2-player booking on a 4-seat slot that also holds another 2-player group, playersBooked is 0 instead of 2. claimTeeTime then lets 4 more golfers book, so 6 golfers are on a 4-player tee time. The cancellation email and alert emails also go out twice.

**Fix:** Make the state change conditional inside the transaction, e.g. `const r = await tx.booking.updateMany({ where: { id: bookingId, status: 'confirmed' }, data: {...} }); if (r.count === 0) throw <already cancelled>`, and decrement only when r.count === 1. Better still, claim that transition before any Stripe call. Add the double-cancel case to concurrency-test.

**Verifier:** cancel-booking.ts:29-39 reads the booking and checks status outside any transaction. The transaction at :142-162 then does an unconditional booking.update and a teeTime.update that decrements playersBooked. Under Postgres Read Committed, a second concurrent request waits on the row lock and then decrements again. All six callers (admin tee-sheet, admin golfers, operator bookings, bookings/cancel, course-closure, weather-cancel) go through this function with no other lock. It is real, but it needs truly concurrent requests: the window is milliseconds unless a Stripe call is made. It is an oversell, not money or security, so S2 rather than S1.

### R-BOOK-004 (S2) Cancel, time swap and party-size change overwrite a blocked slot's status to 'available', reopening a closed tee time

`src/lib/cancel-booking.ts:155`

**Evidence:** Blocking a slot that has bookings keeps those bookings (schedule-service.ts:199-213: 'existing bookings on it are left exactly as they are'). So do blackouts (operator/blackouts/route.ts:23-24: booked times are 'blocked in place'), and frost delay leaves unplaced groups on blocked early slots (frost-delay.ts:79-86). Every path that frees seats then writes the status without checking for 'blocked': cancel-booking.ts:155 `status: keepSlotBlocked ? 'blocked' : 'available'` (keepSlotBlocked is passed only by weather-cancel), manage/[bookingId]/swap-time/route.ts:93 sets the old slot to `status: 'available'`, and manage/[bookingId]/change-players/route.ts:79 sets `status: newPlayersBooked >= ... ? 'full' : 'available'`.

**Impact:** Staff block 8:00 for a shotgun start or maintenance, or block a whole day, or a frost delay blocks the early times. When the one golfer still on that slot cancels or moves, the slot goes back on public sale and the generator never re-blocks it, because it skips non-empty slots. Golfers then book a time the course is closed.

**Fix:** Leave the status alone when it is 'blocked'. For example, set the status only through a helper that keeps 'blocked', or use `updateMany({ where: { id, status: { not: 'blocked' } } })` for the status flip, and do the decrement separately.

**Verifier:** cancel-booking.ts:155 writes status keepSlotBlocked ? 'blocked' : 'available', and only weather-cancel passes keepSlotBlocked. swap-time/route.ts:91-95 sets the old slot to 'available' unconditionally. change-players/route.ts:77-81 sets 'full' or 'available'. setTeeTimeBlocked (schedule-service.ts:204-215) and the blackouts route (updateMany to blocked at :24) both leave bookings on blocked slots. So when the last golfer leaves a blocked slot, the slot reopens for public booking.

### R-BOOK-005 (S2) Members of a private club can never book: /api/bookings rejects every private course before it checks membership

`src/app/api/bookings/route.ts:108`

**Evidence:** `if (teeTimeFull.course.type === 'private') { return NextResponse.json({ error: 'Online booking is not available for this private club.' }, { status: 403 }); }` runs before the membership lookup at lines 122-160. The private-club course page shows 'Tee time booking is reserved for members. Sign in to your member account to view availability and book.' (CourseBookingClient.tsx:601) and links to /courses/[slug]/member. That page's handleBookMemberTime pushes /book (member/page.tsx:346-356), and BookClient POSTs to /api/bookings (BookClient.tsx:489). No other route creates golfer or member bookings: claimTeeTime is called only from bookings, operator/bookings and admin/tee-sheet.

**Impact:** At every course with type 'private', a signed-in member who picks a time and confirms gets a 403 'Online booking is not available'. The member booking flow the page advertises fails at the last step.

**Fix:** Allow the booking when the request carries a recognized active membership for this course (the viewerMembership resolved at lines 128-160). Move the private check after that lookup and reject only when viewerMembership is null.

**Verifier:** bookings/route.ts:108-110 returns 403 for course.type==='private' before the membership lookup at :122-160, and there is no member exception. CourseBookingClient.tsx:601 tells private-club visitors to sign in and book. member/page.tsx:346-357 pushes /book, and /book uses loadPublicTeeTimes, which does not reject private courses, so the member gets all the way to the POST and is refused there. No other creation route exists for golfers or members.

### R-BOOK-006 (S2) /book loads the tee time with the PUBLIC window, so member advance bookings beyond it fail

`src/app/book/page.tsx:22`

**Evidence:** The server render does `loadPublicTeeTimes(slug, date)`, which applies `windowFor(dbCourse, null)`, the public window, and returns 403 outside it (public-tee-times.ts:59-62). The page then sets `error: 'This tee time is no longer available. Please pick another.'`. The client fallback in BookClient.tsx:158 also fetches only `/api/courses/${courseSlug}/tee-times`. Members reach /book from member/page.tsx:356 with dates taken from /api/member/[courseSlug]/tee-times, which uses the member/tier window (member tee-times route lines 39-42). /api/bookings itself would accept these dates (bookings/route.ts:164).

**Impact:** With the default 7-day public and 14-day member windows, a member picking any time 8–14 days out, which is the main thing a membership buys, sees 'This tee time is no longer available' and cannot book.

**Fix:** Have /book resolve the viewer's membership the way /api/bookings does and use windowFor(course, membership), or load the slot by id with the member-aware window. Apply the same change to the client fallback fetch.

**Verifier:** book/page.tsx:22 calls loadPublicTeeTimes, which uses windowFor(dbCourse, null) and returns 403 outside the public window (public-tee-times.ts:59-62). The page then shows 'This tee time is no longer available'. The BookClient fallback (:158) fetches /api/courses/[slug]/tee-times, which is the same public loader. The member tee-times route uses windowFor(course,{tier}) (14-day default). /api/bookings would accept these dates for a member, but the page never gets that far.

### R-BOOK-007 (S2) Swap-time and change-players enforce no time rules on the server: past slots, any date, after the cutoff

`src/app/api/manage/[bookingId]/swap-time/route.ts:55`

**Evidence:** swap-time checks only status, same course, not blocked and room (lines 40-58). It has no isPastIn on the new slot, no booking-window check, no same-date rule and no cutoff check. available-times (available-times/route.ts:28-37) lists same-day slots without filtering past times. change-players (change-players/route.ts) also has no cutoff check. The only cutoff gate is client-side: `canModify = ... && info.windowOpen` (manage/[bookingId]/page.tsx:300). CLAUDE.md treats the route as the control.

**Impact:** With the booking's token, a golfer can POST a swap to a tee time that has already gone off, which puts the booking in the past. They can swap to a date beyond the public window. Under a late-cancel policy they can swap inside the window to next month and then cancel free, avoiding the fee. With a small cancellationHours, the UI itself offers past same-day slots.

**Fix:** In swap-time, reject when the current booking is past its cutoff (cancellationHoursAtBooking), when the new slot isPastIn, or when it is outside windowFor. Filter past slots out of available-times. Add the cutoff check to change-players.

**Verifier:** swap-time/route.ts checks only authorization, status==='confirmed', same course, not blocked and capacity. It has no past-slot, date, window or cutoff check. change-players has no cutoff check. available-times lists same-date non-blocked slots without filtering past times. The only gate is the client's canModify = ... && info.windowOpen (manage page :300). A crafted POST after the cutoff can move a late_cancel booking to a far date, where isLate is false and cancellation is free. This needs a crafted request, so S2 is right.

### R-BOOK-008 (S2) The nightly generator deletes every empty slot, including staff-added walk-in slots, and gives the others new ids

`src/lib/tee-sheet-engine.ts:122`

**Evidence:** `const toDelete = existing.filter(t => t.playersBooked === 0 && t.status !== 'blocked' && t._count.bookings === 0)`. This deletes every empty open slot, not only 'changed or no longer in the schedule' as the comment says, and then recreates only the schedule's desired times. Staff 'open a walk-in slot' via POST /api/operator/tee-times (route.ts:82-91, custom time and capacity up to 8, productId null), and that slot is in no schedule. generateForAllCourses runs for every date from the course's today (cron 0 3 * * *), and regenerateUpcoming runs on every schedule save, delete and product change.

**Impact:** A slot staff added for tomorrow or later, or for later today if a schedule is saved, disappears that night or on the next schedule save if nobody has booked it yet. It is lost with its custom capacity. Every other empty slot gets a new id each night, so a golfer with /book open across 3am UTC (8pm Pacific) gets 'Tee time not found' when confirming.

**Fix:** Delete only slots whose (productId,time) is not in `desired` or whose generated fields differ, and update matching rows in place instead of delete-and-create. Mark operator-created slots (e.g. tierName 'manual' or a flag) and never delete them.

**Verifier:** tee-sheet-engine.ts:122 deletes every slot with playersBooked===0, not blocked and no bookings, whether or not its key is in desired, and then recreates only the desired slots. Operator POST /api/operator/tee-times creates a slot with no productId and no marker (route.ts:82-91), so a walk-in slot at a non-schedule time or custom capacity is deleted on the next generation (nightly cron or any schedule save via regenerateUpcoming) and never recreated. Empty schedule slots are recreated with new ids. This is confirmed as described.

### R-BOOK-009 (S2) Blocking a day fails with a 500 when any booking on that date was cancelled

`src/app/api/operator/blackouts/route.ts:23`

**Evidence:** `prisma.teeTime.deleteMany({ where: { courseId, date, bookings: { none: { status: { in: ['confirmed', 'completed'] } } } } })` also selects slots that hold only CANCELLED bookings. Booking_teeTimeId_fkey is `ON DELETE RESTRICT` (prisma/migrations/0000_baseline/migration.sql:545), so the statement throws P2003, the route returns an unhandled 500, and no Blackout row is created. The generator already handles this case: tee-sheet-engine.ts:120-122 notes 'A slot whose only bookings are cancelled still has Booking rows pointing at it (RESTRICT)'. The operator DELETE /api/operator/tee-times has the same gap: it counts only confirmed/completed bookings (route.ts:130), then deleteMany at line 134 throws.

**Impact:** An operator who tries 'Block this day' on any date where a golfer once cancelled (a common case) gets an error, and the day stays on public sale. Deleting a single slot with a cancelled booking also 500s.

**Fix:** Use `bookings: { none: {} }` in the blackout deleteMany, and `_count.bookings === 0` / `booking.count({ where: { teeTimeId: id } })` for the slot delete, so slots with any history are blocked rather than deleted.

**Verifier:** blackouts/route.ts:23 deleteMany filters on bookings none with status in confirmed/completed, so it selects slots whose only bookings are cancelled. Booking_teeTimeId_fkey is ON DELETE RESTRICT (0000_baseline/migration.sql:545), there is no relationMode=prisma, and no later migration changes it. The statement throws, the error is uncaught, the route returns 500, and no Blackout is created. operator/tee-times DELETE (:130-134) counts only confirmed/completed and then deleteMany hits the same FK. The engine's own comment at :120-121 acknowledges this case.

### R-BOOK-010 (S2) Change-players never recomputes per-player late or no-show fees copied onto the booking

`src/app/api/manage/[bookingId]/change-players/route.ts:65`

**Evidence:** The update writes `players, greenFeeTotal, cartFeeTotal, accessFeeTotal, totalAmount` only. cancellationFeeTotal and noShowFeeTotal were computed at booking as `lateFeeTotalCents(policy, players)` / `noShowTotalCents(policy, players)`, i.e. fee × players when the basis is 'player' (cancel-policy.ts:60-71, bookings/route.ts:207-208). They are left at the original party size and then charged as stored: hourly hold, late cancel at cancel-booking.ts:112, and no-show at no-show-fee.ts:55.

**Impact:** Example: a $10-per-player policy, a booking for 4, reduced to 1. A later hold, late cancel or no-show charges $40 instead of $10. Going from 1 to 4 under-charges the course by $30.

**Fix:** Store the per-player basis on the booking, or recompute both totals from the booking's copied policy with the new player count in the same update. Note that the booking currently stores only totals, so record the basis or unit fee at creation.

**Verifier:** bookings/route.ts:207-208 stores cancellationFeeTotal=lateFeeTotalCents(policy,players) and noShowFeeTotal=noShowTotalCents(policy,players), which are per-player multiples when the basis is 'player'. The schema stores only these totals (schema.prisma:459,485) and no basis. change-players/route.ts:64-70 updates players and the green, cart, access and total fields but not cancellationFeeTotal or noShowFeeTotal. Those stale totals are what the hold, late-cancel (cancel-booking.ts:112) and no-show (no-show-fee.ts:55) charges use.

### R-BOOK-011 (S2) A schedule interval of 0 or below hangs tee-time generation, stalling the nightly cron for every course after it

`src/lib/schedule-service.ts:142`

**Evidence:** updateSchedule writes `intervalMinutes: data.intervalMinutes !== undefined ? Number(data.intervalMinutes) : existing.intervalMinutes`. createSchedule uses `Number(body.intervalMinutes) || 8`, which lets negatives through. Neither /api/operator/schedule nor /api/admin/schedule validates the value (operator/schedule/route.ts:37, 48-53). Only Birdie's proposal checks 5–20 (birdie/proposals.ts:118). generateTeeTimes loops `while (current < end) { ...; current += schedule.intervalMinutes; }` (tee-sheet-engine.ts:87-100): with 0 it never ends, and with a negative value it runs forever while adding new keys to `desired`. generateForAllCourses processes courses one after another in one invocation.

**Impact:** One crafted PATCH from any login with schedule.edit leaves that request hanging until the function times out. Every night after that, the generate-tee-times cron dies at that course, so no course later in the list gets new tee times and their sheets run dry after the window.

**Fix:** Validate in schedule-service, not only the UI: intervalMinutes must be an integer 5–60 (the Birdie range), and startTime/endTime must match HH:MM with start < end. As a backstop, guard the loop with `if (!(interval > 0)) skip`.

**Verifier:** updateSchedule (schedule-service.ts:142) writes Number(data.intervalMinutes) with no range check. createSchedule uses Number(x)||8, which lets negatives through. Neither the operator schedule route (:37, :48-56) nor the service validates it. With interval 0, the loop in tee-sheet-engine.ts:87-100 never terminates; with a negative value it grows desired until memory runs out. generateForAllCourses loops courses sequentially in one invocation, and its try/catch cannot rescue a hang, so later courses are not generated. This needs a schedule.edit login sending a crafted body.

### R-CRON-003 (S2) Hourly 30-minute send windows miss about half of all bookings, so the pay link and the cutoff warning never go out

`src/app/api/cron/hourly/route.ts:164`

**Evidence:** The cron runs at `0 * * * *` (vercel.json), so a given booking's minutes-to-event values seen by successive runs are 60 apart. The check-in/pay-link email fires only when `minsToTee` is in `[windowMins-15, windowMins+15)` (line 164). That 30-minute window is hit only when the tee time's minute-of-hour is in [45,60) or [0,15). Example: checkInWindowHours 3, tee 10:20; runs see 200 min (7:00) and 140 min (8:00), both outside [165,195), so no email. The cutoff warning (line 69, `minsToCutoff >= 45 && < 75`) has the same 30-minute window and misses cutoffs whose minute is in [15,45). For `no_payment_method` bookings (SP-B no-card courses) there is no fallback: cancellation-cutoff only queries `paymentStatus: 'card_on_file'`.

**Impact:** At no-card courses, roughly half of golfers never get the pay link that describePolicy() promises ("we'll send it again N hours before your round"). At fee courses, roughly half get no warning before the hold is charged. The confirmation-email link still works, so the flow isn't completely dead-ended.

**Fix:** Widen each window to the cron interval: check-in `windowMins - 60 < minsToTee <= windowMins`, warning `15 < minsToCutoff <= 75` (or any 60-minute half-open window). The existing paymentStatus flip dedupes the check-in email. The warning needs its own dedup (see R-CRON-005).

**Verifier:** I confirmed this. vercel.json runs hourly at `0 * * * *`. The check-in window (hourly:164) is 30 minutes wide, [W-15, W+15), and runs are 60 minutes apart, so a tee whose minute-of-hour falls in [15,45) is never inside the window. The tee 10:20 / 3h example checks out: the runs see 200 and 140 minutes. The warning window [45,75) misses the same way. For no_payment_method bookings the daily cancellation-cutoff gives no fallback because it queries only card_on_file. Card-on-file late-cancel bookings do fall to cutoff's else-branch. I'm keeping S2: at no-card courses, a golfer who never gets the pay link usually pays at the counter, where GreenReserve's fee can't be collected. The confirmation-email link still works.

### R-GOLF-003 (S2) A signed-in golfer opening a valid emailed manage link for a booking not linked to their account gets 'Link not recognized'. Session auth replaces token auth instead of being an alternative

`src/app/api/manage/[bookingId]/route.ts:36`

**Evidence:** `const authorized = golferSession ? booking.golferAccountId === golferSession.golferId : booking.checkInToken === token;` If a gr_golfer cookie is present, the valid token is never checked. The same pattern is in bookings/cancel/route.ts:30-39 ('Not your booking' 403), manage available-times:23, swap-time:38, change-players:36 and send-modified-email:21. Guest bookings get golferAccountId only at OTP verify time (otp/verify/route.ts:14-16), so a guest booking made AFTER the golfer last verified stays unlinked. Recipe: the golfer signed in on their phone last month (90-day cookie), books as a guest on a laptop, then taps 'Manage My Booking' in the email on the phone. The result is 404 and the page shows 'This link is invalid or has expired. Contact the course for assistance.'

**Impact:** The golfer cannot cancel, change the time or change players from their own confirmation email. The flow dead-ends and they have to phone the course. The same happens on any shared device signed in as someone else.

**Fix:** In all six routes: `authorized = (golferSession && booking.golferAccountId === golferSession.golferId) || (!!token && booking.checkInToken === token)`.

**Verifier:** Confirmed. manage GET (:36), available-times (:23), swap-time, change-players and send-modified-email (:21) all use `golferSession ? accountId match : token match`. bookings/cancel/route.ts:30-39 does the same with a 403. A guest booking has golferAccountId null (bookings/route.ts:256 sets it only from the session), so a device signed in as the golfer, or as anyone else, gets 404 or 403 on a valid emailed token. The page maps that to 'Link not recognized'.

### R-GOLF-004 (S2) Members of a private club can never book online: the member portal hands off to /book, and POST /api/bookings refuses every private course

`src/app/api/bookings/route.ts:108`

**Evidence:** bookings/route.ts:108 `if (teeTimeFull.course.type === 'private') { return NextResponse.json({ error: 'Online booking is not available for this private club.' }, { status: 403 }); }` runs before any member-session check. The private course page sends members to the portal: CourseBookingClient.tsx:601 'Tee time booking is reserved for members. Sign in to your member account to view availability and book.', linking to /courses/{slug}/member. member/page.tsx:356 handleBookMemberTime then does `router.push(`/book?${qp}`)`, which POSTs to /api/bookings.

**Impact:** At every private-club course, the portal promises members they can book. Every attempt fails at 'Confirm tee time' with 'Online booking is not available for this private club.'

**Fix:** Allow the private-club path when the request carries an active membership for this course (the same `viewerMembership` resolution the route already does at :128-160), and refuse only when there is none.

**Verifier:** Confirmed. bookings/route.ts:108 returns 403 for every course of type 'private', before the member-session resolution at :123-160. CourseBookingClient.tsx:601 sends private-club visitors to the member portal, and member/page.tsx:346-356 pushes the selected time to /book, which POSTs to /api/bookings. No other private-club booking path exists in src/app/api. PRIVATE_BILLING_SPEC shows private-club member booking is intended (accessFeeTotal = 0 on member bookings).

### R-GOLF-005 (S2) /book loads the tee time through the PUBLIC loader, so a member booking a date only members can reach gets 'This tee time is no longer available', and members are shown the public price

`src/app/book/page.tsx:22`

**Evidence:** page.tsx:22 `loadPublicTeeTimes(slug, date)`. public-tee-times.ts:59-61 `const win = windowFor(dbCourse, null); if (!withinWindow(date, win.days)) return { ok: false, status: 403 ...}`. page.tsx:25-28 then sets `error: 'This tee time is no longer available. Please pick another.'`. The client fallback (BookClient.tsx:158) uses the same public /api/courses/{slug}/tee-times. The member portal lists dates out to the member window (api/member/[courseSlug]/tee-times/route.ts:39 `windowFor(course, { tier })`) and pushes the member to /book (member/page.tsx:356). The page also prices from the public `green_fee` (BookClient.tsx:286), while the API charges the tier rate (bookings/route.ts:136-141).

**Impact:** The 'members can book earlier' perk is a dead end: members see an available time in the portal and are then told it is gone. On dates inside the public window, members are quoted the non-member total before confirming.

**Fix:** In page.tsx (and the client fallback), resolve the viewer's membership and load the tee time with the member window and member pricing, e.g. by sharing the member tee-times route's logic. Show member_green_fee when present.

**Verifier:** Confirmed. book/page.tsx:22 calls loadPublicTeeTimes, which applies windowFor(dbCourse, null) and returns 403 outside the public window (public-tee-times.ts:59-61). The page then shows 'This tee time is no longer available'. The client fallback (BookClient.tsx:157) hits the same public API. The member tee-times route uses windowFor(course, { tier }) and lists further-out dates. BookClient prices from teeTime.green_fee (public) at :286, while the API applies tier rates.

### R-GOLF-006 (S2) swap-time has no server-side cutoff, date, past-time or booking-window checks. 'Change time' is restricted only in the client

`src/app/api/manage/[bookingId]/swap-time/route.ts:44`

**Evidence:** The route checks only: same course (:52), not blocked (:53) and capacity (:55-56). It never checks the cutoff (the page's `canModify = ... && info.windowOpen`, manage/page.tsx:300, is client-only), that the new slot is on the same date (available-times limits the list to `date: booking.teeTime.date`, but swap-time accepts any teeTimeId of the course), that the new slot is in the future, or the course's publicAdvanceDays window. Recipe under late_cancel timing: 2h before the tee time, POST swap-time with a slot next month (no fee was held). The booking now has a cutoff in the future, so cancel-booking.ts:103 `isLate` is false and the cancel is free.

**Impact:** A crafted request escapes the course's late-cancellation fee. It can also move a booking into a past slot or past the public booking window. The course loses the fee that its policy and describePolicy() promised.

**Fix:** In the swap-time transaction, refuse when the booking's cutoff (the R-GOLF-001 helper) has passed, when newSlot.date !== the old slot's date, or when the new slot is past on the course clock (isPastIn). Apply the same cutoff check to change-players.

**Verifier:** Confirmed. swap-time/route.ts checks only auth, confirmed status, same course, not blocked and capacity. It has no cutoff check, no same-date check, no isPastIn and no booking window. canModify (manage/page.tsx:300) is client-side only. Under late_cancel timing, a swap after the cutoff to a later date moves teeAt, so cancel-booking.ts:103 computes isLate=false and the fee is escaped. change-players also has no cutoff check. It requires a crafted request, so S2 stands rather than S1.

### R-GOLF-007 (S2) Changing tee time re-prices a member's round at the public green fee

`src/app/api/manage/[bookingId]/swap-time/route.ts:64`

**Evidence:** `const greenFeeTotal = newSlot.greenFeeCents * players; const cartFeeTotal = booking.cartSelected ? newSlot.cartFeeCents * players : 0;`. There is no tier lookup, unlike bookings/route.ts:131-141 applyTierRates. available-times/route.ts:49 also returns the public `greenFee`, so the manage page shows the higher price ('vs $X') and asks the member to confirm it.

**Impact:** A member who moves their time loses the member rate. The higher public green fee is charged at check-in.

**Fix:** Re-apply the booking's rate: keep the per-player rate from the original booking when appliedRate !== 'standard', or resolve the membership tier and run applyTierRates. Have available-times return the same price.

**Verifier:** Confirmed. swap-time/route.ts recomputes greenFeeTotal = newSlot.greenFeeCents * players with no tier lookup or appliedRate reuse. available-times returns public greenFee (centsToDollarsOr0(t.greenFeeCents)). The manage page shows 'vs $X' and the higher total is charged at check-in. The price is displayed before confirming, so it is disclosed and S2 is right.

### R-OPS-002 (S2) 'still_coming' has no state guard, so it refunds GreenReserve's fee on bookings that were never no-shows

`src/app/api/operator/bookings/route.ts:137`

**Evidence:** `if (action === 'still_coming') { await prisma.$transaction(... noShowAt: null ...); const r = await refundSeparateAccessFee(id, 'no-show marked in error (still coming)', ...); const c = await refundNoShowFee(id, actorName); ...}`. Nothing checks booking.status or booking.noShowAt first. The no_show branch just above does require `status === 'confirmed'`. refundSeparateAccessFee refunds any live separate fee, and that includes the one charged by performCancellation for a late cancel (`chargeAccessFeeSeparately(bookingId, { why: 'late_cancel' })`, cancel-booking.ts:233) and the one charged by paid_offline (route.ts:184). The only permission needed is 'sheet.no_show', which is in the Starter preset.

**Impact:** A staff login with only Starter rights can send PATCH {action:'still_coming'} for a late-cancelled booking, or for a completed paid-offline booking. GreenReserve's $1.50/player fee is then refunded and recorded as 'no-show marked in error'. A stale second tablet can do the same. The money is lost and the ledger is wrong.

**Fix:** In the still_coming branch, return 409 unless booking.status === 'confirmed' && booking.noShowAt, and only run the refunds after that check passes.

**Verifier:** Confirmed at route.ts:137-148. still_coming checks only the sheet.no_show permission, which is in the Starter preset. It reads booking.noShowAt only to decide whether to log an event, and then runs refundSeparateAccessFee and refundNoShowFee whatever the status. liveSeparateFee (access-fee.ts:51) returns any live fee, whatever the reason it was charged. That includes the late_cancel charge from cancel-booking.ts:233 and the paid_offline charge from route.ts:184. The UI shows the button only for a confirmed booking with noShowAt, so reaching this needs a crafted request or a stale tablet (for example, another device has since done paid_offline, which clears noShowAt and reuses the live no-show fee). Either way GreenReserve's fee is lost and the ledger reason is wrong. S2 is about right.

### R-OPS-003 (S2) The card check-in modal cannot prorate a partial party, and a decline throws away the headcount

`src/app/dashboard/page.tsx:236`

**Evidence:** checkInBooking: `if (b.paymentStatus === 'no_payment_method') { setCardModalReason(''); setCardModalBooking(b); return; }` returns before askHeadcount() runs. checkInWithCard (line 275) sends only `{ id, action: 'checkin', paymentMethodId }` and never checkedInPlayers. CardCheckInModal shows and charges `booking.totalAmount`, the full party. A decline on a partial check-in is a 'definite' error, so chargeBooking rolls back to prePartial (checkin-booking.ts, `...(partialApplied && definite ? { ...prePartial, checkedInPlayers: null } : {})`). The 'Retry with new card' modal then charges the full party.

**Impact:** At an SP-B no-card course, every booking checks in through this modal. A 4-player booking where 2 turn up is charged for 4, with no way to correct it in the UI. The same happens on any card-decline retry. The golfer is overcharged and the course has to refund by hand in Stripe.

**Fix:** Ask askHeadcount() before opening the modal (and keep it in state when the modal opens after a decline). Pass checkedInPlayers through checkInWithCard, and show the prorated amount in the modal.

**Verifier:** Confirmed in page.tsx. At line 236, checkInBooking opens the card modal for no_payment_method before askHeadcount runs. checkInWithCard (line ~275) sends {id, action, paymentMethodId} without checkedInPlayers. CardCheckInModal shows and charges booking.totalAmount. A decline with partialApplied && definite rolls the totals back to prePartial and nulls checkedInPlayers (checkin-booking.ts:279). The 'Retry with new card' path then opens the same modal and charges the full party. STAFF_POLICY_SPEC B0 keeps the counter card modal as the fallback for no-card golfers, so a partial party on that path has no way to avoid an overcharge.

### R-PAY-001 (S2) Checking in a no-show (staff Check in or golfer self check-in) charges the full round but keeps the course's no-show fee and leaves noShowAt set

`src/lib/checkin-booking.ts:314`

**Evidence:** chargeBooking() undoes only GreenReserve's separate fee: `if (booking.stripePaymentIntentId) { await refundSeparateAccessFee(bookingId, 'golfer checked in and paid by card', 'system'); }` (l.314-316). It never calls refundNoShowFee() from src/lib/no-show-fee.ts, and the final update (l.325-335) does not clear noShowAt. The tee sheet still shows 'Check in' on a no-show row: src/app/dashboard/page.tsx:887 renders the button for any `b.status !== 'completed' && b.status !== 'cancelled'`, with no noShowAt check. The golfer link /api/checkin/[bookingId] (route.ts:76) goes straight to performCheckIn too. The paid_offline branch has the same gap: src/app/api/operator/bookings/route.ts:159-184 sets `noShowAt: null` but never calls refundNoShowFee. Repro: course with noShowFee $20 and autoNoShowMinutes 15. The group arrives 40 minutes late, the hourly cron has run markNoShow and charged $20 on the connected account, and staff press Check in. The round is charged, the $1.50 fee is refunded, the $20 no-show charge stays live and noShowAt stays set on a completed booking.

**Impact:** A golfer who played and paid for the round is also charged the course's no-show fee, with no prompt to refund it. Anyone who arrives after the auto no-show window can hit this. Analytics also counts a completed round as a no-show.

**Fix:** In chargeBooking(), after the round charge succeeds and next to refundSeparateAccessFee, call refundNoShowFee(bookingId) and add `noShowAt: null` to the record update. Call refundNoShowFee in the paid_offline branch as well. Surface a failed refund in the result the same way feeRefundFailed is surfaced.

**Verifier:** src/lib/checkin-booking.ts chargeBooking() calls refundSeparateAccessFee (l.314) but never refundNoShowFee, and the final update (l.325-335) does not clear noShowAt. Only the operator still_coming branch calls refundNoShowFee. The dashboard Check in button (page.tsx ~887) has no noShowAt guard, and /api/checkin/[bookingId] calls performCheckIn directly. paid_offline sets noShowAt:null but leaves the course no-show charge live. Severity lowered: describePolicy tells the golfer that a group not checked in N minutes after its tee time counts as a no-show, so keeping the fee on a late arrival is partly defensible. Still, the code refunds GreenReserve's fee and not the course's, the golfer self check-in path has no way to undo it, and a completed booking keeps noShowAt. Broken flow with money impact, but narrow.

### R-PAY-003 (S2) The cutoff crons and the manage page use the course's CURRENT cancellationHours, not the window copied onto the booking

`src/app/api/cron/hourly/route.ts:66`

**Evidence:** The booking route copies `cancellationHoursAtBooking: teeTimeFull.course.cancellationHours` (api/bookings/route.ts:277, comment: 'the window this golfer agreed to, whatever the course changes later'). Only performCancellation reads it (cancel-booking.ts:102). The hold charge uses the live value: hourly/route.ts:66 `const cutoffMs = teeMs - booking.course.cancellationHours * 3600 * 1000;` and cancellation-cutoff/route.ts:58 does the same. The warning email (hourly:81) and the manage page's windowOpen and policy text (manage/[bookingId]/route.ts:49,71) also use the live value. The owner can change cancellationHours at any time (operator/settings/route.ts:41,57). Repro A: book under 24h, owner changes to 48h, cron charges the hold at T-48h, golfer cancels at T-30h (still free under their terms). Then feeAlreadyCharged=true, the fee is kept as non-refundable, and chargeAccessFeeSeparately('late_cancel') also takes GreenReserve's fee. Repro B (48h to 24h): golfer cancels at T-30h, isLate is true on the booking's 48h window, but hold timing means no charge, so the course loses the fee.

**Impact:** After a policy change, golfers are charged a non-refundable late fee for cancelling inside the free window they agreed to. Or the course loses fees its old policy promised. This breaks CLAUDE.md's 'policy copied onto the Booking at creation'.

**Fix:** Use `booking.cancellationHoursAtBooking ?? booking.course.cancellationHours` for the cutoff in both crons, the warning email and the manage GET. Ideally use one shared cutoffMs(booking) helper in cancel-policy.ts that performCancellation also calls.

**Verifier:** hourly/route.ts:66 and cancellation-cutoff/route.ts:58 compute the cutoff from booking.course.cancellationHours (live). The manage GET (route.ts:48-49) does the same for windowOpen, and the warning email passes the live hours. Only performCancellation uses cancellationHoursAtBooking. Owners can change cancellationHours (settings OWNER_ONLY_FIELDS). Both repros hold. Lowered to S2 because it needs a policy change plus a cancel inside the changed window.

### R-PAY-006 (S2) Golfer swap-time reprices at the standard rate (member tier lost) and both manage routes hard-code the $1.50 fee

`src/app/api/manage/[bookingId]/swap-time/route.ts:166`

**Evidence:** `const greenFeeTotal = newSlot.greenFeeCents * players; const cartFeeTotal = booking.cartSelected ? newSlot.cartFeeCents * players : 0; const accessFeeTotal = 150 * players;` There is no membership or applyTierRates lookup, unlike api/bookings/route.ts:128-160. change-players/route.ts:57 also sets `const perPlayerAccess = 150;`, so a counter booking created with accessFeeTotal 0 (operator/bookings/route.ts:229) gains a fee. performCheckIn later charges booking.totalAmount (checkin-booking.ts:252).

**Impact:** A member who moves their tee time is charged the public green and cart fee at check-in. A phone or walk-in booking changed through its emailed link gains a GreenReserve fee it was never meant to carry.

**Fix:** Reprice swaps through the same tier logic the booking route uses (extract applyTierRates and the membership lookup into a lib shared with cartAddOnCentsFor). Rescale accessFeeTotal from the booking's own per-player fee (accessFeeTotal / players) instead of a literal 150.

**Verifier:** swap-time/route.ts sets greenFeeTotal = newSlot.greenFeeCents*players and cartFeeTotal from newSlot.cartFeeCents, with no membership or tier lookup (unlike cartAddOnCentsFor and the booking route), and hard-codes accessFeeTotal = 150*players. change-players also hard-codes perPlayerAccess = 150. Counter bookings with an email get a checkInToken (operator/bookings POST l.239), so they can reach these routes and gain a fee. A member who swaps is charged the public rate at check-in.

### R-PAY-007 (S2) change-players does not rescale the per-player late fee and no-show fee copied onto the booking

`src/app/api/manage/[bookingId]/change-players/route.ts:65`

**Evidence:** The update writes `players, greenFeeTotal, cartFeeTotal, accessFeeTotal, totalAmount` only. cancellationFeeTotal and noShowFeeTotal were computed at booking time as fee × players when the basis is 'player' (api/bookings/route.ts:207-208, cancel-policy.ts:297-308) and are never touched again. The hold, late-cancel and no-show charges use those stored totals (hourly:102, cancel-booking.ts:113, no-show-fee.ts:55).

**Impact:** Under a per-player policy, a golfer who books 4 and drops to 1 is held or charged 4× the fee their terms state. A golfer who books 1 and grows to 4 is charged a quarter of it, which costs the course.

**Fix:** In the same transaction, scale cancellationFeeTotal and noShowFeeTotal by newPlayers / players when they were per-player. That needs the basis copied onto Booking, or recompute from a stored per-unit amount. Leave per-booking fees unchanged.

**Verifier:** change-players/route.ts updates only players, greenFeeTotal, cartFeeTotal, accessFeeTotal and totalAmount. cancellationFeeTotal and noShowFeeTotal were computed per player at booking (bookings/route.ts:207-208 via lateFeeTotalCents and noShowFeeCents) and are what the hold, late-cancel and no-show charges use. No basis is stored on Booking (schema has only lateFeeTimingAtBooking), so per-player fees go stale after a player change.

### R-PAY-008 (S2) Swap and change-players have no cutoff check, so late_cancel fees can be dodged by moving the round and then cancelling

`src/app/api/manage/[bookingId]/swap-time/route.ts:139`

**Evidence:** The only state check is `if (booking.status !== 'confirmed')`. There is no cancellation-window check; the manage page gates this only in the client (`canModify = ... && info.windowOpen`, manage/[bookingId]/page.tsx:300). performCancellation computes isLate from the booking's CURRENT teeTime (cancel-booking.ts:101-103). Repro under late_cancel timing: 2h before the round, POST swap-time to a slot next week, then POST /api/bookings/cancel. isLate is false and nothing is charged.

**Impact:** The course's late-cancellation fee can be avoided by any golfer who sends the request directly.

**Fix:** In swap-time and change-players, refuse (409) once the booking's cutoff (cancellationHoursAtBooking) has passed, matching the page's windowOpen.

**Verifier:** swap-time only checks status==='confirmed'. There is no cutoff check and no same-day restriction server-side; the page gates with windowOpen in the client only. performCancellation computes isLate from the booking's current teeTime. Under late_cancel or late_cancel_or_no_show (nothing is held at the cutoff), moving the round a week out and then cancelling avoids the fee. change-players also has no window check.

### R-ADM-002 (S3) Admin revenue page: saveExpense and loadExpenses have no try/catch, so a dropped connection leaves the Save button stuck with no message

`src/app/admin/revenue/page.tsx:172`

**Evidence:** saveExpense: `setSavingExpense(true); ... const res = editing ? await fetch(...) : await fetch(...); setSavingExpense(false);` (191-196) has no try/catch; a rejected fetch skips setSavingExpense(false) and throws an unhandled rejection. loadExpenses (172-178) likewise sets setExpensesLoading(true) and never resets it if fetch rejects. endExpense/deleteExpense just below were fixed with try/catch/finally; these two were missed.

**Impact:** Admin adds or edits an expense on a flaky connection: the Save button stays in its saving state forever, no error shown, and they cannot tell whether the expense was recorded (a retry may duplicate it). Opening the expenses drawer offline shows a permanent loading state.

**Fix:** Wrap both in try/catch/finally like endExpense: setExpenseError('Network error — the expense may not have been saved. Reload the list before retrying.') and reset the busy/loading flag in finally.

**Verifier:** Confirmed in src/app/admin/revenue/page.tsx. loadExpenses (172-178) and saveExpense (187-199) await fetch without try/catch/finally. A rejected fetch skips setExpensesLoading(false) / setSavingExpense(false) and sets no error. endExpense and deleteExpense right below do have try/catch/finally, so these two were missed. Nothing is lost or charged: the flow is stuck and silent, so S3.

### R-ADM-003 (S3) Course detail loadDocuments has no catch; documents panel spins forever on a network failure

`src/app/admin/courses/[id]/_parts/useCourseDetail.tsx:278`

**Evidence:** `setDocsLoading(true); setDocsError(''); const r = await fetch(...); if (r.ok) ... else {...} setDocsLoading(false);` with no try/catch. A rejected fetch leaves docsLoading true and docsError empty. Siblings loadTransactions (252), loadMembers (272) and loadDetail (305) all have catches.

**Impact:** Admin opens a course's documents tab with a dropped connection and sees an indefinite loading state with no error or retry.

**Fix:** try/catch/finally: on catch setDocsError('Network error loading documents. Check your connection and try again.') and clear docsLoading in finally.

**Verifier:** Confirmed in src/app/admin/courses/[id]/_parts/useCourseDetail.tsx. loadDocuments (~278-284) has no try/catch, so a network rejection leaves docsLoading true and docsError empty. The MP-5a comment on loadMembers claims the documents loader 'always did this correctly', but it has no catch. Its siblings loadTransactions, loadMembers and loadDetail all catch. Spinner with no error or retry: S3.

### R-ADM-004 (S3) Admin forgot-password: fetch is not in a try/catch and the error body is parsed unguarded; the form can freeze with no message

`src/app/admin/forgot-password/page.tsx:17`

**Evidence:** `setLoading(true); setError(''); const res = await fetch(...); setLoading(false); if (!res.ok) { const d = await res.json(); setError(...) }`. A thrown fetch leaves loading=true and shows no error; a non-JSON 5xx makes res.json() throw after loading is cleared, so the 'Something went wrong' fallback is never reached either.

**Impact:** A manager who forgot their password submits on a bad connection or hits a 502 HTML page: the button stays on its loading label or nothing happens, and they cannot tell whether a reset email was sent.

**Fix:** Wrap in try/catch/finally, use `await res.json().catch(() => ({}))`, and set 'Network error — no email was sent. Try again.' in the catch.

**Verifier:** Confirmed in src/app/admin/forgot-password/page.tsx submit(). The fetch is not in a try, so a throw leaves loading=true. On a non-ok response, res.json() is not guarded, so a non-JSON 5xx throws after loading clears and setError is never reached. The user gets no feedback either way. Admin auth page that fails silently and still completes nothing harmful: S3.

### R-ADM-005 (S3) Bulk inquiry actions report 'N failed' with no reason except the one needsBookingDecision case

`src/app/admin/inquiries/page.tsx:379`

**Evidence:** runBulkAction: `if (r.ok) { ok++; continue; } failed++; const d = await r.json().catch(() => ({})); if (d.needsBookingDecision) skipped.push(...)` ; the server's d.error (403 Forbidden, 429, 409, 500) is discarded and the catch only increments `failed`. Result text is `${ok} succeeded, ${failed} failed.`

**Impact:** Admin runs Send sheet / Archive on several inquiries, sees '2 failed' and has no idea which rows or why (session ended, role too low, network), so cannot tell what to do next.

**Fix:** Collect `${courseName}: ${d.error || 'network error'}` for each failure and list them in the result line.

**Verifier:** Confirmed in src/app/admin/inquiries/page.tsx runBulkAction (360-392). On a non-ok response it reads only d.needsBookingDecision and drops d.error. The catch only increments failed. The result line says '${ok} succeeded, ${failed} failed.' without naming which rows failed or why. It also cannot surface email failures, because those never come back (see R-ADM-001). S3 is fair for a no-silent-failures gap.

### R-AUTH-004 (S3) Staff can approve the course page or request changes through the preview token, getting around STAFF_FORBIDDEN on approve-page and request-changes

`src/app/api/operator/preview-link/route.ts:9`

**Evidence:** preview-link GET checks only `resolveDashboardSession()` (no isStaff or permission check) and returns signPreviewToken(course.id) (30-day JWT). /api/preview/[courseId]/approve and /request-changes accept that token alone. Meanwhile operator/approve-page/route.ts:11 returns STAFF_FORBIDDEN for staff.

**Impact:** A staff login can record 'Course approved their page' (which Admin acts on to go live) or file change requests on the owner's behalf, which the operator routes deliberately forbid.

**Fix:** Return STAFF_FORBIDDEN for staff in preview-link (as approve-page does).

**Verifier:** preview-link/route.ts checks only resolveDashboardSession(), with no isStaff or permission check, and returns signPreviewToken. preview/[courseId]/approve checks only that token. operator/approve-page:11 returns STAFF_FORBIDDEN to staff. STAFF_POLICY_SPEC A2 lists 'approving the course page / requesting changes' as never grantable. The token route therefore lets staff do what the spec reserves for the owner. Approval is advisory (an admin still takes the course live), so S3.

### R-AUTH-005 (S3) Course notice (conditions) write has no permission gate, so any staff login, even Starter, can publish text on the public booking page

`src/app/api/operator/conditions/route.ts:5`

**Evidence:** PATCH checks only `resolveDashboardSession()` and then writes `course.conditions`. CourseBookingClient.tsx:889-893 renders it publicly as 'Course notice'. No catalog key covers it, so the owner can't take it away. CLAUDE.md: 'A new staff-reachable action needs a key in the catalog AND a requirePermission call.'

**Impact:** Every staff login can change public golfer-facing copy, and the owner has no control over it in Staff & permissions.

**Fix:** Add a catalog key (e.g. 'sheet.course_notice', in the front_desk/legacy presets to keep current behaviour) and call requirePermission in the route.

**Verifier:** conditions/route.ts PATCH checks only resolveDashboardSession and writes course.conditions. The SP-A catalog has no key for it, and the spec's gate table (A5) leaves it out even though A1 listed it as open to staff. Any staff login, including the Starter preset, can publish the public course notice, and the owner has no toggle to stop it. This breaks the CLAUDE.md rule that every staff action has a key in the catalog and a requirePermission call.

### R-AUTH-006 (S3) Member magic-link send-code has no rate limit

`src/app/api/member/[courseSlug]/send-code/route.ts:57`

**Evidence:** The route has no rateLimit import or call. Every POST with a member's email sends sendMemberMagicLink. Every sibling sender (golfer otp/request, forgot-password, resend-verification) has per-identifier and per-IP limits.

**Impact:** Anyone can flood a member's inbox and run up Resend volume and sender reputation through any live course slug.

**Fix:** Add rateLimit(`member-link:${courseId}:${email}`, 3, 600) and a per-IP limit (clientIp), still returning the generic success.

**Verifier:** member/[courseSlug]/send-code/route.ts has no rateLimit import or call. middleware.ts adds no global limit. Every POST naming an active member's email at a live course sends a magic-link email. The sibling sign-in senders all have per-identifier and per-IP limits.

### R-AUTH-010 (S3) Settings and course PATCH return the raw Course row, including adminNotes and stripeAccountId, which operatorSafe() strips on GET

`src/app/api/operator/settings/route.ts:99`

**Evidence:** `const updated = await prisma.course.update(...); ... return NextResponse.json(updated);`. GET wraps with operatorSafe(courseToWire(course)), and the file's own comment says adminNotes and stripeAccountId must not reach dashboard sessions, staff included. operator/courses/route.ts PATCH has the same `return NextResponse.json(updated)`.

**Impact:** A staff login with settings.edit (and every owner on the courses PATCH) receives GreenReserve's internal build notes about the course and the connected account id.

**Fix:** Return operatorSafe(courseToWire(updated)) from both PATCH handlers.

**Verifier:** settings/route.ts:109 and courses/route.ts:95 both return the raw prisma.course.update row. Each file's own SD-8 comment says adminNotes and stripeAccountId must not reach dashboard sessions, staff included, and that review rated the leak MEDIUM. A staff login with settings.edit receives GreenReserve's internal build notes. The finding understates it, so raised to S3.

### R-BOOK-012 (S3) The member price shown on the member tee sheet uses a different precedence from the price /api/bookings stores

`src/app/api/member/[courseSlug]/tee-times/route.ts:73`

**Evidence:** The member tee-times route does: weekend flat = `tier.greenFeeWeekendCents` only; then `t.memberRateCents`; then discountPct (green only), with the cart fee discounted only by a flat cart rate. applyTierRates in bookings/route.ts:44-72 does: weekend flat = `greenFeeWeekendCents ?? greenFeeWeekdayCents`; then discountPct applied to green AND cart; then memberRateCents. Example 1: a tier with weekday flat $30 and no weekend rate, booking on a Saturday. The sheet shows the slot's member or standard rate, but the booking stores $30. Example 2: a tier at 20% off with a slot memberRate of $35 on a $50 green fee. The sheet shows $35, but the booking stores $40. The 20% cart discount is also charged but never shown. /book shows the public price either way (it loads public tee times).

**Impact:** Members are shown one price and charged another at check-in, which may be higher or lower than what they saw.

**Fix:** Extract one memberRate(teeTime, tier, date) helper and use it in both the member tee-times route and applyTierRates.

**Verifier:** The member tee-times route (:72-86) uses this precedence: weekend flat = greenFeeWeekendCents only, then t.memberRateCents, then discountPct (green only), with cart discounted only by a flat cart rate. applyTierRates (bookings/route.ts:42-72) uses: weekend flat = weekend ?? weekday, then discountPct on green AND cart, then memberRateCents. The examples in the finding follow from the code. The member sees one price and is charged another.

### R-BOOK-013 (S3) Swapping times reprices a member's round at the standard rate

`src/app/api/manage/[bookingId]/swap-time/route.ts:67`

**Evidence:** `const greenFeeTotal = newSlot.greenFeeCents * players; const cartFeeTotal = booking.cartSelected ? newSlot.cartFeeCents * players : 0;`. The swap ignores booking.appliedRate and any membership tier, while creation applies applyTierRates (bookings/route.ts:136-158).

**Impact:** A member who moves their own tee time to another slot the same day has their total raised to the public rate, which is collected at check-in.

**Fix:** When booking.appliedRate is not 'standard', resolve the membership and reprice with the shared tier helper, or carry the per-player rate the way change-players does.

**Verifier:** swap-time/route.ts:67-68 reprices at newSlot.greenFeeCents and cartFeeCents. The select does not load appliedRate or membership, so a member's tier rate is lost on a swap. change-players, by contrast, carries the per-player rate.

### R-BOOK-014 (S3) Booking windows count days from the UTC date, not the course's local date

`src/lib/booking-window.ts:71`

**Evidence:** `dayOffset` measures from `Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())`, and withinWindow / lastBookableDate use it for the tee-times APIs and booking creation (public-tee-times.ts:60, member tee-times route:40, bookings/route.ts:165). The header comment justifies this as 'the same UTC-day basis the tee-times APIs already use for "today"', but SD-3 moved those APIs to todayIn(course.timezone) (public-tee-times.ts:73).

**Impact:** From 8pm Eastern, or 5pm Pacific during DST, the UTC date is already tomorrow, so a 7-day public window allows day 8 and members get one extra day. Each evening golfers can book a day the course has not opened, and the date picker's last date jumps forward mid-evening.

**Fix:** Take the course tz in dayOffset/withinWindow/lastBookableDate (todayIn(tz) + addDaysStr) and pass course.timezone from the three callers.

**Verifier:** booking-window.ts:26-31 dayOffset is computed from the UTC date, and withinWindow and lastBookableDate use it. public-tee-times.ts uses todayIn(course.timezone) for 'today' (:73), so the header comment's 'same UTC-day basis' no longer holds. Each evening US time the window allows one extra day. The generation horizon is window+1, so those slots exist and are bookable. The impact is minor; it sits at the S3/S4 boundary.

### R-BOOK-015 (S3) Changing a schedule leaves partially-booked slots on sale at the old time and price, and refreshes only 8 days

`src/lib/tee-sheet-engine.ts:131`

**Evidence:** When regenerating, any slot with `playersBooked > 0 || _count.bookings > 0` is skipped with 'leave it exactly as is' (lines 129-134), and it stays open for its remaining seats at its old greenFeeCents. A schedule that no longer offers that time, or now charges a new price, keeps selling it. An interval change (e.g. 8 to 10 minutes) adds new slots beside the kept ones (8:08 kept, 8:10 created). regenerateUpcoming defaults to `days = 8` (line 37) and is used by every schedule and product save, while generationHorizonDays allows up to 366 days (booking-window.ts:99-107). Days 9 and later keep the old slots until the 3am cron.

**Impact:** Golfers can book the remaining seats of a time the course removed, or at a price it has raised. With member windows over 8 days, a deleted or paused schedule keeps selling days 9 and later until the night run.

**Fix:** On regenerate, block (not delete) kept slots whose key is no longer desired, and reprice open seats if that is the product decision. Make regenerateUpcoming use generationHorizonDays(course, tiers).

**Verifier:** tee-sheet-engine.ts:129-134 skips any existing slot with playersBooked>0 or bookings, so a partially booked slot keeps its status, price and time even when the schedule no longer wants it, and stays open for its remaining seats. regenerateUpcoming defaults to days=8 (:37), and the schedule-service callers pass no days, while generationHorizonDays can exceed that. Days 9 and later stay stale until the 3am cron.

### R-BOOK-016 (S3) Slot-opened alerts are matched on the cancelled party size, not on the seats now open

`src/lib/cancel-booking.ts:172`

**Evidence:** Criteria alerts match `players: { lte: booking.players }`, and specific-slot alerts (`teeTimeId`) match with no size check at all. Neither looks at playersAvailable - playersBooked after the decrement. Swap-time (old slot freed) and change-players (party reduced) free seats but never notify alerts.

**Impact:** Example: a slot with 3 of 4 seats booked, where a 1-player booking cancels. Two seats are now open, but a waiting alert for 2 players is not sent. A specific-slot alert for 4 is told 'a tee time opened up' when only 1 seat did. Seats freed by swaps or smaller parties never reach the waitlist.

**Fix:** After the decrement, read the slot's open seats and match `players <= openSeats`, skipping blocked or past slots. Call the same notifier from swap-time (old slot) and from change-players when the party shrinks.

**Verifier:** cancel-booking.ts:167-178 matches criteria alerts with players lte booking.players and specific-slot alerts with no size check. It never reads the open seats after the decrement. swap-time and change-players never call any alert notifier. This is wrong behavior, but the flow completes.

### R-BOOK-017 (S3) The course's Min/Max players per booking settings are saved but never enforced

`src/app/api/bookings/route.ts:85`

**Evidence:** Settings exposes 'Min players per booking' / 'Max players per booking' (dashboard/settings/page.tsx:684-685, saved by operator/settings/route.ts:60). grep shows no booking path reads Course.minPlayers/maxPlayers. /api/bookings allows 1–8 (line 85). change-players hard-codes `newPlayers > 4` (change-players/route.ts:17) and the manage page `const maxPlayers = 4` (manage/[bookingId]/page.tsx:405).

**Impact:** A course that sets 'no singles' (min 2) still gets 1-player bookings. A group of 5 or more booked on a 5-to-8-seat slot cannot change its size at all: the API returns 400 'Missing or invalid parameters'.

**Fix:** Enforce course.minPlayers/maxPlayers in /api/bookings and change-players. Replace the hard-coded 4 with min(course.maxPlayers, slot capacity).

**Verifier:** grep shows minPlayers and maxPlayers are only saved and validated (settings routes, settings-validation.ts) and never read on a booking path; the public course normalizer exposes no min_players or max_players. /api/bookings allows 1-8 (:85). change-players rejects newPlayers>4 (:17), and the manage page hard-codes maxPlayers=4 (:405), so a party of 5 or more cannot change its size.

### R-BOOK-018 (S3) Past tee times are deleted, despite AN-1, by the nightly generator and by blocking today

`src/lib/tee-sheet-engine.ts:41`

**Evidence:** generateForAllCourses and regenerateUpcoming both start at i=0, the course's today (lines 41-42, 188-190). The cron runs at 03:00 UTC, which is 8–11pm across the US, so the whole local day has already gone off when generateTeeTimes(today) deletes its empty slots (line 122) and recreates only what the current schedule wants. The blackout POST also deletes today's empty past slots (operator/blackouts/route.ts:23). The operator DELETE refuses past slots for this reason (operator/tee-times/route.ts:124-129: 'unfilled slots are lost-revenue history').

**Impact:** If a schedule is paused, deleted or changed during the day, or a slot was staff-added, that day's unfilled tee times vanish that night. Analytics' lost-revenue and utilisation figures for the day then undercount.

**Fix:** In generateTeeTimes, never delete slots where isPastIn(tz, date, time) is true, and have the blackout deleteMany skip past times. Alternatively start generation at tomorrow when today's last tee has passed.

**Verifier:** generateForAllCourses and regenerateUpcoming start at i=0 from todayIn(tz). The cron runs at 0 3 * * * UTC (vercel.json), which is evening local time, so today's empty past slots are deleted (:122). Unchanged schedule slots are recreated, so only slots from a changed or paused schedule and staff-added slots are lost. The blackouts deleteMany has no past-time filter, while the operator DELETE refuses past slots (AN-1). The real impact is narrower than the finding states, but it is real.

### R-BOOK-019 (S3) /api/bookings does not check that the course is live, so a stale page can book at an offline or archived course

`src/app/api/bookings/route.ts:105`

**Evidence:** The route loads the teeTime and course and checks private, demo, past and window, but not `course.active`, `liveStatus === 'live'` or `archivedAt`. Listing does check these (public-tee-times.ts:53, public-course.ts:21). course-closure.ts cancels future bookings when a course goes offline, but anything POSTed afterwards is accepted.

**Impact:** A golfer with the course or /book page open when the course is taken offline can still complete a confirmed booking (and save a card) at a course that is no longer taking bookings, after the closure sweep has run.

**Fix:** Return 404 'Course not found' unless course.active && liveStatus === 'live' && !archivedAt, the same rule as loadPublicTeeTimes.

**Verifier:** bookings/route.ts:97-125 checks private, demo, past and window, but not course.active, liveStatus or archivedAt. loadPublicTeeTimes checks active and liveStatus (not archivedAt, as the finding claims; loadPublicCourse checks archivedAt). A stale page can POST and create a booking after the course-closure sweep. The window is narrow, so S3 holds.

### R-CRON-004 (S3) Cutoff warning tells late-cancel-timing golfers a fee will be charged automatically, with policy wording hard-coded outside describePolicy()

`src/lib/email.ts:308`

**Evidence:** hourly:63-69 sends sendCancellationWarningEmail to every card_on_file booking with `cancellationFeeTotal > 0`, without checking `holdsAtCutoff(booking)`. The email body says "After the window closes, a $X late-cancellation fee will be charged to your card automatically." Under `late_cancel` / `late_cancel_or_no_show` nothing is charged at the cutoff (hourly:94 `if (!holdsAtCutoff(booking)) continue;`). Other hard-coded policy wording: the fee-charged email (email.ts:267-284) and the confirmation fallback (email.ts ~134 when policyLines is absent). CLAUDE.md: "describePolicy() is the ONLY source of golfer-facing policy wording."

**Impact:** Golfers at late-cancel courses are wrongly told their card will be auto-charged, which pushes needless cancellations and contradicts the terms shown at booking.

**Fix:** Branch the warning copy on timing: pass `describePolicy(policyFrom(...)).lines`, or a timing flag, from the cron and render those lines instead of the fixed sentence.

**Verifier:** I confirmed this. The hourly:62-88 warning branch checks only cancellationFeeTotal > 0 and runs before the holdsAtCutoff check, which applies only in the charge branch (line 93). So late_cancel and late_cancel_or_no_show bookings still get the warning. The email text at email.ts:308 is fixed: "After the window closes, a $X late-cancellation fee will be charged to your card automatically." That contradicts describePolicy's late_cancel wording ("Cancel after that and ... is charged"). sendCancellationFeeChargedEmail and the confirmation fallback (email.ts ~134) also hard-code policy wording. It's misleading copy and no wrong charge results, so S3.

### R-CRON-006 (S3) Cron failures don't reach Admin → System: several jobs never report failure counts

`src/app/api/cron/send-reminders/route.ts:86`

**Evidence:** cron-log.ts `judge()` marks a run as an error only on `ok/success:false`, an `error` string, or a top-level or nested `failed`/`errorCount`. send-reminders catches every send failure (line 43 `catch (err) { console.error(...) }`, and the renewal loop) and returns `{ success: true, sent, total, renewalsSent }` with no failed count. chase-onboarding:79/104 records `reason: 'send failed'` inside a `results` array and returns `{ processed, results }`. hourly:207-217 catches throws from the agreement-PDF, notice and call-reminder sub-jobs and keeps the zeroed defaults, so a crash reads as `failed: 0`. The hold-charged email (hourly:137, cutoff:110) and the cutoff check-in email (cutoff:133) use `.catch(console.error)` and still count as charged/emailed.

**Impact:** With a revoked Resend key, every reminder and chase email fails while System shows green. This is the "check the Vercel logs" situation MP-8b was meant to end.

**Fix:** Count failures in each loop and return them as `failed` (send-reminders, chase-onboarding). In hourly, set `{ failed: 1 }` / an error string on a sub-job throw. For the `.catch(console.error)` sends, increment a failure counter instead of swallowing.

**Verifier:** I confirmed this. cron-log judge() looks only at success/ok false, an error string, and errorCount/failed at the top level or one level down. send-reminders swallows send errors (lines 43 and 82) and returns `{success:true, sent, total, renewalsSent}`. chase-onboarding returns `{processed, results}`, and `results` isn't checked for a 'send failed' reason. In hourly, the sub-job catches at 214/218/222 keep the zeroed defaults, so a throw shows as failed:0. The hold-charged email (hourly:137, cutoff:110) and the cutoff check-in email (cutoff:133) use .catch(console.error). With a revoked Resend key, System shows green.

### R-CRON-007 (S3) Check-in/pay-link email: paymentStatus is flipped before the send, so a failed send is never retried

`src/app/api/cron/hourly/route.ts:169`

**Evidence:** hourly:166-178 runs `prisma.booking.update({ paymentStatus: 'awaiting_checkin' })` and only then `await sendCheckInAvailableEmail(...)`. On a Resend error the booking already falls out of the candidate filter (which requires `no_payment_method`/`card_on_file`). cancellation-cutoff:120-133 does the same and adds `.catch(console.error)`, counting it as `emailedNoPolicy++`.

**Impact:** A transient email failure permanently loses the golfer's pay link, and for no-card courses that link is how GreenReserve's fee gets collected.

**Fix:** Send first and flip the status on success, or flip with a conditional updateMany as a claim and revert it on send failure.

**Verifier:** I confirmed this. hourly:167-179 updates paymentStatus to awaiting_checkin and only then awaits sendCheckInAvailableEmail. If the send throws, the catch counts it as failed, but the booking has already left the candidate filter (no_payment_method/card_on_file), so it's never retried. cancellation-cutoff:120-133 does the same and also swallows the error with .catch(console.error), counting it as emailed. The confirmation email and staff's send_pay_link are the only other ways the golfer gets the link.

### R-CRON-008 (S3) Day-before reminder is sent to placeholder walk-in/phone addresses

`src/app/api/cron/send-reminders/route.ts:23`

**Evidence:** Counter bookings without an email get `golferEmail: golferEmail || `${source}+${Date.now()}@noemail.greenreserve.app`` with `status: 'confirmed'` (operator/bookings/route.ts:236-240). send-reminders selects all confirmed bookings for tomorrow, and sendReminderEmail (email.ts:447) has no `isPlaceholderEmail` guard, unlike sendCancellationEmail (211), the receipt (403), frost-delay and weather-cancel.

**Impact:** Every phone booking entered without an email produces a send to a non-existent address on the verified sending domain's subdomain. These bounce and hurt Resend sender reputation for all mail.

**Fix:** Add `if (isPlaceholderEmail(data.golferEmail)) return;` at the top of sendReminderEmail, or filter with `golferEmail: { not: { endsWith: PLACEHOLDER_EMAIL_DOMAIN } }` in the query.

**Verifier:** I confirmed this. A counter booking without an email gets `${source}+${Date.now()}@noemail.greenreserve.app` and status confirmed (operator/bookings:236-240). send-reminders selects every confirmed booking for tomorrow with no email filter, and sendReminderEmail (email.ts:447-472) has no isPlaceholderEmail guard. sendCancellationEmail (211) and sendCheckInReceiptEmail (403) do have one. Every phone booking entered without an email therefore triggers a send to a non-existent address, which bounces and hurts sender reputation.

### R-GOLF-008 (S3) Golfer-facing policy wording outside describePolicy() ignores late-fee timing and the GreenReserve fee, and contradicts what is charged

`src/app/manage/[bookingId]/page.tsx:302`

**Evidence:** CLAUDE.md: '`describePolicy()` is the ONLY source of golfer-facing policy wording'. Hand-written copy that disagrees with it: (1) manage/page.tsx:311 says 'A $X fee was already charged. Cancelling now won't add another charge', but cancel-booking.ts:233 `if (feeAlreadyCharged && !waiveFee) await chargeAccessFeeSeparately(bookingId, { why: 'late_cancel' ...})` does add the $1.50/player charge. Line 313 says 'Cancelling will charge $X' for a hold_at_cutoff booking whose hold has not run yet, but cancel-booking.ts:104 (chargesOnLateCancel is false for hold) charges nothing. Line 302 policyText never mentions a no-show fee or hold timing. (2) BookClient.tsx:214 (confirmation timeline) says 'After that, a $X late-cancellation fee is charged to your card on file'. Under hold_at_cutoff it is charged at the cutoff whether or not they cancel (hourly/route.ts:93), and it omits the no-show leg of late_cancel_or_no_show. BookClient.tsx:550 says 'Nothing is charged now — you pay at the course when you check in' on hold courses. (3) CourseBookingClient.tsx:1205-1210 (course-page trust line) says 'Cancel free until …' and never mentions the hold, while describePolicy has a `headline` built for exactly this line. (4) The cancellation warning email is sent to late_cancel bookings saying the fee 'will be charged to your card automatically' (hourly/route.ts:63-87 has no timing check; bookings/route.ts:339).

**Impact:** Golfers read one policy on the course page, another on the confirmation and another on the manage page. The manage page tells them cancelling adds no charge, and then the booking fee is charged.

**Fix:** Have every surface read describePolicy() (headline for the trust line, lines for manage and the confirmation). Add the booking's snapshotted timing to the manage GET so the page can call it. Gate the warning email on holdsAtCutoff(booking).

**Verifier:** Confirmed. manage/page.tsx:309-313 says 'Cancelling now won't add another charge' when the fee was charged. cancel-booking.ts:233 then calls chargeAccessFeeSeparately, which charges the $1.50/player when a card is on file (access-fee.ts:70-95). 'Cancelling will charge $X' is wrong for a hold booking before the cron runs, because chargesOnLateCancel is false for hold timing. BookClient.tsx:214 and :550 and the CourseBookingClient trust line (~1205) are hand-written and ignore timing, the hold and the no-show leg. hourly/route.ts:69 sends the warning email ('will be charged to your card automatically', email.ts:309) with no holdsAtCutoff gate.

### R-GOLF-009 (S3) A booking made after the cancellation cutoff has already passed is told '$0 today' and 'free to cancel until <a time already past>', then the hold is charged within the hour

`src/app/book/BookClient.tsx:205`

**Evidence:** BookClient.tsx:205 'Booked · charged today $0.00' and :212 `deadlineLabel(...)` print the cutoff with no check that it is in the past. CourseBookingClient.tsx:1208 does the same. bookings/route.ts:340 `if (minsUntilCutoff < 75) sendCancellationWarningEmail(...)` also fires when minsUntilCutoff is negative, and the email (email.ts:304) says the window 'closes within the next hour'. The next hourly run (hourly/route.ts:88 `cutoffMs <= now`) charges the hold. Recipe: a hold_at_cutoff course with a 24h window; book a slot 10h out.

**Impact:** A same-day golfer is told nothing is charged and that they can cancel free, then sees a card charge within the hour. This is a dispute and chargeback risk, though the flow completes.

**Fix:** When the cutoff is already past at render or booking time, say so: 'This tee time is inside the cancellation window — the $X hold is charged now and refunded at check-in'. Skip the 'closes within the next hour' email when minsUntilCutoff <= 0.

**Verifier:** Confirmed. BookClient.tsx:205-216 always prints 'charged today $0.00' and 'Free to cancel until <deadline>' with no past check. bookings/route.ts:340 sends the warning email for any minsUntilCutoff < 75, including negative values. The email says the window 'closes within the next hour' (email.ts:303). On the next hourly run, cutoffMs <= now charges the hold for hold_at_cutoff bookings.

### R-GOLF-010 (S3) The receipt misstates money: it says 'Nothing has been charged yet' after a hold or no-show charge, and a late-cancel receipt never shows the amount charged

`src/app/receipt/[bookingId]/page.tsx:177`

**Evidence:** Any status other than completed or cancelled renders 'Nothing has been charged yet. Payment collected at check-in.' (line 177). That includes confirmed bookings with paymentStatus 'cancellation_fee_charged' (the hold, hourly/route.ts:111) and no-show-charged bookings. For a cancelled booking the total row is labelled 'Would have been' (line 83) and shows totalAmount. The late fee is listed, but the separately charged $1.50/player (cancel-booking.ts:233) never is, and there is no 'charged' total. The API (api/receipt/[bookingId]/route.ts:36-58) returns no paymentStatus or no-show fields.

**Impact:** The golfer's only receipt contradicts their card statement.

**Fix:** Return paymentStatus, noShowAt, the fee charges and the separate access-fee charge from the receipt API, and render a 'Charged' section from them.

**Verifier:** Confirmed. The receipt page renders 'Nothing has been charged yet' for any non-completed, non-cancelled status, including a confirmed booking whose hold or no-show fee was charged. A cancelled booking shows 'Would have been' totalAmount. The receipt API returns no paymentStatus, noShowAt or separate access-fee charge data, so the page cannot show what was charged.

### R-GOLF-011 (S3) Self check-in shows a pay form for a cancelled booking, says 'charged to your card' for counter-paid rounds, and passes staff-voiced errors to golfers

`src/app/checkin/[bookingId]/page.tsx:157`

**Evidence:** The page branches only on `info.status === 'completed' || result` (line 157). A cancelled booking falls through to the 'Check in · pay $X' form. The golfer enters a card and only then gets performCheckIn's 'This booking was cancelled' (checkin-booking.ts:108). For status completed it always says `$X was charged to your card` (line 165), including paid_offline rounds paid in cash at the counter. performCheckIn's errors are returned verbatim through /api/checkin (route.ts:77): 'Stripe setup incomplete — the operator needs to finish Stripe onboarding in dashboard Settings…' (checkin-booking.ts:118) and 'Payment failed: {decline}. Collect payment in person and contact support.' (:283).

**Impact:** Golfers see confusing or false states, and a card decline tells them to 'collect payment in person'.

**Fix:** Branch on cancelled (show a cancelled state with the course link) and on paymentStatus paid_offline ('Paid at the course'). Map performCheckIn's codes to golfer copy in the /api/checkin route, e.g. 'Your card was declined — try another card or pay at the pro shop.'

**Verifier:** Confirmed. The check-in GET returns any status (authorize only checks the token), and the page branches only on status==='completed' || result (line 157). A cancelled booking falls through to the pay form, and performCheckIn then returns 'This booking was cancelled'. The completed branch always says '$X was charged to your card', even for paid_offline. The /api/checkin POST passes performCheckIn errors through verbatim, including the staff-voiced Stripe-setup message and 'Collect payment in person and contact support.'

### R-GOLF-012 (S3) Golfer error screens for an expired or invalid link, or a failed load, are dead ends with no link, retry or way forward

`src/app/manage/[bookingId]/page.tsx:243`

**Evidence:** manage/page.tsx:231 'This link has expired' and :243 'Link not recognized': text only, and any non-OK response, including 429 and 500, maps to 'invalid or has expired' (:145-149). checkin/page.tsx:148 'Can't check in' and receipt/page.tsx:63-71 'Receipt not found': text only. AccountPortalClient.tsx:153/176-185 'Could not load your account. Try again shortly.': no retry button. None render GolferExitLinks or a sign-in route (/courses/{slug}/account), although the account portal lists every booking with working links.

**Impact:** Expired, invalid and failed-load links all leave the golfer stuck. The checklist item 'every error … has human copy and a way forward' fails on all four pages.

**Fix:** Distinguish 429/5xx ('Something went wrong — Try again' with a retry button) from 404. On 404/410, return courseSlug where it is known, and link to the course page and to 'Find my bookings' (the course account portal).

**Verifier:** Confirmed. The manage page maps every non-OK, non-410 response (429 and 500 included) to 'This link is invalid or has expired' and renders a text-only card. The expired card, check-in 'Can't check in', receipt 'Receipt not found' and the account portal 'Could not load your account. Try again shortly.' have no link, retry or GolferExitLinks.

### R-GOLF-013 (S3) On /book, 'That time just filled up. Please refresh' leads nowhere: the refresh re-shows the full slot with the party silently cut to 1

`src/app/book/BookClient.tsx:285`

**Evidence:** `const players = Math.min(requestedPlayers, Math.max(teeTime.players_available, 1));` The public loader includes full slots (public-tee-times.ts:65, which filters only `status: { not: 'blocked' }`, so players_available can be 0). The page renders it as bookable for 1 player with no notice, and Confirm returns 409 again (bookings/route.ts:288-293). A slot with fewer seats than requested (4 asked, 2 left) also silently becomes 2 with no notice.

**Impact:** The golfer follows the instruction, gets the same tee time back, possibly booked for fewer players than they chose, and hits the same error again.

**Fix:** Treat players_available < requested (and 0) as a state with copy and a 'Pick another time' button back to /courses/{slug}?date=…, instead of clamping. Change the 409 copy to point there.

**Verifier:** Confirmed. BookClient.tsx:285 clamps players to max(players_available, 1) with no notice. The public loader keeps full slots (it filters only status != blocked), so players_available can be 0. A refresh after the 409 'Please refresh and try again' (bookings/route.ts:291) re-renders the same slot as bookable for 1, and a 4-to-2 shrink is silent.

### R-GOLF-014 (S3) The perf budget gate audits PRODUCTION, not the PR build, and audits /book only as its error shell

`.github/workflows/perf-audit.yml:36`

**Evidence:** `AUDIT_BASE_URL: ${{ vars.AUDIT_BASE_URL || 'https://greenreserve.app' }}`. The PR's code is never served. scripts/perf-audit.ts:33 audits `/book?tee_time_id=dummy…`, the 'Can't complete this booking' shell, so the real form, Stripe Elements, manage and check-in pages are never measured.

**Impact:** A golfer-page regression passes the PR check and is only measured after it ships. The 'perf budget passes' checklist item cannot be answered from CI.

**Fix:** Audit the PR's own build (`next build && next start` in the job, or a deployment URL for the PR's commit), and give /book a real seeded tee time.

**Verifier:** Confirmed. perf-audit.yml defaults AUDIT_BASE_URL to https://greenreserve.app and justifies it with 'Vercel deploys every branch anyway', which contradicts CLAUDE.md (preview builds fail and are unused). The PR's code is never built or served. scripts/perf-audit.ts audits /book with tee_time_id=dummy, which renders the error shell. This is a CI-gate gap, not a golfer-facing defect, so S3 is the ceiling.

### R-OPS-004 (S3) On mobile there is no way to reach Members or Analytics, or to create a Course alert

`src/components/OperatorSidebar.tsx:126`

**Evidence:** `const mobileKeys = (['teesheet', 'money', 'schedule', 'messages', 'settings'] ...).filter(visible)`. The bottom bar never includes 'members' or 'analytics'. The md:hidden header strip holds only the name, the course switcher and Sign out. 'Course alert' and 'Your page' sit only in the `hidden md:block` desktop header. On the tee sheet, setShowConditions(true) is reachable on mobile only through the 'Update' link inside `{conditions && ...}` (page.tsx:586), so the link appears only when an alert already exists. A grep finds no other link to /dashboard/members or /dashboard/analytics anywhere in src.

**Impact:** An owner running the course from a phone cannot open Members (no dues, adding members or reminders), cannot see Analytics, and cannot post a new course alert such as 'cart path only'. They are stuck until they get to a desktop.

**Fix:** Add an overflow 'More' item to the mobile bottom bar (Members, Analytics, Course alert, Your page), or add those links to the mobile header strip.

**Verifier:** Confirmed in OperatorSidebar.tsx:126. The mobile bottom bar is limited to teesheet/money/schedule/messages/settings. The md:hidden strip has only the name, the course switcher and Sign out. Course alert and Your page appear only in the hidden md:block header. On the tee sheet, the mobile entry to setShowConditions is the 'Update' link, which renders only when conditions already exist (page.tsx:586). A grep finds no other in-app link to /dashboard/members or /dashboard/analytics, only Birdie's knowledge text. The five-tab set was SD-2's deliberate thumb-row choice, made before Members and Analytics became owner tabs. The pages still load by typing the URL, so this is a real reachability gap rather than a broken flow. Downgraded to S3.

### R-OPS-005 (S3) Staff 'Cancel' confirmation says nothing will be charged, but under late_cancel timing the late fee and GreenReserve's fee are charged at that moment

`src/components/dashboard/money/CancellationsPanel.tsx:64`

**Evidence:** When paymentStatus !== 'cancellation_fee_charged', the prompt reads `No money has been charged — their card will simply never be billed.` performCancellation (cancel-booking.ts:103) charges the late fee immediately when `isLate && booking.cancellationFeeTotal > 0 && chargesOnLateCancel(booking)`, then charges GreenReserve's fee (line 233). The result's lateFeeChargeFailed is never read by the panel, so a failed late-fee charge is not shown either.

**Impact:** A front-desk worker taking a phone cancellation inside the window at a 'charge only if they cancel late' course tells the golfer it's free, confirms, and the golfer's card is charged. This invites disputes. If the charge fails, nobody is told.

**Fix:** Have the panel compute (or the GET return) whether a cancel now is late and would charge, and word the confirm prompt from that. Show a toast for data.lateFeeChargeFailed.

**Verifier:** Confirmed. In CancellationsPanel.tsx:64, any booking without paymentStatus 'cancellation_fee_charged' gets the prompt 'No money has been charged — their card will simply never be billed.' Under late_cancel or late_cancel_or_no_show timing, performCancellation (cancel-booking.ts ~103-128) charges cancellationFeeTotal at that moment when isLate, and then charges GreenReserve's fee (line 233). The panel reads only feeCharged and feeRefundFailed, never lateFeeChargeFailed, so a failed late-fee charge produces a plain success toast. The after-the-fact toast does mention the fee when feeCharged is true, but the confirm prompt the staff member reads to the golfer is wrong. S3.

### R-OPS-006 (S3) Late-group alert and Cancellations 'upcoming' list use the browser clock, not the course's timezone

`src/app/dashboard/page.tsx:474`

**Evidence:** `const nowMin = new Date().getHours() * 60 + new Date().getMinutes();` is compared with course-local tee times to build lateGroups, even though the line above uses `clockIn(courseTz)` (SD-3) for nowHM. CancellationsPanel.tsx:76 does the same: `const today = new Date().toISOString().split('T')[0]` is the UTC date.

**Impact:** On a device whose clock or timezone differs from the course, for example an owner travelling or a kiosk left on UTC, the 'hasn't checked in' banner and its 'Mark no-show' button show up hours early or not at all. In the evening (US time), today's later bookings drop off the Cancellations 'Upcoming' list because the UTC date has already rolled over.

**Fix:** Work out nowMin from clockIn(courseTz). Pass the course's todayIn(timezone) into CancellationsPanel.

**Verifier:** Confirmed. At page.tsx:474, nowMin = new Date().getHours()*60+getMinutes(), the browser's local time. It is compared with course-local tee times, even though the line above uses clockIn(courseTz) for nowHM (SD-3). CancellationsPanel.tsx:76 takes today from new Date().toISOString(), a UTC date, so in the US evening today's later confirmed bookings drop off the Upcoming list. The impact is wrong display only, so S3.

### R-OPS-007 (S3) Deleting a future tee time whose only booking was cancelled returns a 500

`src/app/api/operator/tee-times/route.ts:130`

**Evidence:** The guard counts only `status: { in: ['confirmed', 'completed'] }`, then `prisma.teeTime.deleteMany(...)` runs. Cancelled bookings still reference the slot, and Booking_teeTimeId_fkey is `ON DELETE RESTRICT` (prisma/migrations/0000_baseline/migration.sql:545), so this throws P2003 and nothing catches it. The sheet shows that slot as '4 spots open' with an active Delete button.

**Impact:** Staff press Delete and get 'Something went wrong (500). Nothing was changed — try again.' Trying again fails the same way. The slot can never be deleted, and the message gives no reason or next step.

**Fix:** Include cancelled bookings in the count and return a clear 409 ('a cancelled booking is on this time — block it instead'), or catch P2003 and return that message.

**Verifier:** Confirmed in tee-times/route.ts:130-134. The booking count looks only at confirmed and completed bookings. Booking_teeTimeId_fkey is ON DELETE RESTRICT in the baseline migration, and no later migration changes it (grep). src/lib/prisma.ts has no $extends or P2003 handling. So a future slot whose only booking was cancelled throws P2003, which surfaces as an unhandled 500. The client's deleteTime toasts the generic error, and every retry fails the same way. The route's own SD-10 comment says this exact 500 was meant to be removed.

### R-OPS-009 (S3) Tee sheet ignores a failed permissions load and silently drops every action button

`src/app/dashboard/page.tsx:141`

**Evidence:** useDashboardAccess() returns `can: () => false` and `failed: true` when /api/operator/my-courses fails (use-dashboard-access.ts). page.tsx never reads access.failed (grep: only money/page.tsx does). OperatorSidebar's visible() also hides every tab for an unknown role (`isStaff: raw ? raw.isStaff : true`).

**Impact:** After a single failed request, an owner sees a tee sheet with no Check in, Walk-in, Block, Add time or Weather buttons, and a top bar with only 'Tee sheet'. Nothing explains why or offers a retry. This breaks the no-silent-failures rule on the most-used page.

**Fix:** When access.failed is true, show the LoadError banner with a Retry button that resets the cached `pending` promise and reloads.

**Verifier:** Confirmed. use-dashboard-access.ts sets failed=true and can() returns false whenever raw is null. In src/app/dashboard, only money/page.tsx reads access.failed; page.tsx never does. OperatorSidebar's visible() treats an unknown login as staff, so only 'Tee sheet' stays visible. The hook's own docstring says 'show the limited view and say so', and the tee sheet does neither. The cached pending promise is reset on failure, so a page reload recovers, but nothing on the page tells the user that or offers it. S3.

### R-OPS-010 (S3) Settings PATCH returns the whole Course row, including adminNotes and stripeAccountId, to staff

`src/app/api/operator/settings/route.ts:109`

**Evidence:** `return NextResponse.json(updated);` returns the raw prisma.course.update row. GET wraps its response in operatorSafe() and its comment says: 'adminNotes is GreenReserve's own build commentary... the operator API was shipping them to every dashboard session, staff included.' PATCH was never given the same treatment. Any staff login with settings.edit (Manager preset) gets the row back on every save.

**Impact:** GreenReserve's internal build notes about the course, and the connected Stripe account id, reach the course's staff and owner through a save response. That is the exact leak the GET fix was meant to close.

**Fix:** `return NextResponse.json(operatorSafe(courseToWire(updated)));`

**Verifier:** Confirmed at settings/route.ts:109: `return NextResponse.json(updated)`, the raw prisma Course row. GET wraps its response in operatorSafe(courseToWire(...)) specifically to strip adminNotes and stripeAccountId, citing the same leak to staff. PATCH is reachable by any login with settings.edit (Manager preset), and by owners. The leak is GreenReserve's internal notes about that same course, not cross-tenant data, so S3 holds.

### R-PAY-004 (S3) hold_at_cutoff: cancelling after the cutoff but before the cron charges (or after a declined hold) is free

`src/lib/cancel-booking.ts:104`

**Evidence:** Under hold_at_cutoff, performCancellation charges nothing itself: chargesOnLateCancel() is false for 'hold_at_cutoff' (cancel-policy.ts:316-317). If the hold has not been taken yet (paymentStatus still 'card_on_file'), clearPhantomFee zeroes the fee (l.138,147). The hold is only taken by the hourly cron at minute 0 (vercel.json `0 * * * *`, hourly/route.ts:89), so there is a gap of up to 59 minutes after every cutoff. A declined hold leaves paymentStatus 'card_on_file' indefinitely, so a later cancel is also free. Meanwhile the manage page tells the golfer 'Cancelling will charge $X to your card' (manage/[bookingId]/page.tsx:312).

**Impact:** The course loses a late fee that its policy and the golfer-facing copy say is kept ('Cancelling after the window keeps that fee').

**Fix:** In performCancellation, when holdsAtCutoff(booking) && isLate && !feeAlreadyCharged, charge the hold there using the cron's idempotency key `cancelfee-${id}-${pm}` (so it can never double the cron's charge), and record it exactly as the cron does.

**Verifier:** chargesOnLateCancel() is false for hold_at_cutoff and for legacy null timing, and clearPhantomFee zeroes the fee when paymentStatus is still card_on_file. hourly runs at '0 * * * *' (vercel.json), so a cancel between the cutoff and the next top of the hour is free, while the manage page says 'Cancelling will charge $X'. Real, but limited to a window of at most 59 minutes. The declined-hold variant is a card that already failed. Revenue leak, but the flow completes: S3.

### R-PAY-005 (S3) still_coming has no state guard: staff can refund GreenReserve's fee on paid_offline or late-cancelled bookings

`src/app/api/operator/bookings/route.ts:137`

**Evidence:** `if (action === 'still_coming') { ... tx.booking.update({ data: { noShowAt: null } }) ... const r = await refundSeparateAccessFee(id, 'no-show marked in error (still coming)', ...); const c = await refundNoShowFee(id, actorName);` There is no check on booking.status or booking.noShowAt; noShowAt only gates the event row (l.141). refundSeparateAccessFee refunds whatever live fee the ledger holds (access-fee.ts:137-143), including the fee charged by paid_offline (l.184) and the one charged with a late cancel (cancel-booking.ts:233). Repro: as any staff login with sheet.no_show, send PATCH {id, action:'still_coming'} for a booking already marked paid_offline or late-cancelled. GreenReserve's $1.50/player is refunded on the platform account. The UI only shows the button for confirmed rows with noShowAt set, but the route is the control (CLAUDE.md SP-A).

**Impact:** GreenReserve loses its fee on any counter-paid or late-cancelled booking whenever a course staffer sends this request. The same action can also refund a course no-show fee on a cancelled booking.

**Fix:** Return 409 unless booking.status === 'confirmed' && booking.noShowAt is set, before any refund.

**Verifier:** operator/bookings/route.ts still_coming has no status or noShowAt guard before refundSeparateAccessFee and refundNoShowFee. liveSeparateFee returns any fee_charged PI, including the one paid_offline and late_cancel charge. A staffer with sheet.no_show can craft the PATCH. Lowered to S3: it needs a deliberate crafted request by the course's own authenticated staff, the money goes back to the golfer and not to the attacker, and the amount is $1.50 per player.

### R-PAY-009 (S3) Webhook records hold and late-fee refunds as round 'refund' rows, so a later admin refund under-refunds and the export is wrong

`src/app/api/stripe/webhook/route.ts:53`

**Evidence:** Hold refunds at check-in (checkin-booking.ts:288), at paid_offline (operator/bookings/route.ts:172) and on waive (cancel-booking.ts:80) write no PaymentEvent, so charge.refunded is the first to ledger them. bookingForPi matches through cancellationFeeChargeId (refund-booking.ts:147), isFee is false, and the row is written as `kind: 'refund'`. refundBooking then sums every 'refund' row for the booking: `remaining = booking.totalAmount - alreadyRefunded` (refund-booking.ts:171,181-182). The transactions export also lists it as a round refund and takes a pro-rata GreenReserve fee off it (admin/transactions/export/route.ts:46,63-66), although the hold carried no application fee.

**Impact:** A checked-in round that had a $20 hold refunded can later be refunded by admin for at most total − $20, and the golfer is short. The finance export misstates refunds and GreenReserve's fee.

**Fix:** In the webhook, when the PI equals booking.cancellationFeeChargeId, write a distinct kind (for example 'late_fee_refunded'). Or have each hold-refund site record its own PaymentEvent with the refund id so the webhook dedupes it. Have refundBooking sum only refunds whose PI is roundPaymentIntentId.

**Verifier:** The hold refund at check-in (checkin-booking.ts) and at paid_offline records only a BookingEvent, never a PaymentEvent, and cancellationFeeChargeId stays on the booking. In the webhook, charge.refunded finds the booking through findBookingByStripeId (it matches cancellationFeeChargeId). isFee is false, so it writes kind 'refund'. refundBooking then sums all 'refund' rows against totalAmount, so the remaining amount is understated. Real, but it needs the Connect webhook live plus a later admin full refund of the same round. Lowered to S3.

### R-PAY-010 (S3) Declined fee charges are invisible: a cutoff hold decline is never ledgered, and charge_failed rows only appear in one golfer's timeline

`src/app/api/cron/hourly/route.ts:140`

**Evidence:** Hold decline: `catch (err) { console.error(...); results.failed++; }`. It writes no PaymentEvent, no checkInFailReason and no golfer email. The payment_intent.payment_failed webhook cannot map it either, because the failed PI id is stored nowhere (bookingForPi returns null, webhook route.ts:96-97). The cancellation-cutoff cron has the same gap (l.113-116). The late-cancel, no-show and separate-fee declines do write 'charge_failed', but the only reader is the per-golfer label map in admin/golfers/page.tsx:61. FAILED_CHARGE_WHERE (money-problems.ts:9) only counts check-in declines. Failed hold refunds at check-in also write no refund_failed row.

**Impact:** Nobody learns that a hold, late fee or no-show fee failed. Staff see an ordinary confirmed booking, admin Problems shows nothing, and the golfer is never told.

**Fix:** Record a charge_failed PaymentEvent (with the bookingId) in both cron catch blocks and a refund_failed row for failed hold refunds. Add a 'failed fee charges' predicate over charge_failed and refund_failed rows to money-problems.ts so the admin Problems list shows them.

**Verifier:** Both cron catch blocks (hourly ~l.140, cancellation-cutoff ~l.113) only console.error and count failed. They write no PaymentEvent or checkInFailReason. The failed PI id is stored nowhere, so the payment_failed webhook cannot map it. FAILED_CHARGE_WHERE in money-problems.ts keys only on checkInFailReason. The only reader of charge_failed is the label map in admin/golfers/page.tsx.

### R-PAY-011 (S3) Membership pay route charges dues again when the membership was marked paid at the pro shop (paid_offline)

`src/app/api/membership/[id]/route.ts:78`

**Evidence:** The double-pay guard is `if (m.paymentStatus === 'paid' && m.expiresAt) {... daysLeft > 30 → 409}`. 'paid_offline', which operator/members/route.ts:204 writes, is not blocked on the server; only the page hides the form through GET alreadyPaid. A pay page left open, or a crafted POST, after staff mark_paid charges the full dues. The idempotency key is per PaymentMethod (`membership-${m.id}-${paymentMethodId}`) and createPaymentMethod mints a new PM per submit, so it does not dedupe.

**Impact:** A member who paid cash can also be charged by card for the same term, and expiry is extended twice.

**Fix:** Treat 'paid_offline' the same as 'paid' in the server guard, and block when expiresAt is null and the status is paid or paid_offline.

**Verifier:** The server guard in membership/[id]/route.ts POST blocks only paymentStatus==='paid' && expiresAt. operator/members mark_paid writes 'paid_offline', which only the GET's alreadyPaid hides in the client. A stale open pay page or a resubmit charges the dues again and extends expiry a second time. The idempotency key is per PaymentMethod, so it does not dedupe.

### R-UI-001 (S3) Payouts panel says "You keep 100% of your green and cart fees" - phrase banned by LQ-2 and contradicts CLAUDE.md fee copy freeze

`src/components/dashboard/money/PayoutsPanel.tsx:120`

**Evidence:** Line 120: "...in the same card payment as your green fee. You keep 100% of your green and cart fees. Stripe's normal card-processing fee applies...". legal/LQ-2_FEE_COPY.md bans "keep 100%" on every surface, including new copy, and bans any sentence implying the course nets its listed green fee to the cent. The next sentence about Stripe's fee contradicts it. src/app/HomeContent.tsx:15 and src/app/layout.tsx:28 both follow the rule.

**Impact:** Operators see the claim LQ-2 retired, on the page where they look at their money. This is a legal-exposure copy slip, not a payment bug.

**Fix:** Delete the sentence "You keep 100% of your green and cart fees." Optionally use the LQ-2 allowed sentence about one card payment to the course's own Stripe account. The Stripe-fee sentence can stay.

**Verifier:** I opened src/components/dashboard/money/PayoutsPanel.tsx:120. It renders "You keep 100% of your green and cart fees." in the operator-facing "What GreenReserve takes" card. legal/LQ-2_FEE_COPY.md bans "keep 100%" on every surface, new copy included, and also bans any sentence implying the course nets its listed green fee to the cent. Its own worked example has the course netting $232.57 on $240 of green fees. I found no exception in the codebase: grep finds the phrase only here and in comments that forbid it (HomeContent.tsx:15, layout.tsx:28). CLAUDE.md line 4 says "courses keep 100% of green fees", but that is an internal context summary, not shipped copy, so it does not license the UI string. The sentence is also contradicted by the very next sentence about Stripe's fee. The copy is wrong but nothing breaks, so S3 stands.

### R-ADM-006 (S4) request_details / resend_details has no server-side status guard; only the client limits it to pending (bulk) or modal-eligible states

`src/app/api/admin/inquiries/route.ts:471`

**Evidence:** The handler unconditionally writes `status: 'details_requested'` (478) for any inquiry, including building/live/rejected. The CLOSED guard at line 143 is applied only to the call actions. Bulk canSendSheet (inquiries/page.tsx:350) and the detail modal guard it client-side only.

**Impact:** A stale tab, or a direct API call by a manager, can regress a building or live inquiry back to details_requested and email the operator a setup-sheet link. Low odds in practice, hence S4.

**Fix:** Reject request_details/resend_details with 409 unless the inquiry's status is pending, in_review, details_requested or details_submitted.

**Verifier:** Confirmed. The request_details/resend_details branch writes status 'details_requested' with no check on the current status. CLOSED is applied only to the call actions (lines 149/163/171/284), and POST (1176-1182) routes straight to handleAction. The client gates it: bulk canSendSheet allows pending only, and InquiryCallCards is hidden for archived/rejected. A stale tab or a direct call could still move a building or live inquiry back. Unlikely, and the admin can fix it, so S4.

### R-ADM-007 (S4) Messages and course-thread 'mark as read' PATCH failures are swallowed

`src/app/admin/messages/page.tsx:116`

**Evidence:** `await fetch('/api/admin/messages', { method: 'PATCH', ... }).catch(() => {});` (also useCourseDetail.tsx:289) and a non-ok response is never checked.

**Impact:** If it fails, the unread badge in the sidebar stays and the thread silently remains unread. Best-effort by design (commented as such in useCourseDetail), so polish only.

**Fix:** Optionally log or show a small 'could not mark read' note; otherwise leave as is.

**Verifier:** Confirmed. src/app/admin/messages/page.tsx (~116) and useCourseDetail.tsx loadCourseThread both send the mark-read PATCH with .catch(() => {}) and never check res.ok. Both have comments saying this is best-effort on purpose. It technically breaks the 'never swallow a catch' rule, but the only effect is a stale unread badge. S4 polish.

### R-AUTH-007 (S4) Permission catalog offers 'Issue refunds', 'Charge a fee by hand' and 'See payouts' that no route enforces; the Payouts tab 403s for staff, and payouts is Stripe, which CLAUDE.md says is never grantable

`src/lib/staff-permissions.ts:49`

**Evidence:** Grepping src for money.refund and money.charge_fee finds them only in the catalog; no operator route calls requirePermission with them. money.payouts only shows the tab (money/page.tsx:26, OperatorSidebar:120). PayoutsPanel calls /api/operator/stripe/connect and /stripe/dashboard-link, and both return STAFF_FORBIDDEN.

**Impact:** An owner who grants these thinks the staff member has the power. The staff member gets a tab whose buttons fail, and the labels describe rules that aren't enforced (CLAUDE.md SP-A: one catalog so labels can't drift from enforcement).

**Fix:** Remove money.refund, money.charge_fee and money.payouts from PERMISSIONS (or hide them as 'coming') until a route enforces them. Never offer payouts, because it's Stripe.

**Verifier:** The core claim holds. money.refund and money.charge_fee appear only in staff-permissions.ts, and no operator route has a refund or manual-charge action to gate, so those toggles do nothing. money.payouts opens the Payouts tab, whose buttons call stripe/connect and stripe/dashboard-link; both return STAFF_FORBIDDEN. The finding overstates one part: STAFF_POLICY_SPEC A2 deliberately makes 'See payouts' grantable and keeps only Stripe connection and payouts setup owner-only. These toggles are labels with no feature behind them rather than an escalation path, so S4.

### R-AUTH-008 (S4) 'Manage members' (members.edit) also lets staff rewrite tier prices and dues

`src/app/api/operator/tiers/route.ts:67`

**Evidence:** tiers PATCH/POST/DELETE gate on requirePermission(session,'members.edit') and write greenFeeWeekdayCents, cartFee*, discountPct, annualFeeCents, initiationFeeCents and termMonths. The catalog help for members.edit is 'Add and edit members and send dues reminders.', with no mention of rates or dues, unlike schedule.edit ('Change schedules and rates').

**Impact:** An owner who gives front-desk staff member management also gives them control over member pricing and annual dues amounts, without being told.

**Fix:** Gate tier writes on a separate key (or settings.edit / owner-only), or reword the members.edit help so it says it includes tier pricing and dues.

**Verifier:** tiers/route.ts POST, PATCH and DELETE gate on members.edit and write the tier price, cart fee, discount and dues fields. The spec does not map tiers; A1 had them owner-only. The members.edit help text ('Add and edit members and send dues reminders.') does not mention pricing. members.edit is in no preset except Manager, so an owner has to grant it on purpose. This is a mismatch between the label and the power it grants, so S4.

### R-AUTH-009 (S4) Member session cookie lives 7 days, but CLAUDE.md's session table says 90 days absolute

`src/app/api/member/[courseSlug]/verify/route.ts:52`

**Evidence:** signMemberSessionToken sets 90d (member-session.ts:43), but the cookie is set with `maxAge: 60 * 60 * 24 * 7`. CLAUDE.md: 'Member (per-course) | gr_member | 90 days absolute'.

**Impact:** Members are signed out after a week and have to request a magic link again, which contradicts the documented policy.

**Fix:** Set maxAge to 60*60*24*90 to match the JWT (or update CLAUDE.md if 7 days is intended).

**Verifier:** verify/route.ts sets the gr_member cookie with maxAge 60*60*24*7, while member-session.ts signs a 90d JWT and CLAUDE.md documents 90 days absolute. Members are signed out after a week. That is an annoyance and a docs mismatch, not a broken flow, so S4.

### R-AUTH-011 (S4) Routes that call getOperatorSession() directly skip the sessionVersion and multi-course checks in resolveDashboardSession

`src/app/api/operator/my-courses/route.ts:11`

**Evidence:** my-courses, onboarding-complete, active-course, change-password and auth/resend-verification call getOperatorSession() and trust the JWT. Only resolveDashboardSession compares `session.sv` with operator.sessionVersion (session.ts SD-5). my-courses lists every course name for a token that a password reset was meant to revoke.

**Impact:** A revoked operator token can still list courses, set onboarding step or the active-course cookie, and trigger verification emails. No money or tenant crossing, because change-password still needs the current password.

**Fix:** Add a sessionVersion check to these routes (or have getOperatorSession do it for kind 'operator').

**Verifier:** my-courses/route.ts uses getOperatorSession() for kind 'operator', and the sv check exists only in session.ts:79 (resolveDashboardSession). A revoked operator token can still list that operator's own course names. Its activeCourseId falls back to courses[0], so the call does not fail. Only the operator's own courses are exposed, with no other tenant reached and no money involved, so S4 is right.

### R-AUTH-012 (S4) Operator 2FA resend has no rate limit

`src/app/api/auth/2fa/resend/route.ts:20`

**Evidence:** Each POST with a valid gr_2fa_pending cookie calls issueTwoFactorCode, which sends a new email or SMS. There's no rateLimit call (verify has one, resend doesn't).

**Impact:** Someone who already has an operator's password can trigger unlimited SMS (Twilio cost) or email, and keep getting fresh codes.

**Fix:** rateLimit(`2fa-resend:${operatorId}`, 3, 600).

**Verifier:** auth/2fa/resend/route.ts has no rateLimit call. issueTwoFactorCode sends a new SMS or email on every call. The caller already needs a valid pending_2fa cookie, which requires the password. verify's per-IP limit (10 per 300s) still bounds guessing, so the impact is cost and spam, S4.

### R-AUTH-013 (S4) Member tee-times endpoint doesn't check membership status for gr_member sessions

`src/app/api/member/[courseSlug]/tee-times/route.ts:31`

**Evidence:** With a member session, membershipId comes from the JWT, and the route loads the membership only for its tier. There's no `status === 'active'` check (session/route.ts:164 and bookings POST:151 both have one). windowFor(course, { tier: null }) still returns the member scope.

**Impact:** A removed or lapsed member keeps the extended member booking window view until the cookie expires. Booking still enforces active status.

**Fix:** Return 403 when membership is missing, inactive, or belongs to another course, like session/route.ts does.

**Verifier:** member tee-times/route.ts takes membershipId from the gr_member JWT and loads the membership only to read its tier. It never checks status === 'active', unlike the session route and the bookings POST. A lapsed member keeps the member window and tier rates in this view. Booking still checks status, so S4.

### R-CRON-005 (S4) Day-before reminders and cutoff warnings have no sent-once record, so a rerun or duplicate invocation sends them again

`src/app/api/cron/send-reminders/route.ts:23`

**Evidence:** send-reminders selects `{ status: 'confirmed', teeTime: { date: tomorrowStr } }` and sends to every booking with nothing stamped. The hourly warning (hourly:69) is likewise gated only by the time window. Every other cron send has a dedup: paymentStatus for holds and check-in emails, noShowAt, renewalRemindedAt, RateLimit key for call reminders, noticeSentAt, and the timeline marker for chase-onboarding.

**Impact:** Running a job twice (manual rerun, Vercel duplicate delivery) sends every golfer a second reminder or warning. This is exactly the REVIEW_SPEC rerun check.

**Fix:** Add a nullable `reminderSentAt` / `cutoffWarningSentAt` on Booking (additive migration) and set it with a conditional `updateMany({ where: { id, reminderSentAt: null } })` before sending. Or reuse the RateLimit-key pattern from call-invite.ts (`reminder:${id}`, limit 1).

**Verifier:** The missing dedup is real. send-reminders queries every confirmed booking for tomorrow and stamps nothing, and the hourly warning is gated only by its time window. I'm downgrading it, though. Admin → System has no run-now button (the page only shows the cron path), so a duplicate needs a manual curl with CRON_SECRET or a rare duplicate Vercel invocation. The result is a second copy of an informational email, with no money moved and no flow broken.

### R-CRON-009 (S4) Admin staff-login email bypasses getResend() and the shared template (no logo)

`src/app/api/admin/resend-staff-setup/route.ts:20`

**Evidence:** `const resend = new Resend(process.env.RESEND_API_KEY); ... resend.emails.send({ ..., html: `<p>Hi ${staff.name},</p>...` })`. This is the only `new Resend(` outside src/lib/email.ts. It checks `r.error` by hand (so it isn't silent), but it skips baseTemplate (LOGO-1 lockup top-left, footer) and puts staff.name into the HTML unescaped.

**Impact:** An off-brand plain email, and a second send path that won't pick up future getResend() behaviour (reply-to defaults, throw-on-error).

**Fix:** Move it into an exported `sendStaffSetupEmail()` in src/lib/email.ts that uses getResend() and baseTemplate(), and call that from the route.

**Verifier:** I confirmed this. admin/resend-staff-setup/route.ts:20 is the only `new Resend(` outside src/lib/email.ts. It checks r.error by hand, so failures aren't silent. It skips baseTemplate (no LOGO-1 lockup or footer) and puts staff.name into the HTML unescaped, but only manager-plus admins can trigger it and the email goes to the staff member's own address. This is brand and consistency polish.

### R-GOLF-015 (S4) The check-in page loads Stripe.js on import, even when the golfer will pay with their saved card

`src/app/checkin/[bookingId]/page.tsx:10`

**Evidence:** `import { loadStripe } from '@stripe/stripe-js';` (main entry, which injects on import) plus module-scope `const stripePromise = loadStripe(...)`. Elements is only used in the `!info.hasCard` branch (line 265). CLAUDE.md: 'Stripe JS deferred until a card is actually needed (getStripePromise() pattern)'. BookClient does this correctly with '@stripe/stripe-js/pure'.

**Impact:** Extra third-party JS on a golfer page usually opened on a phone at the course.

**Fix:** Use the /pure entry and a lazy getStripePromise() called only in the no-card branch.

**Verifier:** Confirmed. checkin/page.tsx imports loadStripe from '@stripe/stripe-js' (the main entry, which injects the script on import) and calls it at module scope (line 10). This goes against CLAUDE.md's 'Stripe JS deferred until a card is actually needed' rule, which BookClient follows with the /pure entry.

### R-GOLF-016 (S4) The account portal splits upcoming from past on the UTC date, so evening tee times in US timezones drop out of 'Upcoming' (and lose Check in/Manage) before they are played

`src/app/api/courses/[slug]/account/route.ts:29`

**Evidence:** `const today = new Date().toISOString().split('T')[0];` is UTC, while TeeTime.date is course-local. After 5pm PT, today's 6pm booking matches `teeTime: { date: { lt: today } }` (past) and not `gte: today` (upcoming).

**Impact:** A twilight golfer opening the portal to check in finds the booking under Past with only a receipt link.

**Fix:** Use todayIn(course.timezone) from lib/course-time.

**Verifier:** Confirmed. account/route.ts:29 uses new Date().toISOString() (the UTC date) to split upcoming from past. TeeTime.date is course-local, so US-evening same-day bookings move to Past early. todayIn() exists in lib/course-time and is used elsewhere.

### R-GOLF-017 (S4) Manage 'Change players' is capped at 4, while bookings allow up to 8

`src/app/api/manage/[bookingId]/change-players/route.ts:17`

**Evidence:** Route: `newPlayers > 4` returns 400 'Missing or invalid parameters'. Page: `const maxPlayers = 4` (manage/page.tsx:357). bookings/route.ts:85 allows up to 8. A party of 6 pressing − to 5 gets the generic 400.

**Impact:** Large parties cannot shrink online, and the error message does not explain why.

**Fix:** Use the same 1–8 bound (or the slot capacity) in both places.

**Verifier:** Confirmed. change-players/route.ts:17 rejects newPlayers > 4 with the generic 'Missing or invalid parameters', and the manage page hard-codes a maximum of 4. bookings/route.ts:85 allows 1 to 8, so a booked party of 5 or more cannot change size online. Where the slot capacity is 4 this is moot, so S4.

### R-OPS-011 (S4) No way to cancel a booking from the tee sheet; 'sheet.cancel' without a money.* key has no UI at all

`src/components/OperatorSidebar.tsx:120`

**Evidence:** The only staff cancel UI is CancellationsPanel (Money → Cancellations). There is no cancel button in the tee-sheet rows (page.tsx:870-898). The Money tab is visible only when `money.cancellations || money.payments || money.payouts`. The catalog lists 'Cancel a booking' under the 'Tee sheet' group (staff-permissions.ts:40) and it can be granted on its own.

**Impact:** Someone at the counter on the phone has to leave the sheet and find the booking in a 200-row Money list. A custom login granted only 'Cancel a booking' has a permission it cannot use anywhere.

**Fix:** Add a Cancel action to the expanded booking row, gated by access.can('sheet.cancel'), that reuses CancellationsPanel's cancelBooking wording and the PATCH call.

**Verifier:** Partly holds. The only operator UI that sends action 'cancel' is CancellationsPanel (grep). Seeing its booking list needs money.cancellations (bookings GET, route.ts:26), and the Money tab is visible only with a money.* key. So a custom login holding sheet.cancel without money.cancellations has no single-cancel UI. sheet.cancel is not useless, though: sheet.weather_cancel requires it. Every preset that grants sheet.cancel (Front desk, Legacy, Manager) also grants money.cancellations, and putting cancellation on Money was SD-8's deliberate layout. This is a missing convenience and a custom-grant edge case, so S4 polish, not S3.

### R-OPS-012 (S4) Operator tee sheet status column has drifted from the homepage demo (FLOW-2 'change one, check the other')

`src/app/dashboard/page.tsx:80`

**Evidence:** The demo (TeeSheetDemo.tsx:91-98) shows 'Due $X' plus 'Check in' for a booked group, 'Held', and has a 'Bookings' list tab in the sheet bar. The real sheet's slotBadge shows '{n} left' / 'Full' / '{n} open' for booked slots and has no list view or amount due.

**Impact:** The marketing demo shows a sheet the product does not have. Prospects see the amount owed and a Bookings tab, then can't find either.

**Fix:** Choose one: either make the operator status column show the amount due for unpaid groups, or change the demo to the '2 left' / 'Full' wording and drop its Bookings tab.

**Verifier:** Confirmed. TeeSheetDemo.tsx shows 'Due $X' with an inline Check in for a booked group, a 'Held' state, and a 'Bookings' tab (line 74). The operator sheet's slotStatus and slotBadge (page.tsx:70-87) show 'Checked in', 'N left', 'Full' and 'N open', with no amount due and no Bookings tab. The code comment there claims to be 'the demo's status column', which is not accurate. FLOW-2 says to keep the two in sync. This is marketing and product drift only, so S4.

### R-UI-002 (S4) Stat numbers and money set in font-serif on admin pages (serif is reserved for headlines, course names, dates)

`src/app/admin/revenue/page.tsx:582`

**Evidence:** revenue/page.tsx:582 `text-lg font-serif font-semibold tabular-nums` renders fmtMoney(pnl.net). src/app/admin/golfers/page.tsx:235 `text-[22px] font-serif font-semibold leading-none tabular-nums` renders c.value counts. CLAUDE.md: font-serif is "for headlines, course names and dates ONLY... Never set times or data in the serif". I did not confirm whether stat numbers have a separate prescribed class, so the severity is S4.

**Impact:** Admin data figures use the display face, which is inconsistent with the rest of the admin tables.

**Fix:** Switch both to font-sans (keep tabular-nums), or have Cam rule that stat numbers are a permitted serif use and document it in CLAUDE.md.

**Verifier:** Both lines are as cited. revenue/page.tsx:582 sets fmtMoney(pnl.net) in `text-lg font-serif font-semibold tabular-nums`, and golfers/page.tsx:235 sets count and money values in `text-[22px] font-serif ...`. CLAUDE.md TYPE-1 restricts font-serif to "headlines, course names and dates ONLY... Never set times or data in the serif". No doc carves out an exception for stat figures. Only these two files pair font-serif with tabular-nums, so this is an isolated inconsistency, not a pattern. One addition: the golfers/page.tsx tiles also put an <Eyebrow> label above each value, which TYPE-2 discourages, though design-guard baselines it. This is a visual inconsistency only, so S4.

