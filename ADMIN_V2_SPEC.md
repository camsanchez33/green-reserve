# Admin Console v2 — Refinement Spec

Read CLAUDE.md first. This builds on the completed ADMIN_REBUILD_SPEC.md phases 1–7.
Work ONE PHASE at a time; babel-parse every touched file, commit, push, and stop after
each phase. Dark theme design system per CLAUDE.md throughout.

---

## Phase 0 — Bug fix + quick wins (small run, do first)

1. **BUG: broadcast banner shows on the operator login page.** The announcement banner
   must render ONLY inside authenticated operator dashboard pages — never on
   /dashboard/login, forgot-password, or any unauthenticated page. Move it into the
   authenticated dashboard layout/pages and confirm the login page is clean.
2. **Remove the golfer-accounts stat card** from the admin overview. Keep the API field
   (data still collected) but display it nowhere on the overview.
3. **Make the overview clickable.** Stat cards: courses → /admin/courses, bookings →
   /admin/activity, revenue → /admin/activity, pending inquiries → /admin/inquiries.
   Top-courses rows and recent-activity rows → that course's detail (drawer for now;
   Phase 1 replaces it with a page). Needs-attention rows → the relevant inquiry or
   course. Hover states must make clickability obvious.

## Phase 1 — Full course detail page (kill the drawer)

- New route `/admin/courses/[id]` — a full page, the admin's version of the course.
  Header: name, city/state, status badges (live/inactive, Stripe, operator verified),
  quick actions (View public page, Message course, Deactivate).
- Tabs:
  - **Overview** — 30d revenue/bookings/members stats with trends, alerts for this
    course (Stripe not connected, operator stuck, no schedule, zero bookings 14d).
  - **Transactions** — every booking + membership payment: golfer, amount, platform fee,
    status (paid / refunded / fee charged), searchable, date-filterable. This is the
    "if a course needs help, see exactly what's going on" view.
  - **Tee sheet** — existing admin tee-sheet view moved here.
  - **Schedule** — existing schedule editor moved here.
  - **Members** — tiers + member list, read-only.
  - **Staff** — operator + staff accounts, resend setup link.
  - **Messages** — placeholder tab until Phase 3, then the thread with this course.
- Courses list rows link here. Delete the old drawer once everything is reachable.

## Phase 2 — Inquiries kanban board

- Replace the Active/Past toggle and status-chip filters with a board: columns
  Pending → In Review → Sheet Sent → Sheet In → Building, plus a collapsed **Archive**
  column holding Rejected and Live (inquiries auto-archive when their course goes live).
- Cards: course name, contact, city/state, days-in-stage (red > 7), what they're looking
  for. Drag between columns updates status (PATCH existing endpoint). Search bar filters
  cards across all columns.
- Click a card → full-width detail panel: all submitted info, details-sheet responses
  (read-only), admin notes, action buttons (Request details, Build course →
  pre-filled wizard, Reject, Archive).
- Schedule editing does NOT belong on inquiries — remove any schedule-editing UI from
  the inquiry flow. Schedule setup happens in the add-course wizard or the course
  detail page. The inquiry shows submitted scheduling preferences read-only.

## Phase 3 — Two-way messages (admin ↔ course)

Schema:
```
model MessageThread {
  id        String    @id @default(cuid())
  courseId  String    @unique
  updatedAt DateTime  @updatedAt
  createdAt DateTime  @default(now())
  messages  Message[]
}
model Message {
  id         String   @id @default(cuid())
  threadId   String
  senderType String   // "admin" | "operator"
  senderId   String
  senderName String
  body       String
  readAt     DateTime?
  isBroadcast Boolean @default(false)
  createdAt  DateTime @default(now())
  thread     MessageThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
}
```
- **Admin side:** `/admin/messages` — thread list (course name, last message preview,
  unread badge, sorted by latest) + thread view with composer. "Message course" buttons
  (course detail, needs-attention, activity) deep-link to that thread.
- **Operator side:** new "Messages" item in OperatorSidebar → thread with GreenReserve
  admin; they can start messages too. Broadcasts appear in the thread flagged as
  announcements. Unread badge in the sidebar.
- Broadcasts (Phase 6 feature) now ALSO insert an isBroadcast message into every
  course's thread. Banner behavior unchanged except Phase 0's login-page fix.
- Email notification to the recipient side on new message (batched: max one
  notification email per thread per hour). Reuse baseTemplate.

## Phase 4 — Employees: roles + credential lifecycle

- Roles become: `owner`, `manager`, `support`, `viewer`.
  - owner: everything, only role that manages employees and sends broadcasts
  - manager: courses, inquiries, add-course, messages; no employees, no broadcasts
  - support: view everything, reply to messages; no create/edit/delete
  - viewer: read-only
  Enforce server-side in every /api/admin route (helper: `requireRole(session, [...])`),
  not just hidden buttons.
- Provisioning flow (owner only): create account with the employee's work email +
  system-generated temp password shown ONCE to the owner. Account is created with
  `mustChangePassword: true` — first login forces a password change before anything
  else loads.
- Self-serve: every employee can change their OWN password (current + new) from a small
  account menu. Owner can: reset anyone's password (new temp, forces change), change
  roles, deactivate/reactivate. Nobody else touches other people's credentials.
- Login records `lastLoginAt` (exists) — show it on the employees list.

## Phase 5 — Add-course wizard v2 (type-aware)

- Step 1 asks course type FIRST (Public / Municipal / Semi-private / Resort); later
  steps adapt:
  - **Public:** green fees weekday/weekend + twilight (optional), cart fee, walking
    allowed, season open/close months.
  - **Municipal:** same as public + resident rates (toggle prefilled ON, resident
    weekday/weekend fees), resident-verification note field.
  - **Semi-private:** public fees + "protect member times" advance-booking window,
    prompt to seed one starter membership tier (name + annual fee only, optional).
  - **Resort:** fees + guest-of-resort rate (optional), note field for packages.
- These map to existing Course/TeeTimeSchedule/MembershipTier fields where they exist;
  for anything without a field, collect it into the course's internal notes rather than
  inventing schema — flag in the completion screen what was stored as notes.
- Keep: auto-slug, operator step, inquiry pre-fill (pre-fill now also selects type from
  the inquiry's courseType).

---

## Ground rules

- One phase per run. `git status` must be clean after each push (watch for the known
  file-truncation/ghost-file issue — restore with `git checkout -- .` if it appears).
- Phases 3 and 4 touch the schema → `npx prisma migrate dev`, run attended.
- Every new API route: session/role check first line.
- CLAUDE.md gotchas: no `? [` opening a JSX line, no sed -i, check line counts after
  large writes.
