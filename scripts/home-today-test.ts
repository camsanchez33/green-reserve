// HOME-3 (Cam 2026-11-12, the approved charcoal Home): the pure parts — today by hour (played · playing ·
// booked · open on ROUND_MINUTES, never a new duration), checked in of booked, the 4-week same-weekday
// average (closed days left out), how a goal is going for today, the weather's rain line, and the page's
// own rules (no Open tee sheet button, no count tiles, the one search, events behind events.manage).
// Pure. Run: npx tsx scripts/home-today-test.ts
import { readFileSync } from 'fs';
import { todayByHour, checkedInOf, sameWeekdayAverage, goalTone, weatherLine } from '../src/lib/home-today';
import { cleanConditions, golferConditionLines } from '../src/lib/course-conditions';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

// ── Today by hour at 12:00 ──
const slots = [
  { time: '07:00', holes: 9, spots: 4, bookings: [{ status: 'completed', players: 4, checkedInPlayers: 3 }] }, // 9 holes ends 09:15 → played
  { time: '08:00', holes: 18, spots: 4, bookings: [{ status: 'completed', players: 2 }] },                     // ends 12:30 → playing
  { time: '07:30', holes: 18, spots: 4, bookings: [{ status: 'completed', players: 1 }] },                     // ends 12:00 → played (at the minute)
  { time: '08:10', holes: 18, spots: 4, bookings: [{ status: 'confirmed', players: 3 }, { status: 'cancelled', players: 1 }] },
  { time: '13:00', holes: 18, spots: 4, bookings: [] },
  { time: '15:00', holes: 18, spots: 0, bookings: [] },                                                         // blocked, empty
];
const bars = todayByHour(slots, '12:00');
const at = (h: number) => bars.find(b => b.hour === h);
ok('a checked-in 9-hole group is played once 2¼ hours have passed', at(7)?.played === 4, at(7));
ok('…checkedInPlayers counts over players', at(7)?.played === 4 && at(7)?.playing === 0, at(7));
ok('an 18-hole group 4 hours in is still playing', at(8)?.playing === 2, at(8));
ok('not checked in is booked; cancelled counts nothing', at(8)?.booked === 3, at(8));
ok('open is the spots left', at(8)?.spots === 8 && at(8)?.open === 3 && at(13)?.open === 4, bars);
ok('an hour with no spots and nobody on it is left out', !at(15), bars);
ok('hours come earliest first', bars.map(b => b.hour).join() === '7,8,13');
ok('checked in of booked (players)', JSON.stringify(checkedInOf(slots)) === JSON.stringify({ checkedIn: 6, booked: 9 }), checkedInOf(slots));
ok('the rule is ROUND_MINUTES, not a typed duration', readFileSync('src/lib/home-today.ts', 'utf8').includes("from './on-course'") && !/\b(240|270|135)\b/.test(readFileSync('src/lib/home-today.ts', 'utf8')));

// ── 4-week same-weekday average ── 2031-05-14 is a Wednesday.
const past = new Map<string, number | null>([['2031-05-07', 40], ['2031-04-30', 20], ['2031-04-23', null], ['2031-04-16', 30], ['2031-05-13', 10], ['2031-05-12', 99]]);
ok('the last 4 of the weekday, a closed day left out (not a zero)', sameWeekdayAverage('2031-05-14', '2031-05-14', past) === 30);
ok('next week\'s Wednesday uses the same 4', sameWeekdayAverage('2031-05-21', '2031-05-14', past) === 30);
ok('Tuesday uses the Tuesdays before today', sameWeekdayAverage('2031-05-20', '2031-05-14', past) === 10);
ok('no history → no line', sameWeekdayAverage('2031-05-15', '2031-05-14', past) === null);
ok('days before the last 4 weeks never count', sameWeekdayAverage('2031-05-14', '2031-05-14', new Map([['2031-04-09', 50]])) === null);

// ── Goals for today ── (the mockup: day 12 of 30 = 40%)
const g = (actual: number, target: number, rate = false) => goalTone({ actual, target, dayOfMonth: 12, daysInMonth: 30, rate });
ok('ahead of where it should be is green', g(1140, 1600) === 'ok');
ok('within 10 points behind is amber', g(19800, 60000) === 'warn');
ok('further behind is red', g(2, 20) === 'bad');
ok('reached is green', g(20, 20) === 'ok');
ok('a rate (fill %) is held to its target all month', g(70, 75, true) === 'warn' && g(60, 75, true) === 'bad' && g(76, 75, true) === 'ok');

// ── Weather line ──
const H = (hh: string, rain: number | null, temp = 54, summary = 'Clear') => ({ at: `2031-05-14T${hh}:00:00-04:00`, tempF: temp, summary, windMph: 5, rainPct: rain });
ok('the first hour of rain still to come today', JSON.stringify(weatherLine([H('09', 0), H('12', 10), H('16', 40), H('17', 80)], '2031-05-14')) === JSON.stringify({ now: '54° clear', rain: 'rain at 4 PM' }));
ok('rain under 20% says nothing', weatherLine([H('09', 0), H('12', 19)], '2031-05-14')?.rain === null);
ok('raining now says so', weatherLine([H('09', 60)], '2031-05-14')?.rain === 'rain now');
ok('tomorrow\'s rain is not today\'s', weatherLine([H('09', 0), { ...H('09', 90), at: '2031-05-15T09:00:00-04:00' }], '2031-05-14')?.rain === null);
ok('no forecast hours → nothing', weatherLine([], '2031-05-14') === null);

// ── Conditions: a detail line per condition, kept only beside a set condition ──
const c = cleanConditions({ carts: 'path', greens: 'fast', notes: { carts: '  Holes 4–7,  wet ', pins: 'orphan', greens: 42 } });
ok('a note is trimmed and kept beside its condition', c.notes?.carts === 'Holes 4–7, wet');
ok('a note on an unset condition or not text is dropped', !c.notes?.pins && !c.notes?.greens);
ok('golfers see the note with its condition', golferConditionLines(c, new Date(), new Date()).includes('Carts: Path only (Holes 4–7, wet)'), golferConditionLines(c, new Date(), new Date()));

// ── The page ──
const page = readFileSync('src/app/dashboard/home/page.tsx', 'utf8');
ok('no Open tee sheet button', !page.includes('Open tee sheet'));
ok('no Action needed count tiles', !page.includes('Cards declined') && !page.includes('No-shows today'));
ok('next payout is its own card', /<Card className="px-5 py-4 flex items-center gap-3 text-\[14px\]">\s*<Link href="\/dashboard\/money\?tab=payouts" className="flex-1[^"]*">Next payout</.test(page));
ok('the one search sits on Home and the rail leaves it there', page.includes('<OperatorSearch />') && readFileSync('src/components/OperatorSidebar.tsx', 'utf8').includes("{active !== 'home' && <OperatorSearch />}"));
ok('money numbers only come with money (the route decides)', page.includes('{home.money && <>'));
ok('no typed colours on Home (tokens only)', !/#[0-9A-Fa-f]{6}\b/.test(page) && !/#[0-9A-Fa-f]{6}\b/.test(readFileSync('src/components/dashboard/home/HomeBoard.tsx', 'utf8')));
const route = readFileSync('src/app/api/operator/home/route.ts', 'utf8');
ok('events reach Home only with events.manage', route.includes("can(session, 'events.manage') ? upcomingEvents("));
ok('events carry no money', !/Cents|payments/.test(readFileSync('src/lib/home-board.ts', 'utf8').slice(readFileSync('src/lib/home-board.ts', 'utf8').indexOf('export type HomeEvent'))));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
