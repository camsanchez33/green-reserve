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

## Phase 2b — Pipeline automation (kanban at scale)

Principle: stage = fact the system knows, not a card someone dragged. At 500 courses,
nobody files cards. Three transitions are ALREADY automatic (request-details →
`details_requested`; operator submits form → `details_submitted`; build-from-inquiry →
`building`). Complete the machine:

1. **pending → in_review**: automatic the first time any admin opens the inquiry's
   detail panel (record `reviewStartedAt DateTime?` + who).
2. **building → live**: automatic when the linked course (builtCourseId) is activated —
   hook every code path that sets `Course.active = true`. Record `wentLiveAt`.
3. **live / rejected → Archive column**: automatic (already the Phase 2 display rule —
   verify it needs zero manual action).
4. **Drag stays as manual override** — but log it: add `InquiryStatusEvent` model
   (inquiryId, fromStatus, toStatus, trigger: 'system' | 'admin', actorId?, createdAt).
   ALL transitions (auto + manual) write an event. Card detail shows the timeline.
5. **Needs-action ordering**: within each column, cards sort oldest-in-stage first.
   Column headers show count + oldest age. `details_submitted` is the "your move"
   column — give it a subtle highlighted header.
6. Schema change (reviewStartedAt, wentLiveAt, InquiryStatusEvent) → migrate, run
   attended.

## Phase 2c — Inquiries vertical pipeline + course archive (schema change, run attended)

### A. Inquiries layout v3 — unified list (replaces kanban columns)
ONE list of ALL inquiries in a single white card on paper. No stage sections, no columns.

- **Row**: course name, contact + title, city/state, what they're looking for, stage
  (StatusDot + plain label), days in current stage (red > 7), last-updated date.
- **Quick-filter chips above the list** (act as stage filters, show live counts):
  "Your move (n)" = details_submitted, "New (n)" = pending, "Waiting on them (n)" =
  details_requested, "In review (n)", "Building (n)", "Archived (n)" = rejected + live.
  Default view = everything except Archived.
- **Search**: course, contact, email, city. **Sort**: newest, oldest, course name,
  location, last updated, longest in stage. **Filters**: stage (the chips), submitted
  date range, updated-since.
- **Row click → detail panel**: stage shown prominently with a one-line plain-language
  explanation of what it means and what moves it forward, the Phase 2b event timeline,
  all submitted info + details-sheet answers, admin notes, and stage-appropriate actions
  (Request details / Resend sheet / Review sheet → Build course / Reject). Manual stage
  override is a dropdown here, logged as an admin InquiryStatusEvent.
- Each row also carries its ONE stage-appropriate action button inline (Open / Resend
  sheet / Review sheet → build) so common moves skip the panel.

### B. Course archive (replaces hard delete)
- Schema: `Course.archivedAt DateTime?`, `Course.archivedBy String?` → migrate.
- The admin "delete course" action becomes **Archive**: sets archivedAt, course
  disappears from the default admin list (new "Archived" filter shows them), public
  course page 404s, operator dashboard shows a "This course has been archived" notice,
  tee-time generation and all crons skip archived courses. Data (bookings, members,
  payments) is fully retained. **Restore** action un-archives.
- **Hard delete exists ONLY for already-archived courses**, behind a type-the-course-name
  confirmation. Fix the current cascade bug: enumerate EVERY model in
  prisma/schema.prisma that references courseId (the existing transaction misses some —
  e.g. TeeSet, CourseStaff, Blackout) and delete in FK-safe order.

### C. Cross-entity integrity
- Archiving a course: write an InquiryStatusEvent on its linked inquiry ("course
  archived"); inquiry stays in Archive.
- Hard-deleting a course: clear the inquiry's builtCourseId, revert its status to
  details_submitted with a logged event, so it re-enters the working pipeline honestly.
- Audit every admin page for dead links to archived/deleted courses (course detail 404s
  gracefully with a back link, not a crash).

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
