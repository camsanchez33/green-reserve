// GLASS-1 (Cam 2026-11-02): the dashboard's glass look is CSS only, on rail pages, on screen.
// Pins: the glow is plain blurred circles (no gradient), cards and the rail are frosted, the
// tab lift has no cursor tracking and turns off with reduced motion, previews and
// reduced-transparency stay solid, and nothing of it reaches print.
// Pure. Run: npx tsx scripts/glass-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const css = readFileSync('src/app/globals.css', 'utf8');
const start = css.indexOf('/* GLASS-1');
const end = css.indexOf('/* FB-2:');
const g = start > 0 && end > start ? css.slice(start, end) : '';

ok('the glass block exists before the homepage rules', g.length > 0);
// NOGLOW-1 (Cam 2026-11-06, "take away the green backdrop… it looks terrible"): no glow, solid cards and rail.
ok('no glow and no gradient: a plain page', !/gradient\(/.test(g) && !g.includes('filter: blur(90px)') && !/::before, \.op-look:has\(\.op-rail\)::after \{\n  content/.test(g));
const screenOpen = g.indexOf('@media screen {');
const firstRule = g.search(/^\.op-look/m);
ok('everything is under @media screen (print stays plain)', screenOpen > 0 && firstRule > screenOpen && g.split('\n').filter(l => l.startsWith('@media')).every(l => l.startsWith('@media screen')));
ok('cards are solid white again (no frosting)', !g.includes('backdrop-filter: blur(18px)') && !g.includes('color-mix(in srgb, var(--color-white) 50%, transparent)'));
ok('the rail is solid', !g.includes('backdrop-filter: blur(22px)'));
ok('the tab lifts on hover, never the current tab', g.includes('.op-tab:not([aria-current]):hover') && g.includes('translateY(-2px)'));
ok('reduced motion turns the lift off', /prefers-reduced-motion: reduce\)[^\n]*transform: none/.test(g));
ok('reduced transparency gets solid panels and no glow', g.includes('prefers-reduced-transparency: reduce') && g.includes('display: none'));
ok('a pop-up window\'s panel (inside a fixed inset-0 backdrop) stays solid', g.includes('.op-look:has(.op-rail) .fixed.inset-0 .bg-white.shadow-card'));
ok('muted, faint, ok, warn and bad text are darkened (light) and muted/faint lightened (dark) for the frosted cards', css.includes('--color-ink-muted: #4E534D; --color-ink-faint: #53584F; --color-ok: #285A3C; --color-warn: #744710; --color-bad: #8C3A26;') && css.includes('--color-ink-muted: #9AA098; --color-ink-faint: #959B93;'));
ok('the page wrapper keeps its own grey (nothing to see through any more)', !css.includes('.op-look:has(.op-rail) .min-h-screen.bg-page { background-color: transparent; }'));
ok('a golfer-page preview stays solid', g.includes('.op-keep-light .bg-white.shadow-card'));
ok('no cursor tracking: no pointer variables in the CSS', !/--(mouse|cursor|pointer)-?[xy]/i.test(g));
ok('the rail tabs carry the hook class', readFileSync('src/components/OperatorSidebar.tsx', 'utf8').includes("'op-tab flex items-center"));
ok('Card is still the one place the panel is defined', readFileSync('src/components/ui/Card.tsx', 'utf8').includes("export const CARD = 'bg-white rounded-lg shadow-card'"));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
