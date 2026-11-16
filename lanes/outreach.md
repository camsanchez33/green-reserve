# Outreach lane: finding courses, emailing them, replies, tracking (QUEUED, prep starts Nov 23)

Cam: "a separate branch that focuses on course outreach: managing emails, sending them, replying to them, sending out to new courses, finding where they are and keeping track. Start sending emails Dec 1."

## What already exists (build on it, don't rebuild it)
- `/admin/inquiries` and `/admin/inquiries/[id]`: the course pipeline, one `CourseInquiry` per course, every contact an `OutreachTouch` (email, call, text or in person; in or out; logged by hand), discovery calls (`src/lib/inquiry-call.ts`) and Cal.com booking.
- `company/outreach/`: the plan, who goes on the list (`course-list-criteria.md`), emails 1–3, call and text scripts, objections, the demo script.

## What's new
1. **Find courses.** Show the target list on a map with each course's location, owner type (town, county, independent), how it books today, its decision maker and its stage. Use public sources only (course websites, OpenStreetMap); no scraped personal data.
2. **Send.** Send emails 1, 2 and 3 from the course's page, one course at a time, written by Cam, never a bulk blast. Each send is logged as an `OutreachTouch` automatically, and follow-ups come due on a date, not a timer.
3. **Replies.** A reply lands on the course's page as an incoming touch, and Cam answers from there.
4. **Track.** Each course's stage (target → emailed → replied → call booked → signed → live), with what's due today first.

## Decided (Cam 2026-11-16)
- **Mailbox:** `admin@greenreserve.app` on Cam's Google Workspace, through its Gmail, which Cam will link here. NOT Resend. Build's caution: it shares greenreserve.app's domain reputation with golfers' booking emails, so keep it to one-to-one emails Cam has read, at most about 30 new courses a day, with SPF, DKIM and DMARC checked on Workspace before the first send. A bounce or complaint rate climbing is a stop sign.
- **When:** outreach prep starts Nov 23, when the page redo is done ("we are ahead of schedule"). Emails start Dec 1. Update `LAUNCH_PLAN_SPEC.md` and `company/outreach/plan.md` from Nov 30 to Dec 1 at that point.
- **Law:** every email follows CAN-SPAM: a real name, a postal address, an honest subject and a way to say no that is honoured. Sends go to businesses only, one at a time.
- **Replies:** read from that Gmail through its API or connector. No inbound mail server.

## Who builds it
The pages are the Admin lane's (`/admin/inquiries`); the mailbox connection, sending and logging are Build's (shared code, Opus, final-reviewer); the list and the email copy are the Company lane's (`company/outreach/`). It starts Nov 23.
