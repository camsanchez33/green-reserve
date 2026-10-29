// W2-9 Events, the pure parts: the shotgun hold window, which event holds a
// time, pairing players in list order, reading a pasted player list, and the
// "Run events" permission. Run: npx tsx scripts/events-test.ts
import { shotgunWindow, autoPairings, parsePlayers, dueFor, DEFAULT_TASKS, shotgunLabels, groupStartTime } from '../src/lib/course-events';
import { heldBy, type HoldEvent } from '../src/lib/event-hold';
import { PRESETS, LEGACY_KEYS, ALL_KEYS } from '../src/lib/staff-permissions';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); if (!ok) failed++; };

// Cam 2026-10-22: an hour before the start to the end of the round.
check('18-hole shotgun at 8:00 holds 7:00–12:30', JSON.stringify(shotgunWindow('08:00', 18)) === JSON.stringify({ from: '07:00', to: '12:30' }), shotgunWindow('08:00', 18));
check('9-hole shotgun at 17:30 holds 16:30–19:45', JSON.stringify(shotgunWindow('17:30', 9)) === JSON.stringify({ from: '16:30', to: '19:45' }), shotgunWindow('17:30', 9));
check('a late shotgun never runs past midnight', shotgunWindow('21:00', 18).to === '23:59');
check('an early shotgun never starts before midnight', shotgunWindow('00:30', 18).from === '00:00');

const ev = (o: Partial<HoldEvent>): HoldEvent => ({ id: 'e', format: 'shotgun', holdFrom: '07:00', holdTo: '12:30', productId: null, status: 'planned', ...o });
check('a shotgun holds every round inside its window', heldBy([ev({})], 'back9', '07:00')?.id === 'e' && heldBy([ev({})], null, '12:30')?.id === 'e');
check('…and nothing outside it', heldBy([ev({})], null, '06:50') === null && heldBy([ev({})], null, '12:40') === null);
check('a cancelled event holds nothing', heldBy([ev({ status: 'cancelled' })], null, '08:00') === null);
const tt = ev({ id: 't', format: 'tee_times', holdFrom: '13:00', holdTo: '13:20', productId: 'front' });
check('a tee-times event on one round holds only that round', heldBy([tt], 'front', '13:10')?.id === 't' && heldBy([tt], 'back', '13:10') === null);
check('a tee-times event on every round holds them all', heldBy([ev({ format: 'tee_times', productId: null })], 'back', '08:00') !== null);

// Sharing the course (Cam 2026-10-22): only the chosen nines, minus the times kept open.
const share = ev({ id: 's', shareCourse: true, holdNineIds: ['front'], keepOpen: ['08:00'] });
check('a shared event holds a round on its nine', heldBy([share], 'f9', '07:30', ['front'])?.id === 's');
check('…an 18 that plays its nine too', heldBy([share], 'f18', '07:30', ['front', 'back'])?.id === 's');
check('…but not a round on the other nine', heldBy([share], 'b9', '07:30', ['back']) === null);
check('…nor a time kept open for golfers', heldBy([share], 'f9', '08:00', ['front']) === null);
check('a round with no nines (a simple course) counts as using every nine', heldBy([share], null, '07:30', null)?.id === 's');
check('keepOpen and nines mean nothing unless the course is shared', heldBy([ev({ keepOpen: ['08:00'], holdNineIds: ['front'] })], 'b9', '08:00', ['back'])?.id === 'e');

const ps = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}` }));
const four = autoPairings(ps, 4, true, 18);
check('pairs of four in list order', four.map(p => p.groupNo).join('') === '1111222233', four);
check('shotgun groups start on holes 1, 2, 3', four[0].startHole === 1 && four[4].startHole === 2 && four[8].startHole === 3);
check('tee-times groups have no starting hole', autoPairings(ps, 4, false, 18).every(p => p.startHole === null));
check('a 9-hole shotgun wraps groups round the nine', autoPairings(Array.from({ length: 40 }, (_, i) => ({ id: `${i}` })), 4, true, 9)[36].startHole === 1);
check('group size is kept between 1 and 5', autoPairings(ps, 9, false, 18)[5].groupNo === 2 && autoPairings(ps, 0, false, 18)[4].groupNo === 2);

const pasted = parsePlayers('Name\tEmail\tPhone\nJane Smith\tJANE@Example.com\t555-201-3344\nTom Lee, 201 555 0199\n\n  \nAnn O\'Neil; ann@x.org');
check('a header row is skipped', !pasted.some(p => /^name$/i.test(p.name)), pasted);
check('tabs from a spreadsheet are read, email lower-cased', pasted[0]?.name === 'Jane Smith' && pasted[0].email === 'jane@example.com' && pasted[0].phone === '555-201-3344', pasted[0]);
check('commas work, a phone without email is found', pasted[1]?.name === 'Tom Lee' && pasted[1].phone === '201 555 0199' && pasted[1].email === '', pasted[1]);
check('semicolons work, blank lines are skipped', pasted.length === 3 && pasted[2].email === 'ann@x.org', pasted);
check('at most 500 players at once', parsePlayers(Array.from({ length: 600 }, (_, i) => `P ${i}`).join('\n')).length === 500);

check('default checklist due dates count back from the day', dueFor('2031-05-14', 7) === '2031-05-07' && dueFor('2031-05-14', -1) === '2031-05-15');
check('the default checklist is Cam’s five items', DEFAULT_TASKS.map(t => t.daysBefore).join(',') === '7,5,2,1,-1');

// Cam 2026-10-22: owner + staff given "Run events"; Manager has it, Front desk doesn't.
const preset = (k: string) => PRESETS.find(p => p.key === k)?.keys ?? [];
check('"Run events" is in the catalog', (ALL_KEYS as string[]).includes('events.manage'));
check('the Manager preset runs events', (preset('manager') as string[]).includes('events.manage'), PRESETS.map(p => p.key));
check('Front desk does not', !(preset('front_desk') as string[]).includes('events.manage'));
check('legacy staff (pre-SP-A) do not', !(LEGACY_KEYS as string[]).includes('events.manage'));

// Revamp 3 fix 10: 36 groups on 18 holes start 1A…18A then 1B…18B; a hole with one group is just its number.
const big = autoPairings(Array.from({ length: 144 }, (_, i) => ({ id: `p${i}` })), 4, true, 18);
const groups = [...new Map(big.map(p => [p.groupNo, { groupNo: p.groupNo, startHole: p.startHole }])).values()];
const lbl = shotgunLabels(groups);
check('a full-field shotgun splits shared holes A/B', groups.length === 36 && lbl.get(1) === '1A' && lbl.get(19) === '1B' && lbl.get(36) === '18B' && new Set(lbl.values()).size === 36, [...lbl.entries()].slice(0, 3));
check('…a hole with one group reads its number', shotgunLabels([{ groupNo: 1, startHole: 1 }, { groupNo: 2, startHole: 2 }]).get(2) === '2');
check('a tee-times group past the times held gets no time, never the first one again', groupStartTime(6, ['15:00', '15:10', '15:20', '15:30', '15:40']) === null && groupStartTime(2, ['15:00', '15:10']) === '15:10');

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
