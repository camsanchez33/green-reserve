// Settings rework part 4 (Cam 2026-10-19): booking rules in plain words, and
// golfers actually see the dress code and walking rule.
// Run: npx tsx scripts/booking-rules-test.ts
import { readFileSync } from 'fs';
import { walkingWords, walkingSummary } from '../src/lib/walking';
import { normalizeDbCourse } from '../src/lib/normalize-course';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };

check('every walking rule has words', ['always', 'weekdays', 'after12', 'never'].every(k => walkingWords(k).length > 5));
check('carts-only says no walking', walkingWords('never').includes('no walking'));
check('unknown rule reads as any time', walkingWords(undefined) === 'Walking any time.');
// CART-1: the course's walking line is summed up from its running schedule rows.
check('every cell walkable reads as any time', walkingSummary([{ walkingAllowed: true, walkingWeekend: true }]) === 'always');
check('no cell walkable reads as carts only', walkingSummary([{ walkingAllowed: false, walkingWeekend: false }, { walkingAllowed: false }]) === 'never');
check('weekend mornings ride-only reads as some tee times', walkingSummary([{ walkingAllowed: true, walkingWeekend: false }, { walkingAllowed: true, walkingWeekend: null }]) === 'some');
check('"some" has words', walkingWords('some').includes('some tee times'));
const n = normalizeDbCourse({ schedules: [{ walkingAllowed: false, walkingWeekend: false }], walkingAllowed: 'always', walkingNote: 'Carts are free.', dresscode: [' Collared shirts ', '', 'No denim'] }) as Record<string, unknown>;
check('golfer data sums walking up from the schedule, not the old course word', n.walking_policy === 'never' && n.cart_required === true && n.walking_note === 'Carts are free.');
check('golfer data carries a clean dress code', JSON.stringify(n.dress_code) === '["Collared shirts","No denim"]');

const page = readFileSync('src/app/dashboard/settings/page.tsx', 'utf8');
const booking = readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8');
check('no dress-code toggle chips left', !page.includes("'Collared shirt required'"));
check('settings points walking at the Schedule price table', page.includes('Schedule → What it costs') && !page.includes('WALKING_CHOICES') && booking.includes('walkingWords(course.walking_policy)'));
check('booking page no longer says "Allowed" for a carts-only course', !booking.includes("course.walking_allowed ? 'Allowed' : 'Cart only'"));
check('booking page shows the dress code', booking.includes('Dress code'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
