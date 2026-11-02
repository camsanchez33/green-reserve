// DASH-D (Cam 2026-11-01, "conditions on the booking page"): carts / range / greens / pins
// set on the dashboard's Home show on the golfer booking page — only the fields set, only
// while fresh (18 hours), never anything the cleaner doesn't know.
// Pure. Run: npx tsx scripts/booking-conditions-test.ts
import { readFileSync } from 'fs';
import { golferConditionLines, CONDITIONS_FRESH_HOURS } from '../src/lib/course-conditions';
import { normalizeDbCourse } from '../src/lib/normalize-course';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const now = new Date('2026-11-02T14:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000);

const lines = golferConditionLines({ carts: 'path', range: 'mats', greens: 'lava', junk: 'x' }, hoursAgo(2), now);
ok('set fields only, in the fixed order, unknown values dropped', JSON.stringify(lines) === JSON.stringify(['Carts: Path only', 'Range: Mats']), lines);
ok('fresh for 18 hours', CONDITIONS_FRESH_HOURS === 18 && golferConditionLines({ carts: 'path' }, hoursAgo(17.9), now).length === 1);
ok('stale after 18 hours — yesterday\'s "path only" never shows as today\'s', golferConditionLines({ carts: 'path' }, hoursAgo(18.1), now).length === 0);
ok('never set → nothing', golferConditionLines({ carts: 'path' }, null, now).length === 0 && golferConditionLines(null, hoursAgo(1), now).length === 0);
ok('the public course carries it', Array.isArray(normalizeDbCourse({ conditionsDetail: { pins: 'back' }, conditionsDetailAt: new Date() }).conditions_today) && normalizeDbCourse({ conditionsDetail: { pins: 'back' }, conditionsDetailAt: new Date() }).conditions_today[0] === 'Pins: Back');
const page = readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8');
ok('the booking page shows it as a plain line (not an alert), only when there is one', page.includes("(course.conditions_today?.length ?? 0) > 0 && (") && page.includes("{course.conditions_today!.join(' · ')}"));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
