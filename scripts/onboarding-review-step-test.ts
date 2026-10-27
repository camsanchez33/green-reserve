// Cam 2026-10-27 (onboarding walk): "make review your page the first onboarding
// step" — step 1 no longer re-asks the setup sheet's details; it opens the
// course's own page and records approve / request changes through the same
// routes the dashboard's preview banner uses.
// Run: npx tsx scripts/onboarding-review-step-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const src = readFileSync('src/app/dashboard/onboarding/page.tsx', 'utf8');

ok('step 1 is Review your page', /STEPS = \['Review your page', ?'Sign', ?'Connect payments', ?'Go live'\]/.test(src));
ok('it opens the course\'s own preview link', src.includes("fetch('/api/operator/preview-link')"));
ok('approve goes through approve-page', src.includes("fetch('/api/operator/approve-page', { method: 'POST' })"));
ok('changes go through request-changes with the shared categories', src.includes("fetch('/api/operator/request-changes'") && src.includes('CHANGE_CATEGORIES.map'));
ok('the course details form is gone (the sheet already has them)', !/saveDetails|teeSets|Course Details/.test(src));
ok('approving needs the page opened first', src.includes('disabled={saving || !opened}'));
ok('the done screen never claims payments are connected when they are not', src.includes("pageStatus === 'approved' && isConnected"));

if (failed) { console.error(`onboarding-review-step: ${failed} failed`); process.exit(1); }
console.log('onboarding-review-step: all passed');
