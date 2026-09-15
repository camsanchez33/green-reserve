// IC-5 §7 — structured call answers through the reader, the validator, the
// summaries, the sheet prefill and "Still need from them".
// Run: npx tsx scripts/call-answers-test.ts
import { parseCallAnswers, validateAnswers, summarize, flatSummaries, toSheetPrefill, missingNeedFields } from '../src/lib/call-answers';
import { stillNeed } from '../src/lib/inquiry-needs';

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

// 1. the old flat shape parses as notes
const v1 = parseCallAnswers(JSON.stringify({ green_fees: '$62 wd / $85 we', cancellation: '24h, $10' }));
check('v1 → v2: items keyed by agenda key', Object.keys(v1.items).sort().join(',') === 'cancellation,green_fees', JSON.stringify(Object.keys(v1.items)));
check('v1 → v2: prose lands in note', v1.items.green_fees.note === '$62 wd / $85 we', v1.items.green_fees.note);
check('junk → empty', Object.keys(parseCallAnswers('not json').items).length === 0);
check('empty string → empty', Object.keys(parseCallAnswers('').items).length === 0);

// 2. validation keeps the well-typed, drops the rest
const raw = { v: 2, items: {
  green_fees: { fields: { weekday: 4500, weekend: 'sixty', twilight: -5, bogus: 1 }, note: 'x'.repeat(5000) },
  tee_times: { fields: { first: '07:00', last: '25:00', interval: '11' }, note: '' },
  cancellation: { fields: { hasPolicy: true, hours: '48', lateFee: 1000 }, note: '' },
  season_hours: { fields: { seasonOpen: 'April', seasonClose: 'Soonish', daysOpen: [0, 6, 6, 9, 'x'] }, note: '' },
  assets: { fields: { by: '2026-04-01', logo: 'they_send' }, note: '' },
  not_an_item: { fields: { a: 1 }, note: 'y' },
} };
const v = validateAnswers(raw);
check('money: integer cents kept', v.items.green_fees.fields.weekday === 4500);
check('money: a word is dropped', v.items.green_fees.fields.weekend === undefined);
check('money: negative dropped', v.items.green_fees.fields.twilight === undefined);
check('unknown field dropped', v.items.green_fees.fields.bogus === undefined);
check('note capped at 4000', v.items.green_fees.note.length === 4000, String(v.items.green_fees.note.length));
check('time: valid kept, invalid dropped', v.items.tee_times.fields.first === '07:00' && v.items.tee_times.fields.last === undefined);
check('enum: outside options dropped', v.items.tee_times.fields.interval === undefined);
check('date: valid kept', v.items.assets.fields.by === '2026-04-01');
check('date: invalid dropped', validateAnswers({ v: 2, items: { assets: { fields: { by: 'soon' }, note: '' } } }).items.assets === undefined);
check('season: a month is kept, prose dropped', v.items.season_hours.fields.seasonOpen === 'April' && v.items.season_hours.fields.seasonClose === undefined);
check('days: de-duped, bounded, sorted', JSON.stringify(v.items.season_hours.fields.daysOpen) === '[0,6]', JSON.stringify(v.items.season_hours.fields.daysOpen));
check('unknown item dropped', v.items.not_an_item === undefined);

// 3. summaries
check('summarize: cents as dollars', summarize('green_fees', v.items.green_fees).startsWith('Weekday $45'), summarize('green_fees', v.items.green_fees));
check('summarize: bool reads Yes', /Has a policy: Yes/.test(summarize('cancellation', v.items.cancellation)), summarize('cancellation', v.items.cancellation));
check('summarize: $10.50 keeps cents', summarize('green_fees', { fields: { weekday: 1050 }, note: '' }) === 'Weekday $10.50', summarize('green_fees', { fields: { weekday: 1050 }, note: '' }));
const flat = flatSummaries(JSON.stringify(v));
check('flatSummaries: one line per captured item', Object.keys(flat).length === 5, JSON.stringify(Object.keys(flat)));

// 4. sheet prefill
const pre = toSheetPrefill(validateAnswers({ v: 2, items: {
  green_fees: { fields: { weekday: 4500 }, note: '' },
  cancellation: { fields: { hasPolicy: true, hours: '48' }, note: '' },
  season_hours: { fields: { daysOpen: [1, 2] }, note: '' },
  resident_member: { fields: { residentRates: false, memberships: true, memberPerRound: false }, note: '' },
  protected_times: { fields: { outings: true }, note: '' },
} }));
check('prefill: cents → "45.00"', pre.greenFeeWeekday === '45.00', String(pre.greenFeeWeekday));
check('prefill: bool → yes/no on cancellationPolicy', pre.cancellationPolicy === 'yes');
check('prefill: enum passes through', pre.cancellationHours === '48');
check('prefill: days → array', JSON.stringify(pre.daysOpen) === '[1,2]');
check('prefill: branch.passes yes when either source is yes', pre.branch.passes === 'yes', JSON.stringify(pre.branch));
check('prefill: branch.member_rate no', pre.branch.member_rate === 'no');
check('prefill: branch.outings yes', pre.branch.outings === 'yes');
const preNo = toSheetPrefill(validateAnswers({ v: 2, items: { resident_member: { fields: { residentRates: false, memberships: false }, note: '' } } }));
check('prefill: branch.passes no only when both say no', preNo.branch.passes === 'no');
const preOne = toSheetPrefill(validateAnswers({ v: 2, items: { resident_member: { fields: { residentRates: false }, note: '' } } }));
check('prefill: branch.passes unset when only one says no', preOne.branch.passes === undefined);

// 5. still need names fields
check('missing: weekend named when weekday captured', missingNeedFields('green_fees', { fields: { weekday: 4500 }, note: '' }).join() === 'weekend');
check('missing: nothing when item untouched', missingNeedFields('green_fees', { fields: {}, note: '' }).length === 0);
const now = new Date('2026-09-14T15:00:00Z');
const asked = { status: 'details_requested', greenFeeRange: '', teeTimesPerDay: null, currentBookingMethod: 'Phone', events: [{ fromStatus: 'in_review', toStatus: 'details_requested', createdAt: now }] };
const logged = [{ scheduledAt: new Date(now.getTime() - 86_400_000), outcome: 'talked', answersJson: JSON.stringify({ v: 2, items: { green_fees: { fields: { weekday: 4500 }, note: '' } } }) }];
const need = stillNeed(asked, null, null, logged);
const gf = need.find(n => n.key === 'green_fees');
check('stillNeed: "Green fees: weekend"', gf?.label === 'Green fees: weekend', gf?.label);
check('stillNeed: untouched items keep the topic label', need.some(n => n.label === 'Tee times / day'), JSON.stringify(need.map(n => n.label)));
const v1logged = [{ scheduledAt: new Date(now.getTime() - 86_400_000), outcome: 'talked', answersJson: JSON.stringify({ green_fees: '$62 wd / $85 we' }) }];
const needV1 = stillNeed(asked, null, null, v1logged);
check('stillNeed: an old prose answer still counts as answered (no fields to name)', !needV1.some(n => n.key === 'green_fees'), JSON.stringify(needV1.map(n => n.label)));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
