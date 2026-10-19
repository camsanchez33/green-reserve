// Settings rework part 5 (Cam 2026-10-19): Facilities as one checklist, shown to golfers.
// Run: npx tsx scripts/facilities-test.ts
import { readFileSync } from 'fs';
import { facilityLines } from '../src/lib/facilities';
import { normalizeDbCourse } from '../src/lib/normalize-course';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };

check('nothing ticked → no lines', facilityLines({}).length === 0);
const l = facilityLines({ hasDrivingRange: true, drivingRangeType: 'grass', hasPushCartRental: true, pushCartRateCents: 500, hasCaddies: true, caddieType: 'looper', caddieLooperRateCents: 8000, restaurantType: 'snack_bar', amenities: [' Dog-friendly ', ''] });
check('range with its type and balls', l[0] === 'Driving range (grass tees, balls included)');
check('push carts priced in dollars', l.includes('Push carts ($5)'));
check('caddies per bag', l.includes('Caddies ($80 a bag)'));
check('food in words', l.includes('Snack bar'));
check('extras trimmed, blanks dropped', l[l.length - 1] === 'Dog-friendly');
check('no food is not a line', !facilityLines({ restaurantType: 'none' }).length);
const n = normalizeDbCourse({ amenities: ['Simulator bay'], hasPuttingGreen: true }) as Record<string, unknown>;
check('amenities stay a list (a joined string crashed the booking page)', Array.isArray(n.amenities));
check('golfer data carries facilities', JSON.stringify(n.facilities) === '["Putting green","Simulator bay"]');

const page = readFileSync('src/app/dashboard/settings/page.tsx', 'utf8');
const booking = readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8');
check('settings preview uses the same lines', page.includes('facilityLines({'));
check('no toggle switches left in Facilities', !page.includes('label="Driving Range"'));
check('booking page lists facilities, no tinted pills', booking.includes('>Facilities</h2>') && !booking.includes('backgroundColor: `${accent}10`, color: accent'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
