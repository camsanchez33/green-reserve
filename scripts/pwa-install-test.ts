// PWA install (Cam 2026-11-24): the install criteria, checked by Lighthouse 11 (the last version with the PWA audits;
// the repo's own Lighthouse gate, perf-audit.yml, is untouched and stays on its version). Runs pinned
// lighthouse@11.7.1 through npx against a local `next start`, on the dashboard's and the admin's sign-in pages (the
// pages a signed-out browser lands on; both carry the manifest and register the worker).
//   TEST_URL=http://localhost:3100 CHROME_PATH=/path/to/chrome npx tsx scripts/pwa-install-test.ts
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const BASE = (process.env.TEST_URL || 'http://localhost:3100').replace(/\/$/, '');
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) { console.error('pwa-install: local app only'); process.exit(1); }
const LIGHTHOUSE = 'lighthouse@11.7.1';
const AUDITS = ['installable-manifest', 'maskable-icon', 'themed-omnibox', 'splash-screen'];

let failed = 0;
const check = (name: string, ok: boolean, got?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || got === undefined ? '' : `  got: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

const dir = mkdtempSync(join(tmpdir(), 'pwa-lh-'));
for (const path of ['/dashboard/login', '/admin/login']) {
  const out = join(dir, path.replace(/\W+/g, '_') + '.json');
  try {
    execFileSync('npx', ['-y', LIGHTHOUSE, BASE + path, `--only-audits=${AUDITS.join(',')}`, '--output=json', `--output-path=${out}`, '--quiet',
      '--chrome-flags=--headless=new --no-sandbox --disable-gpu'], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env, timeout: 240_000 });
  } catch (e) {
    check(`${path}: Lighthouse ran`, false, e instanceof Error ? e.message : String(e));
    continue;
  }
  const lhr = JSON.parse(readFileSync(out, 'utf8'));
  check(`${path}: Lighthouse 11`, String(lhr.lighthouseVersion).startsWith('11.'), lhr.lighthouseVersion);
  for (const id of AUDITS) {
    const a = lhr.audits[id];
    const why = a?.details?.items?.map((i: { reason?: string }) => i.reason).filter(Boolean) ?? a?.explanation;
    check(`${path}: ${id}`, a?.score === 1, why ?? a?.score);
  }
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
