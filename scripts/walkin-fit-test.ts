// Cam 2026-10-19: adding a time within a few minutes of another group warns
// and asks once ("Add anyway"). Pure. Run: npx tsx scripts/walkin-fit-test.ts
import { readFileSync } from 'fs';
import { timesTooClose, FIT_WINDOW_MIN } from '../src/lib/tee-time-fit';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const sheet = ['08:00', '08:10', '08:20:00', '09:00'];
check('window is 5 minutes', FIT_WINDOW_MIN === 5);
check('3 min after 08:00 is too close', timesTooClose('08:03', sheet)[0]?.time === '08:00' && timesTooClose('08:03', sheet)[0]?.gap === 3);
check('exactly on a time is flagged with gap 0', timesTooClose('08:10', sheet)[0]?.gap === 0);
check('seconds on stored times are ignored', timesTooClose('08:22', sheet)[0]?.time === '08:20');
check('between two times both are reported, nearest first', JSON.stringify(timesTooClose('08:05', sheet).map(x => x.time)) === '["08:00","08:10"]');
check('6 minutes away is fine', timesTooClose('08:26', sheet).length === 0 && timesTooClose('08:54', sheet).length === 0);
check('5 minutes away still warns', timesTooClose('08:55', sheet).length === 1);
check('an empty day never warns', timesTooClose('08:00', []).length === 0);
check('a bad time never warns', timesTooClose('', sheet).length === 0);
const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
check('the Add time form gets the day’s times, blocked ones left out', page.includes("existingTimes={teeTimes.filter(t => t.status !== 'blocked').map(t => t.time)}"));
check('it names a tee time, not a group that may not exist', page.includes('min from the ${fmtTime(close[0].time)} tee time'));
check('a close time asks once before saving', page.includes('if (needsConfirm) { setConfirmedClose(time); return; }') && page.includes("'Add anyway'"));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
