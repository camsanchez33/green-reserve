// BOOKING WINDOWS — the window math, checked. Run: npx tsx scripts/booking-window-test.ts
import { dayOffset, withinWindow, lastBookableDate, windowFor, generationHorizonDays } from '../src/lib/booking-window';

const now = new Date('2026-09-14T15:00:00Z');
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

check('today is offset 0', dayOffset('2026-09-14', now) === 0);
check('tomorrow is offset 1', dayOffset('2026-09-15', now) === 1);
check('yesterday is offset -1', dayOffset('2026-09-13', now) === -1);
check('7-day window includes day 7', withinWindow('2026-09-21', 7, now) === true);
check('7-day window excludes day 8', withinWindow('2026-09-22', 7, now) === false);
check('last bookable for 7 days is Sep 21', lastBookableDate(7, now) === '2026-09-21', lastBookableDate(7, now));
check('month boundary: Sep 30 + 3 → Oct 3', lastBookableDate(3, new Date('2026-09-30T12:00:00Z')) === '2026-10-03');
const course = { publicAdvanceDays: 7, memberAdvanceDays: 14, hasMemberPricing: true };
check('public viewer gets 7', windowFor(course, null).days === 7);
check('tierless member gets the course member default 14', windowFor(course, { tier: null }).days === 14);
check('tier member gets the tier window 30', windowFor(course, { tier: { advanceBookingDays: 30 } }).days === 30);
check('generation horizon = widest window + 1 (31)', generationHorizonDays(course, [{ advanceBookingDays: 30 }]) === 31);
check('generation horizon never below 8', generationHorizonDays({ publicAdvanceDays: 3, memberAdvanceDays: 3 }, []) === 8);
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
