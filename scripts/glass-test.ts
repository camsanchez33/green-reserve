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
ok('no gradient anywhere in it (the glow is blurred plain circles)', !/gradient\(/.test(g) && g.includes('filter: blur(90px)'));
const screenOpen = g.indexOf('@media screen {');
const firstRule = g.search(/^\.op-look/m);
ok('everything is under @media screen (print stays plain)', screenOpen > 0 && firstRule > screenOpen && g.split('\n').filter(l => l.startsWith('@media')).every(l => l.startsWith('@media screen')));
ok('cards are frosted through <Card>/CARD (bg-white + shadow-card)', g.includes('.op-look:has(.op-rail) .bg-white.shadow-card:not(.op-tab)') && g.includes('backdrop-filter: blur(18px)'));
ok('the rail is frosted', g.includes('.op-look:has(.op-rail) .op-rail {'));
ok('the tab lifts on hover, never the current tab', g.includes('.op-tab:not([aria-current]):hover') && g.includes('translateY(-2px)'));
ok('reduced motion turns the lift off', /prefers-reduced-motion: reduce\)[^\n]*transform: none/.test(g));
ok('reduced transparency gets solid panels and no glow', g.includes('prefers-reduced-transparency: reduce') && g.includes('display: none'));
ok('a pop-up window\'s panel (inside a fixed inset-0 backdrop) stays solid', g.includes('.op-look:has(.op-rail) .fixed.inset-0 .bg-white.shadow-card'));
ok('faint text is darkened for the frosted cards', css.includes('--color-ink-faint: #666B65;'));
ok('a golfer-page preview stays solid', g.includes('.op-keep-light .bg-white.shadow-card'));
ok('no cursor tracking: no pointer variables in the CSS', !/--(mouse|cursor|pointer)-?[xy]/i.test(g));
ok('the rail tabs carry the hook class', readFileSync('src/components/OperatorSidebar.tsx', 'utf8').includes("'op-tab flex items-center"));
ok('Card is still the one place the panel is defined', readFileSync('src/components/ui/Card.tsx', 'utf8').includes("export const CARD = 'bg-white rounded-lg shadow-card'"));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
