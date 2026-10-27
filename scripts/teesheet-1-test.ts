// Tee Sheet rework, batch 1 (Cam 2026-10-19, OPERATOR_REWORK_SPEC §4): header
// counts incl. awaiting check-in, the rate off the header, Find golfer + a
// refresh icon in the sheet's bar, late groups and the color key in the bar
// under the date, tinted squares, the calendar opening on screen, and an
// agreement announcement clearing once signed. Source-level guards. Pure.
// Run: npx tsx scripts/teesheet-1-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const src = (p: string) => readFileSync(p, 'utf8');
const page = src('src/app/dashboard/page.tsx');
// DENSE-4b (Cam 2026-10-27, "yes to all four numbers"): the day strip replaced the header sentence.
check('the day strip shows players, checked in, and paid / not paid yet only with money.payments', page.includes('{livePlayers}<span') && page.includes('{checkedInPlayers}<span') && page.includes("access.can('money.payments')") && page.includes('/api/operator/sheet-money?date='));
check('the strip\'s Not paid yet is every unpaid group on the day, with how many are past their time', src('src/app/api/operator/sheet-money/route.ts').includes('a.revenue.outstandingCents + a.revenue.upcomingCents') && page.includes('{dayMoney.lateGroups} past'));
check('a walk-in who already played gets no booking confirmation', src('src/app/api/operator/bookings/route.ts').includes('if (golferEmail && !checkInNow && body.late !== true)'));
check('the strip\'s money route needs money.payments', src('src/app/api/operator/sheet-money/route.ts').includes("requirePermission(session, 'money.payments')"));
check('the rate is no longer in the header', !page.includes('commonRate'));
check('the time panel always shows its rate', page.includes("holes · ${panelSlot.greenFee.toFixed(2)} a player"));
check('Find golfer sits in the sheet bar with a refresh icon', page.includes('id="sheet-search"') && page.includes('aria-label="Refresh the sheet"'));
check('no Refresh text button in the header', !/>\s*Refresh\s*</.test(page));
check('mark no-show is reachable from the time panel', page.includes("bookingLifecycle(b, 'no_show')") && page.includes("late && access.can('sheet.no_show') && (\n            <button onClick={() => bookingLifecycle(b, 'no_show')"));
check('still coming (a late group) is reachable and clears it from the late list', page.includes('setStillComing(prev => new Set(prev).add(b.id))') && page.includes('!stillComing.has(b.id) && !b.noShowAt'));
// DENSE-4 (Cam 2026-10-27): seat rows replaced the board — the key shows the money edge and the checked-in / member fills the rows use.
check('the key swatches match the seat cells', page.includes('border-l-[3px] border-ok" />Paid') && page.includes('bg-ok/[0.12]" />Checked in') && page.includes('bg-[#F1EEE4]" />Member or resident'));
check('late groups use the course clock', page.includes("Number(nowHM.slice(0, 2)) * 60"));
check('late groups and the color key live in the bar under the date', page.includes('not checked in`') && page.includes('/>Owes</span>'));
const rows = src('src/components/dashboard/TeeSheetRows.tsx');
check('a group cell carries its money edge and a checked-in fill', rows.includes("ok: 'border-l-ok'") && rows.includes("g.status === 'completed' ? 'bg-ok/[0.12] '"));
check('no key or helper sentence under the rows', !rows.includes('Tap a time to'));
check('the calendar opens left-aligned, inside the screen', src('src/components/ui/MonthPicker.tsx').includes('absolute left-0 top-full') && src('src/components/ui/MonthPicker.tsx').includes('max-w-[calc(100vw-32px)]'));
check('an agreement announcement clears once nothing is left to sign', src('src/app/api/operator/announcements/route.ts').includes('/agreement/i.test(newest.title)') && src('src/app/api/operator/announcements/route.ts').includes('st.total > 0 && st.documents.every(d => !d.needsSigning)'));
check('the announcement banner uses the attention style', src('src/components/AnnouncementBanner.tsx').includes('border-l-[3px] border-l-warn'));
// Cam 2026-10-27: a time LATE_ADD_MINUTES (20) after it went off drops to "Past tee times" at the bottom, and nobody new joins it.
const late = src('src/lib/late-add.ts'), claim = src('src/lib/claim-tee-time.ts');
check('the late-add rule is 20 minutes, in one place', late.includes('LATE_ADD_MINUTES = 20') && late.includes('m(time) + LATE_ADD_MINUTES < m(clock)'));
check('every booking path refuses a time 20 minutes gone (claimTeeTime)', claim.includes("throw new TeeTimeClaimError('PAST')") && claim.includes('LATE_ADD_MINUTES * 60_000 < Date.now()'));
check('the three callers map PAST to a message', ['src/app/api/bookings/route.ts', 'src/lib/counter-pay.ts', 'src/app/api/admin/tee-sheet/route.ts'].every(f => src(f).includes("'PAST'")));
check('today\'s gone times move to a collapsed Past tee times section (not while searching)', page.includes('isGone={selectedDate === today() && !q ? (t => lateForAdding(t.time, nowHM))') && rows.includes('Past tee times · {gone.length}') && rows.includes('useState(false)') && rows.includes('aria-expanded={goneOpen}'));
check('a gone time offers only "a walk-in who already played", sent as late', page.includes("selectedDate === today() && !lateForAdding(panelSlot.time, nowHM)))") && page.includes('Add a walk-in who already played') && page.includes("...(late ? { late: true } : {})"));
check('only a staff walk-in marked late skips the cut-off', src('src/lib/counter-pay.ts').includes("{ allowLate: input.late === true && source === 'walk_in' && actor.type === 'staff' }") && claim.includes('if (!opts.allowLate && teeAt'));
check('the sheet re-reads the clock every minute', page.includes('setInterval(() => setClockTick(t => t + 1), 60_000)'));
const demo = src('src/components/home/TeeSheetDemo.tsx');
check('the homepage demo mirrors: players and checked in, no rate, key above', demo.includes('Players <b>') && demo.includes('Checked in <b>') && !demo.includes('{HOLES} holes'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
