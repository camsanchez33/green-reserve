// SEC-4 (Cam 2026-11-18: "Allow it until Dec 15"). The Package flaws gate:
// runs `npm audit --omit=dev --json` and fails on any high or critical advisory
// not in .github/audit-allowlist.json, on an expired or malformed entry, and on
// any audit result it cannot read. Logic: scripts/audit-gate-lib.mjs.
// Run: node scripts/audit-gate.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluate } from './audit-gate-lib.mjs';

function runAudit() {
  // --offline=false: an offline npm config returns an empty, "clean" report.
  // cwd: always audit this project, wherever the caller's shell is.
  const args = ['audit', '--omit=dev', '--json', '--offline=false'];
  try {
    return execFileSync('npm', args, { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 5 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // npm audit exits 1 whenever it finds anything; its JSON is still on stdout.
    if (err && typeof err.stdout === 'string' && err.stdout.trim()) return err.stdout;
    throw err;
  }
}

let audit, allowlist;
try {
  audit = JSON.parse(runAudit());
  allowlist = JSON.parse(readFileSync(new URL('../.github/audit-allowlist.json', import.meta.url), 'utf8'));
} catch (err) {
  console.error('FAIL  could not run npm audit or read the allowlist:', err && err.message ? err.message : err);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
const { ok, problems, allowed } = evaluate(audit, allowlist, today);
for (const a of allowed) console.log('ALLOWED  ' + a);
for (const p of problems) console.log('FAIL  ' + p);
console.log(ok ? '\nPackage flaws gate: PASS' : `\nPackage flaws gate: ${problems.length} problem(s)`);
process.exit(ok ? 0 : 1);
