// LIKE wildcards in typed values (Admin lane finding, 2026-11-17): Prisma runs `equals` / `contains` with
// mode 'insensitive' as an unescaped ILIKE, so a guest booked as "%@gmail.com" matched any Gmail member at
// check-in (member cart price, charge on account). lib/like-exact escapes \ % _; this proves a % email and a _
// email find only their own exact record, on the membership-at-check-in path and the other shared lookups,
// and that sign-in and booking refuse % and \ at the door.
// Needs a database. Run: npx tsx scripts/like-exact-db-test.ts
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { prisma } from '../src/lib/prisma';
import { likeExact, ciEquals, ciContains, LIKE_UNSAFE_EMAIL } from '../src/lib/like-exact';
import { EMAIL_RE, classifyIdentifier } from '../src/lib/golfer-otp';
import { cartAddOnCentsFor } from '../src/lib/checkin-booking';
import { canLogIn } from '../src/lib/member-session';
import { keyMatch } from '../src/lib/golfer-key';

const TAG = 'likeexactdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.golferAccount.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  // ── the helper ──
  ok('likeExact escapes \\ % _ and nothing else', likeExact('a_b%c\\d.e@f') === 'a\\_b\\%c\\\\d.e@f', likeExact('a_b%c\\d.e@f'));
  ok('ciEquals / ciContains are insensitive and escaped', JSON.stringify(ciEquals('%')) === JSON.stringify({ equals: '\\%', mode: 'insensitive' }) && JSON.stringify(ciContains('_')) === JSON.stringify({ contains: '\\_', mode: 'insensitive' }));

  // ── the door: sign-in and booking ──
  ok('sign-in refuses % and \\ in an email', !EMAIL_RE.test('%@gmail.com') && !EMAIL_RE.test('a\\b@gmail.com') && classifyIdentifier('%@gmail.com') === null);
  ok('…and never reads a refused address as a phone number', classifyIdentifier('5551234567%@gmail.com') === null);
  ok('…but allows _ (legal and common) and plain addresses', EMAIL_RE.test('john_smith@gmail.com') && classifyIdentifier('John_Smith@Gmail.com')?.identifier === 'john_smith@gmail.com');
  ok('…and a phone still signs in', classifyIdentifier('(555) 123-4567')?.type === 'phone');
  ok('LIKE_UNSAFE_EMAIL: % and \\ only', LIKE_UNSAFE_EMAIL.test('%@x.com') && LIKE_UNSAFE_EMAIL.test('a\\@x.com') && !LIKE_UNSAFE_EMAIL.test('a_b@x.com'));
  const route = readFileSync('src/app/api/bookings/route.ts', 'utf8');
  ok('booking route refuses % and \\ in the golfer email', /LIKE_UNSAFE_EMAIL\.test\(golferEmail\)\)\s*\n\s*return NextResponse\.json\(\{ error: 'Please enter a valid email address\.' \}/.test(route));
  ok('setup-intent refuses them too', /LIKE_UNSAFE_EMAIL\.test\(email\)/.test(readFileSync('src/app/api/bookings/setup-intent/route.ts', 'utf8')));

  // ── no raw insensitive equals / contains left in shared code ──
  // Anywhere in src: 'insensitive' or QueryMode only inside lib/like-exact, plus member-stats' `in` (LOWER() IN, exact).
  const raw = execSync(`grep -rnE "'insensitive'|QueryMode" src --include=*.ts --include=*.tsx || true`, { encoding: 'utf8' })
    .split('\n').filter(l => l && !l.startsWith('src/lib/like-exact.ts:') && !/^src\/lib\/member-stats\.ts:\d+:.*\{ golferEmail: \{ in: all, mode: 'insensitive' \} \}/.test(l));
  ok('every insensitive match in src goes through lib/like-exact (only an `in` list may use the mode directly)', raw.length === 0, raw);

  // ── the database ──
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { hasMemberPricing: true, name: 'Like GC', slug: `${TAG}-1`, operatorId: op.id, address: 'a', city: 'c', state: 'NY', zipCode: '1', memberGraceDays: 0 } });
  const tier = await prisma.membershipTier.create({ data: { courseId: course.id, name: 'Full', cartFeeWeekdayCents: 1000, cartFeeWeekendCents: 1000, greenFeeWeekdayCents: 3000 } });
  const member = (inviteEmail: string) => prisma.courseMembership.create({ data: { courseId: course.id, tierId: tier.id, inviteEmail, status: 'active' } });
  await member(`alice.${TAG}@gmail.com`);
  await member(`bob_x.${TAG}@gmail.com`);
  await member(`100%club.${TAG}@t.local`);

  // The membership-at-check-in path (lib/checkin-booking): a weekday cart for 4, public $20, member $10.
  const b = (email: string) => ({ golferAccountId: null, golferEmail: email, courseId: course.id, players: 4, cartSelected: false, cartFeeTotal: 0, paymentStatus: 'card_on_file', roundPaymentIntentId: '', teeTime: { date: '2026-11-04', cartFeeCents: 2000, productId: null } });
  const MEMBER = 1000 + 3 * 2000, PUBLIC = 4 * 2000;
  ok('check-in: a guest booked as %@gmail.com pays the public cart price', (await cartAddOnCentsFor(b('%@gmail.com'))) === PUBLIC, await cartAddOnCentsFor(b('%@gmail.com')));
  ok('check-in: a guest booked as %.<tag>@gmail.com pays the public cart price', (await cartAddOnCentsFor(b(`%.${TAG}@gmail.com`))) === PUBLIC);
  ok('check-in: bo__x (two _ wildcards) does not match the member bob_x', (await cartAddOnCentsFor(b(`bo__x.${TAG}@gmail.com`))) === PUBLIC);
  ok('check-in: bob_x, any case, is still the member', (await cartAddOnCentsFor(b(`BOB_X.${TAG}@Gmail.com`))) === MEMBER);
  ok('check-in: bobyx (what _ would have matched) is not', (await cartAddOnCentsFor(b(`bobyx.${TAG}@gmail.com`))) === PUBLIC);
  ok('check-in: a stored % address still matches itself exactly', (await cartAddOnCentsFor(b(`100%club.${TAG}@t.local`))) === MEMBER);
  ok('check-in: …and only itself', (await cartAddOnCentsFor(b(`100xclub.${TAG}@t.local`))) === PUBLIC);

  // The per-course log-in (lib/member-session canLogIn) finds a membership by its email, exactly.
  const g = await prisma.golferAccount.create({ data: { email: `${TAG}+g@t.local`, firstName: 'G', lastName: 'H', password: 'x' } });
  void g;
  ok('log in: %@gmail.com finds no one else\'s membership', (await canLogIn(course, '%@gmail.com')) === null);
  ok('log in: bo__x finds no one', (await canLogIn(course, `bo__x.${TAG}@gmail.com`)) === null);
  ok('log in: bob_x finds bob_x, any case', !!(await canLogIn(course, `BOB_X.${TAG}@gmail.com`)));

  // Bookings: the golfer-record key and the sign-in link to guest bookings (otp/verify: ciEquals on golferEmail).
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2031-07-01', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0 } });
  const book = (golferEmail: string) => prisma.booking.create({ data: { teeTimeId: tt.id, courseId: course.id, golferName: 'X', golferEmail, players: 1, greenFeeTotal: 5000, accessFeeTotal: 0, totalAmount: 5000 } });
  const a = await book(`alice.${TAG}@gmail.com`), u = await book(`a_b.${TAG}@gmail.com`), v = await book(`axb.${TAG}@gmail.com`), p = await book(`50%off.${TAG}@t.local`);
  const ids = async (where: object) => (await prisma.booking.findMany({ where: { courseId: course.id, ...where }, select: { id: true } })).map(r => r.id).sort();
  ok('golfer key e:%@gmail.com finds no bookings', (await ids(keyMatch(`e:%.${TAG}@gmail.com`))).length === 0);
  ok('golfer key e:a_b finds only a_b, not axb', JSON.stringify(await ids(keyMatch(`e:a_b.${TAG}@gmail.com`))) === JSON.stringify([u.id]));
  ok('golfer key e:50%off finds only itself', JSON.stringify(await ids(keyMatch(`e:50%off.${TAG}@t.local`))) === JSON.stringify([p.id]));
  ok('sign-in link: a %@gmail.com identifier would take no guest bookings', (await ids({ golferAccountId: null, golferEmail: ciEquals(`%.${TAG}@gmail.com`) })).length === 0);
  ok('sign-in link: the exact address, any case, takes its own', JSON.stringify(await ids({ golferAccountId: null, golferEmail: ciEquals(`ALICE.${TAG}@gmail.com`) })) === JSON.stringify([a.id]));
  ok('search: ciContains("_") matches only addresses with a real _', JSON.stringify(await ids({ golferEmail: ciContains(`_b.${TAG}`) })) === JSON.stringify([u.id]));
  ok('search: ciContains("%") matches only addresses with a real %', JSON.stringify(await ids({ golferEmail: ciContains('%') })) === JSON.stringify([p.id]));
  // Guard the premise: without the helper Prisma's ILIKE does treat them as wildcards, so the checks above mean something.
  ok('premise: an unescaped insensitive equals is a wildcard match', (await ids({ golferEmail: { equals: `%.${TAG}@gmail.com`, mode: 'insensitive' } })).length === 3);
  void v;

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`like-exact: ${failed} failed`); process.exit(1); }
  console.log('like-exact: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
