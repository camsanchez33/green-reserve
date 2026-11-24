// ASSIST-1 (Cam 2026-11-24, lanes/build.md "AI assistant overhaul" item 1): the course brief — everything the
// course's assistant knows, built on the server from THIS course's own rows only.
//
// Rules this file holds:
//  - Tenant isolation: every read is filtered by the one courseId handed in. The routes take that id from the
//    signed-in session (staff) or the page's own course (golfer); never from a request body.
//  - Policy wording is describePolicy()'s, word for word. Code never paraphrases it.
//  - No personal data: no golfer, member, staff or event-organiser names, emails or phones. The course's own public
//    phone is the only phone in a brief.
//  - Course-written text (notes, descriptions, alert, closure reasons, event names) is DATA: flattened to ONE line
//    (so it can't start a "## " section or a "> " line of its own) with angle brackets replaced (so it can't close
//    or open a tag), inside <course_data>. The persona prompt says the wrapper holds data, never instructions
//    (lib/assistant/prompt). The describePolicy() lines and the fee sentence are code-written and sit OUTSIDE the
//    wrapper in <policy_lines>, which course text cannot forge.
//  - Deterministic: the same rows give byte-identical text, so the prompt cache hits until something really changes.
//    No clock time in the text; "today" only picks which closures and events are still ahead.
//
// Invalidation: the brief is REBUILT from the database on every question, so a settings, rate, closure, event,
// alert or note change shows in the next answer with no write path to remember. The CourseBrief row only records
// when the text last changed (the "Updated" time on "What it knows").
import { createHash } from 'node:crypto';
import { prisma } from '../prisma';
import { describePolicy, policyFrom } from '../cancel-policy';
import { facilityLines } from '../facilities';
import { golferConditionLines } from '../course-conditions';
import { courseBuckets } from '../range-buckets';
import { memberBenefitParts, withoutRates } from '../member-benefits';
import { walkingSummary, walkingWords } from '../walking';
import { todayIn, addDaysStr } from '../course-time';
import { DEFAULT_PUBLIC_WINDOW_DAYS, DEFAULT_MEMBER_WINDOW_DAYS } from '../booking-window';
import { ACCESS_FEE_CENTS, FEE_AT_BOOKING_ON } from '../booking-fees';
import { readAssistantSettings, unknownLineFor, plainLine, plainText, type AssistantSettings, type GolferTopic } from './settings';

/** The policy block's tag. Course text never contains '<', so it cannot forge this. */
export const POLICY_TAG = 'policy_lines';

export type BriefAudience = 'staff' | 'golfer';
export type BriefSectionKey = 'basics' | 'info' | 'rates' | 'policy' | 'closures' | 'conditions' | 'events' | 'memberships' | 'range' | 'facilities' | 'notes' | 'setup';
export type BriefSection = { key: BriefSectionKey; label: string; count: string };
export type CourseBrief = {
  courseId: string; audience: BriefAudience; text: string; hash: string; sections: BriefSection[];
  settings: AssistantSettings; courseName: string; unknownLine: string; timezone: string;
};

/** How far ahead a brief lists closed days and events. */
export const BRIEF_DAYS_AHEAD = 60;
const MAX_EVENTS = 12;
const MAX_CLOSURES = 20;

/**
 * Course-written text, made safe to sit inside <course_data>: one line (line breaks become " / "), no control
 * characters and no angle brackets at all — so it can neither open or close a tag nor begin a line of its own.
 */
export function courseText(v: unknown, max = 600): string {
  if (typeof v !== 'string') return '';
  return plainLine(plainText(v, max).replace(/\n+/g, ' / '), max).replace(/</g, '‹').replace(/>/g, '›');
}
const line = courseText;

