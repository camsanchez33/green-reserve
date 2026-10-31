// Launch walk (Cam 2026-10-31, "launch readiness pass"): the fixes Cam picked from the
// signup, golfer and staff-day walks. No database needed.
// Run: npx tsx scripts/launch-walk-test.ts
import { readFileSync } from 'fs';
import { applyTierRates } from '../src/lib/tier-rates';
import { paymentsMissing, PAYMENTS_BLOCK_LIVE } from '../src/lib/setup-missing';
import { payLinkOpensOn } from '../src/lib/course-time';
import { describePolicy } from '../src/lib/cancel-policy';

let failed = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

// 1. "Do holders pay a green fee per round?" No → a $0 member green fee, not the public price.
const build = read('src/app/api/admin/inquiries/route.ts');
check('a membership whose holders pay no green fee is built at $0 a round', build.includes("const noGreenFee = str(p.perRound) === 'no';") && build.includes(": noGreenFee ? 0 : null;") && build.includes("'No green fee per round'"));
const tt = { greenFeeCents: 4200, cartFeeCents: 2000, memberRateCents: null, date: '2026-11-04' };
const free = applyTierRates(tt, { greenFeeWeekdayCents: 0, greenFeeWeekendCents: 0, cartFeeWeekdayCents: null, cartFeeWeekendCents: null, discountPct: null });
check('…and a $0 tier rate prices the round at $0 (cart at the course\'s price)', free.greenFeeCents === 0 && free.cartFeeCents === 2000);

// 3. The manage page's other times: the route sends dollars, the page shows cents.
check('moving a booking shows the right prices (dollars from the route are made cents)', read('src/app/manage/[bookingId]/page.tsx').includes('greenFee: Math.round(t.greenFee * 100), cartFee: Math.round(t.cartFee * 100)'));

// 4. A member signed in by the member link sees the member rate the booking charges.
check('the booking page asks for the member rate without a golfer sign-in', read('src/app/book/BookClient.tsx').includes("if (!ttId) { setResidentFee(null); setMemberRate(null);") && read('src/app/api/bookings/resident-rate/route.ts').includes('getMemberSession()'));

// 6. Payments are the one thing that blocks going live — say so.
check('Home lists Connect payments first when Stripe isn\'t connected, and not once it is', paymentsMissing(false)[0]?.key === 'payments' && paymentsMissing(false)[0]?.href === '/dashboard/money?tab=payouts' && paymentsMissing(true).length === 0);
check('…on the Home checklist, the approved-page banner, and the onboarding finish', read('src/lib/operator-home.ts').includes('opts.owner ? paymentsMissing(course.stripeAccountActive)') && read('src/app/api/operator/home/route.ts').includes('owner: !session.isStaff') && read('src/app/dashboard/page.tsx').includes('stripeAccountActive ? ') && PAYMENTS_BLOCK_LIVE.includes('Payouts') && read('src/app/dashboard/onboarding/page.tsx').includes("isConnected ? 'Setup complete' : 'Almost there'"));

// Pay link opens on the round's day (paying checks the group in).
const ci = read('src/app/api/checkin/[bookingId]/route.ts');
// 23:59 / 00:00 in New York (UTC−4 on Oct 31) and in Los Angeles (UTC−7), for a Nov 1 round at 00:30.
check('the link opens at midnight on the round\'s day in the course\'s own time zone', payLinkOpensOn('America/New_York', '2026-11-01', new Date('2026-11-01T03:59:00Z')) === '2026-11-01' && payLinkOpensOn('America/New_York', '2026-11-01', new Date('2026-11-01T04:00:00Z')) === null && payLinkOpensOn('America/Los_Angeles', '2026-11-01', new Date('2026-11-01T04:00:00Z')) === '2026-11-01' && payLinkOpensOn('America/Los_Angeles', '2026-11-01', new Date('2026-11-01T07:00:00Z')) === null && payLinkOpensOn('America/New_York', '2026-10-30', new Date('2026-11-01T12:00:00Z')) === null);
check('the golfer\'s check-in / pay link uses it', ci.includes('payLinkOpensOn(b.course.timezone, b.teeTime.date)') && ci.includes("if (booking.status === 'confirmed' && opensOn(booking)) return NextResponse.json({ error: 'Check-in opens on the day of your round.' }, { status: 409 });"));
check('…and the page says when, instead of a card form (no cart box to tick)', read('src/app/checkin/[bookingId]/page.tsx').includes('if (info.opensOn) return (') && read('src/app/checkin/[bookingId]/page.tsx').includes('{cartAddOn > 0 && !info.opensOn && ('));
// Review 2026-10-31: nothing sends or promises the link before the day.
const ops = read('src/app/api/operator/bookings/route.ts');
check('staff can\'t send a pay link before the round\'s day (and the sheet hides it on later days)', ops.includes('if (payLinkOpensOn(b.course.timezone, b.teeTime.date)) return NextResponse.json({ error: \'The pay link opens on the day of the round') && (read('src/app/dashboard/page.tsx').match(/selectedDate <= today\(\) && \(/g) ?? []).length >= 2);
check('the hourly check-in email, and the daily safety net, wait for the round\'s day', read('src/app/api/cron/hourly/route.ts').includes('if (payLinkOpensOn(booking.course.timezone, booking.teeTime.date, now)) continue;') && read('src/app/api/cron/cancellation-cutoff/route.ts').includes('if (payLinkOpensOn(tz, booking.teeTime.date, now)) continue;'));
check('…and so does the at-booking email (booked near the cutoff)', read('src/app/api/bookings/route.ts').includes('minsUntilCutoff < 165 && !payLinkOpensOn(teeTimeFull.course.timezone, teeTimeFull.date)'));
check('the hold email and the policy say the link is for the day of the round', read('src/lib/email.ts').includes('use the button below on the day of your round') && !read('src/lib/email.ts').includes('tap the button below to check in now') && describePolicy({ cancellationHours: 24, lateCancellationFeeCents: 0, noShowFeeCents: 0, checkInWindowHours: 3 } as never).lines.join(' ').includes('On the day of your round, check in and pay online'));
check('a $0 member rate is a rate: only no membership falls through to the member link', read('src/app/api/bookings/route.ts').includes('if (appliedTier == null) {'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
