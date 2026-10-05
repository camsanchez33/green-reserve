// R-PAY-003 / R-CRON-002 / R-GOLF-001 — every cutoff uses the cancellation
// window the booking was MADE under (Booking.cancellationHoursAtBooking), never
// the course's current one. An owner moving 24h -> 48h used to make the hold
// fire at 48h and keep a fee from a golfer cancelling inside the free window
// they agreed to. Pure. Run: npx tsx scripts/cutoff-window-test.ts
import { readFileSync } from 'fs';
import { bookingWindowHours } from '../src/lib/cancel-policy';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

check('the booking\'s own window wins over a later course change', bookingWindowHours({ cancellationHoursAtBooking: 24 }, { cancellationHours: 48 }) === 24);
check('a shorter later window does not apply either', bookingWindowHours({ cancellationHoursAtBooking: 48 }, { cancellationHours: 24 }) === 48);
check('a 0h window copied on the booking is kept (not treated as missing)', bookingWindowHours({ cancellationHoursAtBooking: 0 }, { cancellationHours: 24 }) === 0);
check('rows older than the copy fall back to the course', bookingWindowHours({ cancellationHoursAtBooking: null }, { cancellationHours: 24 }) === 24);

// Guard: no cutoff computed from the course's live window in the places that
// charge, warn or tell the golfer whether they can still cancel free.
const CUTOFF_FILES = [
  'src/app/api/cron/hourly/route.ts',
  'src/app/api/cron/cancellation-cutoff/route.ts',
  'src/app/api/manage/[bookingId]/route.ts',
  'src/lib/cancel-booking.ts',
];
for (const f of CUTOFF_FILES) {
  const src = readFileSync(f, 'utf8');
  check(`${f} computes no cutoff from course.cancellationHours`, !/course\.cancellationHours\s*\*/.test(src));
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
