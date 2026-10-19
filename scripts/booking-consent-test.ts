// Cam 2026-10-19: golfers agree by ticking a box (clickwrap), never by pressing
// Confirm. Nothing books until it is ticked — card form, Apple/Google Pay, or a
// no-card course. Source guards. Run: npx tsx scripts/booking-consent-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const c = readFileSync('src/app/book/BookClient.tsx', 'utf8');
const r = readFileSync('src/app/api/bookings/route.ts', 'utf8');
check('an unticked checkbox, starting false', c.includes('const [agreed, setAgreed] = useState(false);') && c.includes('type="checkbox" checked={agreed}'));
check('it names the Terms, the Privacy Policy, the course’s policy and that booking history is kept', c.includes('Terms of Service</a> and <a href="/privacy"') && c.includes('keep my booking history'));
check('Confirm is disabled until ticked', c.includes('disabled={loading || !agreed ||'));
check('handleSubmit refuses without it', c.includes("if (!agreed) { setError('Tick the box to agree"));
check('Apple Pay / Google Pay only appear once ticked, and refuse without it', c.includes('{walletRequest && agreed && (') && c.includes("if (!f.agreed) { ev.complete('fail');"));
check('the request carries the real answer, not a hard-coded true', c.includes('termsAccepted: latest.current.agreed === true') && !c.includes('termsAccepted: true'));
check('the old "By confirming, you agree" line is gone', !c.includes('By confirming, you agree'));
check('the server still refuses a booking without it and records the version', r.includes('if (termsAccepted !== true)') && r.includes('termsVersion:     CURRENT_TERMS_VERSION'));
const m = readFileSync('src/app/manage/[bookingId]/page.tsx', 'utf8');
check('changing a booking also needs the tick (it re-stamps consent)', !m.includes('By confirming, you agree') && !m.includes('termsAccepted: true') && (m.match(/termsAccepted: agreed/g) || []).length === 2 && m.includes('disabled={swapping || !agreed}') && m.includes('|| !agreed}'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
