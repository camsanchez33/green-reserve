// Product screenshots (Cam 2026-10-23): a fictional course with a believable
// day on the tee sheet and two months of history, for scripts/screenshots/
// capture.cjs to photograph. LOCAL DATABASES ONLY — it refuses any other host.
//
// Run: DATABASE_URL=postgresql://…@localhost:…/gr_shots npx tsx scripts/screenshots/seed.ts
// Prints the course id and an operator token for the capture script.
import { prisma } from '../../src/lib/prisma';
import { signToken } from '../../src/lib/auth';
import { todayIn } from '../../src/lib/course-time';
import { runMonthlyReview, type ReviewFacts, type ReviewBody } from '../../src/lib/monthly-review';
import { signableDocuments } from '../../src/lib/agreements';
import { logAgreementAccepted } from '../../src/lib/course-timeline';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) { console.error('Refusing: the screenshot seed only runs against a local database.'); process.exit(1); }

const SLUG = 'hollow-brook-demo';
const TZ = 'America/New_York';
// Realistic, varied, not famous (HOMEPAGE_SPEC: no Smith/Johnson/celebrities).
const FIRST = ['Marcus', 'Priya', 'Tom', 'Dana', 'Luis', 'Grace', 'Kevin', 'Erin', 'Sam', 'Nora', 'Jamal', 'Hannah', 'Owen', 'Rosa', 'Brian', 'Mei',
  'Chris', 'Leah', 'Victor', 'Tessa', 'Andre', 'Kelly', 'Ray', 'Joan', 'Pete', 'Alicia', 'Derek', 'Maggie', 'Hector', 'Wendy'];
const LAST = ['Bell', 'Raman', 'Kowalski', 'Whitfield', 'Ortega', 'Okafor', 'Brandt', 'Gallagher', 'Teixeira', 'Lindqvist', 'Price', 'Mercer',
  'Fitzgerald', 'Delgado', 'Novak', 'Tanaka', 'Albright', 'Abernathy', 'Haas', 'Burke', 'Moreau', 'Danforth', 'Castellano', 'Whitaker', 'Shah', 'Doyle'];

// Deterministic, so a retake looks the same.
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
// A pool of regulars (who come back) plus one-offs, so "booked more than once" reads like a real course.
const REGULARS = Array.from({ length: 140 }, () => `${pick(FIRST)} ${pick(LAST)}`);
const golfer = () => rnd() < 0.6 ? pick(REGULARS) : `${pick(FIRST)} ${pick(LAST)}`;
/** Today, the capture is taken at 10:05 (capture.cjs fixes the browser's clock): earlier rounds have been played. */
export const NOW_HOUR = 10;
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

