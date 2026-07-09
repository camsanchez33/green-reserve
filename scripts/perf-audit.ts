/**
 * scripts/perf-audit.ts
 * Lighthouse performance audit against golfer-facing pages.
 *
 * Usage:
 *   AUDIT_BASE_URL=https://greenreserve.app npx tsx scripts/perf-audit.ts
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

// Pages to audit. /book shows an error-state shell with dummy params — fine for perf.
const PAGES = [
  { name: 'Home', path: '/' },
  { name: 'For Courses', path: '/for-courses' },
  { name: 'Course Page', path: '/courses/daisylinks' },
  { name: 'Booking Flow', path: '/book?tee_time_id=dummy&course_slug=daisylinks&date=2026-07-10&players=2' },
];

// Budgets — must ALL pass
const BUDGETS = {
  performance: 85,   // score 0-100
  lcp: 2500,         // ms
  tbt: 300,          // ms
  cls: 0.10,         // unitless
};

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

async function main() {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  let anyFailed = false;

  try {
    for (const page of PAGES) {
      const url = BASE + page.path;
      process.stdout.write(`\n=== ${page.name} ===\n${url}\n`);

      let lhr: Awaited<ReturnType<typeof auditPage>>;
      try {
        lhr = await auditPage(url, chrome);
      } catch (e) {
        console.error(`  ERROR: ${(e as Error).message}`);
        anyFailed = true;
        continue;
      }

      const cats = lhr.categories;
      const audits = lhr.audits;

      const perf = Math.round((cats['performance']?.score ?? 0) * 100);
      const lcp = (audits['largest-contentful-paint']?.numericValue ?? 9999) as number;
      const tbt = (audits['total-blocking-time']?.numericValue ?? 9999) as number;
      const cls = (audits['cumulative-layout-shift']?.numericValue ?? 9999) as number;

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
