// BI-1 (PLATFORM_ROADMAP_SPEC §1, Cam 2026-10-07: "the analytics should be
// writing reviews after every month where they are lacking and not hitting
// metrics … the AI doesn't make up numbers but it can interpret them").
//
// One review per course per month, of the month before, in the course's own
// timezone. Every number comes from computeAnalytics() (lib/analytics.ts) — except
// money, which is the ledger's (Analytics page, Cam 2026-11-17): Revenue is the Revenue page's own figure
// (lib/revenue-extras allSegments) and fees are ledger rows (lib/analytics-page noShowReport), never
// analytics.ts money sums. Reports written before 2026-11-17 keep their text. Every number is computed HERE — including every difference the text may quote (vs last
// month, vs the baseline). The model only writes words around them, through a
// forced tool call, and validateNumbers() rejects any text that carries a
// number it was not given. A rejected draft is retried once with the offending
// numbers named; a second failure is stored as `failed` and never shown.
//
// Baseline (Cam: "after 1 month then metrics are set"): the first FULL month a
// course is live (live at local midnight on the 1st) is its baseline — that
// review reports and says "this is your starting line". Every later review
// measures against the baseline and the month before. A month the course was
// not live for in full gets no review.
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma';
import { computeAnalytics, headline, type Analytics, type Range } from './analytics';
import { noShowReport, ledgerMonth, type NoShowReport, type LedgerMonth } from './analytics-page';
import { todayIn, isValidTimezone, DEFAULT_TZ } from './course-time';
import { sendMonthlyReviewEmail } from './email';

