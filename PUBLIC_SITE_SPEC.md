# Public Site Rework — White-Label Focus

Read CLAUDE.md first. Positioning decision: GreenReserve is currently a white-label tee
sheet sold to course operators. The public site speaks ONLY to operators. The golfer
marketplace (course discovery/browse) is deferred until course volume justifies it.
Individual course booking pages stay fully live — golfers reach them via links the course
shares, and via the member portal.

Run as ONE session, but commit in the two phases below. Validate every touched file with
the @babel/parser check from CLAUDE.md before each commit. Do not run this while another
agent/session is working in this repo.

---

## Phase A — Structure & content

1. **Retire the /courses directory (not course pages).**
   - `/courses` (exact path) → permanent redirect to `/` via `next.config.ts` redirects.
   - `/courses/[slug]` and everything under it must keep working exactly as today —
     verify the redirect does NOT catch subpaths.
   - Remove every link to the directory from nav/footer/homepage if any exist.
   - Delete `src/app/courses/page.tsx` (the directory page only).

2. **Unify the footer.** The live /for-courses page shows an outdated footer ($1 fee,
   hello@greenreserve.com, links to /about /contact /how-it-works, "discovery layer"
   tagline). Current source may already be correct — the deploy is serving a stale build
   of that page. Ensure there is exactly ONE `Footer` component used by every public page
   with: $1.50/player copy, hello@greenreserve.app, links = List Your Course, Operator
   Login, Contact, Privacy, Terms. Nothing else. If /for-courses has its own inline
   footer or layout, remove it and use the shared component so the stale version is
   replaced on deploy.

3. **/contact page.** Simple, light-theme, matches design system: heading, one paragraph
   (we respond within 1 business day), hello@greenreserve.app as a mailto, and a button
   to /for-courses. No form.

4. **Interest form: all 50 US states** in the state dropdown (alphabetical, keep NJ
   default-none). Everything else about the form stays.

