// HOME-1 (Cam 2026-11-05, page-by-page pass on Home): the weather and next tee times open the page,
// Finish setting up lands on the field itself, Needs you leads with counts, Staff notes, a clearer heat map.
// Pure + source pins. Run: npx tsx scripts/home-page-test.ts
import { readFileSync } from 'fs';
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

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
