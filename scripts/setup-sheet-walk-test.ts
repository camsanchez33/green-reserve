// Cam 2026-10-26 onboarding walk, the setup sheet: a recap on the done screen and in
// the confirmation email (one builder), days-open that means what it says, the
// cancellation wording matching hold-at-cutoff, $0 placeholders, and the link
// reopening at the step last worked on. Run: npx tsx scripts/setup-sheet-walk-test.ts
import { readFileSync } from 'fs';
import { sheetRecap, SHEET_NEXT_STEPS } from '../src/lib/setup-sheet-recap';

let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

const r = Object.fromEntries(sheetRecap({
  holes: '18', par: '72', daysOpen: [], firstTeeTime: '07:00', lastTeeTime: '17:00', intervalMinutes: '10', publicAdvanceDays: '14',
  greenFeeWeekday: '52', greenFeeWeekend: '68', cartFee: '20', walkingAllowed: 'weekdays', nineHoleSupport: 'yes', nineHoleWhich: 'both', nineHoleFee: '30',
  cancellationPolicy: 'yes', cancellationHours: '24', lateFee: '25',
  passes: [{ name: 'Full Member', fee: '1800', feePeriod: 'annual' }], facilitiesV2: { range: true, restaurantType: 'full' },
}).map(x => [x.label, x.value]));
ok('no days picked reads "Every day"', r['Tee times'] === 'Every day, 7:00 am to 5:00 pm, every 10 minutes', r['Tee times']);
ok('fees and nines in plain words', r['Green fees'] === '$52 weekdays, $68 weekends' && r['9 holes'] === 'Either nine, $30', r);
ok('memberships from the current passes list, with a thousands comma', r['Membership'] === 'Full Member ($1,800 a year)', r['Membership']);
ok('cancellations say it is a hold refunded at check-in', /hold per booking, refunded at check-in/.test(r['Cancellations']), r['Cancellations']);
ok('facility and food labels', r['Facilities'] === 'Driving range, Restaurant' && r['Walking'] === 'Weekdays only', r);
const legacy = Object.fromEntries(sheetRecap({ schedule: { startTime: '06:30', endTime: '18:00', intervalMinutes: '9', greenFeeWeekday: '40' }, daysOpen: [1, 2, 3], memberships: [{ name: 'Senior', fee: '900' }] }).map(x => [x.label, x.value]));
ok('an old-format sheet still reads', legacy['Tee times'] === 'Mon, Tue, Wed, 6:30 am to 6:00 pm, every 9 minutes' && legacy['Membership'] === 'Senior ($900 a year)', legacy);
ok('next steps run build → preview → login + agreement + Stripe → live', SHEET_NEXT_STEPS.length === 4 && /preview/i.test(SHEET_NEXT_STEPS[1]) && /Stripe/.test(SHEET_NEXT_STEPS[2]));

const page = readFileSync('src/app/for-courses/details/page.tsx', 'utf8');
ok('days left blank are not refused', !page.includes("'Pick the days you are open.'"));
ok('the explainer no longer says nothing is charged until tee time', !/<p>[^<]*nothing is charged until tee time/.test(page) && page.includes('the fee is charged to every booking that&apos;s still on'));
ok('no example price looks like a real one', !/placeholder="[1-9]\d*\.\d\d"/.test(page));
ok('"Select an option above" appears once', (page.match(/Select (an option|Yes or No) above to continue/g) ?? []).length === 1);
ok('the step is saved with the answers and restored from the server first', page.includes('_lastSection: sections[activeIdx + 1]?.id') && page.includes('sections.findIndex(sec => sec.id === resumeSection)'));
ok('every card is the soft card (no ruled white boxes)', !/bg-white rounded-lg[^"]*border border-line|rounded-lg border border-line/.test(page) && !page.includes('bg-paper border border-line rounded-md p-4'));
ok('the done screen keeps the header and shows the recap', /if \(submitted\) \{[\s\S]{0,400}<PlainHeader \/>[\s\S]{0,2000}sheetRecap/.test(page) || (page.includes('const recap = sheetRecap(') && page.includes('Your setup sheet is in.')));
const email = readFileSync('src/lib/email.ts', 'utf8');
const conf = email.slice(email.indexOf('export async function sendDetailsSheetConfirmationEmail'), email.indexOf('// CG-1 (Cam 2026-09-29)'));
ok('the confirmation email uses the same recap and next steps', conf.includes('sheetRecap(data.details)') && conf.includes('SHEET_NEXT_STEPS') && !conf.includes('DETAIL_LABELS'));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('setup-sheet-walk: all passed');
