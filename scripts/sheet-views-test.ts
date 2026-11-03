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
ok('the list price only with money.payments', page.includes("showMoney={access.can('money.payments')}") && list.includes('{showMoney && <span')
  && !list.includes('min-w-[30rem]'));
ok('the calendar prints the share, never colour alone', cal.includes("`${pct}% full`") && cal.includes("'Full'"));
ok('a calendar day opens that day in the grid', page.includes("onPick={d => { setSelectedDate(d); setSheetView('grid'); }}"));
ok('the view is remembered per browser, guarded, grid by default', page.includes("useState<SheetView>('grid')") && page.includes("localStorage.getItem('gr_sheet_view')") && /try \{ localStorage\.setItem\('gr_sheet_view'/.test(page));
ok('the switch says which view is on', page.includes('aria-pressed={sheetView === v.id}'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
