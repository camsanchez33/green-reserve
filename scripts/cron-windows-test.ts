// R-CRON-003 — the hourly cron's time-based emails must reach every booking.
// The cron runs once an hour; the old ±15-minute windows were 30 wide, so about
// half of all tee/cutoff minutes fell between two runs and never got the email.
// Simulates hourly runs for every minute-of-hour and checks each booking is hit.
// Pure — no database. Run: npx tsx scripts/cron-windows-test.ts
import { cutoffWarningDue, checkInEmailDue } from '../src/lib/cron-windows';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

// minutes from run k to the event, for an event at minute `m` past some hour,
// with runs at :00 from 10 hours before until just after it.
const runsBefore = (m: number) => Array.from({ length: 12 }, (_, k) => 600 + m - 60 * k);

// 1. Cutoff warning: exactly one run lands in the window, whatever the minute.
{
  const misses: number[] = [], doubles: number[] = [];
  for (let m = 0; m < 60; m++) {
    const hits = runsBefore(m).filter(cutoffWarningDue).length;
    if (hits === 0) misses.push(m);
    if (hits > 1) doubles.push(m);
  }
  check('every cutoff minute gets the warning', misses.length === 0, misses.length ? `missed at :${misses.join(', :')}` : '');
  check('no cutoff minute gets the warning twice', doubles.length === 0, doubles.length ? `twice at :${doubles.join(', :')}` : '');
  check('the warning is never sent after the cutoff', !cutoffWarningDue(0) && !cutoffWarningDue(-5));
}

// 2. Check-in email: the first run inside the window sends it (the caller then
// flips paymentStatus, so later runs skip the booking). Every minute must have one.
{
  for (const windowHours of [1, 2, 3, 6]) {
    const W = windowHours * 60;
    const misses: number[] = [];
    for (let m = 0; m < 60; m++) {
      const first = runsBefore(m).find(x => checkInEmailDue(x, W));
      if (first === undefined) misses.push(m);
      else if (first > W || first <= W - 60) misses.push(m); // sent within the first hour of the window
    }
    check(`check-in email reaches every tee minute (window ${windowHours} h)`, misses.length === 0, misses.length ? `missed at :${misses.join(', :')}` : '');
  }
  // The old 10:20 / 3 h example from the ledger: runs see 200 and 140 minutes.
  check('the ledger example (tee 10:20, 3 h window) is covered', checkInEmailDue(140, 180) && !checkInEmailDue(200, 180));
  check('a booking made inside the window still gets it on the next run', checkInEmailDue(45, 180));
  check('never after the tee time', !checkInEmailDue(0, 180) && !checkInEmailDue(-10, 180));
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
