// R-AUTH-007 (Cam 2026-10-26: "make them real"): a staff switch in Settings must
// control something. Every catalog key is checked by server code (an API route or
// a server lib), never only by the catalog or the UI — the UI only hides. Plus: the
// removed 'Charge a fee by hand' key is gone, and a staff row that still stores it
// resolves cleanly. Run: npx tsx scripts/permission-catalog-test.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ALL_KEYS, normalizePermissions, resolveStaffPermissions } from '../src/lib/staff-permissions';

let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
}
const server = [...files('src/app/api'), ...files('src/lib')].filter(f => !f.endsWith('staff-permissions.ts')).map(f => readFileSync(f, 'utf8'));
const unchecked = ALL_KEYS.filter(k => !server.some(src => src.includes(`'${k}'`)));
ok('every staff switch is checked by server code', unchecked.length === 0, unchecked);

ok("'Charge a fee by hand' is out of the catalog", !(ALL_KEYS as string[]).includes('money.charge_fee'));
const stored = resolveStaffPermissions({ permissions: ['sheet.view', 'money.charge_fee'], permissionsSetAt: new Date() });
ok('…and a staff row that still stores it resolves without it', !(stored as string[]).includes('money.charge_fee') && stored.includes('sheet.view'), stored);
ok('…as does a requested set naming it', !(normalizePermissions(['money.charge_fee']) as string[]).includes('money.charge_fee'));

const panel = readFileSync('src/components/dashboard/money/PayoutsPanel.tsx', 'utf8');
const money = readFileSync('src/app/dashboard/money/page.tsx', 'utf8');
ok('staff never get a Connect with Stripe button (that route refuses them)', panel.includes('{canConnect ? (') && money.includes('canConnect={!treatAsStaff}'));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('permission-catalog: all passed');
