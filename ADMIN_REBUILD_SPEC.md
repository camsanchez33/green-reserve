# Admin Console Rebuild — Spec

Read CLAUDE.md first. Work ONE PHASE at a time; validate every touched file with the
@babel/parser check, commit, and push before starting the next phase. Do not combine phases.

Current state: `src/app/admin/page.tsx` is a single 1,369-line file with 4 tabs
(overview / inquiries / courses / create), authenticated by typing ADMIN_SECRET which is
sent as an `x-admin-key` header to every `/api/admin/*` route.

Target: a multi-page admin console at `/admin/*` with real employee accounts, deeper data,
search/filter everywhere, a guided add-course flow, operator broadcasts, and a cross-course
activity feed. Dark theme per CLAUDE.md design system (`bg-gray-950`/`bg-gray-900`,
emerald-600 accent, rounded-md buttons / rounded-lg cards, lucide icons, no emojis).

---

## Phase 1 — Admin accounts & login (foundation, do first)

Schema — new model:
```
model AdminUser {
  id           String    @id @default(cuid())
  email        String    @unique
  name         String
  passwordHash String
  role         String    @default("staff")   // "owner" | "staff"
  active       Boolean   @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
}
```

- `/admin/login` page: email + password. On success set httpOnly JWT cookie `admin_session`
  (12h expiry). Use jose like `src/lib/session.ts` but a distinct session type — do NOT
  reuse operator/golfer/member sessions. bcrypt for password hashing.
- New helper `src/lib/admin-session.ts`: `resolveAdminSession()` returning
  `{ adminId, role }` or null.
- Replace the `x-admin-key` check in EVERY `/api/admin/*` route with `resolveAdminSession()`.
  Keep ADMIN_SECRET as a bootstrap-only path: a one-time `/api/admin/bootstrap` route that
  creates the first owner account if zero AdminUsers exist (requires ADMIN_SECRET header).
- `/admin` when unauthenticated redirects to `/admin/login`.
- Employees page `/admin/employees`: list admins (name, email, role, active, last login),
  create employee (name + email → email them a set-password link, 24h token), deactivate /
  reactivate, change role. Only role `owner` can manage employees; `staff` sees the list
  read-only. Set-password page at `/admin/set-password?token=...`.
- Remove the type-the-key login screen from the admin UI.

## Phase 2 — Split into pages + richer Overview

- Break `src/app/admin/page.tsx` into routes sharing an `AdminSidebar` component
  (pattern: `OperatorSidebar`):
  `/admin` (overview), `/admin/inquiries`, `/admin/courses`, `/admin/create`,
  `/admin/employees`, `/admin/broadcasts`, `/admin/activity`.
  Keep each file well under 1,000 lines. Preserve all existing functionality while moving it.
- Overview additions (extend `/api/admin/stats`):
  - Stat cards with trend vs the prior 30 days: platform revenue, bookings, new golfers,
    new courses.
  - Revenue-by-day chart (exists) + bookings-by-day chart.
  - Top 5 courses by bookings (last 30d) with revenue, linking to course detail.
  - Attention list: inquiries pending > 7 days, live courses with Stripe not connected,
    operators stuck mid-onboarding (onboardingStep incomplete > 7 days).
  - Recent activity strip: latest 10 bookings and latest 5 inquiries.

## Phase 3 — Inquiries: search, filter, depth

- Search bar: matches course name, contact name, email, city (client-side is fine at
  current volume).
- The pipeline status bar becomes clickable filters (multi-select chips); keep Active/Past
  toggle; sort by newest / oldest / longest-in-stage.
- Each row shows: course, contact + title, city/state, status badge, days in current stage
  (highlight red when > 7 days), and what they're looking for.
- Keep the existing detail drawer and all existing actions (approve, reject, request
  details, notes) exactly as they behave today.

## Phase 4 — Courses: search, filter, sort, proper info

- Extend `/api/admin/courses` to include per-course: bookings last 30d, platform revenue
  last 30d, active member count.
- Search: name, slug, city, state, operator email.
- Filters: active/inactive, Stripe connected / not, featured, course type.
- Sort: name, newest, bookings 30d, revenue 30d.
- Rows show those numbers plus operator email-verified and Stripe badges.
- Keep the existing course detail drawer (tee sheet, setup, contact) — reachable from
  the list as today.

## Phase 5 — Add-course wizard

Replace the `create` tab with a stepper (pattern already used in
`src/app/dashboard/members/page.tsx` tier wizard):
1. Basics — name, auto-slug (editable, uniqueness-checked live), city/state/zip, type.
2. Operator — name + email; creates CourseOperator and emails the setup/invite link on
   completion (reuse existing verify-operator / setup-link machinery).
3. Review — everything on one card → Create.
Complete screen: links to the new course's admin detail, the operator setup link
(copy button), and "email setup link to operator" confirmation.

Efficiency win: an "Build course from this inquiry" button in the inquiry drawer that
opens this wizard pre-filled from the CourseInquiry (name, address, city, state, zip,
website, contact → operator fields) and sets `builtCourseId` on the inquiry when created.

## Phase 6 — Broadcasts (message every course)

Schema — new models:
```
model Announcement {
  id        String   @id @default(cuid())
  title     String
  body      String   // plain text w/ line breaks
  emailSent Boolean  @default(false)
  sentById  String
  createdAt DateTime @default(now())
  dismissals AnnouncementDismissal[]
}
model AnnouncementDismissal {
  id             String   @id @default(cuid())
  announcementId String
  operatorId     String
  createdAt      DateTime @default(now())
  announcement   Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  @@unique([announcementId, operatorId])
}
```

- `/admin/broadcasts`: compose (title, body, "also send as email" toggle) + history of
  past broadcasts with sent-by and date.
- Email path: Resend `baseTemplate` in `src/lib/email.ts`, sent to every active
  CourseOperator. Send sequentially/batched to respect rate limits.
- Operator side: dashboard shows a banner (top of every dashboard page, amber accent) for
  the latest announcement the operator has not dismissed; dismiss button records an
  AnnouncementDismissal. API: `GET /api/operator/announcements`,
  `POST /api/operator/announcements/dismiss`.

## Phase 7 — Activity (all-courses view)

- `/admin/activity`: cross-course feed of recent bookings (course, golfer, players,
  amount, tee time, booked-at), cancellations with fees, new memberships, membership
  payments. Filter by course (dropdown) and date range; paginate 50 at a time.
- Outings/tournaments: no models exist yet — the dashboard pages are placeholders. When
  those features are built they surface here. Do NOT invent models for them in this phase.

---

## Ground rules for every phase

- Validate each touched `.tsx`/`.ts` with the @babel/parser check from CLAUDE.md before
  committing (SWC parse errors are the only build failures).
- `npx prisma migrate dev` for schema phases (1 and 6); confirm generated client compiles.
- Never log or email passwords; set-password tokens single-use, 24h expiry.
- All new API routes: session check first line, 401 on failure.
- Watch CLAUDE.md gotchas: no `? [` starting a JSX line, avoid sed -i, verify no file
  truncation (check line counts after large writes).
