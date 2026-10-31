// Cam 2026-10-27 (onboarding walk): onboarding step 1 walks the owner through
// their booking page part by part ("going page by page approving everything and
// giving feedback if needed"), and whatever is still missing is "pointed to
// finish setting up in settings on their homepage". Source checks for the
// client side; scripts/page-review-db-test.ts checks the data.
// Run: npx tsx scripts/onboarding-review-step-test.ts
import { readFileSync } from 'fs';
import { CHANGE_CATEGORIES } from '../src/lib/change-requests';
import { missingSetup, settingsHref } from '../src/lib/setup-missing';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const page = readFileSync('src/app/dashboard/onboarding/page.tsx', 'utf8');
const step = readFileSync('src/components/dashboard/onboarding/PageReviewStep.tsx', 'utf8');
const lib = readFileSync('src/lib/page-review.ts', 'utf8');

ok('step 1 is Review your page', /STEPS = \['Review your page', ?'Sign', ?'Connect payments', ?'Go live'\]/.test(page));
ok('…and it is the part-by-part review', page.includes('<PageReviewStep status={pageStatus} onStatus={setPageStatus} onAdvance={advance} />'));
ok('the course details form is gone (the sheet already has them)', !/saveDetails|teeSets|Course Details/.test(page));
ok('the parts load from the owner-only page-review route', step.includes("fetch('/api/operator/page-review')"));
const keys = [...lib.matchAll(/\{ key: '([a-z_]+)', title:/g)].map(m => m[1]);
ok('every part is a change-request category, so each note lands under the right heading', keys.length === 5 && keys.every(k => CHANGE_CATEGORIES.some(c => c.key === k)));
ok('each part asks Looks right / Change this, and a change needs a note', step.includes('>Looks right<') && step.includes('>Change this<') && step.includes('disabled={!note.trim()}'));
ok('all right approves the page; any change sends them as one request', step.includes("fetch('/api/operator/approve-page'") && step.includes("fetch('/api/operator/request-changes'") && step.includes('category: p.key, detail:'));
ok('the policy part is describePolicy, the only source of golfer policy wording', lib.includes('describePolicy(policyFrom(c))'));
ok('a missing logo, course photo or gallery photo can be added in the review', step.includes('kind="logo"') && step.includes('kind="hero"') && step.includes("fetch('/api/operator/photos', { method: 'POST'"));
ok('the done screen never claims payments are connected when they are not', page.includes("pageStatus === 'approved' && isConnected"));

// Finish setting up: one list for Settings, Home and the review.
const m = missingSetup({ logoUrl: '', heroImageUrl: 'x', description: 'd', phone: '1', holes: 18, par: 72, galleryCount: 0, teeSetCount: null });
ok('missing items read off real data (unloaded counts never report missing)', m.map(i => i.key).join() === 'logo,gallery');
ok('each links to its Settings section', settingsHref(m[0].section) === '/dashboard/settings?section=Your%20course');
const home = readFileSync('src/app/dashboard/home/page.tsx', 'utf8');
ok('Home shows Finish setting up, linking into Settings', home.includes('<FinishSetup items={home.setupMissing.map(') && home.includes('router.push(i.href ?? settingsHref(i.section))'));
ok('…only for logins that can edit settings', readFileSync('src/app/api/operator/home/route.ts', 'utf8').includes("setup: can(session, 'settings.edit')"));
ok('Settings reads the same list', readFileSync('src/app/dashboard/settings/page.tsx', 'utf8').includes('missingSetup({'));

// The dashboard banner says what is true after a decision.
const dash = readFileSync('src/app/dashboard/page.tsx', 'utf8');
ok('the not-live banner no longer says "until you approve" after approving', !dash.includes('golfers can&apos;t book until you approve the page') && dash.includes('You approved your page. We’ll check everything'));

if (failed) { console.error(`onboarding-review-step: ${failed} failed`); process.exit(1); }
console.log('onboarding-review-step: all passed');
