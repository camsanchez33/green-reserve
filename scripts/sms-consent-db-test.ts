// SMS-1 (Cam 2026-11-02, Twilio A2P 10DLC — docs/SMS_OPT_IN.md):
//  1. the consent record: opt-in / opt-out rows, the latest decides, a repeat records nothing;
//  2. sendSms() refuses a number that never agreed (before any network call);
//  3. the Twilio reply webhook: unsigned → 403; STOP → opt_out; START → opt_in + confirmation; HELP → the help text;
//  4. every place a phone comes in asks properly: an unticked box on the web forms, the verbal script + "They said yes" for staff;
//  5. Terms / Privacy say "up to 4 messages per booking", and the table is in the launch wipe.
// Needs a database. Run: npx tsx scripts/sms-consent-db-test.ts
import { readFileSync } from 'fs';
import twilio from 'twilio';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { recordSmsConsent, hasSmsConsent, consentedPhones, consentPhone } from '../src/lib/sms-consent';
import { SMS_HELP, SMS_CONFIRMATION, smsKeyword, SMS_FREQUENCY } from '../src/lib/sms-consent-copy';
import { WIPED_TABLES } from '../src/lib/data-reset';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
// 212-555-02xx: outside the fictional 555-01xx block sendSms skips, never a real line in tests (no Twilio creds here).
const A = '+12125550201', B = '+12125550202', C = '(212) 555-0203';
const PHONES = [A, B, '+12125550203'];

async function cleanup() { await prisma.smsConsent.deleteMany({ where: { phone: { in: PHONES } } }); }

