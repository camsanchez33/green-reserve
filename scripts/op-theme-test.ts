// DASH-D (Cam 2026-11-01/02): the dashboard's Light/Dark choice is ONLY a token swap.
//  1. every colour token the dashboard scope sets has a dark twin;
//  2. the layout reads the cookie into data-theme (first paint right), light by default;
//  3. Stripe's card frame and the golfer-page preview stay light;
//  4. dashboard pages don't gain typed hex colours (they wouldn't follow the theme) — a ratchet.
// Pure. Run: npx tsx scripts/op-theme-test.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { readOpTheme } from '../src/lib/op-theme';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const css = read('src/app/globals.css');
const block = (sel: string) => { const i = css.indexOf(sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
const light = block('.op-look:has(.op-rail)');
const dark = block('.op-look[data-theme="dark"]:has(.op-rail)');
const vars = (b: string) => new Set([...b.matchAll(/(--color-[a-z-]+):/g)].map(m => m[1]));
const themeVars = [...css.slice(css.indexOf('@theme {'), css.indexOf('}', css.indexOf('@theme {'))).matchAll(/(--color-[a-z-]+):/g)].map(m => m[1]);
const darkVars = vars(dark);
const missing = [...new Set([...vars(light), ...themeVars])].filter(v => !darkVars.has(v));
ok('every colour token has a dark twin', dark.length > 0 && missing.length === 0, missing);
ok('bg-white is a panel in dark (card colour), dark knows its own scheme', dark.includes('--color-white: #181B19') && dark.includes('color-scheme: dark'));
ok('white text on a solid fill turns dark in dark mode', css.includes(':is(.bg-pine, .bg-ok, .bg-bad, .bg-warn, .bg-ink) .text-white { color: #0F1110; }'));

const layout = read('src/app/dashboard/layout.tsx');
ok('the layout reads the cookie into data-theme', layout.includes('readOpTheme((await cookies()).get(OP_THEME_COOKIE)?.value)') && layout.includes('data-theme={theme}'));
ok('light by default; only "dark" means dark', readOpTheme(undefined) === 'light' && readOpTheme('nonsense') === 'light' && readOpTheme('dark') === 'dark');
ok('Geist is the dashboard face', layout.includes("from 'next/font/google'") && layout.includes('Geist(') && css.includes('var(--font-geist)'));
ok('the switch is on the rail and in the phone menu', (read('src/components/OperatorSidebar.tsx').match(/<ThemeSwitch \/>/g) || []).length === 2);

ok('Stripe\'s card frame stays light', /op-keep-light[^"]*"[^]*?<CardElement/.test(read('src/app/dashboard/page.tsx')));
ok('the golfer-page preview stays light', read('src/components/dashboard/CoursePreview.tsx').includes('op-keep-light'));

// 4. typed hex on dashboard surfaces — a ratchet: lower these numbers, never raise them.
const BASE: Record<string, number> = {
  'src/app/dashboard/page.tsx': 3,              // Stripe card frame style (an iframe — can't read CSS vars; its box is op-keep-light)
  'src/app/dashboard/settings/page.tsx': 4,     // the brand colour picker's default
  'src/app/dashboard/members/page.tsx': 8,      // membership swatch palette (reads on both)
  'src/app/dashboard/onboarding/page.tsx': 2,   // Stripe's own button colours (no rail: site look)
  'src/app/dashboard/home/page.tsx': 1,         // last week's comparison bar
  'src/app/dashboard/analytics/page.tsx': 2,    // chart comparison greys
  'src/components/dashboard/money/SalesPanel.tsx': 3, // chart fills
  'src/components/dashboard/CoursePreview.tsx': 1,    // golfer preview (op-keep-light)
  'src/components/OperatorSidebar.tsx': 2,      // default course colour before the course loads
};
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
walk('src/app/dashboard'); walk('src/components/dashboard'); files.push('src/components/OperatorSidebar.tsx');
const over = files.map(f => [f, (read(f).match(/#[0-9A-Fa-f]{6}\b/g) || []).length] as const).filter(([f, n]) => n > (BASE[f] ?? 0));
ok('no new typed hex colours on the dashboard (use the tokens)', over.length === 0, over);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
