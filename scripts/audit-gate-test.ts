// SEC-4 (Cam 2026-11-18): the Package flaws gate fails on any high or critical
// advisory not in .github/audit-allowlist.json, and on an expired, escalated or
// unmatched entry. Pure: the CLI test uses a fake npm, never the registry.
// Run: npx tsx scripts/audit-gate-test.ts
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, copyFileSync, symlinkSync, chmodSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-ignore plain .mjs, no types
import { evaluate, isDay } from './audit-gate-lib.mjs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

type V = { severity: string; via: unknown[] };
const adv = (id: string, severity: string) => ({ source: 1, title: 't', url: `https://github.com/advisories/${id}`, severity });
// A well-formed npm audit v2 report whose counts match its list (as npm builds it).
const report = (vulns: Record<string, V>) => {
  const counts: Record<string, number> = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const v of Object.values(vulns)) counts[v.severity]++;
  return { auditReportVersion: 2, vulnerabilities: vulns, metadata: { vulnerabilities: { ...counts, total: Object.keys(vulns).length } as Record<string, number> } };
};
const list = (entries: unknown[]) => ({ entries });
const pico = { id: 'GHSA-fc5q-39xc-vjpf', package: 'picomatch', severity: 'high', expires: '2026-12-15', reason: 'r', approved: 'Cam 2026-11-18' };
const HIGH = report({ picomatch: { severity: 'high', via: [adv('GHSA-fc5q-39xc-vjpf', 'high')] }, fdir: { severity: 'high', via: ['picomatch'] } });
const OTHER = (sev: string) => ({ x: { severity: sev, via: [adv('GHSA-aaaa-bbbb-cccc', sev)] } });
const T = '2026-11-18';

check('clean audit passes', evaluate(report({}), list([]), T).ok);
check('unlisted high fails', !evaluate(HIGH, list([]), T).ok);
check('unlisted critical fails', !evaluate(report(OTHER('critical')), list([]), T).ok);
check('moderate never fails', evaluate(report(OTHER('moderate')), list([]), T).ok);
check('listed high passes before expiry', evaluate(HIGH, list([pico]), T).ok);
check('listed high passes on the expiry day', evaluate(HIGH, list([pico]), '2026-12-15').ok);
check('expired entry fails with the advisory present', !evaluate(HIGH, list([pico]), '2026-12-16').ok);
check('expired entry fails when no longer needed', !evaluate(report({}), list([pico]), '2026-12-16').ok);
check('unexpired entry that matches nothing fails (empty audit is not clean)', !evaluate(report({}), list([pico]), T).ok);
check('allowlist covers only its own id', !evaluate(report({ picomatch: { severity: 'high', via: [adv('GHSA-fc5q-39xc-vjpf', 'high'), adv('GHSA-aaaa-bbbb-cccc', 'high')] } }), list([pico]), T).ok);
check('the same GHSA on another package is not covered', !evaluate(report({ 'left-pad': { severity: 'high', via: [adv('GHSA-fc5q-39xc-vjpf', 'high')] } }), list([pico]), T).ok);
check('advisory re-rated above the approved severity fails', !evaluate(report({ picomatch: { severity: 'critical', via: [adv('GHSA-fc5q-39xc-vjpf', 'critical')] } }), list([pico]), T).ok);
check('entry without reason or approval fails', !evaluate(HIGH, list([{ id: pico.id, package: pico.package, severity: 'high', expires: pico.expires }]), T).ok);
check('entry without a package fails', !evaluate(HIGH, list([{ ...pico, package: undefined }]), T).ok);
check('entry without a severity fails', !evaluate(HIGH, list([{ ...pico, severity: undefined }]), T).ok);
check('entry with a bad date fails', !evaluate(HIGH, list([{ ...pico, expires: 'Dec 15' }]), T).ok);
check('impossible date fails', !evaluate(HIGH, list([{ ...pico, expires: '2026-12-99' }]), T).ok && !isDay('2026-02-30') && isDay('2026-12-15'));
check('allowlist id in URL or upper-case form still matches', evaluate(HIGH, list([{ ...pico, id: 'https://github.com/advisories/GHSA-FC5Q-39XC-VJPF' }]), T).ok);
check('npm error result fails', !evaluate({ error: { code: 'ENOTFOUND' } }, list([]), T).ok);
check('missing vulnerabilities key fails', !evaluate({ auditReportVersion: 2 }, list([]), T).ok);
check('unknown report version fails', !evaluate({ ...report({}), auditReportVersion: 3 }, list([]), T).ok);
check('vulnerabilities as an array fails', !evaluate({ ...report({}), vulnerabilities: [] }, list([]), T).ok);
check('missing metadata counts fail', !evaluate({ auditReportVersion: 2, vulnerabilities: {} }, list([]), T).ok);
check('missing entries array fails', !evaluate(report({}), {}, T).ok);
check('bad or missing today fails', !evaluate(report({}), list([]), '').ok && !evaluate(report({}), list([]), undefined).ok);
check('advisory without its own severity takes the package severity', !evaluate(report({ x: { severity: 'high', via: [{ source: 1, title: 't', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }] } }), list([]), T).ok);
check('high package with only string via and no advisory fails', !evaluate(report({ x: { severity: 'high', via: ['y'] } }), list([]), T).ok);
check('advisory without a GHSA url cannot be allowlisted', !evaluate(report({ x: { severity: 'high', via: [{ source: 9, title: 't', severity: 'high' }] } }), list([pico]), T).ok);
check('severity named after an Object property is rejected', !evaluate(report(OTHER('critical')), list([{ ...pico, id: 'GHSA-aaaa-bbbb-cccc', package: 'x', severity: 'constructor' }]), T).ok);
check('the same GHSA twice on one package keeps the higher rating', !evaluate(report({ picomatch: { severity: 'critical', via: [adv('GHSA-fc5q-39xc-vjpf', 'high'), adv('GHSA-fc5q-39xc-vjpf', 'critical')] } }), list([pico]), T).ok);
check('a critical package explained only by a high advisory fails', !evaluate(report({ picomatch: { severity: 'high', via: [adv('GHSA-fc5q-39xc-vjpf', 'high')] }, dep: { severity: 'critical', via: ['picomatch'] } }), list([pico]), T).ok);
const inflated = (h: number, c: number) => { const r = report(HIGH.vulnerabilities as Record<string, V>); r.metadata.vulnerabilities.high += h; r.metadata.vulnerabilities.critical += c; return r; };
check('critical count with no critical listed fails even with an allowed advisory', !evaluate(inflated(0, 2), list([pico]), T).ok);
check('high count above the list fails even with an allowed advisory', !evaluate(inflated(1, 0), list([pico]), T).ok);

