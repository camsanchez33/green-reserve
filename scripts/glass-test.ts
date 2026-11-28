// The dashboard's and admin's surfaces, CSS only. History: GLASS-1 (Cam 2026-11-02) frosted the dashboard over a green
// glow; NOGLOW-1 (2026-11-06) made it solid; GLASS-2 / CHARCOAL-1 (2026-11-12) brought glass back over blurred ribbons,
// and LIGHT-PARITY made Light glass too. UI-STYLE (Cam 2026-11-26, "Approved, build it"; lanes/build.md "UI style
// overhaul") replaces both: DARK = Apple-style glass on a flat neutral #141414 page, LIGHT = solid white cards on a
// neutral #F2F2F2 page with a dark sidebar. No ribbons, shapes or gradients behind either; no colour cast (R=G=B).
// Pins: the two materials, neutral surfaces, print stays plain, previews / pop-ups / reduced transparency stay solid,
// reduced motion stops the tab lift, both looks share every layout rule (parity), and text contrast of 4.5:1 or better
// in both looks on a panel and straight on the page (modelled below from the tokens themselves).
// Pure. Run: npx tsx scripts/glass-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const css = readFileSync('src/app/globals.css', 'utf8');
const start = css.indexOf('/* UI-KIT-4 (Cam 2026-11-26');
const end = css.indexOf('/* FB-2:');
const g = start > 0 && end > start ? css.slice(start, end) : '';
const side = readFileSync('src/components/OperatorSidebar.tsx', 'utf8');
const adminCss = readFileSync('src/app/admin/admin-glass.module.css', 'utf8');
const adminLayout = readFileSync('src/app/admin/layout.tsx', 'utf8');

