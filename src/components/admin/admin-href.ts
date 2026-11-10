// Admin lane (2026-11-10): which admin pages a login can open, by role and
// area (AW-11) — the same gates the menu uses (AdminSidebar's allGroups;
// scripts/admin-problems-test.ts checks the two agree). Pages only use this to
// avoid offering a link that answers 403; the routes stay the control.
import { VIEWER_PLUS, SUPPORT_PLUS, MANAGER_PLUS, OWNER_ONLY } from '@/lib/admin-roles';
import type { AdminArea } from '@/lib/admin-areas';

type Gate = { roles: readonly string[]; area?: AdminArea };

/** Longest prefix first: /admin/courses/… and /admin/courses?… both mean Courses. */
export const ADMIN_PAGE_GATES: [string, Gate][] = [
  ['/admin/problems', { roles: SUPPORT_PLUS, area: 'problems' }],
  ['/admin/inquiries', { roles: VIEWER_PLUS, area: 'pipeline' }],
  ['/admin/courses', { roles: VIEWER_PLUS, area: 'courses' }],
  ['/admin/groups', { roles: SUPPORT_PLUS, area: 'courses' }],
  ['/admin/golfers', { roles: SUPPORT_PLUS, area: 'golfers' }],
  ['/admin/revenue', { roles: SUPPORT_PLUS, area: 'money' }],
  ['/admin/messages', { roles: SUPPORT_PLUS, area: 'messages' }],
  ['/admin/announcements', { roles: SUPPORT_PLUS, area: 'messages' }],
  ['/admin/goals', { roles: SUPPORT_PLUS, area: 'company' }],
  ['/admin/employees', { roles: MANAGER_PLUS, area: 'company' }],
  ['/admin/system', { roles: MANAGER_PLUS, area: 'company' }],
  ['/admin/audit', { roles: OWNER_ONLY }],
  ['/admin/security', { roles: OWNER_ONLY }],
  ['/admin/company-documents', { roles: OWNER_ONLY }],
];

function gateFor(href: string): Gate | null {
  const hit = ADMIN_PAGE_GATES.find(([p]) => href === p || href.startsWith(`${p}?`) || href.startsWith(`${p}/`) || href.startsWith(`${p}#`));
  return hit ? hit[1] : null;
}

/** True when this login can open the page; an href we don't know (Home, profile) is open to everyone. */
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
