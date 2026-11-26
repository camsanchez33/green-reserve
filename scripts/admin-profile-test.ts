// Settings → My profile (Cam approved the mockup 2026-11-15, lanes/admin.md "Approved, to build: Settings → My profile").
// Pins the page's helpers and the behaviour the re-skin must keep. Run: npx tsx scripts/admin-profile-test.ts
import { readFileSync } from 'fs';
import { shortDay, dayAndTime, changedOn, passkeyLine, deviceLine, codesLow, ROLE_LABELS } from '../src/app/admin/profile/logic';

let failed = 0;
const check = (name: string, ok: boolean, got?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || got === undefined ? '' : `  got: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

const now = new Date(2026, 10, 15, 12, 0);           // Nov 15 2026, local
const at = (y: number, m: number, d: number, h = 8, mi = 2) => new Date(y, m, d, h, mi).toISOString();

check('short day: no year this year', shortDay(at(2026, 9, 28), now) === 'Oct 28', shortDay(at(2026, 9, 28), now));
check('short day: year another year', shortDay(at(2025, 11, 31), now) === 'Dec 31, 2025', shortDay(at(2025, 11, 31), now));
check('short day: missing or junk is empty', shortDay(null, now) === '' && shortDay('nope', now) === '');
check('day and time: today', dayAndTime(at(2026, 10, 15, 8, 2), now) === 'today, 8:02 AM', dayAndTime(at(2026, 10, 15, 8, 2), now));
check('day and time: another day', dayAndTime(at(2026, 10, 13, 18, 40), now) === 'Nov 13, 6:40 PM', dayAndTime(at(2026, 10, 13, 18, 40), now));
check('changed: a date with the year, null hides the row', changedOn(at(2026, 9, 12)) === 'Oct 12, 2026' && changedOn(null) === null && changedOn(undefined) === null && changedOn('x') === null);
check('passkey line', passkeyLine(at(2026, 9, 28), at(2026, 10, 15, 8, 2), now) === 'Added Oct 28 · last used today, 8:02 AM'
  && passkeyLine(at(2026, 10, 2), at(2026, 10, 13, 18, 40), now) === 'Added Nov 2 · last used Nov 13'
  && passkeyLine(at(2026, 10, 2), null, now) === 'Added Nov 2 · never used', passkeyLine(at(2026, 10, 2), null, now));
check('device line', deviceLine(at(2026, 8, 30), at(2026, 9, 4, 11, 15), now) === 'Approved Sep 30 · last sign-in Oct 4, 11:15 AM'
  && deviceLine(at(2026, 8, 30), null, now) === 'Approved Sep 30', deviceLine(at(2026, 8, 30), null, now));
check('recovery codes go amber at two or fewer (as before)', codesLow(2) && !codesLow(3) && codesLow(0));
check('role labels', ROLE_LABELS.owner === 'Owner' && ROLE_LABELS.support === 'Support');

const read = (p: string) => readFileSync(p, 'utf8');
const page = read('src/app/admin/profile/page.tsx');
const keys = read('src/components/admin/OwnerPasskeysCard.tsx');
const devs = read('src/components/admin/OwnerDevicesCard.tsx');
const tf = read('src/components/admin/OwnerTwoFactorCard.tsx');
const soe = read('src/components/admin/OwnerSignOutEverywhere.tsx');

check('password: same route, same body, same checks and errors', /'\/api\/admin\/change-password'/.test(page) && /currentPassword: cpCurrent, newPassword: cpNew/.test(page)
  && /'Passwords do not match'/.test(page) && /'Must be at least 8 characters'/.test(page) && /'Network error'/.test(page) && /'Password updated'/.test(page));
check('password: closed by default, "Update password" opens it', /useState\(false\)/.test(page) && /setPwOpen\(true\)/.test(page));
check('password: the Changed row only shows with a known date', /\{changed && <ProfileRow>/.test(page));
check('owner security only for the owner', /\{isOwner && \(/.test(page) && /<OwnerPasskeysCard \/>/.test(page) && /mfaSession=\{session\.mfa === true\}/.test(page));
check('employee "Request a change" hidden until the contact page exists', /EMPLOYEE_CONTACT_HREF: string \| null = null/.test(page) && /!isOwner && EMPLOYEE_CONTACT_HREF/.test(page));
check('passkeys: step-up fetch, options → add, delete', /stepUpFetch\('\/api\/admin\/passkeys'/.test(keys) && /action: 'options'/.test(keys) && /action: 'add'/.test(keys) && /call\('DELETE', \{ id: k\.id \}\)/.test(keys));
check('passkeys: plus disabled until the app is set up', /disabled=\{!appSetUp/.test(keys) && /'Waiting for your device…'|>Waiting for your device…</.test(keys));
check('devices: step-up fetch, removing this device signs out to /cam', /stepUpFetch\('\/api\/admin\/owner-devices'/.test(devs) && /signedOut\) \{ window\.location\.assign\('\/cam'\)/.test(devs));
check('removes confirm first', /if \(!await ask\(/.test(keys) && /if \(!await ask\(/.test(devs) && /if \(!await ask\(/.test(soe));
check('two-factor: start, confirm, regenerate on the same route', /'\/api\/admin\/two-factor'/.test(tf) && /action: 'start'/.test(tf) && /action: 'confirm', enrolToken: setup\.enrolToken, code/.test(tf) && /action: 'regenerate' \}/.test(tf)); // audit 2026-11-24 M6: the Confirm-it's-you dialog asks for the factor, not a code box
check('two-factor: links read as approved', /'Move to a new phone'/.test(tf) && /'Set up'/.test(tf) && />Make new codes</.test(tf) && /Copy all/.test(tf) && />I saved them</.test(tf));
check('sign out everywhere: same call', /'\/api\/admin\/logout'/.test(soe) && /everywhere: true/.test(soe) && /assign\('\/cam'\)/.test(soe));
check('no browser confirm() left', ![keys, devs, soe].some(f => /[^.\w]confirm\(/.test(f)));

const conf = read('src/components/admin/ProfileCard.tsx');
check('confirm dialog: focus starts on Cancel, Tab stays inside', /cancelRef\.current\?\.focus\(\)/.test(conf) && !/okRef\.current\?\.focus\(\);\n/.test(conf.split('const key')[0]) && /e\.key === 'Tab'/.test(conf));
check('Enter can fire a code or passkey call only once (no repeat, not while busy)',
  (tf.match(/e\.key === 'Enter' && !e\.repeat && !busy/g) || []).length === 1 && // M6: the regenerate code box is gone
   /e\.key === 'Enter' && !e\.repeat && busy === ''/.test(keys));
check('passkeys stay hidden until the authenticator app is set up (as before)', /\{appSetUp && keys && keys\.map/.test(keys));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
