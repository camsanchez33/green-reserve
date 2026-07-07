# GreenReserve Design System — "Clubhouse"

Read CLAUDE.md first. This REPLACES the June 2026 design system (dark dashboards, emerald-600,
neon-tinted badges). Everything becomes light. Three tiers: admin wears GreenReserve green,
operator dashboards wear quiet paper with the course's own accent, golfer-facing course pages
personalize further toward the course. Locked from approved mockups — do not improvise colors.

Run phases in order, one per session. Babel-parse every touched file, commit, push per phase.

---

## Tokens

### Type
- **Serif: Fraunces** (Google Fonts, via `next/font/google`, weights 400/500, `--font-serif`).
  Used for: wordmark, page titles, stat/display numbers, course names.
- **Sans: Inter** (weights 400/500, `--font-sans`). Everything else.
- Page title: serif 500, 22px, `tracking-tight`. Card eyebrow: sans 11px uppercase,
  `tracking-[0.06em]`, muted. Body: 13px. Secondary: 12px. Sidebar items: 12.5–13px.
- BANNED: `font-black`, `tracking-widest`, uppercase anywhere except card eyebrows.

### Palette (Tailwind config names)
```
paper        #F6F4EC   page background, all apps
card         #FFFFFF   section cards
ink          #1C1C18   primary text
ink-soft     #6E6D64   secondary text
ink-muted    #87867C   labels, captions
ink-faint    #98968B   tertiary/meta
line         #E6E3D7   card borders (1px)
line-soft    #F0EDE2   row dividers inside cards
line-strong  #D9D6C8   section rules
pine         #24513B   GreenReserve green — admin + public marketing only
pine-hover   #2E6349
ok           #3D6B4C   success/confirmed
bad          #A3452F   danger/cancelled
warn         #8A6116   warning/pending
dot-neutral  #B3B1A6   neutral status dot
```

### Rules
- Radius: 8px cards, 5px buttons/inputs. Nothing larger. `rounded-full` only for avatars
  and status dots.
- Cards: white bg, 1px `line` border, padding 16–20px. Sections separate by white-on-paper
  contrast, NOT heavy borders. Page bg is always `paper`.
- Buttons: primary = solid accent (pine in admin/public; course accent in operator
  dashboard), white text, 12.5px/500, px-4 py-2. Secondary = white bg, `line` border, ink
  text. Text links = accent color, with `→` where they navigate.
- **Status = 5px dot + plain colored text** (`ok`/`bad`/`warn`/`dot-neutral` +
  matching or muted text). BANNED: tinted-background pills, colored borders as decoration,
  the 7-color badge rainbow, gradients, `/10`-opacity color washes (single exception:
  active sidebar item tint), glows, emerald-600.
- Stats: grouped in ONE card, divided by vertical `line-soft` hairlines; label 11px muted,
  value serif 21–24px ink, delta 11px in `ok`/`bad`.
- Tables/lists: rows divided by `line-soft`, 10–11px vertical padding, `tabular-nums` on
  times and money, no zebra striping, no outer border when already inside a card.
- Icons stay lucide-react, 14–16px, default stroke.
- Dark mode is DEAD platform-wide. Remove `bg-gray-950/900` and all dark styling as each
  phase sweeps its area.

### Sidebars
- **Admin:** `pine` bg. Wordmark "GreenReserve" serif 15.5px in `paper` color. Items:
  inactive `#A9BFAF`, active `paper` text on `white/10` bg. No border radius on items.
- **Operator:** white bg, 1px `line` right border. Top: course name serif 14.5px ink +
  one 10.5px uppercase meta line (e.g. "EST. 1962 · SEMI-PRIVATE" from course data —
  omit gracefully if fields empty). Items: inactive `ink-soft`; active = course-accent
  text, 2px left border in accent, bg = accent at 8% opacity.

### Per-course accent
- Schema: `Course.brandColor String @default("#24513B")` (+ optional
  `Course.establishedYear Int?`). Migration required.
- Operator dashboard + golfer-facing course pages read it for: active nav, primary
  buttons, links, member-rate highlights. Validate contrast: if the stored color is too
  light for white button text (relative luminance > 0.5), darken for button use.
- Editable in: operator Settings, and admin course detail Settings tab.
- Course pages: course name in serif; hero photo when the course has one; footer reduces
  GreenReserve to "Powered by GreenReserve" one-liner.

---

## Phases

### Phase D1 — Foundation + admin sweep
1. Fonts via `next/font/google` in root layout; Tailwind config gets the palette + font
   families above; build shared UI in `src/components/ui/`: `Card`, `Eyebrow`,
   `StatGroup`, `StatusDot`, `PageHeader`, `Btn` (primary/secondary/link), `SidebarShell`
   (admin | operator variants, accent prop).
2. Sweep ALL `/admin` pages (overview, inquiries, courses + detail, create wizard,
   employees, messages/broadcasts, activity, login, set-password) to Clubhouse using the
   shared components. Layouts and functionality unchanged — this is a reskin.
3. Rewrite the "Design system" section of CLAUDE.md to this spec so every future build
   (including remaining ADMIN_V2 phases) comes out in Clubhouse style, not dark/emerald.
   Any "dark theme" instruction in ADMIN_V2_SPEC.md is superseded — note that in
   CLAUDE.md.

### Phase D2 — Operator dashboard sweep + course accent
1. `brandColor`/`establishedYear` migration; expose in operator Settings and admin course
   detail.
2. Sweep all `/dashboard` pages (incl. login, onboarding, 2fa) to Clubhouse with the
   operator sidebar identity block and accent mechanic.

### Phase D3 — Golfer-facing + public
1. Course page + booking flow + member portal + checkin + account: paper/Clubhouse base,
   personalized with course accent, serif course name, hero photo slot, "Powered by
   GreenReserve" footer.
2. Public marketing pages (home, /for-courses, /contact, privacy, terms) + email
   template accents: pine + paper editorial style. (If PUBLIC_SITE_SPEC hasn't run yet,
   run it BEFORE this phase and build it already in Clubhouse.)

---

## Ground rules
- One phase per run; `git status` after every run (known ghost-file issue — restore with
  `git checkout -- .` on Cam's machine if dirty with no real work).
- D2 touches schema → `npx prisma migrate dev`, run attended.
- Reskin only: zero behavioral changes, zero route changes, zero API changes except the
  brandColor plumbing in D2.
- CLAUDE.md gotchas apply (no `? [` JSX lines, no sed -i, check line counts after writes).
