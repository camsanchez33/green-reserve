// Admin lane (2026-11-10): which admin pages a login can open, by role and
// area (AW-11) — the same gates the menu uses (AdminSidebar's allGroups;
// scripts/admin-problems-test.ts checks the two agree). Pages only use this to
// avoid offering a link that answers 403; the routes stay the control.
import { VIEWER_PLUS, SUPPORT_PLUS, MANAGER_PLUS, OWNER_ONLY } from '@/lib/admin-roles';
import type { AdminArea } from '@/lib/admin-areas';

type Gate = { roles: readonly string[]; area?: AdminArea };

/**
 * First match wins. A key ending in "/" or "=" matches as a prefix; any other
 * key matches itself or itself followed by ?, / or #. A course's own page (and
 * the old ?courseId= link that redirects to it) is support+, though the list is
 * viewer+ (course-detail/route.ts).
 */
export const ADMIN_PAGE_GATES: [string, Gate][] = [
  ['/admin/courses/', { roles: SUPPORT_PLUS, area: 'courses' }],
  ['/admin/courses?courseId=', { roles: SUPPORT_PLUS, area: 'courses' }],
  ['/admin/problems', { roles: SUPPORT_PLUS, area: 'problems' }],
  ['/admin/inquiries', { roles: VIEWER_PLUS, area: 'pipeline' }],
  ['/admin/courses', { roles: VIEWER_PLUS, area: 'courses' }],
  ['/admin/groups', { roles: SUPPORT_PLUS, area: 'courses' }],
  ['/admin/golfers', { roles: SUPPORT_PLUS, area: 'golfers' }],
  ['/admin/revenue', { roles: SUPPORT_PLUS, area: 'money' }],
  ['/admin/bookings', { roles: SUPPORT_PLUS, area: 'money' }],
  ['/admin/messages', { roles: SUPPORT_PLUS, area: 'messages' }],
  ['/admin/announcements', { roles: SUPPORT_PLUS, area: 'messages' }],
  ['/admin/broadcasts', { roles: SUPPORT_PLUS, area: 'messages' }],
  ['/admin/create', { roles: MANAGER_PLUS, area: 'pipeline' }],
  ['/admin/activity', { roles: OWNER_ONLY }],
  ['/admin/goals', { roles: SUPPORT_PLUS, area: 'company' }],
  ['/admin/employees', { roles: MANAGER_PLUS, area: 'company' }],
  ['/admin/system', { roles: MANAGER_PLUS, area: 'company' }],
  ['/admin/audit', { roles: OWNER_ONLY }],
  ['/admin/security', { roles: OWNER_ONLY }],
  ['/admin/company-documents', { roles: OWNER_ONLY }],
];

function gateFor(href: string): Gate | null {
  const hit = ADMIN_PAGE_GATES.find(([p]) => /[/=]$/.test(p) ? href.startsWith(p)
    : href === p || href.startsWith(`${p}?`) || href.startsWith(`${p}/`) || href.startsWith(`${p}#`));
  return hit ? hit[1] : null;
}

/** True when this login can open the page. Pages open to every login (Home, My profile) have no entry. */
export function canOpenAdminHref(href: string, role: string, areas: readonly string[]): boolean {
  const g = gateFor(href);
  if (!g) return true;
  return g.roles.includes(role) && (!g.area || areas.includes(g.area));
}

/** Who can open it, in a few words, for a login that can't. */
export function whoCanOpen(href: string): string {
  const g = gateFor(href);
  if (!g) return '';
  if (g.roles === OWNER_ONLY) return 'Owner only';
  const role = g.roles === MANAGER_PLUS ? 'Managers' : g.roles === SUPPORT_PLUS ? 'Support and up' : '';
  const area = g.area ? `${g.area[0].toUpperCase()}${g.area.slice(1)} access` : '';
  return [role, area].filter(Boolean).join(' with ');
}
