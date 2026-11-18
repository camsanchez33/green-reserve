// Analytics → Reviews (Cam 2026-11-17): the monthly report PDF. The By-area figures and changes, a real PDF
// rendered from a stored review, and that the download route is gated, course-scoped and never serves a
// failed draft. No database. Run: npx tsx scripts/monthly-report-pdf-test.ts
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { buildSync } from 'esbuild';
import { areaValue, areaChange } from '../src/lib/report-figures';
import { pdfText } from '../src/lib/report-figures';
import { byAreaOf } from '../src/lib/monthly-review';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

(async () => {
  ok('money prints in whole dollars', areaValue('cents', 11428012) === '$114,280');
  ok('a rate prints as a percent', areaValue('pct', 2.8) === '2.8%');
  ok('a count prints with commas', areaValue('count', 2412) === '2,412');
  ok('nothing prints as a dash', areaValue('count', null) === '—');
  ok('a rate changes in points', areaChange({ key: 'no_show_rate', label: '', unit: 'pct', thisMonth: 2.8, lastMonth: 2.2 }) === '+0.6 pts');
  ok('money changes in percent', areaChange({ key: 'revenue', label: '', unit: 'cents', thisMonth: 11428000, lastMonth: 10204000 }) === '+12%');
  ok('a fall shows a minus', areaChange({ key: 'rounds', label: '', unit: 'count', thisMonth: 90, lastMonth: 100 }) === '−10%');
  ok('no month before, no change', areaChange({ key: 'rounds', label: '', unit: 'count', thisMonth: 90, lastMonth: null }) === '—' && areaChange({ key: 'rounds', label: '', unit: 'count', thisMonth: 90, lastMonth: 0 }) === '—');

  ok('pdfText: the true minus (no Helvetica glyph) prints as a hyphen; dashes and bullets are left', pdfText('−10% and −4.5 pts') === '-10% and -4.5 pts' && pdfText('a — b • c') === 'a — b • c');
  const h = { roundsPlayed: 120, fillPct: 64, noShowPct: 2.8 } as Parameters<typeof byAreaOf>[0]['h'];
  const l = { grossCents: 500000, refundsCents: 0, teeCartCents: 400000, proShopCents: 90000, rangeCents: 0, eventCents: 0, duesCents: 10000 };
  const area = byAreaOf({ h, l }, null);
  ok('By area: five rows, money from the ledger month', area.map(a => a.key).join() === 'rounds,fill,revenue,no_show_rate,pro_shop' && area.find(a => a.key === 'revenue')?.thisMonth === 500000 && area.find(a => a.key === 'pro_shop')?.thisMonth === 90000 && area.every(a => a.lastMonth === null), area);

  // @react-pdf/renderer only loads as ESM (Next loads it that way; tsx's CommonJS can't), so the real component is
  // compiled with esbuild and rendered in a child Node process.
  // Under node_modules (git-ignored) so the ESM import finds the packages.
  mkdirSync(resolve('node_modules/.cache'), { recursive: true });
  const dir = mkdtempSync(resolve('node_modules/.cache/reportpdf-'));
  buildSync({ entryPoints: ['src/lib/monthly-report-pdf.tsx'], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: join(dir, 'pdf.mjs'), logLevel: 'silent', absWorkingDir: process.cwd() });
  const input = {
    full: { courseName: 'Pine Hollow', monthLabel: 'October 2026', lastMonthLabel: 'September 2026', review: { verdict: 'October was the strongest month.', wentWell: ['Weekend mornings sold out.'], fellShort: ['Weekday afternoons fell −12%.'], recommendations: ['Try a twilight rate.'] },
      // A fall: rounds 90 against 100, fill 60% against 64.5%.
      byArea: byAreaOf({ h: { ...h, roundsPlayed: 90, fillPct: 60 }, l }, { h: { ...h, roundsPlayed: 100, fillPct: 64.5 }, l }) },
    old: { courseName: 'Pine Hollow', monthLabel: 'September 2026', lastMonthLabel: null, review: { verdict: 'A quiet month.', wentWell: [], fellShort: [], recommendations: [] }, byArea: null },
  };
  writeFileSync(join(dir, 'run.mjs'), `import { renderMonthlyReportPdf } from './pdf.mjs';
const input = ${JSON.stringify(input)};
const out = {};
import { writeFileSync } from 'fs';
for (const [k, v] of Object.entries(input)) { const b = await renderMonthlyReportPdf(v); writeFileSync(new URL('./' + k + '.pdf', import.meta.url), b); out[k] = { head: b.subarray(0, 5).toString(), size: b.length }; }
console.log(JSON.stringify(out));`);
  const run = spawnSync(process.execPath, [join(dir, 'run.mjs')], { encoding: 'utf8', cwd: process.cwd() });
  // What the PDF shows, when poppler's pdftotext is on the machine (it is in the dev container; CI may not have it).
  const txt = spawnSync('pdftotext', ['-layout', join(dir, 'full.pdf'), '-'], { encoding: 'utf8' });
  if (txt.status === 0) {
    ok('the PDF prints a fall with its minus: rounds -10%, fill -4.5 pts, and the model\'s own −12% as -12%', txt.stdout.includes('-10%') && txt.stdout.includes('-4.5 pts') && txt.stdout.includes('-12%'), txt.stdout.slice(0, 800));
  } else console.log('SKIP  pdftotext not installed: the printed-text check did not run');
  rmSync(dir, { recursive: true, force: true });
  let res: Record<string, { head: string; size: number }> = {};
  try { res = JSON.parse(run.stdout.trim().split('\n').pop() ?? '{}'); } catch { /* reported below */ }
  ok('renders a PDF', res.full?.head === '%PDF-' && res.full.size > 1000, { out: run.stdout, err: run.stderr.slice(0, 600) });
  ok('an older report (no By area, empty lists) still renders', res.old?.head === '%PDF-', res.old);

  const route = readFileSync('src/app/api/operator/monthly-reviews/[month]/pdf/route.ts', 'utf8');
  ok('PDF route: signed in, analytics.view', route.includes('resolveDashboardSession()') && route.includes("requirePermission(session, 'analytics.view')"));
  ok('PDF route: the session\'s course only', /where: \{ courseId: session\.courseId, month,/.test(route));
  ok('PDF route: never a failed draft', route.includes("status: { in: ['written', 'thin'] }"));
  ok('PDF route: a month, nothing else', route.includes('/^\\d{4}-(0[1-9]|1[0-2])$/'));
  ok('PDF route: never cached by a shared cache', route.includes("'Cache-Control': 'private, no-store'"));
  const list = readFileSync('src/app/api/operator/monthly-reviews/route.ts', 'utf8');
  ok('By area money rows only with money.payments, in the list and the PDF', [list, route].every(t => t.includes("can(session, 'money.payments')") && t.includes("a.unit === 'cents' ? { ...a, thisMonth: null, lastMonth: null } : a")));
  ok('the list gives By area and the PDF link', list.includes('byArea') && list.includes('/pdf'));
  const mr = readFileSync('src/lib/monthly-review.ts', 'utf8');
  ok('the review\'s money comes from the ledger', mr.includes('ledgerCovers(m) ? ledgerMonth(courseId, tz, m, now)') && readFileSync('src/lib/analytics-page.ts', 'utf8').includes('allSegments(courseId, tz, r, previousRange(r), now)') && !mr.includes('collectedDollars') && !mr.includes('outstandingCents') && !mr.includes('impactCents'));

  if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
  console.log('\nall passed');
})().catch(e => { console.error(e); process.exit(1); });
