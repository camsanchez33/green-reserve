// VIEWS-1 (Cam 2026-11-03): the tee sheet's Grid / List / Calendar views.
// Pins: the month summary is this course's only and leaves blocked times out; the List and
// Calendar views only read (every action stays on the time's card); money shows only with
// money.payments; the choice is remembered per browser and the grid is the default.
// Pure. Run: npx tsx scripts/sheet-views-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
const route = read('src/app/api/operator/tee-times/route.ts');
const list = read('src/components/dashboard/TeeSheetList.tsx');
const cal = read('src/components/dashboard/TeeSheetCalendar.tsx');
const page = read('src/app/dashboard/page.tsx');

const month = route.slice(route.indexOf("const month = searchParams.get('month')"), route.indexOf("// SD-3: the default day"));
ok('the month summary sits after the session check', route.indexOf('if (!session) return') > 0 && route.indexOf('if (!session) return') < route.indexOf("const month = searchParams.get('month')"));
ok('the month summary is scoped to the course and skips blocked times', month.includes('courseId: session.courseId') && month.includes("status: { not: 'blocked' }"));
ok('a bad month is refused', month.includes('status: 400') && month.includes('(0[1-9]|1[0-2])'));
ok('List and Calendar never write (no POST/PATCH/DELETE)', ![list, cal].some(f => /method:\s*'(POST|PATCH|DELETE)'/.test(f)));
ok('a list line opens the time\'s card', list.includes('onClick={() => onSelect(s.id)}'));
ok('the list amount only with money.payments', page.includes("showMoney={access.can('money.payments')}") && list.includes('showMoney && g.totalAmount != null') && list.includes('roundChargeCents(') && !list.includes('`$${(g.totalAmount')
  && !list.includes('min-w-[30rem]'));
ok('LIST-2: a line carries the grid\'s fill and tags, what they play, how booked and the exact rate', list.includes('FILL[t]') && list.includes('groupTags(g)') && list.includes('roundName(s)') && list.includes('rateWords(g)') && !list.includes('member or resident'));
ok('LIST-2: paid and checked-in groups owe nothing in words', list.includes("t === 'ok' ? ''"));
{
  const { rateWords, groupTags } = require('../src/components/dashboard/TeeSheetRows') as typeof import('../src/components/dashboard/TeeSheetRows');
  const g = (x: object) => ({ id: 'b', golferName: 'A', golferEmail: '', players: 3, status: 'confirmed', paymentStatus: 'pending', ...x });
  ok('the exact rate: the tier, residents, senior, pack, nothing for the public price', rateWords(g({ appliedRate: 'Full Member' })) === 'Full Member' && rateWords(g({ appliedRate: 'Senior' })) === 'Senior member' && rateWords(g({ appliedRate: 'resident', residentPlayers: 2 })) === '2 residents'
    && rateWords(g({ appliedRate: 'senior' })) === 'Senior' && rateWords(g({ appliedRate: 'pack' })) === 'Round pack' && rateWords(g({ appliedRate: 'standard' })) === '');
  ok('a resident rate is tagged R only, not M', groupTags(g({ appliedRate: 'resident', residentPlayers: 1 })).join() === 'R' && groupTags(g({ appliedRate: 'Full Member' })).join() === 'M');
}
ok('the calendar prints players and the share, never colour alone', cal.includes("'players'} · ${pct >= 100 ? 'Full' : `${pct}%`}") && !cal.includes('Players booked of spots'));
{
  const { emptyDayWords, notYetWords } = require('../src/lib/calendar-days') as typeof import('../src/lib/calendar-days');
  const info = { today: '2026-11-06', publicDays: 7, openWeekdays: [1, 2, 3, 4, 5, 6], blockedDates: ['2026-11-11'] };
  ok('CAL-2: an empty day says why — blocked, closed, or when golfers can book it', emptyDayWords('2026-11-11', info) === 'All times blocked'
    && emptyDayWords('2026-11-08', info) === 'Closed · no schedule' && emptyDayWords('2026-11-23', info) === 'Not bookable till Nov 16'
    && emptyDayWords('2026-11-02', info) === 'No tee times');
  ok('CAL-2: a day golfers can already book says nothing extra', notYetWords('2026-11-13', info) === '' && notYetWords('2026-11-14', info) === 'Not bookable till Nov 7');
  ok('CAL-2: the route sends the reasons for this course only', month.includes('info }') && month.includes("teeTimeSchedule.findMany({ where: { courseId: session.courseId, active: true }"));
}
ok('search on the Calendar asks for a day', page.includes("disabled={sheetView === 'calendar'}") && page.includes("'Pick a day to search'"));
ok('a calendar day opens that day in the grid', page.includes("onPick={d => { setSelectedDate(d); setSheetView('grid'); }}"));
ok('the view is remembered per browser, guarded, grid by default', page.includes("useState<SheetView>('grid')") && page.includes("localStorage.getItem('gr_sheet_view')") && /try \{ localStorage\.setItem\('gr_sheet_view'/.test(page));
ok('the switch says which view is on', page.includes('aria-pressed={sheetView === v.id}'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
