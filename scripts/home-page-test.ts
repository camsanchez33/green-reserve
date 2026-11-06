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
ok('the weather and next tee times are one bar at the top; Coming up is gone from the bottom', home.includes('<NextUpBar home={home}') && !home.includes('>Coming up<') && home.includes('forecastAt(hours, home.today, s.time)'));
ok('Finish setting up is one line on Home', home.includes('<FinishSetup compact items='));
ok('…and each button lands on the field itself', settingsHref('Your course', 'gallery') === '/dashboard/settings?section=Your%20course&focus=gallery' && read('src/app/dashboard/settings/page.tsx').includes('data-setup="gallery"') && read('src/app/dashboard/settings/page.tsx').includes("searchParams.get('focus')"));
ok('Needs you leads with counts: cards declined, past their time, no-shows, unread', ['Cards declined', 'Past their time', 'No-shows today', 'Unread messages'].every(l => home.includes(`label: '${l}'`)) && read('src/lib/operator-home.ts').includes('const noShows = '));
ok('the refresh button sits beside the time, not in its own box', home.includes('aria-label="Refresh"') && !home.includes('w-9 h-9 rounded-md bg-white border border-line'));
ok('two columns that stack, so no card leaves a gap under its neighbour', home.includes('lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] items-start') && !home.includes('self-start'));
ok('the bar chart has room between hours', home.includes('gap-2 sm:gap-3 h-44') && home.includes('max-w-[14px]'));

const board = read('src/components/dashboard/home/HomeBoard.tsx');
ok('staff notes: what the last shift left, and a box for the next', board.includes('>Staff notes<') && board.includes('Nothing from the last shift.') && board.includes('Leave a note for the next shift…'));
ok('the heat map says what it shows, with a scale and each day\'s total', board.includes('how full each hour is') && board.includes('Empty') && board.includes('no tee times</span>') && board.includes('>Booked<'));

// HOME-2 (Cam 2026-11-05): goals on the numbers the course picks; conditions open to what the course wants golfers to know.
const goalsLib = read('src/lib/course-goals.ts');
ok('goals can be set on money, rounds, players booked, fill and new golfers', ['collected', 'rounds', 'booked', 'fill', 'new_golfers'].every(k => goalsLib.includes(`key: '${k}'`)));
ok('Home shows the goals card to every login; setting needs settings.edit', home.includes('<GoalsCard key=') && home.includes("canSet={access.can('settings.edit')}") && !home.includes('MonthGoalCard'));
ok('each goal: actual of target, a day to go, last month, change and remove', board.includes(' a day to go') && board.includes('>Change<') && board.includes('>Remove<') && board.includes('Add a goal'));
ok('the old single money goal and its route are gone', !existsSync('src/app/api/operator/month-goal/route.ts'));
const cond = read('src/lib/course-conditions.ts');
ok('conditions: the course\'s own lines, shown to golfers with the four choices', cond.includes('...(c.lines ?? [])') && board.includes('Your own · golfers see these too') && board.includes('CONDITION_SUGGESTIONS'));

// Cam 2026-11-06: "Action needed" on Home and Money; the conditions editor lines up and its suggestions read as shortcuts.
ok('"Action needed", not "Needs you", on Home and Money', home.includes('>Action needed</h2>') && read('src/app/dashboard/money/page.tsx').includes('>Action needed</h2>') && !home.includes('>Needs you</h2>'));
ok('conditions editor: label above, equal options, "+" shortcuts', board.includes('repeat(${f.options.length}, minmax(0, 1fr))') && board.includes('>+ {x}</button>'));

// SHEET-3 (Cam 2026-11-06, the tee sheet notes): quiet actions, one shape for every day number (groups moved up),
// highlighted view words, a search field, no boxed arrows or reload, a one-line late bar, a key that says Edge / Fill,
// and past tee times at the top.
const sheet = read('src/app/dashboard/page.tsx'), sheetRows = read('src/components/dashboard/TeeSheetRows.tsx');
ok('tee sheet: the groups count is in the day strip, not a footer', sheet.includes('const dayGroups = ') && sheet.includes('>Times booked</div>') && !sheet.includes("group{teeTimes.reduce("));
ok('tee sheet: the view switch highlights the word', sheet.includes("'text-ink font-semibold border-pine'") && !sheet.includes("className=\"flex p-0.5 rounded-md bg-paper border border-line\""));
ok('tee sheet: the key says what the colours and the tags mean', sheet.includes('" />Declined or no-show</span>') && sheet.includes('>M</b> member') && sheet.includes('>R</b> resident'));
ok('tee sheet: "Times booked N of M", groups under it', sheet.includes('>Times booked</div>') && sheet.includes('const timesBooked = '));
ok('tee sheet: past tee times come first', sheetRows.indexOf('{PAST} · {gone.length}') < sheetRows.indexOf("rows(slots, 'Tee times', true)"));

ok('the homepage demo mirrors the filled cells and the key', read('src/components/home/TeeSheetDemo.tsx').includes('<span><b>In</b>checked in</span>') && read('src/app/home.module.css').includes('.seatPaid { background: #CFE8D6; }'));
ok('conditions choices wrap on a phone, never cut off', board.includes('whitespace-normal break-words') && !board.includes("text-[13px] truncate ' + (draft"));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
