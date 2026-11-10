// Admin lane, Problems PR (2026-11-10): no "Go to it" a login can't open, the
// assign list only offers people who can open Problems, and a #id link opens
// its tab once. Run: npx tsx scripts/admin-problems-test.ts
import { readFileSync } from 'fs';
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
check('an unknown admin page is open to all', canOpenAdminHref('/admin/profile', 'viewer', []));
check('who-can-open words', whoCanOpen('/admin/security') === 'Owner only' && whoCanOpen('/admin/system') === 'Managers with Company access');

// The page and the route.
const page = readFileSync('src/app/admin/problems/page.tsx', 'utf8');
const route = readFileSync('src/app/api/admin/problems/route.ts', 'utf8');
check('Go to it only when the login can open it, else the course, else who can', /canOpenAdminHref\(p\.href, role, areas\)/.test(page) && /label: 'Open course'/.test(page) && /whoCanOpen\(p\.href\)/.test(page));
check('a #id link opens its tab once, not after every reload', /if \(!data \|\| !hash \|\| hashDone\) return;\s*setHashDone\(true\)/.test(page));
check('the course name is linked inside the title, not printed twice', /<TitleWithCourse p=\{p\} \/>/.test(page) && !/\{p\.courseName && p\.courseId && <>/.test(page));
check('assign offers only people who can open Problems', /const CAN_WORK = \{ active: true, role: \{ in: SUPPORT_PLUS \}, OR: \[\{ role: 'owner' \}, \{ areasSetAt: null \}, \{ areas: \{ has: 'problems' \} \}\] \}/.test(route)
  && /findMany\(\{ where: CAN_WORK/.test(route) && /findFirst\(\{ where: \{ \.\.\.CAN_WORK, id: body\.adminId \}/.test(route));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
