# Admin walkthrough V1 (Cam 2026-10-20)

Status: QUEUED — Cam: "save this for when everything else is done and we can go
over it then". Nothing here is built. Go over it with Cam (questions first)
after Walkthrough 2 (OPERATOR_REWORK_SPEC / HOMEPAGE_SPEC "Walkthrough 2") is done.
Earlier admin specs: ADMIN_REBUILD_SPEC, ADMIN_V2..V4_SPEC.

## Cam's notes, verbatim

> First u type in greenreserve.app/admin brings u into admin cosole access the whole thing just looks weird and then it says are u in owner go to sign on it shouldnt ahve that thw owner should know his own thing and it shouldn t be the same thing as the admin cause that is where theoretical workers would go
>
> quick thing/fix 404 pages or we couldnt find that maybe do a litte rework just say this doesnt exist what are u look for or return home its honestly fine and can just be kept
>
> My owner sign in should be /cam and should be unbelievably secure
>
> Wow so this is a lot this first page first thoughts are do we really want a side bar as opposed to top and how can we make this whole side bar shit be more organized and easy with all the admin pages since it is our company its not so much about impressing or looking good but the functionality and ease needs to be icredibly thought out this is how all issues and problems are going to be fixed
>
> starting with platform overview it fucking sucks i mean u have green reserve fees today who gives a fuck what does that help us with unread sitting there doing nothing and then waiting i mean its awful needs complete rework
>
> Then the action que this also sucks so combobled no clue what to look at and what to do this jsut sucks all around makes no sense no functionality or ease to it u have the refresh word in the top that should be symbol
>
> You scroll down and see the revenue boc with day week month just so unorganized with live courses bookings and green reserve fees FUCKING THINK what do we actually need there as the owner of the website think and then u have three random tabs pipleine todays sheet and course health watch list i mean it just sucks all around maube some things need seperate tabs but it just needs to be better also there should be AI integrated into the admin doing checks hourly with updates making sure things are running wel that they are notiying of any problems messages etc
>
> moving down into inquiries
> - THIS IS GENuiniely one of the worst tabs ive ever seen complete wework
>
> Courses tab
> - This sucks to complete rework just so unorganized and functionality is terrible rework
>
> Messages
> - I geuss messages is alright still not organized and the announcments thing shouild probaly be its own thing and make it actually organized an functionally sound
>
> Revenue
> - GENUINELY TERRIBLE complete rework
>
> Golfers
> -DO WE REALLY NEED TO KNOW WHO EVERY FUCKING GOLFER IS
>
> EMPLOYEES
> - NEED THIS TO BE A GOOD TAB AND IT sucks we have the change password tab on just htis page makes no fucking sense
>
> ACtivity
> - IS every fucking thing going to be here on this activity page that sounds retarded fix it with rework and ask me questions
>
> Manual build
> -LETS THINK are we REally doing this dumb shit fucking from like V1
>
> System
> - SO MUCH ON THIS TAB IS important and it is so fucking disorganized
>
> COmpany docs
> - Again important needs to be organized
>
> My profile
> - Just rework make more organized
>
> OVERALL
>
> THINK about how to make this way better because it sucks ask me questions about how and what to change maybe some more tabs are needed Expense tab? MArketing tab? LEads Tab? Advertising Tab? The employees thing also im  the owner so i can see everything but workers are going to have there own log in and are going to only see certain  portals etc so that needs to be built out

## Items (nothing built; questions to Cam first)

- **AW-1 Owner sign-in at /cam, separate from employees.** /admin is the employees' door; the "are you the owner?" prompt goes. The owner signs in at /cam — "unbelievably secure" (auth: overseer only, never delegated).
- **AW-2 404 page.** Small rework: says the page doesn't exist, asks what they were looking for, offers home. Low priority ("honestly fine").
- **AW-3 Navigation.** Sidebar vs top bar; organise every admin page around how problems get found and fixed. Function over looks.
- **AW-4 Platform overview.** Complete rework — what the owner actually needs to see and act on (not "GreenReserve fees today", not an unread count that sits there). Includes the action queue (unclear what to look at; refresh should be an icon), the revenue box, and the Pipeline / Today's sheet / Course health tabs.
- **AW-5 AI checks.** An assistant in the admin that runs hourly checks that things are running well and reports problems and messages.
- **AW-6 Inquiries.** Complete rework.
- **AW-7 Courses.** Complete rework.
- **AW-8 Messages.** Organise; announcements become their own area.
- **AW-9 Revenue.** Complete rework.
- **AW-10 Golfers.** Question whether the admin needs a list of every golfer at all.
- **AW-11 Employees.** Make it a good tab; change-password does not belong only here. Employee logins with per-person access to only some areas (owner sees everything) — needs building out.
- **AW-12 Activity.** Rework; decide what belongs there (not "every single thing"). Questions to Cam.
- **AW-13 Manual build.** Question whether it should exist at all (from V1).
- **AW-14 System.** Important but disorganised — reorganise.
- **AW-15 Company docs.** Organise.
- **AW-16 My profile.** Rework, more organised.
- **AW-17 New areas?** Cam asks whether to add Expenses, Marketing, Leads, Advertising.

## Decisions (Cam 2026-10-21)

- **AW-1 /cam:** passkey as the second factor (authenticator app + recovery codes as backup; email codes off for the owner once a passkey exists); owner session 4 hours, risky actions re-confirmed with the passkey; an email on every sign-in; new devices approved from an emailed link; the owner's own cookie; /admin never mentions the owner and /cam is linked nowhere and not indexed. Built in three parts: AW-1a (/cam, devices, sessions, alerts), AW-1b (passkeys), AW-1c (step-up on risky actions, plus a device list to revoke one).
- **AW-3 navigation:** the LEFT RAIL, grouped by job — Today · Courses (Leads, Inquiries, Courses, Course groups, Messages) · Money (Revenue, Expenses, Marketing) · People (Employees, Golfer lookup) · System (Health, Company docs). Mockups: https://claude.ai/artifact/LymjV9nP8oEqeutpdb7eb7 (option A chosen).
- **Search on top of the rail (Cam: "I do like that search bar AI feature where I can find anything"):** typing a name, email, phone or id is an instant plain search across courses, inquiries, golfers, bookings, messages and admin pages; asking a question ("which courses had no bookings this week") goes to an AI answer that reads data through read-only tools and links to what it found — it never changes anything.
- **AW-4 Today (overview):** four sections only — Needs you now (each item with its one fix button), Platform health (red/green), Money this month vs the same point last month (volume through courses, GreenReserve fees, net after Stripe and expenses), Onboarding by stage with stuck courses flagged. No daily fee tile, no unread count, no ticker.
- **AW-5 AI checks:** hourly; a morning digest email plus an immediate alert for anything urgent (payments failing, site errors, a course stuck).
- **AW-17 new areas:** Expenses gets its own page (today a drawer in Revenue); Leads (courses being chased before they inquire, feeding Inquiries); Marketing & advertising (campaigns, spend, what each brought in).

Status (2026-10-21): AW-1a shipped (camsanchez33/green-reserve#161). AW-1b passkeys built (SimpleWebAuthn 13.3.x, pinned); AW-1c (step-up on risky actions + a device list) next, then AW-3/AW-4.
