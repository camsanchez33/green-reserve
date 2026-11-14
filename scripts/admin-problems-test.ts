// Admin lane, Problems PR (2026-11-10): no "Go to it" a login can't open, the
// assign list only offers people who can open Problems, and a #id link opens
// its tab once. Run: npx tsx scripts/admin-problems-test.ts
import { readFileSync, readdirSync } from 'fs';
import { VIEWER_PLUS, SUPPORT_PLUS, MANAGER_PLUS, OWNER_ONLY } from '../src/lib/admin-roles';
import { ADMIN_PAGE_GATES, canOpenAdminHref, whoCanOpen } from '../src/components/admin/admin-href';

let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

// The gate table agrees with the menu (AdminSidebar's allGroups, the routes' mirror).
const rail = readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8');
const groups = rail.slice(rail.indexOf('const allGroups'), rail.indexOf('const canSee'));
const SETS: Record<string, string[]> = { VIEWER_PLUS, SUPPORT_PLUS, MANAGER_PLUS, OWNER_ONLY };
const nav = [...groups.matchAll(/\{ key: '\w+', label: '[^']+', href: '([^']+)'(?:, minRole: (\w+))?[^}]*?(?:area: '(\w+)')?\s*\}/g)]
  .map(m => ({ href: m[1], roles: m[2] ? SETS[m[2]] : null, area: m[3] ?? null })).filter(n => n.href !== '/admin');
check('the menu lists its pages', nav.length >= 12);
for (const n of nav) {
  const g = ADMIN_PAGE_GATES.find(([p]) => p === n.href)?.[1];
  check(`${n.href} has a gate`, !!g);
  if (!g) continue;
  check(`${n.href}: same roles as the menu`, JSON.stringify([...g.roles]) === JSON.stringify(n.roles ?? VIEWER_PLUS));
  check(`${n.href}: same area as the menu`, (g.area ?? null) === n.area);
}

// Who can open what.
check('support with Problems + Courses can open a course setup link', canOpenAdminHref('/admin/courses?courseId=x&tab=setup', 'support', ['problems', 'courses']));
check('…but not Money', !canOpenAdminHref('/admin/revenue?tab=uncollected', 'support', ['problems', 'courses']));
check('…nor Systems', !canOpenAdminHref('/admin/system', 'support', ['problems', 'courses', 'company']));
check('a manager with Company opens Systems', canOpenAdminHref('/admin/system', 'manager', ['company']));
check('Security is the owner’s only', !canOpenAdminHref('/admin/security', 'manager', ['company']) && canOpenAdminHref('/admin/security', 'owner', []));
check('a page with no gate (My profile) is open to all', canOpenAdminHref('/admin/profile', 'viewer', []));
check('a viewer with Courses opens the list but not a course’s page', canOpenAdminHref('/admin/courses', 'viewer', ['courses'])
  && !canOpenAdminHref('/admin/courses/x', 'viewer', ['courses']) && !canOpenAdminHref('/admin/courses?courseId=x&tab=setup', 'viewer', ['courses']));
for (const page of readdirSync('src/app/admin', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
  if (['login', 'forgot-password', 'set-password', 'profile'].includes(page)) continue;
  check(`/admin/${page} has a gate (no admin page fails open)`, ADMIN_PAGE_GATES.some(([p]) => p === `/admin/${page}`));
}
check('who-can-open words', whoCanOpen('/admin/security') === 'Owner only' && whoCanOpen('/admin/system') === 'Managers with Company access');

// The page and the route.
// Cam 2026-11-12 (with Course support): the list lives in Overview's Needs attention; /admin/problems redirects there.
const old = readFileSync('src/app/admin/problems/page.tsx', 'utf8');
const page = readFileSync('src/app/admin/page.tsx', 'utf8') + readFileSync('src/app/admin/ProblemRow.tsx', 'utf8');
const ov = readFileSync('src/app/api/admin/today/overview/route.ts', 'utf8');
const route = readFileSync('src/app/api/admin/problems/route.ts', 'utf8');
check('/admin/problems redirects to Overview', /redirect\('\/admin'\)/.test(old));
check('Overview lists problems only for the Problems area', /can\('problems'\) \? listProblems\(now\) : null/.test(ov));
check('each problem carries its course, age and detail', /problem: \{ course: p\.courseName, courseId: p\.courseId, openedAt: p\.openedAt, detail: p\.detail, goTo: p\.href \}/.test(ov));
check('Go to it only when the login can open it, else the course, else who can', /canOpenAdminHref\(p\.goTo, role, areas\)/.test(page) && /label: 'Open course'/.test(page) && /whoCanOpen\(p\.goTo\)/.test(page));
check('snoozed problems still show (snoozing is gone)', /\.\.\.\(problems\?\.snoozed \?\? \[\]\)/.test(ov));
check('the course is not printed twice when the title already names it', /!text\.includes\(p\.course\)/.test(page));
check('a problem opens in place (no page to go to)', /aria-expanded=\{open\}/.test(page) && !/href="\/admin\/problems"/.test(page));
check('the problems route is read-only (no PATCH: no take, assign, note or snooze)', !/export (async function|const) (PATCH|POST|PUT|DELETE)\b/.test(route) && /export async function GET/.test(route));
// The rail's count is the rows Needs attention lists: every problem not yet cleared, snoozed or not.
const lib = readFileSync('src/lib/problems.ts', 'utf8');
const countFn = lib.slice(lib.indexOf('export async function openProblemCount'));
check('openProblemCount counts open and snoozed alike', /kind: 'urgent', resolvedAt: null \}/.test(countFn) && !/snoozedUntil/.test(countFn));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
