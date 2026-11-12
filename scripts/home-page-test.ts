// HOME-1 (Cam 2026-11-05, page-by-page pass on Home): the weather and next tee times open the page,
// Finish setting up lands on the field itself, Needs you leads with counts, Staff notes, a clearer heat map.
// Pure + source pins. Run: npx tsx scripts/home-page-test.ts
import { readFileSync, existsSync } from 'fs';
import { parseHourly, hourKey } from '../src/lib/weather';
import { settingsHref } from '../src/lib/setup-missing';

let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + JSON.stringify(i)}`); if (!c) failed++; };
const read = (f: string) => readFileSync(f, 'utf8');

// weather.gov's hourly shape → our hours
const raw = { properties: { periods: [
  { startTime: '2026-11-05T16:00:00-05:00', temperature: 70, temperatureUnit: 'F', windSpeed: '8 mph', shortForecast: 'Chance Rain Showers', probabilityOfPrecipitation: { value: 30 } },
  { startTime: '2026-11-05T17:00:00-05:00', temperature: 20, temperatureUnit: 'C', windSpeed: '5 to 10 mph', shortForecast: 'Sunny', probabilityOfPrecipitation: { value: null } },
  { startTime: 'bad' },
] } };
const h = parseHourly(raw);
ok('the forecast reads temperature, wind, rain and summary', h.length === 2 && h[0].tempF === 70 && h[0].windMph === 8 && h[0].rainPct === 30 && h[0].summary === 'Chance Rain Showers', h);
ok('…Celsius becomes Fahrenheit, a wind range reads its top, no rain chance is null', h[1].tempF === 68 && h[1].windMph === 10 && h[1].rainPct === null, h[1]);
ok('…junk is skipped, not thrown', parseHourly(null).length === 0 && parseHourly({ properties: {} }).length === 0);
ok('an hour is matched in the forecast\'s own local time', hourKey('2026-11-05T16:00:00-05:00') === '2026-11-05 16');

const wx = read('src/lib/weather.ts');
ok('weather comes from the Census geocoder and weather.gov (no key, commercial use allowed), cached', wx.includes('geocoding.geo.census.gov') && wx.includes('api.weather.gov/points/') && wx.includes('next: { revalidate }') && !wx.includes('open-meteo'));
ok('…and never throws: a failure is a reason the card says in words', wx.includes("catch {\n    return { ok: false, reason: 'unavailable' };"));
ok('the weather route is gated like the tee sheet', read('src/app/api/operator/weather/route.ts').includes("requirePermission(session, 'sheet.view')"));

const home = read('src/app/dashboard/home/page.tsx');
// HOME-3 (Cam 2026-11-12, the approved charcoal Home) replaces HOME-1's bar: three cards — next off, checked in, the weather.
ok('next off, checked in and the weather are three cards at the top', home.includes('>Next off<') && home.includes('>Checked in<') && home.includes('aria-label="Weather"') && home.includes('weatherLine(weather.hours, home.today)') && !home.includes('>Coming up<'));
ok('Finish setting up is one line on Home', home.includes('<FinishSetup compact items='));
ok('…and each button lands on the field itself', settingsHref('Your course', 'gallery') === '/dashboard/settings?section=Your%20course&focus=gallery' && read('src/app/dashboard/settings/page.tsx').includes('data-setup="gallery"') && read('src/app/dashboard/settings/page.tsx').includes("searchParams.get('focus')"));
ok('Action needed is just the list (HOME-3: the count tiles are gone)', !['Cards declined', 'No-shows today', 'Unread messages'].some(l => home.includes(`label: '${l}'`)) && home.includes('{home.late.length} past their time'));
ok('the refresh button sits beside the time, not in its own box', home.includes('aria-label="Refresh"') && !home.includes('w-9 h-9 rounded-md bg-white border border-line'));
ok('two columns that stack, so no card leaves a gap under its neighbour', home.includes('lg:grid-cols-[minmax(0,2fr)_minmax(290px,1fr)] items-start') && !home.includes('self-start'));
ok('today by hour: every bar the same height, room between hours', home.includes('gap-1 sm:gap-2.5 h-40') && home.includes('max-w-[30px] h-full flex flex-col'));

const board = read('src/components/dashboard/home/HomeBoard.tsx');
ok('staff notes: what the last shift left, and Add a note for the next', board.includes('>Staff notes<') && board.includes('Nothing from the last shift.') && board.includes('>Add a note<'));
ok('the heat map says what it shows, four steps with the % printed, and each day\'s total', board.includes('How full each hour is') && board.includes('heatStep(pct)') && board.includes('Math.round(pct * 100)') && board.includes('>Booked<'));

// HOME-2 (Cam 2026-11-05): goals on the numbers the course picks; conditions open to what the course wants golfers to know.
const goalsLib = read('src/lib/course-goals.ts');
ok('goals can be set on money, rounds, players booked, fill and new golfers', ['collected', 'rounds', 'booked', 'fill', 'new_golfers'].every(k => goalsLib.includes(`key: '${k}'`)));
ok('Home shows the goals card to every login; setting needs settings.edit', home.includes('<GoalsCard key=') && home.includes("canSet={access.can('settings.edit')}") && !home.includes('MonthGoalCard'));
ok('each goal: actual of target coloured for today (HOME-3), change and remove', board.includes('goalTone({') && board.includes('>Change<') && board.includes('>Remove<') && board.includes('Add a goal'));
ok('the old single money goal and its route are gone', !existsSync('src/app/api/operator/month-goal/route.ts'));
const cond = read('src/lib/course-conditions.ts');
ok('conditions (HOME-3): cart path, greens, pins, each with a detail line golfers see too', cond.includes('...(c.lines ?? [])') && cond.includes('c.notes?.[f.key]') && board.includes('HOME_CONDITIONS.map') && board.includes('Detail (optional)'));

// Cam 2026-11-06: "Action needed" on Home and Money; the conditions editor lines up and its suggestions read as shortcuts.
ok('"Action needed", not "Needs you", on Home and Money', home.includes('>Action needed</h2>') && read('src/app/dashboard/money/page.tsx').includes('>Action needed</h2>') && !home.includes('>Needs you</h2>'));
ok('conditions editor: label above, equal options', board.includes('repeat(${options(f.key).length}, minmax(0, 1fr))'));

// SHEET-3 (Cam 2026-11-06, the tee sheet notes): quiet actions, one shape for every day number (groups moved up),
// highlighted view words, a search field, no boxed arrows or reload, a one-line late bar, a key that says Edge / Fill,
// and past tee times at the top.
const sheet = read('src/app/dashboard/page.tsx'), sheetRows = read('src/components/dashboard/TeeSheetRows.tsx');
ok('tee sheet: the groups count is in the day strip, not a footer', sheet.includes('const dayGroups = ') && sheet.includes('>On the course</div>') && !sheet.includes("group{teeTimes.reduce("));
ok('tee sheet: the view switch highlights the word (POS-7: a sliding underline)', sheet.includes('<SlidingTabs label="Sheet view"') && !sheet.includes("className=\"flex p-0.5 rounded-md bg-paper border border-line\""));
ok('tee sheet: the key says what the colours and the tags mean', sheet.includes('" />Declined or no-show</span>') && sheet.includes('>M</b> member') && sheet.includes('>R</b> resident'));
ok('tee sheet: today shows who is on the course; another day, the groups booked', sheet.includes('>On the course</div>') && sheet.includes('const onCourseNow = onCourse(teeTimes, today(), nowHM)') && sheet.includes('>Groups booked</div>'));
ok('tee sheet: past tee times come first', sheetRows.indexOf('{PAST} · {gone.length}') < sheetRows.indexOf("rows(slots, 'Tee times', true)"));

ok('the homepage demo mirrors the filled cells and the key', read('src/components/home/TeeSheetDemo.tsx').includes('<span><b>In</b>checked in</span>') && read('src/app/home.module.css').includes('.seatPaid { background: #CFE8D6; }'));
ok('conditions choices wrap on a phone, never cut off', board.includes('whitespace-normal break-words') && !board.includes("text-[13px] truncate ' + (draft"));

ok('the week-ahead link offers demand pricing and lands on it', board.includes('href="/dashboard/schedules#demand-pricing"') && read('src/components/dashboard/DemandPricing.tsx').includes('id="demand-pricing"'));

{
  const { onCourse } = require('../src/lib/on-course') as typeof import('../src/lib/on-course');
  const g = (status: string, players: number) => ({ status, players });
  const day = [
    { date: '2026-11-06', time: '08:00', holes: 18, bookings: [g('completed', 4)] },          // out since 8, back ~12:30
    { date: '2026-11-06', time: '09:00', holes: 18, bookings: [g('confirmed', 2)] },          // not checked in: not counted
    { date: '2026-11-06', time: '06:30', holes: 18, bookings: [g('completed', 3)] },          // finished at 11:00
    { date: '2026-11-06', time: '09:30', holes: 9, bookings: [g('completed', 2)] },           // a 9: back by 11:45
    { date: '2026-11-06', time: '13:00', holes: 18, bookings: [g('completed', 4)] },          // later today
  ];
  const at = onCourse(day, '2026-11-06', '11:15');
  ok('on the course: checked-in groups whose round is still under way (18 ≈ 4½ h, 9 ≈ 2¼ h)', at.groups === 2 && at.players === 6, at);
  ok('…nobody on the course on another day', onCourse(day, '2026-11-07', '11:15').groups === 0);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