export const REVIEW_MODEL = 'claude-opus-5-5';
/** Below this many bookings in the month the review says the sample is small. */
export const THIN_BOOKINGS = 40;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-09" for any date in October 2026. */
export function previousMonth(today: string): string {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function monthRange(month: string): Range {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** Was the course live for the whole month — live by local midnight on the 1st? */
export function isFullMonth(firstWentLiveAt: Date | null, month: string, tz: string): boolean {
  if (!firstWentLiveAt) return false;
  return todayIn(tz, firstWentLiveAt) <= `${month}-01`;
}

// ── The facts the model is given — the only numbers it may use ─────────────
const dollars = (cents: number) => Math.round(cents / 100);
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : Math.round((a - b) * 10) / 10);

type Headline = ReturnType<typeof headline>;

/**
 * The ledger (MoneyMove) began on 2026-10-30 (migration 20261030020000_money_ledger) with no backfill: a month
 * before November 2026 isn't in it in full, so its money is unknown — never read as $0. Such a month gets no
 * ledger facts, no revenue change, and blank money rows in By area.
 */
export const LEDGER_FIRST_FULL_MONTH = '2026-11';
export const ledgerCovers = (month: string) => month >= LEDGER_FIRST_FULL_MONTH;

const ledgerFacts = (l: LedgerMonth | null) => !l ? {} : ({
  revenueDollars: dollars(l.grossCents), refundsDollars: dollars(l.refundsCents), teeAndCartDollars: dollars(l.teeCartCents),
  proShopDollars: dollars(l.proShopCents), eventDollars: dollars(l.eventCents), duesDollars: dollars(l.duesCents),
});

/** "By area" in the written report: this month against the month before, stored with the review. */
export type AreaRow = { key: 'rounds' | 'fill' | 'revenue' | 'no_show_rate' | 'pro_shop'; label: string; unit: 'count' | 'pct' | 'cents'; thisMonth: number | null; lastMonth: number | null };
export function byAreaOf(cur: { h: Headline; l: LedgerMonth | null }, prev: { h: Headline; l: LedgerMonth | null } | null): AreaRow[] {
  return [
    { key: 'rounds', label: 'Rounds played', unit: 'count', thisMonth: cur.h.roundsPlayed, lastMonth: prev?.h.roundsPlayed ?? null },
    { key: 'fill', label: 'Tee sheet filled', unit: 'pct', thisMonth: cur.h.fillPct, lastMonth: prev?.h.fillPct ?? null },
    { key: 'revenue', label: 'Revenue', unit: 'cents', thisMonth: cur.l?.grossCents ?? null, lastMonth: prev?.l?.grossCents ?? null },
    { key: 'no_show_rate', label: 'No-show rate', unit: 'pct', thisMonth: cur.h.noShowPct, lastMonth: prev?.h.noShowPct ?? null },
    { key: 'pro_shop', label: 'Pro shop sales', unit: 'cents', thisMonth: cur.l?.proShopCents ?? null, lastMonth: prev?.l?.proShopCents ?? null },
  ];
}

function money(h: Headline) {
  return {
    fillPct: h.fillPct,
    noShowPct: h.noShowPct, cancelPct: h.cancelPct, bookings: h.bookings,
    customers: h.customers, returningCustomerPct: h.returningPct, avgDaysBookedAhead: h.avgLeadDays,
  };
}
function changes(cur: Headline, then: Headline, curL: LedgerMonth | null, thenL: LedgerMonth | null) {
  return {
    // Only when the ledger covers both months; otherwise the change is unknown and left out.
    ...(curL && thenL ? { revenueDollars: dollars(curL.grossCents - thenL.grossCents) } : {}),
    fillPctPoints: diff(cur.fillPct, then.fillPct),
    noShowPctPoints: diff(cur.noShowPct, then.noShowPct),
    cancelPctPoints: diff(cur.cancelPct, then.cancelPct),
    bookings: cur.bookings - then.bookings,
    returningCustomerPctPoints: diff(cur.returningPct, then.returningPct),
  };
}

export type ReviewFacts = ReturnType<typeof buildFacts>;

export function buildFacts(
  month: string, a: Analytics,
  prev: { month: string; a: Analytics; ledger: LedgerMonth | null } | null,
  baseline: { month: string; headline: Headline; ledger: LedgerMonth | null } | null,
  ledger: LedgerMonth | null, ns: Pick<NoShowReport, 'totals' | 'lateCancels'>,
) {
  const cur = headline(a);
  return {
    month: monthLabel(month),
    isBaseline: !baseline,
    thinSample: a.behavior.bookings < THIN_BOOKINGS,
    // Money is the ledger's: what was paid this month (the course's part), as the Revenue page shows it.
    thisMonth: { ...money(cur), ...ledgerFacts(ledger) },
    fillByDayOfWeek: a.utilization.byDow.filter(d => d.sale > 0).map(d => ({ day: d.dow, fillPct: d.fillPct })),
    fillByHour: a.utilization.byHour.filter(h => h.sale > 0).map(h => ({ hour: hourLabel(h.hour), fillPct: h.fillPct })),
    worstUnsoldHours: a.unfilled.worstHours.map(h => ({ hour: hourLabel(h.hour), openSpots: h.open })),
    worstUnsoldDays: a.unfilled.worstDays.slice(0, 3).map(d => ({ day: d.dow, openSpots: d.open })),
    // Booked value = what the missed rounds were priced at (money that never moved); fees are ledger money.
    noShows: { count: a.noShows.count, bookedValueDollars: dollars(ns.totals.lostValueCents), feesRecoveredDollars: dollars(ns.totals.recoveredCents), golfersWhoNoShowedMoreThanOnce: a.noShows.repeat.length },
    cancellations: { count: a.cancellations.count, lateFeesKeptDollars: dollars(ns.lateCancels.feesCents), rebookedPct: a.cancellations.rebookedPct },
    bookingsBy: { online: a.behavior.channel.online ?? 0, phone: a.behavior.channel.phone ?? 0, walkIn: a.behavior.channel.walk_in ?? 0 },
    // Word keys: digits in a key would count as numbers the text may use.
    bookedAhead: { sameDay: a.behavior.lead.sameDay, oneOrTwoDays: a.behavior.lead.d1to2, threeToSevenDays: a.behavior.lead.d3to7, oneToTwoWeeks: a.behavior.lead.d8to14, overTwoWeeks: a.behavior.lead.d15plus },
    activeMembers: a.customers.members.active,
    lastMonth: prev ? { month: monthLabel(prev.month), ...money(headline(prev.a)), ...ledgerFacts(prev.ledger), change: changes(cur, headline(prev.a), ledger, prev.ledger) } : null,
    baseline: baseline ? { month: monthLabel(baseline.month), ...money(baseline.headline), ...ledgerFacts(baseline.ledger), changeFromBaseline: changes(cur, baseline.headline, ledger, baseline.ledger) } : null,
  };
}

// ── No invented numbers ─────────────────────────────────────────────────────
const NUM = /\d[\d,]*(?:\.\d+)?/g;
const toNums = (s: string) => (s.match(NUM) ?? []).map(t => Number(t.replace(/,/g, ''))).filter(Number.isFinite);

/** Numbers the text may carry: every number in the facts (and its rounding),
 *  and small counting/clock numbers (0–12: "3 recommendations", "1pm"). */
export function allowedNumbers(facts: unknown): Set<number> {
  const ok = new Set<number>(Array.from({ length: 13 }, (_, i) => i));
  for (const n of toNums(JSON.stringify(facts))) { ok.add(n); ok.add(Math.round(n)); ok.add(Math.abs(n)); ok.add(Math.round(Math.abs(n))); }
  return ok;
}

/** Every number in `text` that the facts do not contain. Empty = valid. */
export function validateNumbers(text: string, facts: unknown): number[] {
  const ok = allowedNumbers(facts);
  return [...new Set(toNums(text).filter(n => !ok.has(n)))];
}

/** Ratio words carry a number the digit check can't see ("doubled", "half"). */
const RATIO_WORDS = /\b(doubl\w*|tripl\w*|twice|thrice|half|halved|third|quarter)\b/gi;
export function ratioWords(text: string): string[] {
  return [...new Set((text.match(RATIO_WORDS) ?? []).map(w => w.toLowerCase()))];
}

/** Everything wrong with a draft's numbers, as one list for the retry note. */
export function draftProblems(text: string, facts: unknown): string[] {
  return [...validateNumbers(text, facts).map(String), ...ratioWords(text)];
}

// ── The writer ──────────────────────────────────────────────────────────────
export type ReviewBody = { verdict: string; wentWell: string[]; fellShort: string[]; recommendations: string[] };
export type Writer = (facts: ReviewFacts, retryNote?: string) => Promise<ReviewBody>;

export const reviewText = (b: ReviewBody) => [b.verdict, ...b.wentWell, ...b.fellShort, ...b.recommendations].join('\n');

const SYSTEM = `You write the monthly business review for a golf course owner, inside GreenReserve, their tee sheet.

You are given one JSON object of facts about last month, computed by the software. Reply with the review as JSON matching the schema.

Numbers: use ONLY numbers that appear in the facts, copied exactly (you may drop decimals). Never calculate a new number — no sums, differences, ratios or percentages of your own, and no ratio words (doubled, half, twice, a third); every comparison you need is already in "change" and "changeFromBaseline". Never estimate or invent a figure. If a number you'd want isn't there, say it in words without a number.

Interpret: explain what the numbers mean for the business and why it matters, in plain words an owner uses. Be specific — name days, hours and figures.

- verdict: one sentence, the month in a nutshell.
- wentWell: 1–3 short points.
- fellShort: 1–3 short points. If "baseline" is present, judge the month against it (targets) and against "lastMonth"; say how far off. If "isBaseline" is true, there are no targets yet: say this month is the starting line the next reviews will measure against, and leave fellShort to things that were clearly weak.
- recommendations: up to 3, each a concrete action tied to a number in the facts (e.g. a lower rate for the hours that went unsold, a reminder push if no-shows are high). If "thinSample" is true, say the month was too quiet to draw firm conclusions and give at most one recommendation.

Plain text inside each string: no markdown, no emojis, no headings. Money in dollars ("$1,240"). Under 220 words in total.`;

// Structured output, not a forced tool call: Opus 5.5 rejects
// tool_choice {type:"tool"} with a 400 (claude-api skill, error-codes).
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    wentWell: { type: 'array', items: { type: 'string' } },
    fellShort: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'wentWell', 'fellShort', 'recommendations'],
  additionalProperties: false,
} as const;

