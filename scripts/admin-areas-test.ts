// AW-11: per-person admin areas. The rules in lib/admin-areas.ts, and a guard
// over every admin API route: each one checks the area it belongs to
// (areaGate), is owner-only, or is on the short list that every login needs
// (sign-in, its own account, Home, the menu counts, search). A new admin route
// that does none of these fails here before it ships.
// Run: npx tsx scripts/admin-areas-test.ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { effectiveAreas, hasArea, ALL_AREAS } from '../src/lib/admin-areas';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); if (!ok) failed++; };

check('the owner has every area, whatever is stored', effectiveAreas('owner', []).length === ALL_AREAS.length);
check('never set (null) = every area', effectiveAreas('support', null).length === ALL_AREAS.length);
check('set = exactly those areas', JSON.stringify(effectiveAreas('manager', ['money', 'courses'])) === JSON.stringify(['money', 'courses']));
check('set to nothing = nothing', effectiveAreas('support', []).length === 0);
check('an unknown stored area is ignored', JSON.stringify(effectiveAreas('support', ['money', 'casino'])) === JSON.stringify(['money']));
check('hasArea follows the same rule', hasArea({ role: 'support', areas: ['messages'] }, 'messages') && !hasArea({ role: 'support', areas: ['messages'] }, 'money') && hasArea({ role: 'support', areas: null }, 'money'));

// Every admin route is gated by area, owner-only, or deliberately open to every login.
const OPEN_TO_EVERY_LOGIN = new Set([
  'login', 'logout', 'session', 'forgot-password', 'set-password', 'change-password', 'two-factor', 'passkeys', 'owner-devices', 'bootstrap',
  'today', 'nav-badges', 'search', 'ask',   // each filters what it returns by area (checked in isolation-test)
]);
const root = 'src/app/api/admin';
const routes: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === 'route.ts') routes.push(p); } };
walk(root);
const missing = routes.filter(p => {
  const top = p.slice(root.length + 1).split('/')[0];
  if (OPEN_TO_EVERY_LOGIN.has(top)) return false;
  const src = readFileSync(p, 'utf8');
  const ownerOnly = /requireOwner\(session\)|requireRole\(session, OWNER_ONLY\)/.test(src) && !/SUPPORT_PLUS|MANAGER_PLUS|VIEWER_PLUS/.test(src);
  return !src.includes('areaGate(') && !ownerOnly;
});
check(`every admin route checks its area or is owner-only (${routes.length} routes)`, missing.length === 0, missing);
check('the course preview email checks Pipeline', readFileSync('src/app/api/preview/send/route.ts', 'utf8').includes("areaGate(session, 'pipeline')"));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
