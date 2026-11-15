// Support reply promise (Cam 2026-11-15): 2 business days skip US federal holidays as well as weekends (Eastern).
// Pure. Run: npx tsx scripts/business-days-test.ts
import { addBusinessDays, federalHolidays, isOffDay } from '../src/lib/business-days';
import { replyDueAt } from '../src/lib/support-ticket';

let failed = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => { if (cond) console.log('PASS ', name); else { failed++; console.log('FAIL ', name, extra ?? ''); } };
const due = (iso: string) => replyDueAt(iso).toISOString();

const h2026 = [...federalHolidays(2026)].sort();
ok('2026 observed federal holidays (July 4 on a Saturday → Friday July 3)', JSON.stringify(h2026) === JSON.stringify(['2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25']), h2026);
ok('Thanksgiving 2026 is off; the Friday after is a business day', isOffDay('2026-11-26') && !isOffDay('2026-11-27'));
ok('a Sunday holiday is observed Monday (Juneteenth 2033 → June 20)', federalHolidays(2033).has('2033-06-20') && !federalHolidays(2033).has('2033-06-19'));
ok('New Year 2028 on a Saturday is observed Friday Dec 31 2027', isOffDay('2027-12-31') && federalHolidays(2027).has('2027-12-31'));
ok('Christmas 2027 on a Saturday is observed Friday Dec 24', isOffDay('2027-12-24'));

// Thanksgiving week 2026 (Eastern is UTC-5).
ok('Tue before Thanksgiving 10:00 → Fri 10:00 (Thu skipped)', due('2026-11-24T15:00:00Z') === '2026-11-27T15:00:00.000Z', due('2026-11-24T15:00:00Z'));
ok('Wed before Thanksgiving 10:00 → Mon 10:00 (Thu, weekend skipped)', due('2026-11-25T15:00:00Z') === '2026-11-30T15:00:00.000Z', due('2026-11-25T15:00:00Z'));
ok('on Thanksgiving: the clock starts Friday 00:00 → due Tue Dec 1 00:00', due('2026-11-26T16:00:00Z') === '2026-12-01T05:00:00.000Z', due('2026-11-26T16:00:00Z'));
ok('late Wednesday Eastern (UTC Thursday) is still Wednesday → Mon 22:30 Eastern', due('2026-11-26T03:30:00Z') === '2026-12-01T03:30:00.000Z', due('2026-11-26T03:30:00Z'));

// Christmas.
ok('Thu Dec 24 2026 10:00 → Tue Dec 29 10:00 (Christmas Friday, weekend skipped)', due('2026-12-24T15:00:00Z') === '2026-12-29T15:00:00.000Z', due('2026-12-24T15:00:00Z'));
ok('Wed Dec 23 2026 10:00 → Mon Dec 28 10:00', due('2026-12-23T15:00:00Z') === '2026-12-28T15:00:00.000Z', due('2026-12-23T15:00:00Z'));
ok('Thu Dec 23 2027 10:00 → Tue Dec 28 (observed Christmas Friday Dec 24)', due('2027-12-23T15:00:00Z') === '2027-12-28T15:00:00.000Z', due('2027-12-23T15:00:00Z'));
ok('Thu Dec 30 2027 10:00 → Tue Jan 4 2028 (observed New Year Friday Dec 31)', due('2027-12-30T15:00:00Z') === '2028-01-04T15:00:00.000Z', due('2027-12-30T15:00:00Z'));

// Unchanged where no holiday is near.
ok('an ordinary Monday is due Wednesday', addBusinessDays(new Date('2026-11-16T15:00:00Z'), 2).toISOString() === '2026-11-18T15:00:00.000Z');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
