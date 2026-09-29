/**
 * scripts/perf-audit.ts
 * Lighthouse performance audit against golfer-facing pages.
 *
 * Usage:
 *   AUDIT_BASE_URL=https://greenreserve.app node --experimental-strip-types scripts/perf-audit.ts  (Node 22; not tsx — see perf-audit.yml)
 *
 * Requires: npm install -D lighthouse tsx
 *
 * Budgets (fail = nonzero exit):
 *   Performance score ≥ 85
 *   LCP ≤ 2.5s  |  TBT ≤ 300ms  |  CLS ≤ 0.1
 *
 * Mobile emulation + simulated slow-4G throttling.
 */

import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import type { RunnerResult } from 'lighthouse';

const BASE = (process.env.AUDIT_BASE_URL || 'https://greenreserve.app').replace(/\/$/, '');

// PERF-1: 'daisylinks' is not a live course on production, so for months the
// "Course Page" row timed the not-found state (its CLS 0.181 was that page's).
// Set the repo variable AUDIT_COURSE_SLUG to a real live course.
const COURSE = process.env.AUDIT_COURSE_SLUG || 'daisylinks';

// Pages to audit. /book shows an error-state shell with dummy params — fine for perf.
const PAGES = [
  { name: 'Home', path: '/' },
  { name: 'For Courses', path: '/for-courses' },
  { name: 'Course Page', path: `/courses/${COURSE}` },
  { name: 'Booking Flow', path: `/book?tee_time_id=dummy&course_slug=${COURSE}&date=2026-07-10&players=2` },
];

// Budgets — must ALL pass
const BUDGETS = {
  performance: 85,   // score 0-100
  lcp: 2500,         // ms
  tbt: 300,          // ms
  cls: 0.10,         // unitless
};

// Median-of-N (PERF-4). AUDIT_RUNS overrides it for a quick local check.
const RUNS = Math.max(1, Number(process.env.AUDIT_RUNS) || 3);

async function auditPage(url: string, chrome: chromeLauncher.LaunchedChrome) {
  const result: RunnerResult | undefined = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance'],
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      disabled: false,
    },
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1474.56,
      uploadThroughputKbps: 675,
    },
    throttlingMethod: 'simulate',
  } as Parameters<typeof lighthouse>[1]);

  if (!result?.lhr) throw new Error('Lighthouse returned no result');
  return result.lhr;
}

type AuditMap = Record<string, { numericValue?: number; details?: { items?: Record<string, unknown>[] } } | undefined>;

function printDiagnostics(audits: AuditMap) {
  const ms = (v: unknown) => `${Math.round(Number(v) || 0)}ms`;
  const short = (u: unknown) => String(u ?? '').replace(BASE, '').slice(0, 90);
  const groups = (audits['mainthread-work-breakdown']?.details?.items ?? []).slice(0, 6);
  if (groups.length) console.log('    main thread: ' + groups.map(g => `${g.groupLabel ?? g.group} ${ms(g.duration)}`).join(' · '));
  const boot = (audits['bootup-time']?.details?.items ?? []).slice(0, 6);
  for (const b of boot) console.log(`    script ${short(b.url)}  total ${ms(b.total)}  scripting ${ms(b.scripting)}`);
  const tasks = (audits['long-tasks']?.details?.items ?? []).slice(0, 8);
  for (const t of tasks) console.log(`    long task ${ms(t.duration)} at ${ms(t.startTime)}  ${short(t.url)}`);
  const third = (audits['third-party-summary']?.details?.items ?? []).slice(0, 5);
  for (const t of third) console.log(`    third party ${String((t.entity as { text?: string } | undefined)?.text ?? t.entity)}  blocking ${ms(t.blockingTime)}`);
}

async function main() {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  let anyFailed = false;

  try {
    for (const page of PAGES) {
      const url = BASE + page.path;
      process.stdout.write(`\n=== ${page.name} ===\n${url}\n`);

      // PERF-4 (Cam 2026-09-29, option 1): each page is audited RUNS times and
      // judged on the MEDIAN of each metric — Lighthouse's own advice for CI.
      // One run swung Home's TBT from 443ms to 1798ms on identical code; the
      // budgets themselves are unchanged.
      const runs: Awaited<ReturnType<typeof auditPage>>[] = [];
      for (let i = 0; i < RUNS; i++) {
        try {
          runs.push(await auditPage(url, chrome));
        } catch (e) {
          console.error(`  run ${i + 1} ERROR: ${(e as Error).message}`);
        }
      }
      if (runs.length === 0) { anyFailed = true; continue; }

      const metric = (l: (typeof runs)[number]) => ({
        perf: Math.round((l.categories['performance']?.score ?? 0) * 100),
        lcp: (l.audits['largest-contentful-paint']?.numericValue ?? 9999) as number,
        tbt: (l.audits['total-blocking-time']?.numericValue ?? 9999) as number,
        cls: (l.audits['cumulative-layout-shift']?.numericValue ?? 9999) as number,
      });
      const all = runs.map(metric);
      const median = (xs: number[]) => { const v = [...xs].sort((x, y) => x - y); return v[Math.floor((v.length - 1) / 2)]; };
      const perf = median(all.map(m => m.perf));
      const lcp = median(all.map(m => m.lcp));
      const tbt = median(all.map(m => m.tbt));
      const cls = median(all.map(m => m.cls));
      console.log(`  ${runs.length} runs — TBT ${all.map(m => Math.round(m.tbt)).join(' / ')}ms · LCP ${all.map(m => (m.lcp / 1000).toFixed(2)).join(' / ')}s · score ${all.map(m => m.perf).join(' / ')}`);
      // Diagnostics come from the run whose TBT is the median one.
      const audits = runs[all.findIndex(m => m.tbt === tbt)].audits;

      const checks = [
        { name: 'Performance', pass: perf >= BUDGETS.performance, display: `${perf}`, budget: `≥${BUDGETS.performance}` },
        { name: 'LCP        ', pass: lcp <= BUDGETS.lcp,         display: `${(lcp / 1000).toFixed(2)}s`, budget: `≤${BUDGETS.lcp / 1000}s` },
        { name: 'TBT        ', pass: tbt <= BUDGETS.tbt,         display: `${Math.round(tbt)}ms`,        budget: `≤${BUDGETS.tbt}ms` },
        { name: 'CLS        ', pass: cls <= BUDGETS.cls,         display: cls.toFixed(3),                 budget: `≤${BUDGETS.cls}` },
      ];

      for (const c of checks) {
        const icon = c.pass ? '✓' : '✗';
        console.log(`  ${icon} ${c.name}  ${c.display.padStart(8)}  (budget ${c.budget})`);
        if (!c.pass) anyFailed = true;
      }
      // PERF-3: a failing page says WHERE the time went, so the fix is not a
      // guess. (Home failed TBT on CI only — 40ms locally, 1.1-1.8s here.)
      if (checks.some(c => !c.pass)) printDiagnostics(audits as unknown as AuditMap);
    }
  } finally {
    await chrome.kill();
  }

  if (anyFailed) {
    console.error('\nFAIL — one or more pages exceeded performance budget.\n');
    process.exit(1);
  }
  console.log('\nPASS — all budgets met.\n');
}

main().catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});
