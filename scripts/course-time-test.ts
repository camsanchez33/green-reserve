// SD-3 — course-local time, checked. Run: npx tsx scripts/course-time-test.ts
import { todayIn, clockIn, addDaysStr, isPastIn } from '../src/lib/course-time';
import { teeToUtcMs } from '../src/lib/tee-time-utils';
import { easternToIso } from '../src/lib/inquiry-call';
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
// DST (R-BOOK-001): a local tee time must map to the same UTC instant whichever
// side of a clock change the naive UTC reading falls on. Nov 1 2026 and
// Mar 14 2027 are the next two US changes; holds, cutoffs and auto no-shows
// all run off teeToUtcMs.
const iso = (ms: number) => new Date(ms).toISOString();
check('LA 07:00 on fall-back Sunday is 15:00Z (PST)', iso(teeToUtcMs('2026-11-01', '07:00', 'America/Los_Angeles')) === '2026-11-01T15:00:00.000Z', iso(teeToUtcMs('2026-11-01', '07:00', 'America/Los_Angeles')));
check('NY 05:30 on fall-back Sunday is 10:30Z (EST)', iso(teeToUtcMs('2026-11-01', '05:30', 'America/New_York')) === '2026-11-01T10:30:00.000Z', iso(teeToUtcMs('2026-11-01', '05:30', 'America/New_York')));
check('LA 10:00 on fall-back Sunday is 18:00Z', iso(teeToUtcMs('2026-11-01', '10:00', 'America/Los_Angeles')) === '2026-11-01T18:00:00.000Z');
check('LA 07:00 on spring-forward Sunday is 14:00Z (PDT)', iso(teeToUtcMs('2027-03-14', '07:00', 'America/Los_Angeles')) === '2027-03-14T14:00:00.000Z', iso(teeToUtcMs('2027-03-14', '07:00', 'America/Los_Angeles')));
check('NY 06:00 on spring-forward Sunday is 10:00Z (EDT)', iso(teeToUtcMs('2027-03-14', '06:00', 'America/New_York')) === '2027-03-14T10:00:00.000Z', iso(teeToUtcMs('2027-03-14', '06:00', 'America/New_York')));
check('NY 10:56 in summer is 14:56Z', iso(teeToUtcMs('2026-07-10', '10:56', 'America/New_York')) === '2026-07-10T14:56:00.000Z');
check('Honolulu never shifts', iso(teeToUtcMs('2026-11-01', '07:00', 'Pacific/Honolulu')) === '2026-11-01T17:00:00.000Z');
check('discovery call 08:00 ET on fall-back Sunday is 13:00Z', easternToIso('2026-11-01', '08:00') === '2026-11-01T13:00:00.000Z', String(easternToIso('2026-11-01', '08:00')));
check('discovery call 08:00 ET on spring-forward Sunday is 12:00Z', easternToIso('2027-03-14', '08:00') === '2027-03-14T12:00:00.000Z', String(easternToIso('2027-03-14', '08:00')));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
