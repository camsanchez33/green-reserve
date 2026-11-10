// Golfer lane, booking flow (LAUNCH_PLAN_SPEC §4): every way out of /book goes to
// the page the golfer came from, as a real link. No database needed.
// Run: npx tsx scripts/golfer-booking-links-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const book = read('src/app/book/BookClient.tsx');
const course = read('src/app/courses/[slug]/CourseBookingClient.tsx');
const member = read('src/app/courses/[slug]/member/page.tsx');
const account = read('src/app/courses/[slug]/account/AccountPortalClient.tsx');

check('/book never sends the golfer back through browser history', !book.includes('router.back()') && !book.includes('router.push('));
check('"Back to tee times" is a link built by backToTimesHref', book.includes('<Link href={backToTimesHref(courseSlug, params, players)}'));
check('a member booking goes back to the member tee times', book.includes("if (params.get('from') === 'member') return `/courses/${courseSlug}/member`;"));
check('…and the member page marks its bookings from=member', /router\.push\(`\/book\?\$\{qp\}`\)/.test(member) && member.includes("from: 'member',"));
check('the course page link keeps the date, party and filters', book.includes("for (const k of ['tod', 'holes', 'product'])") && book.includes("q.set('players', String(players));") && course.includes("if (todFilter !== 'all') qp.set('tod', todFilter);"));
check('both "Pick another time" links return where the golfer picked', book.split("courseSlug ? backToTimesHref(courseSlug, params, requestedPlayers) : '/'").length === 3);
check('the confirmation links are real links, and the bookings link does not prefetch the email', book.includes('prefetch={false}') && book.includes('<Link href={`/courses/${courseSlug}`} className="inline-block text-sm'));
check('the account page can retry a failed load', account.includes("onClick={() => { setError(''); load(); }}"));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall passed');
