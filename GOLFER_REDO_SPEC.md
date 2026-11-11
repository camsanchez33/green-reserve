# GOLFER-REDO — the course booking page (Cam 2026-11-11)

Cam's notes (chat 2026-11-11): keep the information, change the hierarchy — "a polished reservation application", not
a course information profile. Mockup: `lanes/golfer/booking-page-mockup.html` (claude.ai/artifact/K8kASEuuMnpubSV3gLHJpm).

## Decisions (question feature, 2026-11-11)
- Mockup first, approved by Cam, then built by the Golfer lane.
- The look: a regular clean light page, NO glass, the course's own photo, logo and colour leading.
- #361 and #363 merged; the redesign builds on them.
- "(TEST)" stays on test courses' pages (never on real ones); test pages stay noindex.
- Fee wording on golfer pages is "service fee" (Cam 2026-11-11).

## The page, in order
1. Header: banner photo (the course's), a large logo, the name as the main heading, a small details row (town,
   public/private, holes, par, walking), and "Find a tee time".
2. Booking first: dates across the top with "from" prices, players, 9/18, walking/riding, times grouped by part of
   day with the price beside each, a sticky summary on a laptop and a bottom bar on a phone.
3. Course information: description, a four-fact grid, yardages by tee.
4. Photos: optional gallery (CoursePhoto, already uploadable); hidden when a course has none.
5. Facilities.
6. Footer: address, phone, directions, the course's website, cancellation policy, privacy and terms, small
   "Booking powered by GreenReserve".

Already exists: banner (`heroPhotoUrl`), logo, gallery (`CoursePhoto`, Settings), booking-first sidebar layout. New
data needed is none expected — check the course's website field before the footer.
