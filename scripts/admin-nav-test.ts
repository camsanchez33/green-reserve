// AW-3 (Cam 2026-10-21): the admin rail is the map of the company, so it must
// never offer a role a door its API refuses (MP-2c), and search must label
// every result type it returns. Reads the sources. Run: npx tsx scripts/admin-nav-test.ts
import { readFileSync } from 'fs';
import { VIEWER_PLUS, SUPPORT_PLUS, MANAGER_PLUS, OWNER_ONLY } from '../src/lib/admin-roles';
import { PALETTE_PAGES, pageMatches, freshRecents } from '../src/lib/admin-palette-pages';

let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

const rail = readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8');
const groups = rail.slice(rail.indexOf('const allGroups'), rail.indexOf('const canSee'));
const ROLE_SETS: Record<string, string[]> = { VIEWER_PLUS, SUPPORT_PLUS, MANAGER_PLUS, OWNER_ONLY };
const items = [...groups.matchAll(/\{ key: '(\w+)',[^}]*?href: '([^']+)'(?:,\s*minRole: (\w+))?/g)].map(m => ({ key: m[1], href: m[2], roles: m[3] ? ROLE_SETS[m[3]] : null }));
check('the rail lists its items', items.length >= 10);

// Course groups is parked (Cam 2026-11-18): off the rail and out of the search palette; /admin/groups still works.
const search = readFileSync('src/app/api/admin/search/route.ts', 'utf8');
const pages = readFileSync('src/lib/admin-palette-pages.ts', 'utf8'); // the palette's page rows (lib/admin-palette-pages)
check('Course groups is not on the rail', !items.some(i => i.key === 'groups' || i.href === '/admin/groups'));
// Every page in the menu is also in the search palette (Build 2026-11-18), shown to no wider a role set than the menu.
{
  const nav = [...pages.matchAll(/\{ id: 'nav:[^']+',\s*label: '([^']*)',\s*href: '([^']+)',\s*(always|support|manager|owner): true/g)].map(m => ({ label: m[1], href: m[2], tier: m[3] }));
  const TIER: Record<string, string[]> = { always: SUPPORT_PLUS, support: SUPPORT_PLUS, manager: MANAGER_PLUS, owner: OWNER_ONLY }; // the route itself is support+
  const absent = items.filter(i => !nav.some(n => n.href === i.href)).map(i => i.href);
  // Same words as the menu (Build 2026-11-18): every menu item, including Settings (written label-first in the rail).
  const railLabels = [...groups.matchAll(/\{ (?:key: '\w+', label: '([^']+)'|label: '([^']+)', key: '\w+'), href: '([^']+)'/g)].map(m => ({ label: m[1] ?? m[2], href: m[3] }));
  const offLabel = railLabels.filter(r => { const n = nav.find(x => x.href === r.href); return !n || n.label !== r.label; }).map(r => `${r.href} (menu "${r.label}", palette "${nav.find(x => x.href === r.href)?.label ?? 'none'}")`);
  check('…under exactly the menu\'s label', railLabels.length >= items.length && offLabel.length === 0);
  if (offLabel.length) console.log('      label:', offLabel.join('; '));
  check('every menu page has a search-palette row', absent.length === 0 && nav.length >= items.length - 1);
  if (absent.length) console.log('      missing:', absent.join(', '));
  const wider = items.flatMap(i => { const n = nav.find(x => x.href === i.href); if (!n || !i.roles) return []; const extra = TIER[n.tier].filter(r => !i.roles!.includes(r)); return extra.length ? [`${i.href} (${extra.join(', ')})`] : []; });
  check('…and the palette never shows a page name to a role the menu hides it from', wider.length === 0);
  // What the tier check stands on: the route is support+ (so `always` = support+), and the owner tier is filtered.
  check('…the search route refuses below support', /if \(!requireRole\(session, SUPPORT_PLUS\)\) return NextResponse\.json\(\{ error: 'Forbidden' \}, \{ status: 403 \}\)/.test(search));
  check('…owner rows show only to the owner', search.includes('const isOwner = requireRole(session, OWNER_ONLY);') && search.includes('if (n.owner && isOwner) return true;'));
  // Each row is area-filtered exactly as the menu item is (AW-11).
  const railArea = new Map([...groups.matchAll(/href: '([^']+)'[^}]*?area: '(\w+)'/g)].map(m => [m[1], m[2]]));
  const areaBlock = search.slice(search.indexOf('const NAV_AREA'), search.indexOf('const TYPE_AREA'));
  const navArea = new Map([...areaBlock.matchAll(/'(\/admin[^']*)': '(\w+)'/g)].map(m => [m[1], m[2]]));
  const areaOff = [...railArea].filter(([h, a]) => navArea.get(h) !== a).map(([h, a]) => `${h} (menu ${a}, palette ${navArea.get(h) ?? 'none'})`);
  check('…and each palette row is area-filtered as its menu item is', railArea.size >= 8 && areaOff.length === 0);
  if (areaOff.length) console.log('      area:', areaOff.join('; '));
  if (wider.length) console.log('      wider:', wider.join('; '));
}
// The palette's old words still find the renamed rows, and saved recents follow the pages (Build 2026-11-18).
{
  const find = (q: string) => PALETTE_PAGES.filter(p => pageMatches(p, q)).map(p => p.label);
  check('"revenue" and the old "money" both find Revenue', find('revenue').includes('Revenue') && find('money').includes('Revenue'));
  check('…"home" finds Overview, "courses" Golf courses, "profile" Settings', find('home').includes('Overview') && find('courses').includes('Golf courses') && find('profile').includes('Settings'));
  const saved = [
    { type: 'nav', id: 'nav:inquiries', label: 'Pipeline', href: '/admin/inquiries' },        // from before #466: Pipeline moved
    { type: 'nav', id: 'nav:revenue', label: 'Money', href: '/admin/revenue' },              // renamed
    { type: 'nav', id: 'nav:groups', label: 'Course groups', href: '/admin/groups' },        // parked, no row now
    { type: 'nav', id: 'nav:bookings-q', label: 'Bookings matching "x"', href: '/admin/bookings?q=x' },
    { type: 'course', id: 'course:c1', label: 'Pine Hollow', href: '/admin/courses/c1' },
  ];
  const fresh = freshRecents(saved);
  check('a saved Pipeline recent from before it moved is dropped (it would open the outreach page)', !fresh.some(r => r.id === 'nav:inquiries'));
  check('…a renamed page keeps its recent under today\'s label', fresh.find(r => r.id === 'nav:revenue')?.label === 'Revenue');
  check('…a page with no row any more drops out', !fresh.some(r => r.id === 'nav:groups'));
  check('…and other recents are untouched', fresh.some(r => r.id === 'nav:bookings-q') && fresh.some(r => r.id === 'course:c1') && fresh.length === 3);
  check('…a garbled entry in storage is skipped, not fatal', freshRecents([null, ...saved] as unknown as typeof saved).length === 3);
  // The wiring: the route filters these rows, and the palette cleans recents with them.
  check('the search route serves PALETTE_PAGES and the palette cleans recents with freshRecents', search.includes('PALETTE_PAGES.filter(') && readFileSync('src/components/admin/CommandPalette.tsx', 'utf8').includes('freshRecents('));
}
check('…nor in the search palette (no page row, no group results)', !pages.includes("'nav:groups'") && !pages.includes('/admin/groups') && !search.includes('courseGroup.findMany'));

// The gate of the API behind each page (the page's own data route).
const GATE: Record<string, string[] | null> = {
  // messages: the Messages page is off the rail (Course support replaces it, Cam 2026-11-12); its page and API keep support+.
  overview: null, inquiries: VIEWER_PLUS, courses: VIEWER_PLUS, support: SUPPORT_PLUS, announcements: SUPPORT_PLUS,
  revenue: SUPPORT_PLUS, expenses: OWNER_ONLY, finance: OWNER_ONLY, business: MANAGER_PLUS, goals: SUPPORT_PLUS, employees: MANAGER_PLUS, system: MANAGER_PLUS, bookings: SUPPORT_PLUS,
  // Golfers is back on the rail (Cam 2026-11-17, approved mockup): /api/admin/golfers is support+. Inquiries
  // (outreach) reads /api/admin/inquiries and /api/admin/outreach, both viewer+.
  golfers: SUPPORT_PLUS, outreach: VIEWER_PLUS,
  company: OWNER_ONLY, audit: OWNER_ONLY, security: OWNER_ONLY,
  // groups: parked (Cam 2026-11-18) — off the rail; /admin/groups and its API keep support+.
  // problems: off the rail (Cam 2026-11-12) — the list is Overview's Needs attention; /admin/problems redirects there.
};
for (const it of items) {
  const gate = GATE[it.key];
  check(`${it.key} has a known gate`, gate !== undefined);
  if (gate === undefined) continue;
  const shownTo = it.roles ?? VIEWER_PLUS;
  const extra = shownTo.filter(r => gate !== null && !gate.includes(r));
  check(`${it.key} (${it.href}) is shown only to roles its API lets in${extra.length ? ` — not ${extra.join(', ')}` : ''}`, extra.length === 0);
}
check('every gated page is in the rail', Object.keys(GATE).every(k => items.some(i => i.key === k)));
// ADMIN-C (Cam 2026-10-22): one outline icon per section, inline and decorative — never a lucide import here.
check('rail icons are inline and hidden from screen readers (ADMIN-C)', !/from 'lucide-react'/.test(rail) && /aria-hidden="true"/.test(rail));

const route = readFileSync('src/app/api/admin/search/route.ts', 'utf8');
const palette = readFileSync('src/components/admin/CommandPalette.tsx', 'utf8');
const routeTypes = new Set([...route.matchAll(/\| \{ type: '(\w+)'/g)].map(m => m[1]));
const labelBlock = palette.slice(palette.indexOf('const TYPE_LABEL'), palette.indexOf('};', palette.indexOf('const TYPE_LABEL')));
const labelled = new Set([...labelBlock.matchAll(/^\s*(\w+):/gm)].map(m => m[1]));
check('search returns several result types', routeTypes.size >= 8);
for (const t of routeTypes) check(`the palette labels search results of type ${t}`, labelled.has(t));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