export const claudeWriter: Writer = async (facts, retryNote) => {
  const client = new Anthropic();
  const content = retryNote
    ? `${JSON.stringify(facts)}\n\nYour last draft used numbers that are not in the facts: ${retryNote}. Rewrite it using only numbers from the facts.`
    : JSON.stringify(facts);
  // Opus 5.5 always thinks, and thinking counts toward max_tokens.
  const msg = await client.messages.create({
    model: REVIEW_MODEL, max_tokens: 8000, system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
    messages: [{ role: 'user', content }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  if (msg.stop_reason === 'refusal') throw new Error('the model declined to write the review');
  if (msg.stop_reason === 'max_tokens') throw new Error('the review ran out of room');
  const text = msg.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
  let b: Partial<ReviewBody>;
  try { b = JSON.parse(text) as Partial<ReviewBody>; } catch { throw new Error('the review was not valid JSON'); }
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()).slice(0, 3) : []);
  if (typeof b.verdict !== 'string' || !b.verdict.trim()) throw new Error('the review had no verdict');
  return { verdict: b.verdict.trim(), wentWell: list(b.wentWell), fellShort: list(b.fellShort), recommendations: list(b.recommendations) };
};

// ── One course, one month ───────────────────────────────────────────────────
export type ReviewOutcome = 'written' | 'thin' | 'failed' | 'not_full_month' | 'exists';

export async function runMonthlyReview(courseId: string, now: Date = new Date(), writer: Writer = claudeWriter): Promise<{ outcome: ReviewOutcome; month: string; error?: string }> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, firstWentLiveAt: true } });
  const tz = course?.timezone && isValidTimezone(course.timezone) ? course.timezone : DEFAULT_TZ;
  const month = previousMonth(todayIn(tz, now));
  if (!course || !isFullMonth(course.firstWentLiveAt, month, tz)) return { outcome: 'not_full_month', month };

  const existing = await prisma.monthlyReview.findUnique({ where: { courseId_month: { courseId, month } }, select: { status: true } });
  if (existing && existing.status !== 'failed') return { outcome: 'exists', month };

  const baselineRow = await prisma.monthlyReview.findFirst({
    // A baseline that never got a readable review isn't one the owner can see —
    // the next month that is written becomes the starting line instead.
    where: { courseId, isBaseline: true, month: { lt: month }, status: { in: ['written', 'thin'] } }, select: { month: true, metrics: true },
  });
  const a = await computeAnalytics(courseId, monthRange(month), now);
  const prevMonth = previousMonth(`${month}-01`);
  // The ledger is append-only, so a past month's money read now is what it was (the baseline's included) — for a
  // month it covers in full. A month before it is unknown money, never $0 (LEDGER_FIRST_FULL_MONTH).
  const ledgerOf = (m: string) => (ledgerCovers(m) ? ledgerMonth(courseId, tz, m, now) : Promise.resolve(null));
  const prev = isFullMonth(course.firstWentLiveAt, prevMonth, tz) ? { month: prevMonth, a: await computeAnalytics(courseId, monthRange(prevMonth), now), ledger: await ledgerOf(prevMonth) } : null;
  const baseline = baselineRow ? { month: baselineRow.month, headline: (baselineRow.metrics as { headline: Headline }).headline, ledger: await ledgerOf(baselineRow.month) } : null;
  const [ledger, ns] = await Promise.all([ledgerOf(month), noShowReport(courseId, monthRange(month), now)]);
  const nsFacts = ns ?? { totals: { bookings: 0, noShows: 0, ratePct: null, lostValueCents: 0, recoveredCents: 0, lateCancelLostValueCents: 0, lateCancelRecoveredCents: 0, lateCancelNetCents: 0, netCents: 0 }, lateCancels: { spots: 0, lostValueCents: 0, refilledSpots: 0, refilledCents: 0, feesCents: 0, netCents: 0 } };
  const facts = buildFacts(month, a, prev, baseline, ledger, nsFacts);
  const byArea = byAreaOf({ h: headline(a), l: ledger }, prev ? { h: headline(prev.a), l: prev.ledger } : null);

  let body: ReviewBody | null = null;
  let error = '';
  try {
    let draft = await writer(facts);
    let bad = draftProblems(reviewText(draft), facts);
    if (bad.length) {
      draft = await writer(facts, bad.join(', '));
      bad = draftProblems(reviewText(draft), facts);
    }
    if (bad.length) error = `the draft used numbers not in the facts: ${bad.join(', ')}`;
    else body = draft;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const status = body ? (facts.thinSample ? 'thin' : 'written') : 'failed';
  const data = {
    isBaseline: !baseline, status, model: REVIEW_MODEL, error: error || null,
    metrics: { headline: headline(a), ledger, byArea, facts } as object,
    body: body ? JSON.stringify(body) : null,
  };
  await prisma.monthlyReview.upsert({ where: { courseId_month: { courseId, month } }, create: { courseId, month, ...data }, update: data });
  return body ? { outcome: status as ReviewOutcome, month } : { outcome: 'failed', month, error };
}

/** Email every stored, readable review the owner hasn't been sent yet. */
export async function emailPendingReviews(courseId: string): Promise<number> {
  const rows = await prisma.monthlyReview.findMany({
    where: { courseId, status: { in: ['written', 'thin'] }, emailedAt: null },
    select: { id: true, month: true, isBaseline: true, body: true, course: { select: { name: true, operator: { select: { email: true } } } } },
  });
  let sent = 0;
  for (const r of rows) {
    const to = r.course.operator?.email;
    if (!to || !r.body) continue;
    await sendMonthlyReviewEmail({ to, courseName: r.course.name, monthLabel: monthLabel(r.month), isBaseline: r.isBaseline, review: JSON.parse(r.body) as ReviewBody });
    await prisma.monthlyReview.update({ where: { id: r.id }, data: { emailedAt: new Date() } });
    sent++;
  }
  return sent;
}