// CLI, with a fake npm (no registry): run through a symlinked path from another
// directory. The fake answers with the picomatch advisory only when the gate
// passes --omit=dev --json --offline=false AND runs in the project directory;
// otherwise it answers with an empty clean report, which the entry then fails.
const root = mkdtempSync(join(tmpdir(), 'audit-gate-'));
try {
const proj = join(root, 'proj');
mkdirSync(join(proj, 'scripts'), { recursive: true }); mkdirSync(join(proj, '.github')); mkdirSync(join(root, 'bin')); mkdirSync(join(root, 'elsewhere'));
copyFileSync('scripts/audit-gate.mjs', join(proj, 'scripts/audit-gate.mjs'));
copyFileSync('scripts/audit-gate-lib.mjs', join(proj, 'scripts/audit-gate-lib.mjs'));
writeFileSync(join(root, 'high.json'), JSON.stringify(report({ picomatch: { severity: 'high', via: [adv('GHSA-fc5q-39xc-vjpf', 'high')] } })));
writeFileSync(join(root, 'clean.json'), JSON.stringify(report({})));
writeFileSync(join(root, 'bin/npm'), `#!/bin/sh
case " $* " in *" audit "*) ;; *) exit 2;; esac
case " $* " in *" --omit=dev "*) ;; *) cat "${root}/clean.json"; exit 0;; esac
case " $* " in *" --json "*) ;; *) cat "${root}/clean.json"; exit 0;; esac
case " $* " in *" --offline=false "*) ;; *) cat "${root}/clean.json"; exit 0;; esac
if [ "$(pwd -P)" = "$(cd "${proj}" && pwd -P)" ]; then cat "${root}/high.json"; exit 1; fi
cat "${root}/clean.json"; exit 0
`);
chmodSync(join(root, 'bin/npm'), 0o755);
symlinkSync(proj, join(root, 'link'));
const runCli = () => spawnSync('node', [join(root, 'link', 'scripts/audit-gate.mjs')], { cwd: join(root, 'elsewhere'), encoding: 'utf8', env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` } });
// A fixture, not the checked-in file: the CLI uses the real clock, and the
// checked-in entry expiring must turn the Security gate red, not this test.
writeFileSync(join(proj, '.github/audit-allowlist.json'), JSON.stringify({ entries: [{ ...pico, expires: '2999-12-31' }] }));
const good = runCli();
check('CLI (symlinked, other cwd) audits this project offline=false and allows picomatch', good.status === 0 && good.stdout.includes('ALLOWED') && good.stdout.includes('PASS'));
writeFileSync(join(proj, '.github/audit-allowlist.json'), JSON.stringify({ entries: [{ ...pico, expires: '2000-01-01' }] }));
const expired = runCli();
check('CLI fails on an expired entry', expired.status === 1 && expired.stdout.includes('expired on 2000-01-01'));
writeFileSync(join(proj, '.github/audit-allowlist.json'), JSON.stringify({ entries: [] }));
const unlisted = runCli();
check('CLI fails on an unlisted high', unlisted.status === 1 && unlisted.stdout.includes('high: picomatch'));
} finally {
  rmSync(root, { recursive: true, force: true });
}

const file = JSON.parse(readFileSync('.github/audit-allowlist.json', 'utf8'));
// 2026-11-18: npm's audit stopped reporting GHSA-fc5q-39xc-vjpf for picomatch 4.0.5 (withdrawn or re-scoped upstream;
// already stale on main, independent of the Sentry 11.14 bump), so the entry was removed. A new entry needs Cam;
// this check then changes with it, in the same PR.
check('checked-in allowlist is empty', Array.isArray(file.entries) && file.entries.length === 0);
const wf = readFileSync('.github/workflows/security.yml', 'utf8');
check('workflow runs the gate', wf.includes('node scripts/audit-gate.mjs') && !/run: npm audit --omit=dev --audit-level=high\b/.test(wf));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