async function main() {
  await cleanup();

  // 1. the record
  ok('a 10-digit number normalises to E.164', consentPhone(C) === '+12125550203' && consentPhone('12') === null);
  ok('no row → no consent', !(await hasSmsConsent(A)));
  ok('an opt-in is recorded and changes the state', await recordSmsConsent(A, 'opt_in', { method: 'web_booking' }));
  ok('…and now the number has consent', await hasSmsConsent(A));
  ok('a second opt-in records nothing (no second confirmation text)', !(await recordSmsConsent(A, 'opt_in', { method: 'verbal', recordedBy: 'staff1' })));
  ok('one row so far', (await prisma.smsConsent.count({ where: { phone: A } })) === 1);
  ok('STOP turns it off', await recordSmsConsent(A, 'opt_out', { method: 'sms_reply' }) && !(await hasSmsConsent(A)));
  await recordSmsConsent(C, 'opt_in', { method: 'verbal', recordedBy: 'staff1', courseId: null });
  const row = await prisma.smsConsent.findFirst({ where: { phone: '+12125550203' } });
  ok('a verbal yes stores who recorded it and the wording version', row?.method === 'verbal' && row.recordedBy === 'staff1' && !!row.wording);
  const set = await consentedPhones([A, B, C, 'nonsense']);
  ok('consentedPhones: only the latest opt-ins', set.has('+12125550203') && !set.has(A) && !set.has(B), [...set]);

  // 2. the send gate (dummy creds: the consent check runs before any network call)
  process.env.TWILIO_ACCOUNT_SID = 'ACtest'; process.env.TWILIO_AUTH_TOKEN = 'testtoken'; process.env.TWILIO_FROM_NUMBER = '+15005550006';
  const { sendSms, SmsNoConsentError } = await import('../src/lib/twilio');
  let refused: unknown = null;
  try { await sendSms(B, 'hello', { kind: 'test' }); } catch (e) { refused = e; }
  ok('sendSms refuses a number that never agreed', refused instanceof SmsNoConsentError, String(refused));
  const logged = await prisma.sentMessage.findFirst({ where: { to: B, kind: 'test' }, orderBy: { createdAt: 'desc' } });
  ok('…and the send log says why (no body stored)', logged?.status === 'skipped' && logged.error === 'no text consent');
  await prisma.sentMessage.deleteMany({ where: { to: B, kind: 'test' } });

  // 3. the webhook
  process.env.NEXT_PUBLIC_URL = 'https://greenreserve.test';
  const url = 'https://greenreserve.test/api/twilio/inbound';
  const { POST } = await import('../src/app/api/twilio/inbound/route');
  const call = async (params: Record<string, string>, sign = true) => {
    const sig = sign ? twilio.getExpectedTwilioSignature('testtoken', url, params) : 'bad';
    const res = await POST(new NextRequest(url, { method: 'POST', body: new URLSearchParams(params), headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig } }));
    return { status: res.status, text: await res.text() };
  };
  ok('an unsigned reply is refused and changes nothing', (await call({ From: B, Body: 'START' }, false)).status === 403 && !(await hasSmsConsent(B)));
  const start = await call({ From: B, Body: 'start' });
  ok('START opts in and answers with the enrollment confirmation', start.status === 200 && (await hasSmsConsent(B)) && start.text.includes(SMS_CONFIRMATION.slice(0, 40)));
  const stop = await call({ From: B, Body: ' Stop please' });
  ok('STOP opts out (first word, any case)', stop.status === 200 && !(await hasSmsConsent(B)));
  const help = await call({ From: B, Body: 'HELP' });
  ok('HELP answers with the help text and changes nothing', help.text.includes('support@greenreserve.app') && help.text.includes(SMS_FREQUENCY) && SMS_HELP.includes('STOP') && !(await hasSmsConsent(B)));
  ok('keywords read the first word only', smsKeyword('stop.') === 'STOP' && smsKeyword('  help me') === 'HELP' && smsKeyword('') === '');

  // 4. every door asks properly
  const book = read('src/app/book/BookClient.tsx');
  ok('booking form: its own text box, unticked, sent only with a full number', book.includes('const [smsOk, setSmsOk] = useState(false);') && book.includes("smsConsent: latest.current.smsOk === true && who.phone.replace(/\\D/g, '').length >= 10") && book.includes('smsWebConsentText(courseName)'));
  const bRoute = read('src/app/api/bookings/route.ts');
  ok('booking route records only an explicit true, after the response', bRoute.includes('if (smsConsent === true && golferPhone) {') && bRoute.includes("after(() => optInAndConfirm(consentPhoneRaw, { method: 'web_booking'"));
  const signup = read('src/app/events/[id]/SignupForm.tsx'), signupRoute = read('src/app/api/event-signup/[id]/route.ts');
  ok('event sign-up: the box is for the person signing up only', signup.includes('{i === 0 && p.phone') && signup.includes('useState(false)') && signupRoute.includes("method: 'web_event'") && signupRoute.includes('body.players[0]'));
  const ask = read('src/components/dashboard/SmsConsentAsk.tsx');
  ok('staff: the script is shown before the "They said yes" tick', ask.includes('smsVerbalScript(courseName)') && ask.includes('They said yes to texts'));
  const sheet = read('src/app/dashboard/page.tsx'), ops = read('src/app/api/operator/bookings/route.ts'), shop = read('src/app/api/operator/shop-sales/route.ts'), ev = read('src/app/api/operator/events/[id]/payments/route.ts');
  ok('walk-in form and the tee sheet pay link ask first', sheet.includes('const [smsYes, setSmsYes] = useState(false);') && sheet.includes('r.error === SMS_NO_CONSENT_STAFF') && sheet.includes('<SmsConsentDialog') && ask.includes('disabled={!yes || busy}'));
  // Final review 2026-11-02: a tick given for one number never carries over to another typed in its place.
  const shopPage = read('src/app/dashboard/shop/page.tsx'), evMoney = read('src/components/dashboard/events/EventMoney.tsx');
  ok('changing the phone clears "They said yes" (walk-in, register, event link)', sheet.includes('setPhone(e.target.value); setSmsYes(false);') && shopPage.includes('setSmsYes(false); }}') && evMoney.includes('payerPhone: e.target.value })); setSmsYes(false);'));
  ok('the text promise names only texts we send (no "confirmation" of the booking by text)', !read('src/lib/sms-consent-copy.ts').includes('the confirmation, a pay link'));
  ok('staff routes record a verbal yes against the login', [ops, shop, ev].every(s => s.includes("method: 'verbal'") && s.includes('recordedBy: ') && s.includes("smsConsent === 'verbal'")));
  ok('course notices text only numbers that agreed (preview too)', read('src/lib/golfer-messages.ts').includes('const list = await withTextConsent(') && read('src/app/api/operator/golfer-messages/route.ts').includes('.then(withTextConsent)'));
  ok('the webhook checks Twilio\'s signature', read('src/app/api/twilio/inbound/route.ts').includes('twilio.validateRequest(token, signature, url, params)'));

  // 5. the words and the wipe
  const terms = read('src/app/terms/page.tsx'), privacy = read('src/app/privacy/page.tsx');
  ok('Terms and Privacy give the figure, not "varies"', terms.includes('up to 4 messages per booking') && privacy.includes('up to 4 messages per booking') && !terms.includes('frequency varies'));
  ok('SmsConsent is wiped before launch', (WIPED_TABLES as readonly string[]).includes('SmsConsent'));

  await cleanup();
}

main().catch(e => { console.error(e); failed++; }).finally(async () => {
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
});
