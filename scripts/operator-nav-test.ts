// The operator dashboard's desktop menu (DASH-C, Cam 2026-10-22 — replaced
// CLUB-3's colour bar) must show every tab and never push a page sideways:
// a fixed white rail down the left, the pages making room for it, and every
// full-width fixed bar starting after it. Reads the sources.
// Run: npx tsx scripts/operator-nav-test.ts
import { readFileSync } from 'fs';

const src = readFileSync('src/components/OperatorSidebar.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');
const layout = readFileSync('src/app/dashboard/layout.tsx', 'utf8');
const schedules = readFileSync('src/app/dashboard/schedules/page.tsx', 'utf8');
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

const railStart = src.indexOf('<aside className="op-rail');
const rail = railStart >= 0 ? src.slice(railStart, src.indexOf('</aside>', railStart)) : '';
check('the desktop menu is a rail down the left', /hidden md:flex fixed inset-y-0 left-0/.test(rail) && /w-\[var\(--op-rail-w\)\]/.test(rail));
check('the rail lists every visible tab (one list, not a hand-picked few)', /navItems\.filter\(n => !n\.soon && visible\(n\.key\)\)/.test(rail));
check('a tall menu scrolls inside the rail, never sideways', /overflow-y-auto/.test(rail) && !/overflow-x-auto/.test(rail));
check('the rail keeps the course switcher, Course alert, the booking page and sign-out',
  /aria-label="Switch course"/.test(rail) && /Course alert/.test(rail) && /\/courses\/' \+ slug/.test(rail) && /onClick=\{logout\}/.test(rail));
check('no decorative icons on the desktop menu (TYPE-3)', !/className="w-4 h-4"/.test(rail) && !/item\.icon/.test(rail));
check('pages make room for the rail only where it renders', /\.op-look:has\(\.op-rail\)\s*\{\s*padding-left:\s*var\(--op-rail-w\)/.test(css) && /min-width:\s*768px/.test(css));
check('the dashboard layout wraps pages in .op-look', /op-look/.test(layout));
check('the Schedule save bar starts after the rail', /fixed bottom-16 md:bottom-0 inset-x-0 md:left-\[var\(--op-rail-w\)\]/.test(schedules));
check('below md the bottom tab bar is unchanged', /md:hidden fixed bottom-0 inset-x-0 z-30/.test(src));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
