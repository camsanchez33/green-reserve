// SC-1 §3 — the availability engine, pure, no Google.
// Run: npx tsx scripts/call-availability-test.ts
import { openSlots, matchesPreference, LEAD_HOURS, HORIZON_DAYS, type CallWindow } from '../src/lib/call-availability';
import { easternToIso } from '../src/lib/inquiry-call';

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}
const et = (date: string, time: string) => new Date(easternToIso(date, time)!);

// Monday 2026-09-14, 11:00 ET
const now = et('2026-09-14', '11:00');
const all = openSlots(now, [], []);
const byDate = Object.fromEntries(all.map(d => [d.date, d]));

// 1. lead time removes today (11:00 + 12h = 23:00, past Monday's last slot)
check('lead time: no slots today', !byDate['2026-09-14'], JSON.stringify(Object.keys(byDate).slice(0, 3)));
check('first day offered is tomorrow', all[0]?.date === '2026-09-15', all[0]?.date);
check('Tuesday starts at 08:00 ET', all[0]?.slots[0]?.getTime() === et('2026-09-15', '08:00').getTime(), all[0]?.slots[0]?.toISOString());
check('Tuesday: 24 half-hour slots (08:00–20:00)', all[0]?.slots.length === 24, String(all[0]?.slots.length));

// 2. Sunday is empty; Friday ends at 18:00; Saturday 09:00–16:00
check('Sunday: no slots', !byDate['2026-09-20']);
check('Friday: last slot 17:30', byDate['2026-09-18']?.slots.at(-1)?.getTime() === et('2026-09-18', '17:30').getTime());
check('Saturday: 09:00–15:30 (14 slots)', byDate['2026-09-19']?.slots.length === 14 && byDate['2026-09-19']?.slots[0].getTime() === et('2026-09-19', '09:00').getTime());

// 3. horizon
const lastDate = all.at(-1)?.date;
check(`horizon: nothing past ${HORIZON_DAYS} days`, lastDate !== undefined && lastDate <= '2026-09-28', lastDate);
void LEAD_HOURS;

// 4. a busy block removes exactly the overlapping slots (a 20-minute event kills the whole slot)
const busy = [{ start: et('2026-09-15', '10:10'), end: et('2026-09-15', '10:30') }];
const withBusy = openSlots(now, busy, []);
const tue = withBusy.find(d => d.date === '2026-09-15')!;
const has = (d: { slots: Date[] }, time: string) => d.slots.some(s => s.getTime() === et('2026-09-15', time).getTime());
check('busy 10:10–10:30 removes the 10:00 slot', !has(tue, '10:00'));
check('busy 10:10–10:30 keeps 09:30', has(tue, '09:30'));
check('busy 10:10–10:30 keeps 10:30', has(tue, '10:30'));
check('busy: exactly one slot fewer', tue.slots.length === 23, String(tue.slots.length));

// 5. a scheduled Call removes its slot (either kind); a logged one does not
const calls = [
  { scheduledAt: et('2026-09-15', '14:00'), durationMin: 30, outcome: 'scheduled' },
  { scheduledAt: et('2026-09-15', '15:00'), durationMin: 30, outcome: 'talked' },
];
const withCalls = openSlots(now, [], calls);
const tue2 = withCalls.find(d => d.date === '2026-09-15')!;
check('scheduled call removes 14:00', !has(tue2, '14:00'));
check('logged call does not remove 15:00', has(tue2, '15:00'));
check('a 45-minute call removes two slots', openSlots(now, [], [{ scheduledAt: et('2026-09-15', '14:00'), durationMin: 45, outcome: 'scheduled' }])
  .find(d => d.date === '2026-09-15')!.slots.filter(s => [et('2026-09-15', '14:00').getTime(), et('2026-09-15', '14:30').getTime()].includes(s.getTime())).length === 0);

// 6. empty windows → nothing, not everything
const none: CallWindow[] = [];
check('empty window list returns nothing', openSlots(now, [], [], null, none).length === 0);

// 7. preference orders, never removes
const pref = { times: ['Mornings'], days: ['Weekdays'] };
const withPref = openSlots(now, [], [], pref);
const tue3 = withPref.find(d => d.date === '2026-09-15')!;
check('preference: same total slots', tue3.slots.length === 24, String(tue3.slots.length));
check('preference: mornings first (08:00–11:30 = 8)', tue3.preferred.length === 8, String(tue3.preferred.length));
check('preference: the rest under other', tue3.other.length === 16, String(tue3.other.length));
check('preference: Saturday is all "other" for weekdays-only', withPref.find(d => d.date === '2026-09-19')!.preferred.length === 0);
check('matchesPreference: 13:00 is an afternoon', matchesPreference(et('2026-09-15', '13:00'), { times: ['Afternoons'] }));
check('matchesPreference: empty preference matches all', matchesPreference(et('2026-09-15', '13:00'), { times: [], days: [] }));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