5. **Homepage additions (keep existing sections and copy; insert these):**
   - **Product proof section** after "How It Works": a "See the tee sheet" section
     displaying dashboard screenshots inside simple browser-chrome frames (dark frame,
     rounded-lg, subtle border). Load images from `/public/screenshots/dashboard-1.png`,
     `dashboard-2.png`, `dashboard-3.png` with captions (Tee sheet · Live bookings ·
     Pricing & schedule control). If a file is missing, the frame renders a tasteful
     "screenshot coming soon" placeholder — the section must not look broken. (Cam will
     capture and drop in real screenshots.)
   - **Video slot** in the same section: a 16:9 placeholder card ("2-minute walkthrough —
     coming soon") behind a `SHOW_VIDEO` const set to false, with a commented YouTube
     embed ready to flip on.
   - **Comparison section** near Pricing: "GreenReserve vs. typical booking platforms" —
     two-column card. Typical platforms: commission on green fees, barter tee times they
     resell, monthly software fees, they own the golfer relationship. GreenReserve: $0/mo,
     no commission, no barter times, direct Stripe payouts, your golfer data is yours.
     Factual tone, no competitor named.

## Phase B — Metadata & SEO hygiene

1. Per-page `metadata` exports (title + description) for: home, /for-courses, /contact,
   /privacy, /terms. Pattern: "List Your Course — GreenReserve" etc.
2. Course pages: add `generateMetadata` so `/courses/[slug]` renders
   "{Course Name} — Book Tee Times" + course city/state in description. The page is a
   client component; wrap it in a thin server component that fetches name/city for
   metadata and renders the client page. Do not restructure the booking logic.
3. Redirected /courses directory: nothing needed (redirects drop out of the index).
4. `robots.txt` (via `src/app/robots.ts`): allow all, but disallow `/admin`, `/dashboard`,
   `/checkin`, `/api`.

---

## Ground rules

- CLAUDE.md gotchas apply: no `? [` opening a JSX line, no sed -i, verify line counts
  after large writes (truncation), babel-parse every touched file.
- Do not touch: booking flow, member portal, dashboard, admin, any API routes except none
  are needed.
- Light theme for all public pages per design system; max rounded-lg; no emojis.

---

## Phase C — Lead form integrity (from Cam's audit, 2026-07-09; no migration)

Verified findings only. The lead form is the top of the entire business funnel —
an unreachable lead is a lost course.

1. **Email validation, server AND client (CRITICAL).**
   - /api/inquiries: validate email format server-side (sane regex: something@
     something.tld, trim/lowercase already happens). Invalid → 400 with
     `{ error: 'invalid_email' }`. Apply the same to /api/inquiries/details
     if it accepts an email.
   - Client: validate on blur + on submit; inline error under the field.
   - Add a hidden honeypot field ignored by humans; if filled, return 200 but
     drop the submission (bot trap — do NOT reveal rejection).
2. **Inline validation errors on the lead form.** Errors currently appear only
   as a banner above Submit at the bottom of a long form. Per-field red border
   + message at the field, auto-scroll to the first invalid field on submit.
   (Same pattern A0 adds to the admin wizard — reuse the approach.)
3. **Entry points route through segmentation.** The top-nav "List Your Course"
   should land users in the same type-aware experience as the homepage cards
   (course type question first or preselected via ?type=). Audit every CTA
   linking to /for-courses.
4. **Brand line consistency.** Page titles/taglines differ between homepage and
   login pages (login drops "Free"). One canonical brand line in a shared
   constant; apply to all page metadata.
5. **Login form autofill hygiene.** Add proper autoComplete attributes
   (email / current-password) to golfer, operator, and admin login forms so
   browser autofill behaves predictably.

NOT in scope (Cam decisions, flag don't build): public phone number on
/contact; Sentry alert-watching is a manual setup step (Sentry → Alerts) noted
in RUNBOOK.

---

## Phase D — Proof layer + operator legal (from marketing audit 2026-07-09; no migration)

Decisions recorded: NO phone number for now. Social proof = founding-courses
angle. Legal entity name: Cam supplies the exact LLC name — spec uses
{{COMPANY_LEGAL_NAME}}; if not provided at run time, leave the placeholder
visibly marked TODO and flag in RUN_QUEUE.md.

1. **Screenshot resilience.** The three /screenshots/dashboard-*.png 404 and
   render as broken tan boxes. (a) Component-level fallback: if an image
   fails/missing, render a styled Clubhouse card with the caption text and a
   subtle icon — never a broken box, on ANY marketing image. (b) Cam's manual
   to-do (not code): capture the three real screenshots from the live admin/
   dashboard and drop them in public/screenshots/ — the section springs to
   life with no code change.
2. **Founding-courses section (replaces the social-proof void).** Honest
   scarcity block on the homepage after How It Works: "We're onboarding our
   founding group of courses" — early courses get white-glove setup and free
   forever; direct CTA into /for-courses. No fake counts, no fake logos, no
   invented testimonials.
3. **Comparison table de-FUD.** Remove unverifiable claims about unnamed
   competitors ("resells your tee times", "revenue split with the vendor").
   Reframe rows as OUR commitments: "Your tee times are never resold",
   "0% commission — you keep 100% of green fees", "No contract — leave
   anytime". Same table shape, claims we can stand behind.
4. **Private-club variant gets tailored reassurance.** On /for-courses?type=
   private, a short block above the form: members-only booking mode exists
   (no public tee times unless enabled), member data stays per-club and is
   never shared or marketed to, member sign-in is private to the club.
5. **Operator-facing legal.** Add "For Course Operators" sections to BOTH
   /terms and /privacy: what we collect from courses at onboarding, course
   data ownership (their booking history is theirs; export on request),
   what happens on termination (courses can leave anytime; page comes down,
   data exported then deleted on request), Stripe Connect relationship
   (funds flow course-ward, GreenReserve never holds green-fee funds),
   liability limitation basics, and {{COMPANY_LEGAL_NAME}} + state of
   formation in both docs. Bump "Last updated". NOTE for Cam, keep in the
   page footer of these docs as an HTML comment only: drafted by AI, needs
   attorney review before scale.
6. **"Good fit" copy softening.** How It Works step 1: replace "If it's a
   good fit" with plain criteria ("As long as you run a real golf course,
   you're in — we review to prevent spam, not to reject courses.").

Ground rules: Clubhouse system, no schema changes, validate parses, update
RUN_QUEUE.md.
