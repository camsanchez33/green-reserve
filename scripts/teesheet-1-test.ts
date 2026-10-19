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
check('the header says how many are awaiting check-in', page.includes('{awaitingCheckIn} awaiting check-in'));
check('the rate is no longer in the header', !page.includes('commonRate'));
check('the time panel always shows its rate', page.includes('players · {rateLabel(panelSlot)}'));
check('Find golfer sits in the sheet bar with a refresh icon', page.includes('id="sheet-search"') && page.includes('aria-label="Refresh the sheet"'));
check('no Refresh text button in the header', !/>\s*Refresh\s*</.test(page));
check('late groups use the course clock', page.includes("Number(nowHM.slice(0, 2)) * 60"));
check('late groups and the color key live in the bar under the date', page.includes('past their time, not checked in') && page.includes('Booked, not paid yet</span>'));
const board = src('src/components/dashboard/TeeSheetBoard.tsx');
check('squares take a color wash, not just the edge', /ok: 'border-l-\[3px\] border-ok !bg-ok/.test(board));
check('the key is gone from under the board', !board.includes('TONE_LABEL[t]} />)'));
check('the calendar opens left-aligned, inside the screen', src('src/components/ui/MonthPicker.tsx').includes('absolute left-0 top-full') && src('src/components/ui/MonthPicker.tsx').includes('max-w-[calc(100vw-32px)]'));
check('an agreement announcement clears once nothing is left to sign', src('src/app/api/operator/announcements/route.ts').includes('every(d => !d.needsSigning)'));
check('the announcement banner uses the attention style', src('src/components/AnnouncementBanner.tsx').includes('border-l-[3px] border-l-warn'));
const demo = src('src/components/home/TeeSheetDemo.tsx');
check('the homepage demo mirrors: awaiting count, no rate, key above', demo.includes('awaiting check-in') && !demo.includes('{HOLES} holes'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
