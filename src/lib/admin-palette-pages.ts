// The admin search palette's page rows (Build 2026-11-18): every page in the admin menu, under the menu's own label,
// plus Pipeline (the full old inquiry board). `keywords` are other words that find the row (the palette's old labels).
// Client-safe — no server imports — so the palette can drop a saved recent whose page moved, and the search route
// filters these by role tier and area. admin-nav-test pins: every menu page has a row, the same label, no wider role.
export type PalettePage = { id: string; label: string; href: string; always?: true; support?: true; manager?: true; owner?: true; keywords?: string[] };

export const PALETTE_PAGES: PalettePage[] = [
  { id: 'nav:overview',    label: 'Overview',      href: '/admin',            always: true, keywords: ['home'] },
  { id: 'nav:goals',       label: 'Goals',         href: '/admin/goals',      support: true },
  // Inquiries (the outreach page, in the menu since 2026-11-17); Pipeline stays the full old board.
  { id: 'nav:outreach',    label: 'Inquiries',     href: '/admin/inquiries',  always: true },
  { id: 'nav:inquiries',   label: 'Pipeline',      href: '/admin/inquiries/all',  always: true },
  { id: 'nav:onboarding',  label: 'Onboarding',    href: '/admin/onboarding', always: true },
  { id: 'nav:courses',     label: 'Golf courses',  href: '/admin/courses',    always: true, keywords: ['courses'] },
  { id: 'nav:bookings',    label: 'Bookings',      href: '/admin/bookings',   support: true },
  { id: 'nav:business',    label: 'Business analytics', href: '/admin/business', manager: true },
  // Owner-only pages: the names alone stay out of anyone else's palette, as the menu hides them.
  { id: 'nav:expenses',    label: 'Expenses',      href: '/admin/expenses',   owner: true },
  { id: 'nav:finance',     label: 'Financial analytics', href: '/admin/finance', owner: true },
  { id: 'nav:audit',       label: 'Audit',         href: '/admin/audit',      owner: true },
  { id: 'nav:security',    label: 'Security',      href: '/admin/security',   owner: true },
  { id: 'nav:company',     label: 'Company docs',  href: '/admin/company-documents', owner: true },
  { id: 'nav:support',     label: 'Course support', href: '/admin/support',   always: true },
  { id: 'nav:revenue',     label: 'Revenue',       href: '/admin/revenue',    support: true, keywords: ['money'] },
  { id: 'nav:golfers',     label: 'Golfers',       href: '/admin/golfers',    support: true },
  { id: 'nav:employees',   label: 'Team',          href: '/admin/employees',  manager: true },
  { id: 'nav:broadcasts',  label: 'Announcements', href: '/admin/announcements', support: true },
  { id: 'nav:system',      label: 'Platform activity', href: '/admin/system',     manager: true },
  { id: 'nav:profile',     label: 'Settings',      href: '/admin/profile',    always: true, keywords: ['my profile', 'profile', 'password'] },
];

/** The page row for a saved recent, only if the row still exists at the same address (a moved page drops out). */
export function currentPage(id: string, href: string): PalettePage | null {
  const p = PALETTE_PAGES.find(x => x.id === id);
  return p && p.href === href ? p : null;
}

/** Whether a typed query finds the row: its label or any keyword contains it. */
export const pageMatches = (p: PalettePage, lq: string) => p.label.toLowerCase().includes(lq) || (p.keywords ?? []).some(k => k.includes(lq));

/** Saved recents with page rows brought up to date: a page row is kept only while it exists at the same address,
 *  under today's label (a page that moved — Pipeline went to /admin/inquiries/all — or was renamed drops out or is
 *  relabelled). Other recents (courses, bookings, the "Bookings matching" row) are untouched. */
export function freshRecents<T extends { type: string; id: string; href: string; label: string }>(saved: T[]): T[] {
  return saved.flatMap(r => {
    if (r.type !== 'nav' || r.id === 'nav:bookings-q') return [r];
    const p = currentPage(r.id, r.href);
    return p ? [{ ...r, label: p.label }] : [];
  });
}
