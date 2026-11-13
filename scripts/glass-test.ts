// The dashboard's glass, CSS only, on rail pages, on screen. History: GLASS-1 (Cam 2026-11-02) frosted it over a
// green glow; NOGLOW-1 (Cam 2026-11-06, "take away the green backdrop… it looks terrible") made it solid;
// GLASS-2 / CHARCOAL-1 (Cam 2026-11-12, "should look like glass like the admin home", the approved charcoal Home)
// brings the glass back in grey: blurred SVG ribbons (never a gradient), frosted cards and rail, charcoal by default.
// Pins: no gradient, ribbons are blurred strokes, print stays plain, previews / pop-ups / reduced transparency stay
// solid, reduced motion stops the tab lift, no cursor tracking — and text contrast of 4.5:1 or better in both
// themes on a frosted panel over the brightest ribbon (modelled below from the tokens themselves).
// Pure. Run: npx tsx scripts/glass-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const css = readFileSync('src/app/globals.css', 'utf8');
const start = css.indexOf('/* GLASS-2');
const end = css.indexOf('/* FB-2:');
const g = start > 0 && end > start ? css.slice(start, end) : '';
const side = readFileSync('src/components/OperatorSidebar.tsx', 'utf8');

ok('the glass block exists before the homepage rules', g.length > 0);
ok('no gradient anywhere in the dashboard look', !/gradient\(/.test(css.slice(css.indexOf('/* DASH-D (Cam 2026-11-01/02)'), end)));
ok('the ribbons are blurred SVG strokes, fixed behind the page', side.includes('className="op-waves"') && side.includes('<feGaussianBlur') && side.includes('aria-hidden="true"') && g.includes('.op-waves { position: fixed; inset: 0;') && g.includes('z-index: -1'));
ok('everything is under @media screen (print stays plain)', g.split('\n').filter(l => l.startsWith('@media')).every(l => l.startsWith('@media screen')));
ok('print hides the ribbons', /@media print \{[^\n]*\.op-waves/.test(css));
ok('cards are frosted', g.includes('.bg-white.shadow-card:not(.op-tab) {') && g.includes('backdrop-filter: blur(22px)') && g.includes('background-color: var(--op-panel)'));
ok('the rail is frosted', g.includes('.op-rail { background-color: var(--op-rail-glass); -webkit-backdrop-filter: blur(18px)'));
// Theme changes (Cam 2026-11-12): Light stays glass — charcoal ribbons on the light page (the inverse of charcoal).
const lb = css.slice(css.indexOf('.op-look:has(.op-rail) {'), css.indexOf('\n}', css.indexOf('.op-look:has(.op-rail) {')));
// LIGHT-PARITY (Cam 2026-11-12, the mockup's Light): grey sweeps darker than the page, plus one white fold.
ok('light ribbons are grey sweeps on the light page (and one white fold)', ['--op-wv1', '--op-wv2'].every(n => { const m = lb.match(new RegExp(`${n}: rgb\\((\\d+) (\\d+) (\\d+)`)); return !!m && +m[1] < 180 && +m[2] < 180 && +m[3] < 180; }) && /--op-wv3: rgb\(255 255 255 \//.test(lb));
ok('the page wrapper lets the ribbons through', g.includes('.op-look:has(.op-rail) .min-h-screen.bg-page { background-color: transparent; }'));
ok('the tab lifts on hover, never the current tab', g.includes('.op-tab:not([aria-current]):hover') && g.includes('translateY(-2px)'));
ok('reduced motion turns the lift off', /prefers-reduced-motion: reduce\)[^\n]*transform: none/.test(g));
ok('reduced transparency gets solid panels and no ribbons', g.includes('prefers-reduced-transparency: reduce') && g.includes('.op-waves { display: none; }') && g.includes('background-color: var(--op-panel-solid)'));
ok('a pop-up window\'s panel (inside a fixed inset-0 backdrop) stays solid', g.includes('.op-look:has(.op-rail) .fixed.inset-0 .bg-white.shadow-card'));
ok('a fixed panel (the phone More menu, the assistant) stays solid', g.includes('.op-look:has(.op-rail) .fixed.bg-white.shadow-card'));
ok('a golfer-page preview stays solid', g.includes('.op-keep-light .bg-white.shadow-card'));
ok('no cursor tracking: no pointer variables in the CSS', !/--(mouse|cursor|pointer)-?[xy]/i.test(g));
ok('the rail tabs carry the hook class', side.includes("'op-tab flex items-center"));
ok('Card is still the one place the panel is defined', readFileSync('src/components/ui/Card.tsx', 'utf8').includes("export const CARD = 'bg-white rounded-lg shadow-card'"));

// LIGHT-PARITY (Cam 2026-11-12: "Light and Charcoal get the SAME redesign — only the colours swap"): a rule that only
// applies in charcoal may change COLOUR, never glass or layout. Anything else (blur, radius, size, spacing, position,
// transforms, which elements show) must live in the shared rule so Light gets it too. The logo pair's show/hide is the
// one exception (it swaps which colour of the logo shows).
const COLOUR_PROPS = new Set(['color', 'background-color', 'border-color', 'box-shadow', 'color-scheme', 'filter', 'fill', 'stroke', 'outline-color', 'caret-color']);
const darkOnly = [...css.matchAll(/([^{}]*data-theme="dark"[^{}]*)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), props: m[2].split(';').map(d => d.split(':')[0].trim()).filter(Boolean) }));
const layoutInDark = darkOnly.filter(r => !/\.op-(dark|light)-only/.test(r.sel)).flatMap(r => r.props.filter(p => !p.startsWith('--') && !COLOUR_PROPS.has(p)).map(p => `${r.sel.split('\n').pop()} → ${p}`));
ok('charcoal-only rules change colour only — glass and layout are shared with Light', darkOnly.length > 5 && layoutInDark.length === 0, layoutInDark);
ok('the Light block carries the same glass tokens as charcoal (panel, edge, rail, ribbons, well)', ['--op-panel', '--op-edge', '--op-rail-glass', '--op-wv1', '--op-wv2', '--op-wv3', '--op-well'].every(t => lb.includes(t + ':') && (() => { const i = css.indexOf('.op-look[data-theme="dark"]:has(.op-rail) {'); return css.slice(i, css.indexOf('\n}', i)); })().includes(t + ':')));

// ── Contrast: each text token on the worst frosted panel in its theme (panel over the page with the brightest
// ribbon under it, blur ignored = the brightest case for charcoal, and the darkest ribbon for light).
type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB;
const over = (top: RGB, a: number, under: RGB): RGB => top.map((c, i) => c * a + under[i] * (1 - a)) as RGB;
const lum = (c: RGB) => { const [r, gg, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * gg + 0.0722 * b; };
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const block = (sel: string) => { const i = css.indexOf(sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('\n}', i)); };
const tok = (b: string, name: string) => b.match(new RegExp(`${name}: (#[0-9A-Fa-f]{6})`))?.[1] ?? '';
const rgba = (b: string, name: string): [RGB, number] => { const m = b.match(new RegExp(`${name}: rgb\\((\\d+) (\\d+) (\\d+) / \\.(\\d+)\\)`)); return m ? [[+m[1], +m[2], +m[3]], Number('.' + m[4])] : [[0, 0, 0], 0]; };
for (const [theme, sel] of [['light', '.op-look:has(.op-rail)'], ['charcoal', '.op-look[data-theme="dark"]:has(.op-rail)']] as const) {
  const b = block(sel);
  const page = hex(tok(b, '--color-page'));
  const [panelC, panelA] = rgba(b, '--op-panel');
  // Worst case: every ribbon crossing at one spot (they overlap at the edges), blur ignored.
  // Worst case: all three ribbons crossing (each darkens the page in light, lightens it in charcoal).
  // .w4 also uses --op-wv2 but sits low (y ≈ 650–1090) and never crosses .w1 (y ≈ 60–500), so w1+w2+w3 is the worst stack.
  // Only the ribbons that move the page AWAY from the text count: darker ones in light (the white fold only helps), lighter
  // ones in charcoal.
  const mean = (c: RGB) => (c[0] + c[1] + c[2]) / 3;
  const worstUnder = ['--op-wv1', '--op-wv2', '--op-wv3'].map(n => rgba(b, n))
    .filter(([c]) => theme === 'light' ? mean(c) < mean(page) : mean(c) > mean(page))
    .reduce((under, [c, a]) => over(c, a, under), page);
  const panel = over(panelC, panelA, worstUnder);
  for (const t of ['--color-ink', '--color-ink-soft', '--color-ink-muted', '--color-ink-faint', '--color-ok', '--color-warn', '--color-bad']) {
    const r = ratio(hex(tok(b, t)), panel);
    ok(`${theme}: ${t} clears 4.5:1 on a frosted panel (${r.toFixed(2)})`, r >= 4.5, { panel, t: tok(b, t) });
  }
  // A page title and its "As of" line sit straight on the page, over the ribbons.
  for (const t of ['--color-ink', '--color-ink-soft', '--color-ink-muted', '--color-ink-faint', '--color-ok', '--color-warn', '--color-bad']) {
    const r = ratio(hex(tok(b, t)), worstUnder);
    ok(`${theme}: ${t} clears 4.5:1 straight on the page over the ribbons (${r.toFixed(2)})`, r >= 4.5, { worstUnder, t: tok(b, t) });
  }
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