ok('the style block exists before the homepage rules', g.length > 0);
ok('no gradient anywhere in the dashboard look', !/gradient\(/.test(css.slice(css.indexOf('/* DASH-D (Cam 2026-11-01/02)'), end)));
ok('no gradient in the admin look', !/gradient\(/.test(adminCss));
ok('no ribbons behind the dashboard (markup or CSS)', !side.includes('op-waves') && !side.includes('<feGaussianBlur') && !css.includes('op-waves') && !/--op-wv\d/.test(css));
ok('no ribbons behind the admin (markup or CSS)', !adminLayout.includes('waves') && !adminLayout.includes('<feGaussianBlur') && !adminCss.includes('.waves') && !/--g-wv\d/.test(adminCss));
ok('the material rules are under @media screen (print stays plain)', g.split('\n').filter(l => l.startsWith('@media')).every(l => l.startsWith('@media screen') || l.startsWith('@media print')));

const block = (sel: string) => { const i = css.indexOf(sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('\n}', i)); };
const lb = block('.op-look:has(.op-rail)');
const db = block('.op-look[data-theme="dark"]:has(.op-rail)');
const rb = block('.op-look:has(.op-rail) .op-band');
const kit = readFileSync('src/app/ui-kit-v4.css', 'utf8');

// One material rule for both looks; the tokens decide solid or glass.
ok('cards take the material from tokens (one rule, both looks)', g.includes('.op-look:has(.op-rail) .bg-white.shadow-card:not(.op-tab) {') && g.includes('background-color: var(--op-panel); border-color: var(--op-edge);') && g.includes('backdrop-filter: var(--op-blur);') && g.includes('box-shadow: 0 0 0 1px var(--op-edge), var(--op-shadow);'));
ok('the rail takes the material from tokens', g.includes('.op-look:has(.op-rail) .op-rail { background-color: var(--op-rail-bg); -webkit-backdrop-filter: var(--op-blur); backdrop-filter: var(--op-blur);'));
ok('Light is solid: opaque white panels, no blur, neutral page', /--op-panel: #FFFFFF;/.test(lb) && /--op-blur: none;/.test(lb) && /--color-page: #F2F2F2;/.test(lb));
ok('Light: a white sidebar over the neutral page, solid white panels', /--op-rail-bg: #FFFFFF;/.test(lb) && /--color-rail: #FFFFFF;/.test(lb));
ok('Dark: solid #262626 panels, a flat #141414 page, a white hairline at low alpha, no blur and no shadow (glass is only for what floats)',
  /--op-panel: #262626;/.test(db) && /--op-blur: none;/.test(db) && /--op-edge: rgb\(255 255 255 \/ \.09\);/.test(db) && /--op-shadow: none;/.test(db) && /--color-page: #141414;/.test(db) && /--op-rail-bg: #262626;/.test(db));
  /--op-panel: rgb\(38 38 38 \/ \.62\);/.test(db) && /--op-blur: blur\(30px\) saturate\(1\.8\);/.test(db) && /--op-edge: rgb\(255 255 255 \/ \.10\);/.test(db)
ok('the ribbon is dark in both looks (its own light-on-dark tokens)', /--color-ink: #F2F2F2;/.test(rb) && rb.includes('color-scheme: dark'));
ok('the page wrapper shows the page colour (nothing behind it)', g.includes('.op-look:has(.op-rail) .min-h-screen.bg-page { background-color: transparent; }'));

// No colour cast: every surface and grey text token is R=G=B in both looks (status colours keep their meaning).
const SURFACES = ['--color-page', '--color-paper', '--color-card', '--color-white', '--color-rail', '--color-rail-line', '--color-ink', '--color-ink-soft', '--color-ink-muted', '--color-ink-faint', '--color-line', '--color-line-soft', '--color-line-strong', '--color-pine-soft', '--op-panel', '--op-panel-solid', '--op-rail-bg', '--op-edge'];
const neutral = (v: string) => { const h = v.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/); if (h) return h[1].toLowerCase() === h[2].toLowerCase() && h[2].toLowerCase() === h[3].toLowerCase(); const r = v.match(/^rgb\((\d+) (\d+) (\d+)/); return !!r && r[1] === r[2] && r[2] === r[3]; };
for (const [name, b] of [['Light', lb], ['Dark', db], ['Ribbon', rb]] as const) {
  const cast = SURFACES.map(t => [t, b.match(new RegExp(`${t}: ([^;]+);`))?.[1]?.trim()] as const).filter(([, v]) => v && !neutral(v));
  ok(`${name}: no colour cast on surfaces and grey text (R=G=B)`, cast.length === 0, cast);
}

// UI-STYLE sidebar: hover is a faint fill (no lift); the current page is a lighter fill, a 2px left bar and bold text.
ok('sidebar hover is a faint fill, never a lift', g.includes('.op-tab:not([aria-current]):hover { background-color: color-mix(in srgb, var(--op-sel) 60%, transparent);') && !g.includes('translateY('));
ok('the current page: the selected fill, ink text, weight 500 (no left bar)', g.includes('.op-tab[aria-current="page"] { background-color: var(--op-sel); color: var(--color-ink); font-weight: 500; }') && !g.includes('inset 2px 0 0'));
ok('reduced motion turns the transitions off', /prefers-reduced-motion: reduce\) \{ \.op-look:has\(\.op-rail\) \.op-tab \{ transition: none; \} \}/.test(g));
const railNav = side.slice(side.indexOf('<aside className="op-rail'), side.indexOf('</aside>', side.indexOf('<aside className="op-rail')));
const navArr = side.slice(side.indexOf('const navItems'), side.indexOf('];', side.indexOf('const navItems')));
ok('every rail item has one 16px line icon, hidden from screen readers (no colour dot)', (railNav.match(/<span aria-hidden="true" className="op-ic shrink-0 flex">/g) || []).length === 4 && !/icon: null/.test(navArr) && (navArr.match(/className="w-4 h-4"\/>/g) || []).length >= 12 && !railNav.includes("style={{ backgroundColor: isActive"));
ok('rail group labels are small and quiet', railNav.includes('text-[11.5px] font-semibold text-ink-muted'));
const adminSide = readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8');
const iconMap = adminSide.slice(adminSide.indexOf('const ICONS'), adminSide.indexOf('};', adminSide.indexOf('const ICONS')));
const menuKeys = [...adminSide.matchAll(/\{ (?:key: '(\w+)', label: '[^']+'|label: '[^']+', key: '(\w+)'), href:/g)].map(m => m[1] ?? m[2]);
ok('admin: every menu item has one 16px line icon', menuKeys.length >= 18 && menuKeys.every(k => new RegExp(`\\b${k}: <[A-Za-z0-9]+ className=\\{IC\\}\\/>`).test(iconMap)) && adminSide.includes("const IC = 'w-4 h-4';") && adminSide.includes('<span aria-hidden="true" className={g.ic}>{ICONS[item.key]}</span>'), menuKeys.filter(k => !new RegExp(`\\b${k}: <`).test(iconMap)));
ok('admin: small quiet group labels; current page is the selected fill, ink text, weight 500', adminCss.includes('.grpLabel { font-size: 11.5px; font-weight: 600; color: var(--g-muted);') && adminCss.includes('.on { background: var(--g-active); color: var(--g-ink); font-weight: 500; }'));
ok('reduced transparency gets solid panels and a solid rail', g.includes('prefers-reduced-transparency: reduce') && g.includes('background-color: var(--op-panel-solid)') && g.includes('.op-rail { background-color: var(--color-rail); -webkit-backdrop-filter: none'));
ok('a pop-up window\'s panel is glass with the spring, a centred dialog (v4); on a phone a sheet', kit.includes('[role="dialog"][aria-modal="true"]:not(.h-full) {') && kit.includes('-webkit-backdrop-filter: blur(18px) saturate(1.3)') && kit.includes('animation: op-dialog-in var(--t-dialog) var(--spring) both;') && kit.includes('animation-name: op-sheet-in;'));
ok('a fixed panel (the phone More menu, the assistant) stays solid', g.includes('.op-look:has(.op-rail) .fixed.bg-white.shadow-card'));
ok('a golfer-page preview stays solid', g.includes('.op-keep-light .bg-white.shadow-card'));
ok('no cursor tracking: no pointer variables in the CSS', !/--(mouse|cursor|pointer)-?[xy]/i.test(g));
ok('the rail tabs carry the hook class', side.includes("'op-tab "));
ok('Card is still the one place the panel is defined', readFileSync('src/components/ui/Card.tsx', 'utf8').includes("export const CARD = 'bg-white rounded-[10px] shadow-card'"));

// PARITY (Cam 2026-11-12, kept by UI-STYLE 2026-11-26: "both looks still get every change"): a rule that only applies in
// Dark may change COLOUR or the glass material's tokens, never layout. Anything else (radius, size, spacing, position,
// transforms, which elements show) must live in the shared rule so Light gets it too. The logo pair's show/hide is the
// one exception (it swaps which colour of the logo shows).
const COLOUR_PROPS = new Set(['color', 'background-color', 'border-color', 'box-shadow', 'color-scheme', 'filter', 'fill', 'stroke', 'outline-color', 'caret-color']);
const DARK = /\[data-theme=["']?dark["']?\]/;
const darkOnly = [...css.matchAll(/([^{}]*\[data-theme=["']?dark["']?\][^{}]*)\{([^{}]*)\}/g)].map(m => ({
  sel: m[1].trim(),
  decls: m[2].split(';').map(d => { const k = d.indexOf(':'); return k < 0 ? null : [d.slice(0, k).trim(), d.slice(k + 1).trim()] as [string, string]; }).filter((d): d is [string, string] => !!d && !!d[0]),
}));
const COLOUR_VALUE = /^(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)|var\(--color-[a-z0-9-]+\)|transparent|dark|light)$/;
const MATERIAL_TOKEN = new Set(['--op-blur', '--op-shadow', '--op-glass-shadow', '--op-raise']);
const bad: string[] = [];
for (const r of darkOnly) {
  const last = r.sel.split('\n').pop()!;
  const logo = /\.op-(dark|light)-only/.test(r.sel);
  const twin = r.sel.split(',').map(x => x.trim().replace(DARK, '')).every(x => css.includes(x + ' {') || css.includes(x + ',') || css.includes(x + '\n'));
  for (const [p, v] of r.decls) {
    if (logo) { if (p !== 'display') bad.push(`${last} → ${p}`); continue; }
    if (p.startsWith('--')) {
      if (MATERIAL_TOKEN.has(p)) { if (!lb.includes(p + ':')) bad.push(`${p} has no Light twin`); continue; }
      if (!COLOUR_VALUE.test(v)) bad.push(`${last} → ${p}: ${v} (a dark-only token must be a colour)`);
      continue;
    }
    if (!COLOUR_PROPS.has(p)) { bad.push(`${last} → ${p}`); continue; }
    if (p === 'filter' && !/^(brightness|contrast|saturate|grayscale)\([^)]*\)( (brightness|contrast|saturate|grayscale)\([^)]*\))*$/.test(v)) bad.push(`${last} → filter: ${v}`);
    if (p === 'box-shadow' && !twin) bad.push(`${last} → box-shadow with no Light twin`);
  }
}
ok('dark-only rules change colour or material tokens only — layout is shared with Light', darkOnly.length > 5 && bad.length === 0, bad);
const opTokens = [...new Set([...db.matchAll(/(--op-[a-z0-9-]+):/g)].map(m => m[1]))];
ok('the Light block carries every --op- token Dark has', opTokens.length >= 8 && opTokens.every(t => lb.includes(t + ':')), opTokens.filter(t => !lb.includes(t + ':')));
ok('the time card is a panel only at xl, and solid under reduced transparency', /@media screen and \(min-width: 1280px\) \{\s*\n\s*\.op-look:has\(\.op-rail\) \.fixed \.tt-card\.bg-white\.shadow-card \{ background-color: var\(--op-panel\)/.test(css) && /prefers-reduced-transparency: reduce\)[\s\S]*?\.fixed \.tt-card\.bg-white\.shadow-card \{ background-color: var\(--color-white\)/.test(css));
ok('a well is opt-in (.op-well), not every bg-page', css.includes('.op-look:has(.op-rail) .op-well { background-color: var(--op-well); }') && !css.includes('.bg-white.shadow-card .bg-page'));
ok('tee sheet cells and List carry the money edge over the fill', readFileSync('src/components/dashboard/TeeSheetRows.tsx', 'utf8').includes("+ FILL[t] + ' ' + EDGE[t] + ' '") && readFileSync('src/components/dashboard/TeeSheetList.tsx', 'utf8').includes("FILL[t] + ' ' + EDGE[t]"));

// UI-STYLE search and band: the band is the sidebar's colour and tokens; a search field is white + thin border on Light,
// dark glass on Dark, the dark field in the band, and the dark field everywhere in the admin.
ok('the ribbon: 48px, #1E1E1E in both looks, drawn full width behind the page', g.includes('.op-band { position: relative; z-index: 20; height: 48px; }') && g.includes('.op-band::before {') && g.includes('background-color: #1E1E1E;') && g.includes('.op-look:has(.op-rail) .op-band {'));
ok('search is a v4 field: the soft fill, 8px, a transparent edge, no shadow', g.includes('.op-look:has(.op-rail) .ui-search {\n  background-color: var(--op-field); border: 1px solid transparent; border-radius: 8px; box-shadow: none;'));
ok('search in the ribbon is the dark field; focus turns the edge green', g.includes('.op-band .ui-search { background-color: rgb(255 255 255 / .07); border-color: transparent; }') && g.includes('.ui-search:focus-within { border-color: var(--op-focus); }'));
ok('admin search: the same v4 field as the dashboard', g.includes('[data-admin-shell] .ui-search {\n  background: var(--op-field); border: 1px solid transparent; border-radius: 8px;'));
{ const railSrc = side.slice(side.indexOf('<aside className="op-rail'), side.indexOf('</aside>', side.indexOf('<aside className="op-rail')));
  ok('no search in the sidebar', !railSrc.includes('<OperatorSearch') && !railSrc.includes('<input')); }
const SEARCHES = ['src/components/dashboard/OperatorSearch.tsx', 'src/app/dashboard/page.tsx', 'src/app/dashboard/shop/page.tsx', 'src/components/dashboard/StockTab.tsx', 'src/components/dashboard/money/revenue/ui.tsx', 'src/components/dashboard/money/CancellationsPanel.tsx', 'src/components/dashboard/money/PaymentsPanel.tsx', 'src/components/dashboard/events/EventPlayers.tsx', 'src/components/dashboard/members/ResidentsCard.tsx', 'src/app/dashboard/settings/page.tsx', 'src/components/admin/AdminSidebar.tsx', 'src/app/admin/golfers/page.tsx', 'src/app/admin/system/page.tsx', 'src/app/admin/support/page.tsx', 'src/app/admin/announcements/page.tsx'];
ok('every page search carries the .ui-search hook', SEARCHES.every(f => /ui-search/.test(readFileSync(f, 'utf8'))), SEARCHES.filter(f => !/ui-search/.test(readFileSync(f, 'utf8'))));

// UI-STYLE phone layouts (Cam 2026-11-26, the mockup's "On a phone"): same content and actions, sized for a thumb.
const phone = (() => { const i = css.indexOf('@media screen and (max-width: 767px) {'); return i < 0 ? '' : css.slice(i, css.indexOf('\n}\n', i)); })();
const sheetPage = readFileSync('src/app/dashboard/page.tsx', 'utf8');
ok('phone: the tee sheet opens in List unless this browser picked a view', sheetPage.includes("else if (window.matchMedia('(max-width: 767px)').matches) setSheetViewState('list');") && sheetPage.includes("' ui-stats mb-4'"));
ok('phone: the day numbers fit in one row', phone.includes('.ui-stats { grid-template-columns: repeat(5, minmax(0, 1fr));'));
ok('phone: the primary action is pinned above the tab bar', sheetPage.includes('className="ui-fab ') && phone.includes('.ui-fab {\n    position: fixed;') && phone.includes('.bg-white.shadow-card:has(.ui-fab, [aria-modal="true"]) { -webkit-backdrop-filter: none; backdrop-filter: none; }'));
ok('phone: 44px tap targets on the page and in pop-ups (a switch keeps its 24px track)', phone.includes(':is(main, .fixed.inset-0) :is(button:not([role="switch"]), [role="tab"], select) { min-height: 44px; }') && phone.includes(':is(main, .fixed.inset-0) :is(button, a)[aria-label] { min-width: 44px; min-height: 44px; }'));
ok('phone: dialogs are sheets from the bottom', phone.includes('border-radius: 10px 10px 0 0;') && phone.includes('align-items: flex-end;'));
ok('admin phone: a bottom tab bar (More opens the menu), 44px targets, menu button gone', adminCss.includes('.tabbar {\n    display: flex; position: fixed;') && adminCss.includes('.ibtn, .search { min-width: 44px; height: 44px; }') && /@media \(max-width: 899px\) \{\n  \.menuBtn \{ display: none; \}/.test(adminCss) && readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8').includes('<nav className={g.tabbar} aria-label="Admin sections">'));
ok('admin Overview: every stat card on one row on a computer', adminCss.includes('.kpis { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr);'));

// ── Admin: dark glass only, neutral; the menu's hover and active are white at low alpha (no green tint).
const adb = (() => { const i = adminCss.indexOf('.shell[data-theme="dark"] {'); return adminCss.slice(i, adminCss.indexOf('\n}', i)); })();
const whiteAlpha = (n: string) => new RegExp(`${n}: rgba\\(255, 255, 255, \\.\\d+\\);`).test(adb);
ok('admin: menu hover and active are neutral (white at low alpha), never green', whiteAlpha('--g-hover') && whiteAlpha('--g-active') && whiteAlpha('--g-edge') && whiteAlpha('--g-line'));
ok('admin: flat neutral page and solid neutral panels (the same as the dashboard)', /--g-bg: #141414;/.test(adb) && /--g-panel: #262626;/.test(adb) && /--g-rail: #262626;/.test(adb) && /--g-blur: 0px;/.test(adb));
ok('admin: no blur on the panels, the rail or the bar (glass is only for what floats)', !adminCss.includes('backdrop-filter: blur(var(--g-blur))') && !/--g-t[12]: #(173B2A|C9A24A|1F6B45|D9B45A)/i.test(adb), 'green or gold tile colours came back');
ok('admin: reduced transparency gets solid panels', /prefers-reduced-transparency: reduce\) \{\s*\n\s*\.glass, \.rail, \.top \{ background: var\(--g-panel-solid\)/.test(adminCss));
const adminGreys = ['--g-bg', '--g-panel-solid', '--g-ink', '--g-ink-soft', '--g-muted', '--color-page', '--color-paper', '--color-card', '--color-ink', '--color-ink-soft', '--color-ink-muted', '--color-line'];
const adminCast = adminGreys.map(t => [t, adb.match(new RegExp(`${t}: ([^;]+);`))?.[1]?.trim()] as const).filter(([, v]) => !v || !neutral(v));
ok('admin: no colour cast on surfaces and grey text', adminCast.length === 0, adminCast);

// ── Contrast: each text token on a panel over the page, and straight on the page, in each look. Dark's panel is
// translucent over the flat page (nothing else sits behind it), so the composite is exact; blur changes nothing.
type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB;
const over = (top: RGB, a: number, under: RGB): RGB => top.map((c, i) => c * a + under[i] * (1 - a)) as RGB;
const lum = (c: RGB) => { const [r, gg, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * gg + 0.0722 * b; };
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const tok = (b: string, name: string) => b.match(new RegExp(`${name}: (#[0-9A-Fa-f]{6})`))?.[1] ?? '';
const colour = (b: string, name: string): [RGB, number] => {
  const h = tok(b, name); if (h) return [hex(h), 1];
  const m = b.match(new RegExp(`${name}: rgb\\((\\d+) (\\d+) (\\d+) / \\.(\\d+)\\)`)); return m ? [[+m[1], +m[2], +m[3]], Number('.' + m[4])] : [[0, 0, 0], 0];
};
const TEXT = ['--color-ink', '--color-ink-soft', '--color-ink-muted', '--color-ink-faint', '--color-ok', '--color-warn', '--color-bad'];
for (const [theme, b] of [['light', lb], ['dark', db]] as const) {
  const page = hex(tok(b, '--color-page'));
  const [pc, pa] = colour(b, '--op-panel');
  const panel = over(pc, pa, page);
  for (const t of TEXT) {
    const r1 = ratio(hex(tok(b, t)), panel);
    ok(`${theme}: ${t} clears 4.5:1 on a panel (${r1.toFixed(2)})`, r1 >= 4.5, { panel, t: tok(b, t) });
    const r2 = ratio(hex(tok(b, t)), page);
    ok(`${theme}: ${t} clears 4.5:1 straight on the page (${r2.toFixed(2)})`, r2 >= 4.5, { page, t: tok(b, t) });
  }
}
// The sidebar's text on the sidebar (a solid panel in both looks: white / #262626), and the ribbon's on #1E1E1E.
for (const [theme, b] of [['light', lb], ['dark', db]] as const) {
  const railBg = hex(tok(b, '--op-rail-bg'));
  for (const t of ['--color-ink', '--color-ink-soft', '--color-ink-muted']) {
    const r = ratio(hex(tok(b, t)), railBg);
    ok(`${theme}: sidebar ${t} clears 4.5:1 on the sidebar (${r.toFixed(2)})`, r >= 4.5, { railBg, t: tok(b, t) });
  }
}
for (const t of ['--color-ink', '--color-ink-soft', '--color-ink-muted']) {
  const r = ratio(hex(tok(rb, t)), hex('#1E1E1E'));
  ok(`ribbon: ${t} clears 4.5:1 on the ribbon (${r.toFixed(2)})`, r >= 4.5, tok(rb, t));
}

// ── UI-KIT-4 phase 1 (Cam 2026-11-26, the approved v4 mockup): the shared parts. Look only; every handler stays put.
ok('v4 tokens, both looks: the brand button, field, selected row, switch, glass, raised', ['--op-brand', '--op-focus', '--op-field', '--op-sel', '--op-track', '--op-on', '--op-glass', '--op-raise', '--op-panel-2'].every(t => lb.includes(t + ':') && db.includes(t + ':')));
ok('motion tokens: tap 120ms, panel 200ms, the ease and the spring', css.includes('--ease: cubic-bezier(.2, .8, .2, 1); --spring: cubic-bezier(.34, 1.35, .5, 1);') && css.includes('--t-tap: 120ms; --t-panel: 200ms;'));
ok('the primary button: brand #346B4F, a top highlight and a bottom edge', /--op-brand: #346B4F;/.test(lb) && /--op-brand: #346B4F;/.test(db) && kit.includes('inset 0 1px 0 rgb(255 255 255 / .22), inset 0 -1px 0 rgb(0 0 0 / .25)'));
ok('fields: 44px, a soft fill, a green border on focus, red on error', kit.includes('min-height: 44px; border-radius: var(--r-ctl); background-color: var(--op-field);') && kit.includes('border-color: var(--op-focus)') && kit.includes('[aria-invalid="true"]'));
ok('the switch: 40 by 24, a light on-colour, the knob moves 16px', kit.includes('width: 40px; height: 24px;') && kit.includes('background-color: var(--op-on)') && kit.includes('translate: 16px 0;'));
ok('type scale: page title Garamond 32, card heading Garamond 20, dialog title 24', kit.includes('h1.font-serif { font-size: 32px;') && kit.includes('font-family: var(--font-serif); font-size: 20px;') && kit.includes('font-size: 24px;'));
ok('panels: solid with a 10px radius; a featured card is raised', kit.includes('.bg-white.shadow-card:not(.op-tab) { border-radius: var(--r-panel);') && kit.includes('.op-raised'));
ok('the spring is only on dialogs and sheets (never on a tap or a panel)', !/var\(--spring\)/.test(kit.replace(/animation: op-dialog-in var\(--t-dialog\) var\(--spring\) both;/g, '')) );
const statusSrc = readFileSync('src/components/ui/StatusDot.tsx', 'utf8');
ok('status words: the word in its colour, no dot beside it, a soft red fill for the red states', statusSrc.includes("status === 'bad' ? ' px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--color-bad)_18%,transparent)]'") && !statusSrc.includes('RING'));
const toastSrc = readFileSync('src/components/dashboard/Toast.tsx', 'utf8');
ok('the toast: top-right glass with a coloured left edge', toastSrc.includes('fixed z-[60] top-16 right-4') && toastSrc.includes('op-glass') && toastSrc.includes('border-l-[3px]') && toastSrc.includes('border-l-ok') && toastSrc.includes('border-l-bad'));
const tabsSrc = readFileSync('src/components/dashboard/SlidingTabs.tsx', 'utf8');
ok('tabs: an underline, 2px green, a 40px tab', tabsSrc.includes('h-0.5 bg-[var(--op-focus,var(--color-fairway))]') && tabsSrc.includes('h-10 px-4'));
ok('the admin is the dashboard\'s look: the ribbon across the top, the rail below it', adminCss.includes('background: #1E1E1E;') && adminCss.includes('.rail { top: var(--admin-topbar-h); }') && css.includes('--admin-topbar-h: 3rem'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
