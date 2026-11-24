// Security audit 2026-11-24 (M13): Next.js at or past 15.5.29, which fixes GHSA-f3mh-rxg3-f5g2
// (HttpOnly cookies exposed through a response header on Edge runtime routes: src/middleware.ts
// runs on Edge and reads gr_operator), GHSA-7qx7-33qx-rqx2 and GHSA-pc58-hwjq-p385. The CI
// package gate fails only on high advisories, so these moderate ones need their own floor.
// Run: npx tsx scripts/next-version-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`); if (!ok) failed++; };

const FLOOR = [15, 5, 29];
const parts = (v: string) => v.replace(/^[^\d]*/, '').split(/[.-]/).slice(0, 3).map(Number);
const atLeast = (v: string) => { const p = parts(v); for (let i = 0; i < 3; i++) { if (p[i] !== FLOOR[i]) return p[i] > FLOOR[i]; } return true; };

check('the floor check itself', atLeast('15.5.29') && atLeast('^15.6.0') && !atLeast('15.5.28') && !atLeast('^15.5.28'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
check('package.json asks for next ^15.5.29 or later', atLeast(pkg.dependencies.next), pkg.dependencies.next);
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const locked = lock.packages?.['node_modules/next']?.version;
check('package-lock.json resolves next at 15.5.29 or later', typeof locked === 'string' && atLeast(locked), locked);

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nNext.js version floor holds');
