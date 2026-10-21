// AW-3 (Cam 2026-10-21): the admin rail is the map of the company, so it must
// never offer a role a door its API refuses (MP-2c), and search must label
// every result type it returns. Reads the sources. Run: npx tsx scripts/admin-nav-test.ts
import { readFileSync } from 'fs';
import { VIEWER_PLUS, SUPPORT_PLUS, MANAGER_PLUS, OWNER_ONLY } from '../src/lib/admin-roles';

let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

const rail = readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8');
const groups = rail.slice(rail.indexOf('const allGroups'), rail.indexOf('const canSee'));
const ROLE_SETS: Record<string, string[]> = { VIEWER_PLUS, SUPPORT_PLUS, MANAGER_PLUS, OWNER_ONLY };
const items = [...groups.matchAll(/\{ key: '(\w+)',[^}]*?href: '([^']+)'(?:,\s*minRole: (\w+))?/g)].map(m => ({ key: m[1], href: m[2], roles: m[3] ? ROLE_SETS[m[3]] : null }));
check('the rail lists its items', items.length >= 10);

// The gate of the API behind each page (the page's own data route).
const GATE: Record<string, string[] | null> = {
  overview: null, inquiries: VIEWER_PLUS, courses: VIEWER_PLUS, groups: SUPPORT_PLUS, messages: SUPPORT_PLUS,
  revenue: SUPPORT_PLUS, employees: MANAGER_PLUS, golfers: SUPPORT_PLUS, system: MANAGER_PLUS,
  activity: SUPPORT_PLUS, create: MANAGER_PLUS, company: OWNER_ONLY,
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
check('no icons beside the rail labels (TYPE-3)', !/from 'lucide-react'/.test(rail) || /import \{ Search \} from 'lucide-react'/.test(rail));

const route = readFileSync('src/app/api/admin/search/route.ts', 'utf8');
const palette = readFileSync('src/components/admin/CommandPalette.tsx', 'utf8');
const routeTypes = new Set([...route.matchAll(/\| \{ type: '(\w+)'/g)].map(m => m[1]));
const labelBlock = palette.slice(palette.indexOf('const TYPE_LABEL'), palette.indexOf('};', palette.indexOf('const TYPE_LABEL')));
const labelled = new Set([...labelBlock.matchAll(/^\s*(\w+):/gm)].map(m => m[1]));
check('search returns several result types', routeTypes.size >= 8);
for (const t of routeTypes) check(`the palette labels search results of type ${t}`, labelled.has(t));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
