// Cam 2026-10-27 (onboarding walk): a new owner is "walked through immediately
// the process of going page by page approving everything and giving feedback if
// needed". Onboarding step 1 shows their booking page one part at a time, in the
// words golfers see, and the owner says "Looks right" or "Change this" per part.
// Each part's key is a CHANGE_CATEGORIES key, so the notes go to GreenReserve as
// one structured change request. Read-only: nothing here writes.
import { sheetPricesNotBuilt } from './setup-sheet-recap';
import { prisma } from './prisma';
import { describePolicy, policyFrom } from './cancel-policy';
import { facilityLines, type FacilityFields } from './facilities';
import { walkingSummary } from './walking';
import { missingSetup, type MissingItem } from './setup-missing';

export type ReviewPartKey = 'course_details' | 'pricing' | 'tee_times' | 'policies' | 'photos';
export type ReviewRow = { label: string; value: string };
export type ReviewPart = { key: ReviewPartKey; title: string; intro: string; rows: ReviewRow[] };
export type PageReview = {
  courseName: string;
  parts: ReviewPart[];
  images: { logoUrl: string; heroImageUrl: string; gallery: string[] };
  missing: MissingItem[];
};

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) ? `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` : hhmm;
};
function days(list: number[]): string {
  const d = [...new Set(list)].filter(n => n >= 0 && n <= 6).sort((a, b) => a - b);
  if (d.length === 0 || d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '0,6') return 'Weekends';
  return d.map(n => DAY[n]).join(', ');
}

export async function pageReview(courseId: string): Promise<PageReview | null> {
  const c = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      photos: { orderBy: { sortOrder: 'asc' }, select: { url: true } },
      schedules: { where: { active: true }, orderBy: { createdAt: 'asc' } },
      _count: { select: { teeSets: true } },
    },
  });
  if (!c) return null;

  const place = [c.address, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const walking = walkingSummary(c.schedules);
  const details: ReviewRow[] = [
    { label: 'Name', value: c.name },
    { label: 'Address', value: place },
    { label: 'Phone', value: c.phone },
    { label: 'Website', value: c.website },
    { label: 'Course', value: [c.holes && `${c.holes} holes`, c.par && `par ${c.par}`].filter(Boolean).join(', ') },
    { label: 'Walking', value: walking === 'always' ? 'Walking allowed' : walking === 'never' ? 'Cart required' : 'Walking allowed at some times' },
    { label: 'Facilities', value: facilityLines(c as unknown as FacilityFields).join(', ') },
    { label: 'Description', value: c.description },
  ];

  // One price row per running schedule; a second schedule (twilight, 9 holes) gets its own line.
  const many = c.schedules.length > 1;
  const pricing: ReviewRow[] = c.schedules.flatMap(s => {
    const label = many ? `${s.holes} holes, ${days(s.daysOfWeek).toLowerCase()} from ${clock(s.startTime)}` : `${s.holes} holes`;
    const cartWe = s.cartFeeWeekendCents ?? s.cartFeeCents;
    const rows: ReviewRow[] = [{ label, value: s.greenFeeWeekdayCents === s.greenFeeWeekendCents ? `${usd(s.greenFeeWeekdayCents)} a player` : `${usd(s.greenFeeWeekdayCents)} weekdays, ${usd(s.greenFeeWeekendCents)} weekends` }];
    if (s.cartFeeCents || cartWe) rows.push({ label: many ? `Cart (${s.holes} holes)` : 'Cart', value: s.cartFeeCents === cartWe ? `${usd(s.cartFeeCents)} a player` : `${usd(s.cartFeeCents)} weekdays, ${usd(cartWe)} weekends` });
    return rows;
  });

  // Launch walk (Cam 2026-10-31): prices from the course's setup sheet that aren't on the page yet.
  const inq = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId }, select: { detailsJson: true } });
  let sheet: Record<string, unknown> = {};
  try { sheet = inq?.detailsJson ? JSON.parse(inq.detailsJson) : {}; } catch { sheet = {}; }
  for (const r of sheetPricesNotBuilt(sheet, c.schedules)) pricing.push({ label: `${r.label} (on your setup sheet, not on your page yet)`, value: r.value });

  const teeTimes: ReviewRow[] = c.schedules.map(s => ({
    label: many ? `${s.holes} holes` : 'Tee times',
    value: `${days(s.daysOfWeek)}, ${clock(s.startTime)} to ${clock(s.endTime)}, every ${s.intervalMinutes} minutes`,
  }));
  teeTimes.push({ label: 'Booking opens', value: `${c.publicAdvanceDays} days ahead` });

  // The golfer's words come ONLY from describePolicy (CLAUDE.md, SP-B).
  const policy = describePolicy(policyFrom(c));
  const policies: ReviewRow[] = [{ label: policy.headline, value: policy.lines.join(' ') }];

  const missing = missingSetup({ ...c, galleryCount: c.photos.length, teeSetCount: c._count.teeSets });
  const have = (url: string) => (url ? 'Added' : 'Not added yet');
  const photos: ReviewRow[] = [
    { label: 'Logo', value: have(c.logoUrl) },
    { label: 'Course photo', value: have(c.heroImageUrl) },
    { label: 'Gallery', value: c.photos.length ? `${c.photos.length} photo${c.photos.length === 1 ? '' : 's'}` : 'Not added yet' },
  ];

  return {
    courseName: c.name,
    parts: [
      { key: 'course_details', title: 'Your course', intro: 'The details at the top of your page and in its About section.', rows: details.filter(r => r.value) },
      { key: 'pricing', title: 'Prices', intro: 'What golfers pay for a round, before any member or resident rate.', rows: pricing },
      { key: 'tee_times', title: 'Tee times', intro: 'When golfers can book, and how far ahead.', rows: teeTimes },
      { key: 'policies', title: 'Cancellation policy', intro: 'Exactly what golfers read before they book.', rows: policies },
      { key: 'photos', title: 'Photos and logo', intro: 'Add any that are missing now, or later from Settings.', rows: photos },
    ],
    images: { logoUrl: c.logoUrl, heroImageUrl: c.heroImageUrl, gallery: c.photos.map(p => p.url) },
    missing,
  };
}
