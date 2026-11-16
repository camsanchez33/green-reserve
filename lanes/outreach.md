# Outreach lane: finding courses, emailing them, replies, tracking (QUEUED, Cam 2026-11-16)

Cam: "a separate branch that focuses on course outreach: managing emails, sending them, replying to them, sending out to new courses, finding where they are and keeping track. Start sending emails Dec 1."

## What already exists (build on it, don't rebuild it)
- `/admin/inquiries` and `/admin/inquiries/[id]`: the course pipeline, one `CourseInquiry` per course, every contact an `OutreachTouch` (email, call, text or in person; in or out; logged by hand), discovery calls (`src/lib/inquiry-call.ts`) and Cal.com booking.
- `company/outreach/`: the plan, who goes on the list (`course-list-criteria.md`), emails 1–3, call and text scripts, objections, the demo script.

## What's new
1. **Find courses.** Show the target list on a map with each course's location, owner type (town, county, independent), how it books today, its decision maker and its stage. Use public sources only (course websites, OpenStreetMap); no scraped personal data.
2. **Send.** Send emails 1, 2 and 3 from the course's page, one course at a time, written by Cam, never a bulk blast. Each send is logged as an `OutreachTouch` automatically, and follow-ups come due on a date, not a timer.
3. **Replies.** A reply lands on the course's page as an incoming touch, and Cam answers from there.
4. **Track.** Each course's stage (target → emailed → replied → call booked → signed → live), with what's due today first.

## Decisions for Cam before any build
- **Sending address.** Cold email must NOT go out from greenreserve.app through Resend. Resend's terms forbid unsolicited email, and complaints would hurt delivery of golfers' booking confirmations at launch. Recommend a separate mailbox on a sibling domain, sending from Cam's own mail account, with the app logging and threading it. A new domain needs about 2 weeks of warm-up, so it has to start now to send on Dec 1.
- **Replies come from that mailbox,** read through its API. Building our own inbound mail server is not needed.
- **The law.** Every email follows CAN-SPAM: a real name, a postal address, an honest subject and a way to say no that is honoured. Sends go to businesses only, one at a time.
- **Date.** `LAUNCH_PLAN_SPEC.md` and `company/outreach/plan.md` say Mon Nov 30, but Cam now says Tue Dec 1. Update both once confirmed.
- **When.** The page redo freezes Nov 23. Recommend the smallest version by Dec 1: send-and-log plus the reply view on the existing inquiry pages, with the map and stages straight after launch.

## Who builds it
The pages are the Admin lane's (`/admin/inquiries`); the mailbox connection, sending and logging are Build's (shared code, Opus, final-reviewer); the list and the email copy are the Company lane's (`company/outreach/`). It starts once Cam answers the decisions above.