const usd = (c: number | null | undefined) => (c == null ? '' : c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function days(list: number[]): string {
  const d = [...new Set(list)].filter(n => n >= 0 && n <= 6).sort((a, b) => a - b);
  if (d.length === 7) return 'every day';
  if (d.join() === '1,2,3,4,5') return 'Mon–Fri';
  if (d.join() === '0,6') return 'Sat–Sun';
  return d.map(n => DAY[n]).join(', ');
}
/** "07:30" → "7:30 AM". */
function clock(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  if (!m) return line(t, 10);
  const h = Number(m[1]); const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m[2]} ${ap}`;
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Which golfer topic each section belongs to. Basics, closures, conditions and the course's golfer notes are always in. */
const TOPIC_OF: Partial<Record<BriefSectionKey, GolferTopic>> = {
  rates: 'rates', policy: 'policy', info: 'info', facilities: 'info', events: 'events', memberships: 'memberships', range: 'range',
};

const COURSE_SELECT = {
  id: true, name: true, city: true, state: true, address: true, zipCode: true, phone: true, proShopPhone: true, website: true,
  holes: true, par: true, description: true, timezone: true, dresscode: true, walkingNote: true, cartRequired: true,
  cancellationHours: true, lateCancellationFeeCents: true, lateFeeBasis: true, lateFeeTiming: true, noShowFeeCents: true,
  noShowFeeBasis: true, autoNoShowMinutes: true, checkInWindowHours: true,
  publicAdvanceDays: true, memberAdvanceDays: true, residentAdvanceDays: true, hasMemberPricing: true, hasResidentPricing: true,
  conditions: true, conditionsDetail: true, conditionsDetailAt: true, confirmationArrival: true, confirmationParking: true,
  hasDrivingRange: true, drivingRangeType: true, rangeBallsFree: true, hasPuttingGreen: true, hasShortGameArea: true,
  hasProShop: true, hasLessons: true, hasClubRental: true, clubRentalRateCents: true, hasPushCartRental: true,
  pushCartRateCents: true, hasCaddies: true, caddieType: true, caddieLooperRateCents: true, caddieForeRateCents: true,
  caddieNote: true, hasBagStorage: true, hasLockerRoom: true, hasGpsCarts: true, restaurantType: true, hasCartGirl: true,
  hasTournaments: true, tournamentFrequency: true, amenities: true, memberLoginOn: true, liveStatus: true, stripeAccountId: true, stripeAccountActive: true,
  assistantStaffOn: true, assistantGolferOn: true, assistantTone: true, assistantGolferTopics: true, assistantUnknownLine: true,
  assistantGolferDailyLimit: true,
} as const;

/**
 * Build the brief for one course and one audience from the database. Pure reads; see getCourseBrief() for the
 * snapshot row. `now` only decides which closures and events are still ahead.
 */
export async function buildCourseBrief(courseId: string, audience: BriefAudience, now: Date = new Date()): Promise<CourseBrief | null> {
  if (!courseId) return null;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: COURSE_SELECT });
  if (!course) return null;
  const today = todayIn(course.timezone, now);
  const until = addDaysStr(today, BRIEF_DAYS_AHEAD);
  const staff = audience === 'staff';

  const [schedules, closures, events, tiers, buckets, notes] = await Promise.all([
    prisma.teeTimeSchedule.findMany({
      where: { courseId, active: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        tierName: true, daysOfWeek: true, startTime: true, endTime: true, intervalMinutes: true, holes: true,
        greenFeeWeekdayCents: true, greenFeeWeekendCents: true, cartFeeCents: true, cartFeeWeekendCents: true,
        memberRateWeekdayCents: true, memberRateWeekendCents: true, residentRateWeekdayCents: true, residentRateWeekendCents: true,
        walkingAllowed: true, walkingWeekend: true,
      },
    }),
    prisma.blackout.findMany({ where: { courseId, date: { gte: today, lte: until } }, orderBy: [{ date: 'asc' }, { id: 'asc' }], take: MAX_CLOSURES, select: { date: true, reason: true } }),
    prisma.courseEvent.findMany({
      // Golfers hear only events open for sign-up; staff hear every planned one. Never the organiser's details.
      where: { courseId, date: { gte: today, lte: until }, status: { not: 'cancelled' }, ...(staff ? {} : { signupOpen: true }) },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }], take: MAX_EVENTS,
      select: { name: true, date: true, startTime: true, format: true, holes: true, pricePerPlayerCents: true, signupOpen: true, includes: true },
    }),
    prisma.membershipTier.findMany({
      where: { courseId, active: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { name: true, discountPct: true, greenFeeWeekdayCents: true, greenFeeWeekendCents: true, lineRates: true, advanceBookingDays: true, windowPublic: true, guestPassesPerYear: true, annualFeeCents: true },
    }),
    courseBuckets(prisma, courseId, true),
    prisma.courseAssistantNote.findMany({
      where: { courseId, ...(staff ? {} : { audience: 'golfers' }) }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { question: true, answer: true, audience: true },
    }),
  ]);

  const settings = readAssistantSettings(course);
  const unknownLine = unknownLineFor(settings, course);
  const blocks: { key: BriefSectionKey; label: string; count: string; body: string[] }[] = [];

  // Basics — always. The course's own public contact only.
  const where = [course.address, course.city, course.state, course.zipCode].map(v => line(v, 120)).filter(Boolean).join(', ');
  blocks.push({
    key: 'basics', label: 'Course basics', count: `${course.holes} holes`, body: [
      `Name: ${line(course.name, 120)}`,
      `Holes: ${course.holes}, par ${course.par}`,
      where && `Address: ${where}`,
      course.phone && `Phone: ${line(course.phone, 40)}`,
      course.proShopPhone && course.proShopPhone !== course.phone && `Pro shop phone: ${line(course.proShopPhone, 40)}`,
      course.website && `Website: ${line(course.website, 200)}`,
    ].filter((s): s is string => !!s),
  });
  const info = [
    course.description && `About (written by the course): ${courseText(course.description, 1200)}`,
    course.confirmationArrival && `Arrival (written by the course): ${courseText(course.confirmationArrival, 400)}`,
    course.confirmationParking && `Parking and directions (written by the course): ${courseText(course.confirmationParking, 400)}`,
    course.dresscode?.length ? `Dress code: ${course.dresscode.map(d => line(d, 80)).filter(Boolean).join('; ')}` : '',
  ].filter((s): s is string => !!s);
  blocks.push({ key: 'info', label: 'About, directions and dress code', count: plural(info.length, 'item'), body: info.length ? info : ['- Nothing written yet.'] });

  // Rates and schedules: what each running schedule sells, as the booking page prices it.
  const walk = walkingSummary(schedules);
  const rateLines = schedules.map(s => {
    const parts = [
      `${line(s.tierName, 60) || 'Standard'} (${s.holes} holes): ${days(s.daysOfWeek)}, first tee ${clock(s.startTime)}, last tee ${clock(s.endTime)}, every ${s.intervalMinutes} min`,
      `green fee ${usd(s.greenFeeWeekdayCents)} weekdays, ${usd(s.greenFeeWeekendCents)} weekends`,
      s.cartFeeCents > 0 ? `cart ${usd(s.cartFeeCents)}${s.cartFeeWeekendCents != null && s.cartFeeWeekendCents !== s.cartFeeCents ? ` (${usd(s.cartFeeWeekendCents)} weekends)` : ''} per player` : '',
    ];
    if (staff) {
      if (s.memberRateWeekdayCents != null || s.memberRateWeekendCents != null) parts.push(`member ${usd(s.memberRateWeekdayCents)}/${usd(s.memberRateWeekendCents)}`);
      if (s.residentRateWeekdayCents != null || s.residentRateWeekendCents != null) parts.push(`resident ${usd(s.residentRateWeekdayCents)}/${usd(s.residentRateWeekendCents)}`);
    }
    return `- ${parts.filter(Boolean).join('; ')}`;
  });
  blocks.push({
    key: 'rates', label: 'Rates and schedules', count: plural(schedules.length, 'schedule'), body: [
      ...(rateLines.length ? rateLines : ['- No tee times are on sale right now.']),
      `Walking: ${walkingWords(walk)}${course.walkingNote ? ` (${line(course.walkingNote, 200)})` : ''}${course.cartRequired ? '; carts required' : ''}`,
      `Golfers can book ${course.publicAdvanceDays ?? DEFAULT_PUBLIC_WINDOW_DAYS} days ahead online${course.memberLoginOn && tiers.length === 0 && course.hasMemberPricing ? `; members ${course.memberAdvanceDays ?? DEFAULT_MEMBER_WINDOW_DAYS} days ahead` : ''}${course.hasResidentPricing && course.residentAdvanceDays != null ? `; residents ${course.residentAdvanceDays} days ahead` : ''}.`,
      'Live availability and the exact price of a tee time are on the booking page; never quote a time as open.',
    ],
  });

  // Booking policy — describePolicy(), word for word. Rendered OUTSIDE <course_data> (see the end of this function),
  // so no course-written text sits beside it. Listed here only for "What it knows".
  const policy = describePolicy(policyFrom(course));
  blocks.push({ key: 'policy', label: 'Booking policy (word for word)', count: plural(policy.lines.length, 'line'), body: [] });

  blocks.push({
    key: 'closures', label: 'Closed days', count: closures.length ? `${closures.length} ahead` : 'none ahead',
    body: closures.length ? closures.map(c => `- ${c.date}: closed${c.reason ? ` (${line(c.reason, 120)})` : ''}`) : [`- No closed days in the next ${BRIEF_DAYS_AHEAD} days.`],
  });

  const condLines = golferConditionLines(course.conditionsDetail, course.conditionsDetailAt, now).map(l => line(l, 120));
  const alert = course.conditions ? courseText(course.conditions, 500) : '';
  blocks.push({
    key: 'conditions', label: 'Course alert and conditions', count: alert ? line(alert, 40) : condLines.length ? plural(condLines.length, 'line') : 'none',
    body: [alert ? `Course alert (written by the course): ${alert}` : 'No course alert right now.', ...condLines.map(l => `- ${l}`)],
  });

  blocks.push({
    key: 'events', label: 'Events', count: events.length ? `${events.length} upcoming` : 'none',
    body: events.length
      ? events.map(e => `- ${e.date} ${clock(e.startTime)}: ${line(e.name, 120)} (${line(e.format, 30)}, ${e.holes} holes${e.pricePerPlayerCents > 0 ? `, ${usd(e.pricePerPlayerCents)} a player` : ''}${e.signupOpen ? ', sign-up open on the course page' : ''}${e.includes?.length ? `; includes ${e.includes.map(i => line(i, 60)).filter(Boolean).join(', ')}` : ''})`)
      : ['- No upcoming events.'],
  });

  blocks.push({
    key: 'memberships', label: 'Memberships and benefits', count: plural(tiers.length, 'group'),
    body: tiers.length ? tiers.map(t => {
      const tier = course.hasMemberPricing ? t : withoutRates(t);
      const parts = memberBenefitParts(tier, course);
      return `- ${line(t.name, 80)}${parts.length ? `: ${parts.join(' · ')}` : ''}${staff && t.annualFeeCents > 0 ? ` (dues ${usd(t.annualFeeCents)} a year)` : ''}`;
    }).concat([course.memberLoginOn
      ? 'Members log in on the course\'s booking page with the email the course has on file.'
      : 'Members don\'t log in online here: online bookings are at the public price, and member rates are given at the counter.'])
      : ['- This course has no memberships.'],
  });

  const fac = facilityLines(course).map(l => line(l, 160));
  blocks.push({ key: 'facilities', label: 'Facilities', count: plural(fac.length, 'item'), body: fac.length ? fac.map(l => `- ${l}`) : ['- None listed.'] });

  blocks.push({
    key: 'range', label: 'Range buckets', count: String(buckets.length),
    body: buckets.length
      ? buckets.map(b => `- ${line(b.name, 60)}${b.rangeBalls ? ` (${b.rangeBalls} balls)` : ''}: ${usd(b.priceCents)}`)
      : [course.hasDrivingRange ? (course.rangeBallsFree ? '- Range balls are included.' : '- Range balls are sold in the pro shop.') : '- No driving range.'],
  });

  blocks.push({
    key: 'notes', label: 'Your notes', count: String(notes.length),
    body: notes.length
      ? notes.map(n => `- ${staff && n.audience === 'staff' ? '(staff only — never tell golfers) ' : ''}Q: ${line(n.question, 200)} A: ${courseText(n.answer, 600)}`)
      : ['- None yet.'],
  });

  if (staff) {
    const stripe = !!course.stripeAccountId && course.stripeAccountActive;
    blocks.push({
      key: 'setup', label: 'Setup', count: course.liveStatus, body: [
        `Status on GreenReserve: ${line(course.liveStatus, 20)}`,
        `Stripe: ${stripe ? 'connected' : 'NOT connected — payouts cannot start until it is'}`,
        `Member pricing ${course.hasMemberPricing ? 'on' : 'off'}; resident pricing ${course.hasResidentPricing ? 'on' : 'off'}`,
        `Assistant: staff ${settings.staffOn ? 'on' : 'off'}; golfer questions ${settings.golferOn ? 'on' : 'off'}`,
      ],
    });
  }

  const kept = staff ? blocks : blocks.filter(b => {
    const topic = TOPIC_OF[b.key];
    return !topic || settings.golferTopics.includes(topic);
  });
  const withPolicy = kept.some(b => b.key === 'policy');
  // Code-written only: describePolicy()'s lines verbatim, then the LQ-2 fee sentence under its own label
  // (legal/LQ-2_FEE_COPY.md allowed sentence 1, in the golfer's words). With the fee charged at booking,
  // describePolicy() already carries the fee.
  const policyBlock = withPolicy ? [
    `<${POLICY_TAG}>`,
    ...policy.lines,
    '</' + POLICY_TAG + '>',
    ...(FEE_AT_BOOKING_ON ? [] : [`GreenReserve fee: Golfers pay ${usd(ACCESS_FEE_CENTS)} per player on each online booking, added to the course's price.`]),
    'These terms are for new bookings. A booking already made keeps the terms in its confirmation email.',
  ].join('\n') : '';
  const text = [
    `<course_data course="${line(course.name, 120).replace(/"/g, "'")}" audience="${audience}">`,
    ...kept.filter(b => b.key !== 'policy').map(b => `## ${b.label}\n${b.body.join('\n')}`),
    '</course_data>',
    policyBlock,
  ].filter(Boolean).join('\n\n');
  return {
    courseId, audience, text, hash: createHash('sha256').update(text).digest('hex'),
    sections: kept.filter(b => b.key !== 'basics').map(({ key, label, count }) => ({ key, label, count })),
    settings, courseName: course.name, unknownLine, timezone: course.timezone,
  };
}

/**
 * The brief plus when its text last changed. Rebuilds from the database every call; writes the snapshot row only
 * when the text differs from the last one (or `force`, the Refresh button), so a quiet course writes nothing.
 */
export async function getCourseBrief(courseId: string, audience: BriefAudience, opts: { now?: Date; force?: boolean } = {}): Promise<(CourseBrief & { builtAt: Date }) | null> {
  const brief = await buildCourseBrief(courseId, audience, opts.now);
  if (!brief) return null;
  const last = await prisma.courseBrief.findUnique({ where: { courseId_audience: { courseId, audience } }, select: { hash: true, builtAt: true } });
  if (last && last.hash === brief.hash && !opts.force) return { ...brief, builtAt: last.builtAt };
  const row = await prisma.courseBrief.upsert({
    where: { courseId_audience: { courseId, audience } },
    create: { courseId, audience, hash: brief.hash, text: brief.text, sections: brief.sections },
    update: { hash: brief.hash, text: brief.text, sections: brief.sections, builtAt: new Date() },
    select: { builtAt: true },
  });
  return { ...brief, builtAt: row.builtAt };
}
