// W2-6 slice 3: a tee time's booking rules — the course's, or its round's own. Pure.
// Run: npx tsx scripts/round-rules-test.ts
import { rulesFor, walkingAllowedAt, groupSizeError, readRoundRules } from '../src/lib/booking-rules';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };
const course = { walkingAllowed: 'always', cartRequired: false, minPlayers: 1, maxPlayers: 4, publicAdvanceDays: 7 };
const mon = { date: '2026-10-19', time: '08:00', walkingAllowed: true };   // a Monday
const sat = { date: '2026-10-24', time: '08:00', walkingAllowed: true };

const base = rulesFor(course, null);
ok('no round: the course rules', base.minPlayers === 1 && base.maxPlayers === 4 && base.publicAdvanceDays === 7 && base.walking === 'always');
ok('walking any time', walkingAllowedAt(base, mon) && walkingAllowedAt(base, sat));
ok("a schedule that doesn't allow walking forces a cart", !walkingAllowedAt(base, { ...mon, walkingAllowed: false }));
ok('course cart required forces a cart', !walkingAllowedAt(rulesFor({ ...course, cartRequired: true }), mon));
ok('weekdays only: walk Monday, cart Saturday', walkingAllowedAt(rulesFor({ ...course, walkingAllowed: 'weekdays' }), mon) && !walkingAllowedAt(rulesFor({ ...course, walkingAllowed: 'weekdays' }), sat));
ok('after 12: cart at 8:00, walk at 15:00', !walkingAllowedAt(rulesFor({ ...course, walkingAllowed: 'after12' }), mon) && walkingAllowedAt(rulesFor({ ...course, walkingAllowed: 'after12' }), { ...mon, time: '15:00' }));

// The round's own rules.
const twilight9 = rulesFor({ ...course, cartRequired: true }, { walkingPolicy: 'always', minPlayers: null, maxPlayers: 2, publicAdvanceDays: 3 });
ok('a round can let golfers walk when the course requires a cart', walkingAllowedAt(twilight9, mon));
ok("…but not past a schedule that doesn't allow it", !walkingAllowedAt(twilight9, { ...mon, walkingAllowed: false }));
ok('a round can cap the group and shorten the window', twilight9.maxPlayers === 2 && twilight9.minPlayers === 1 && twilight9.publicAdvanceDays === 3);
ok('a round can require a cart on a walking course', !walkingAllowedAt(rulesFor(course, { walkingPolicy: 'never' }), mon));
ok('blank round fields fall back to the course', rulesFor(course, { walkingPolicy: null, minPlayers: null, maxPlayers: null, publicAdvanceDays: null }).maxPlayers === 4);

// Group size.
const foursomes = rulesFor(course, { minPlayers: 2, maxPlayers: 4 });
ok('a single is refused where groups are 2+', groupSizeError(foursomes, 1)?.includes('groups of 2 or more') === true);
ok('a five is refused where groups are up to 4', groupSizeError(foursomes, 5)?.includes('up to 4 players') === true);
ok('a three is fine', groupSizeError(foursomes, 3) === null);
ok('a bad min above max never makes an impossible rule', rulesFor(course, { minPlayers: 4, maxPlayers: 2 }).maxPlayers >= 4);

// The owner's form.
ok('blank form = all course rules', (() => { const r = readRoundRules({ walkingPolicy: '', minPlayers: '', maxPlayers: '', publicAdvanceDays: '' }, course); return r.ok && Object.values(r.data).every(v => v === null); })());
ok('a round window past the course window is refused', !readRoundRules({ publicAdvanceDays: 10 }, course).ok);
ok('a shorter one is fine', readRoundRules({ publicAdvanceDays: 3 }, course).ok);
ok('fewest above most is refused', !readRoundRules({ minPlayers: 4, maxPlayers: 2 }, course).ok);
ok('fewest above the course most is refused', !readRoundRules({ minPlayers: 5 }, course).ok);
ok('an unknown walking word is refused', !readRoundRules({ walkingPolicy: 'sometimes' }, course).ok);
ok('nonsense numbers are refused', !readRoundRules({ maxPlayers: 9 }, course).ok && !readRoundRules({ minPlayers: 1.5 }, course).ok);

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('round-rules: all passed');
