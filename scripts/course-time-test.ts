// SD-3 — course-local time, checked. Run: npx tsx scripts/course-time-test.ts
import { todayIn, clockIn, addDaysStr, isPastIn } from '../src/lib/course-time';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
// 2026-09-15 01:30 UTC = Sep 14 21:30 Eastern = Sep 14 18:30 Pacific = Sep 15 10:30 Tokyo
const t = new Date('2026-09-15T01:30:00Z');
check('Eastern is still Sep 14', todayIn('America/New_York', t) === '2026-09-14', todayIn('America/New_York', t));
check('Pacific is still Sep 14', todayIn('America/Los_Angeles', t) === '2026-09-14');
check('Hawaii is still Sep 14', todayIn('Pacific/Honolulu', t) === '2026-09-14');
check('Eastern clock 21:30', clockIn('America/New_York', t) === '21:30', clockIn('America/New_York', t));
check('Pacific clock 18:30', clockIn('America/Los_Angeles', t) === '18:30', clockIn('America/Los_Angeles', t));
check('bad tz falls back to Eastern', todayIn('Mars/Olympus', t) === '2026-09-14');
check('null tz falls back to Eastern', clockIn(null, t) === '21:30');
check('addDaysStr crosses a month', addDaysStr('2026-09-30', 2) === '2026-10-02');
check('addDaysStr goes back across a year', addDaysStr('2026-01-01', -1) === '2025-12-31');
check('a 19:00 Pacific slot on Sep 14 is still ahead at 18:30 Pacific', isPastIn('America/Los_Angeles', '2026-09-14', '19:00', t) === false);
check('a 21:00 Eastern slot on Sep 14 has passed at 21:30 Eastern', isPastIn('America/New_York', '2026-09-14', '21:00', t) === true);
check('tomorrow is never past', isPastIn('America/New_York', '2026-09-15', '06:00', t) === false);
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