async function main() {
  const old = await prisma.course.findUnique({ where: { slug: SLUG }, select: { id: true, operatorId: true } });
  if (old) {
    await prisma.monthlyReview.deleteMany({ where: { courseId: old.id } });
    await prisma.agreementAcceptance.deleteMany({ where: { courseId: old.id } });
    await prisma.courseInquiry.deleteMany({ where: { builtCourseId: old.id } });
    await prisma.booking.deleteMany({ where: { courseId: old.id } });
    await prisma.teeTime.deleteMany({ where: { courseId: old.id } });
    await prisma.course.delete({ where: { id: old.id } });
  }
  const op = await prisma.courseOperator.upsert({ where: { email: 'shots@greenreserve.test' }, update: { emailVerified: true, onboardingStep: 4 }, create: { name: 'Dana Whitfield', email: 'shots@greenreserve.test', password: 'x', emailVerified: true, onboardingStep: 4 } });
  const today = todayIn(TZ);
  const course = await prisma.course.create({ data: {
    name: 'Hollow Brook Golf Club', slug: SLUG, operatorId: op.id, address: '400 Brook Road', city: 'Warwick', state: 'NY', zipCode: '10990',
    holes: 18, liveStatus: 'live', active: true, timezone: TZ, brandColor: '#24513B', stripeAccountId: 'acct_shots', stripeAccountActive: true,
    firstWentLiveAt: new Date(`${addDays(today, -95)}T12:00:00Z`),
  } });

  // Tee times every 10 minutes, 7:00 to 4:00, for the last 80 days and the next 7.
  const times: string[] = [];
  for (let m = 7 * 60; m <= 16 * 60; m += 10) times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  for (let off = -80; off <= 7; off++) {
    const date = addDays(today, off);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    for (const time of times) {
      const hour = Number(time.slice(0, 2));
      const fee = weekend ? 6500 : hour >= 14 ? 3800 : 5200;
      // Mornings and weekends fill; afternoons less; the future is part-booked.
      const fill = (weekend ? 0.85 : 0.6) * (hour < 11 ? 1 : hour < 14 ? 0.75 : 0.45) * (off > 0 ? 0.5 : 1);
      const players = rnd() < fill ? (rnd() < 0.55 ? 4 : rnd() < 0.6 ? 2 : 3) : 0;
      if (!players) { await prisma.teeTime.create({ data: { courseId: course.id, date, time, greenFeeCents: fee, cartFeeCents: 0, playersAvailable: 4 } }); continue; }
      const source = rnd() < 0.7 ? 'online' : rnd() < 0.6 ? 'phone' : 'walk_in';
      const past = off < 0 || (off === 0 && hour < NOW_HOUR);
      const noShow = past && source === 'online' && rnd() < 0.008;
      const cancelled = !noShow && rnd() < 0.04;
      // A cancelled group gives its spots back.
      const held = cancelled ? 0 : players;
      const tt = await prisma.teeTime.create({ data: { courseId: course.id, date, time, greenFeeCents: fee, cartFeeCents: 0, playersAvailable: 4, playersBooked: held, status: held >= 4 ? 'booked' : 'available' } });
      const access = source === 'online' ? 150 * players : 0;
      const name = golfer();
      const createdAt = new Date(`${addDays(date, -Math.floor(rnd() * (weekend ? 9 : 4)))}T14:00:00Z`);
      await prisma.booking.create({ data: {
        teeTimeId: tt.id, courseId: course.id, golferName: name, golferEmail: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, golferPhone: '845-555-0142',
        players, greenFeeTotal: fee * players, accessFeeTotal: access, totalAmount: fee * players + access, source, createdAt,
        status: cancelled ? 'cancelled' : past && !noShow ? 'completed' : 'confirmed', cancelledAt: cancelled ? createdAt : null,
        paymentStatus: past && !noShow && !cancelled ? (source === 'online' ? 'paid' : 'paid_offline') : source === 'online' ? 'card_on_file' : 'no_payment_method',
        checkedInAt: past && !noShow && !cancelled ? new Date(`${date}T${time}:00Z`) : null, paidAt: past && !noShow && !cancelled ? new Date(`${date}T${time}:00Z`) : null,
        noShowAt: noShow ? new Date(`${date}T${time}:00Z`) : null,
      } });
    }
  }

  // The inquiry it came from (the onboarding timeline, which the dashboard reads for the agreement, hangs off it).
  await prisma.courseInquiry.create({ data: {
    contactName: 'Dana Whitfield', contactTitle: 'General Manager', email: op.email, phone: '845-555-0100', courseName: course.name,
    address: '400 Brook Road', city: 'Warwick', state: 'NY', zipCode: '10990', courseType: 'public', status: 'live', builtCourseId: course.id,
  } });

  // A finished course: its agreements signed, written as lib/agreement-sign.ts
  // writes them (that module loads the PDF renderer, which tsx can't).
  for (const d of signableDocuments()) {
    await prisma.agreementAcceptance.create({ data: {
      courseId: course.id, document: d.document, version: d.version, textHash: d.hash, signerName: 'Dana Whitfield', signerTitle: 'General Manager',
      signerEmail: op.email, authorityAttested: d.document === 'operator_agreement', ip: '127.0.0.1', userAgent: 'screenshot seed',
    } });
    if (d.document === 'operator_agreement') await logAgreementAccepted(course.id, op.email, d.version);
  }

  // Last month's review, written through the real path (numbers checked by
  // validateNumbers) with a fixed writer instead of the model.
  const DAY: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
  const writer = async (f: ReviewFacts): Promise<ReviewBody> => {
    const best = [...f.fillByDayOfWeek].sort((a, b) => (b.fillPct ?? 0) - (a.fillPct ?? 0))[0];
    const worst = f.worstUnsoldHours[0];
    return {
      verdict: `${f.month} brought in $${f.thisMonth.collectedDollars.toLocaleString('en-US')} from ${f.thisMonth.bookings} bookings, with ${f.thisMonth.fillPct}% of tee times filled.`,
      wentWell: [`${DAY[best.day] ?? best.day} was your strongest day, at ${best.fillPct}% full.`, `Online bookings made up ${f.bookingsBy.online} of the month's bookings, so the counter phone rang less.`],
      fellShort: worst ? [`The ${worst.hour} hour had the most unsold spots (${worst.openSpots}).`] : [],
      recommendations: worst ? [`Try a lower rate or a twilight price around ${worst.hour} on weekdays.`] : ['Keep your prices where they are.'],
    };
  };
  const r = await runMonthlyReview(course.id, new Date(), writer);
  console.log(`review: ${r.outcome}${r.error ? ` (${r.error})` : ''}`);
  const token = await signToken({ operatorId: op.id, email: op.email });
  console.log(JSON.stringify({ courseId: course.id, slug: SLUG, today, token }));
  await prisma.$disconnect();
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
