# Homepage lane — the public site

Read this, CLAUDE.md and `HOMEPAGE_SPEC.md` §0. Reactive only: a job when the real product changes and the homepage
must match. Homepage copy has no durations and no contract terms; fee sentences only from `legal/LQ-2_FEE_COPY.md`.

## Open jobs (from the dashboard changes of 2026-11-12/14)
1. `TeeSheetDemo.tsx` / `home.module.css`: each group's `.seat` gets the 3px money-colour left edge (mirror of the
   real tee sheet), and the demo rail lists Support after Settings instead of Messages under Today.
2. `src/app/contact/page.tsx:48`: "message us from Messages in your dashboard" → Support.

## Homepage redo — APPROVED (Cam 2026-11-18, "make sure all the individual pages are made ... then you can start merging it")
Mockup `lanes/homepage/homepage-mockup.html` (https://claude.ai/artifact/YKv35xFG84XjdF136Y2oPp) is the spec. Hero A (photo) only, tightened, with a down arrow; no top-bar buttons.
- Home = overview: "What GreenReserve does" — seven features in three groups, each one line + "Learn more" to its own page; one compact "Free for your course" block (no fee list on Home); bottom block = Cal.com inline booking calendar ("Book a call", Cam's existing event type) + "Contact us" button opening the question form as a pop-up (lands in admin inquiries).
- Seven feature pages, same template (title, one-line summary, 3–5 sections with real product screenshots, shared bottom block). Fee wording only from LQ-2 (Payments page carries the fee list, all three fees once Agreement v2026-12 is in effect).
- Footer: logo, Privacy, Terms, Contact, "© 2026 GreenReserve. All rights reserved." No Course login link (courses use their bookmark / onboarding link).
- Screenshots: real captures of the current app; retake after the UI styles work merges.
