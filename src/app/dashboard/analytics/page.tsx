'use client';
// AN-3 (Cam 2026-10-19, after AN-2): "it should say Analytics", the dates as ONE
// calendar button defaulting to the past week, the golf-standard four numbers,
// every number explained in plain words, "What to look at" that helps them act,
// Birdie offered for explanations, a smaller monthly review, and the detail
// organised into clear tabs. Top to bottom:
//   1. Analytics + one sentence built from the numbers; the date button.
//   2. Four numbers: Revenue, Tee sheet filled, Rounds played, Average per round,
//      each against the period before.
//   3. "What to look at": sentences from the same numbers, each with an idea to
//      try and an "Ask Birdie" (nothing estimated, nothing invented).
//   4. The monthly review, compact.
//   5. The detail behind tabs: Revenue, Busy times, No-shows & cancellations,
//      Golfers, How they book.
// Every number still comes from lib/analytics.ts (AN-1). Charts are plain
// HTML/CSS — no chart library.
import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { toast } from '@/components/dashboard/Toast';
import { Loader2 } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import DateRangeButton, { type DateRange } from '@/components/dashboard/DateRangeButton';
import { dfetch } from '@/lib/dashboard-fetch';
import { askBirdie, useBirdieReady } from '@/lib/birdie/ask';
import { LoadError } from '@/components/dashboard/LoadError';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import type { Analytics } from '@/lib/analytics';

type Headline = { collectedCents: number; expectedCents: number; fillPct: number | null; lostCents: number; noShowPct: number | null; cancelPct: number | null; customers: number; returningPct: number | null; bookings: number; avgLeadDays: number | null; roundsPlayed?: number; perRoundCents?: number | null };
type Data = Analytics & { headline: Headline; compare: { range: { from: string; to: string }; headline: Headline } | null };
type Tab = 'revenue' | 'busy' | 'misses' | 'golfers' | 'booking';

const usd = (c: number | null | undefined) => c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const usd2 = (c: number | null | undefined) => c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctS = (p: number | null | undefined) => p == null ? '—' : `${Math.round(p)}%`;
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtWeekday = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtHour = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const DAY_NAME: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const spanDays = (r: { from: string; to: string }) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1;

function downloadCsv(name: string, header: string[], rows: (string | number | null)[][]) {
  if (rows.length === 0) { toast('Nothing to download — this is empty for the dates you picked.', 'warn'); return; }
  const esc = (v: string | number | null) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([[header, ...rows].map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast(`Downloaded ${name}.csv (${rows.length} row${rows.length === 1 ? '' : 's'}).`, 'ok');
}

/** The change against the period before, in words: "↑ 12% on the 7 days before". */
function changeOf(now: number | null | undefined, prev: number | null | undefined, unit: 'pct' | 'pts' | 'usd'): { n: number; up: boolean; text: string } | null {
  if (now == null || prev == null) return null;
  const diff = now - prev;
  if (unit === 'pct' && prev === 0) return null;
  const n = unit === 'pts' ? Math.abs(Math.round(diff)) : unit === 'usd' ? Math.abs(Math.round(diff)) : Math.abs(Math.round((diff / prev) * 100));
  if (n === 0) return { n: 0, up: false, text: 'same' };
  const text = unit === 'pts' ? `${n} pt${n === 1 ? '' : 's'}` : unit === 'usd' ? usd2(n) : `${n}%`;
  return { n, up: diff > 0, text };
}

function Change({ now, prev, unit, days, goodWhenUp = true }: { now: number | null | undefined; prev: number | null | undefined; unit: 'pct' | 'pts' | 'usd'; days: number; goodWhenUp?: boolean }) {
  const c = changeOf(now, prev, unit);
  const vs = `the ${days === 1 ? 'day' : `${days} days`} before`;
  if (!c) return <span className="text-ink-muted">Nothing to compare with yet</span>;
  if (c.n === 0) return <span className="text-ink-muted">Same as {vs}</span>;
  return <span><span className={'font-semibold ' + (c.up === goodWhenUp ? 'text-ok' : 'text-bad')}>{c.up ? '↑' : '↓'} {c.text}</span> <span className="text-ink-muted">on {vs}</span></span>;
}

function Big({ label, value, explain, change }: { label: string; value: string; explain: string; change: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-white px-5 py-4">
      <div className="text-[13.5px] font-semibold text-ink">{label}</div>
      <div className="mt-1.5 text-[32px] leading-none font-semibold text-ink tabular-nums">{value}</div>
      <div className="mt-2 text-[12.5px]">{change}</div>
      <div className="mt-1.5 text-[12.5px] text-ink-soft leading-snug">{explain}</div>
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return <div className="flex-1 h-2.5 bg-line-soft rounded-full overflow-hidden"><div className="h-full rounded-full bg-pine" style={{ width: `${w}%` }} /></div>;
}

function BarRow({ label, value, max, right, labelW = 'w-24', hint }: { label: string; value: number; max: number; right: string; labelW?: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px]" title={hint}>
      <span className={labelW + ' shrink-0 text-ink'}>{label}</span>
      <Bar value={value} max={max} />
      <span className="w-14 shrink-0 text-right tabular-nums font-semibold text-ink">{right}</span>
    </div>
  );
}

function Line({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={'flex items-baseline justify-between gap-4 py-2 text-[13.5px] ' + (strong ? 'font-semibold' : '')}>
      <span className="text-ink">{label}{sub && <span className="ml-2 text-[12.5px] font-normal text-ink-muted">{sub}</span>}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** "Ask Birdie" — shown only once Birdie is on, so it never does nothing. */
function Ask({ q, children = 'Ask the assistant about this' }: { q: string; children?: React.ReactNode }) {
  const on = useBirdieReady();
  if (!on) return null;
  return <button onClick={() => askBirdie(q)} className="shrink-0 text-[12.5px] font-medium text-pine hover:underline underline-offset-4">{children}</button>;
}

/** One block of a tab: a title, one sentence on what it tells you, then the detail. */
function Section({ title, why, children, action }: { title: string; why: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {action && <div className="flex items-baseline gap-4">{action}</div>}
      </div>
      <p className="text-[13px] text-ink-soft mt-1 mb-4 max-w-[62em] leading-snug">{why}</p>
      {children}
    </section>
  );
}

function Download({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="shrink-0 text-[12.5px] font-medium text-ink-soft hover:text-ink underline underline-offset-4 decoration-line-strong">Download CSV</button>;
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-[13px] text-ink-soft py-2">{empty}</p>;
  return (
    <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-white"><tr className="text-left">{head.map((h, i) => <th key={h} className={'py-2 pr-4 text-[12.5px] font-semibold text-ink border-b border-line ' + (i > 0 ? 'text-right' : '')}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line-soft">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={'py-2 pr-4 tabular-nums ' + (j > 0 ? 'text-right' : 'text-ink')}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** A small figure inside a tab: a label, the number, one line under it. */
function Fig({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div><div className="text-[13px] font-semibold text-ink">{label}</div><div className="text-[24px] font-semibold tabular-nums mt-1 text-ink">{value}</div><div className="text-[12.5px] text-ink-soft mt-1 leading-snug">{sub}</div></div>;
}

const busiestDay = (d: Data) => [...d.utilization.byDow].filter(r => r.fillPct != null && r.sale > 0).sort((a, b) => (b.fillPct ?? 0) - (a.fillPct ?? 0))[0];
const quietestDay = (d: Data) => [...d.utilization.byDow].filter(r => r.fillPct != null && r.sale > 0).sort((a, b) => (a.fillPct ?? 0) - (b.fillPct ?? 0))[0];
const busiestHour = (d: Data) => [...d.utilization.byHour].filter(r => r.fillPct != null && r.sale > 0).sort((a, b) => (b.fillPct ?? 0) - (a.fillPct ?? 0))[0];

/** The one line under "Analytics": what happened, in a sentence, from the numbers only. */
function summary(d: Data): string {
  const days = spanDays(d.range);
  if (d.behavior.bookings === 0 && d.revenue.collectedCents === 0) return 'No bookings in these dates yet. Pick other dates, or check back once golfers start booking.';
  const parts: string[] = [];
  const c = changeOf(d.headline.collectedCents, d.compare?.headline.collectedCents, 'pct');
  parts.push(`You took in ${usd(d.revenue.collectedCents)}${c && c.n > 0 ? `, ${c.up ? 'up' : 'down'} ${c.text} on the ${days === 1 ? 'day' : `${days} days`} before` : ''}`);
  const bd = busiestDay(d); const bh = busiestHour(d);
  if (bd && bh) parts.push(`${DAY_NAME[bd.dow] ?? bd.dow}s and ${fmtHour(bh.hour)} tee times filled best`);
  return parts.join(', and ') + '.';
}

type Note = { tone: 'ok' | 'warn' | 'bad' | 'neutral'; text: string; tryThis?: string; ask: string };

/** "What to look at": each line restates numbers this page already shows,
 *  says what it means for the course, and offers Birdie for more. */
function insights(d: Data): Note[] {
  const out: Note[] = [];
  if (d.behavior.bookings === 0 && d.revenue.collectedCents === 0) return [{ tone: 'neutral', text: 'No bookings in these dates yet, so there is nothing to read into.', ask: 'How do golfers find my booking page, and how can I get more online bookings?' }];
  const qd = quietestDay(d); const bd = busiestDay(d);
  if (qd && bd && qd.dow !== bd.dow && (bd.fillPct ?? 0) - (qd.fillPct ?? 0) >= 15) out.push({
    tone: 'warn',
    text: `${DAY_NAME[qd.dow] ?? qd.dow}s are your quietest day: ${pctS(qd.fillPct)} of spots booked, against ${pctS(bd.fillPct)} on ${DAY_NAME[bd.dow] ?? bd.dow}s.`,
    tryThis: `A lower ${DAY_NAME[qd.dow] ?? qd.dow} rate or a twilight price can fill spots that would otherwise go unsold.`,
    ask: `Why are ${DAY_NAME[qd.dow] ?? qd.dow}s my quietest day, and what could I try to fill them?`,
  });
  else if (bd && (bd.fillPct ?? 0) > 0) out.push({ tone: 'ok', text: `${DAY_NAME[bd.dow] ?? bd.dow} is your busiest day: ${pctS(bd.fillPct)} of spots booked.`, ask: `Which times on ${DAY_NAME[bd.dow] ?? bd.dow}s fill first?` });
  if (d.noShows.count > 0) {
    const repeat = d.noShows.repeat.slice(0, 3).map(r => r.name).join(', ');
    out.push({
      tone: 'bad',
      text: `${plural(d.noShows.count, 'group')} didn’t show up (${pctS(d.noShows.ratePct)} of bookings).${repeat ? ` More than once: ${repeat}.` : ''}`,
      tryThis: 'A no-show fee (Settings → Cancellation & card) asks for a card at booking and charges it when a group doesn’t come.',
      ask: 'Who didn’t show up in these dates, and would a no-show fee help?',
    });
  }
  if (d.revenue.outstandingBookings > 0) out.push({
    tone: 'warn',
    text: `${plural(d.revenue.outstandingBookings, 'group')} played or were booked but weren’t paid, worth ${usd(d.revenue.outstandingCents)}. No-shows are included.`,
    tryThis: 'Check them in or mark them paid at the counter on the tee sheet so the books match.',
    ask: 'Which groups in these dates were never paid?',
  });
  if (d.cancellations.count > 0) out.push({
    tone: 'neutral',
    text: `${plural(d.cancellations.count, 'booking')} cancelled${d.cancellations.rebookedPct != null ? `; ${pctS(d.cancellations.rebookedPct)} of those times were booked again by someone else` : ''}.`,
    ask: 'How far ahead do golfers cancel, and is my cancellation window right?',
  });
  if (d.customers.returningPct != null && d.customers.returningPct > 0 && d.customers.identified >= 5) out.push({
    tone: 'neutral',
    text: `${pctS(d.customers.returningPct)} of your ${d.customers.identified.toLocaleString()} golfers booked more than once.`,
    ask: 'Who are my regulars, and who hasn’t been back in a while?',
  });
  return out.slice(0, 5);
}

// BI-1 (PLATFORM_ROADMAP_SPEC §1): the monthly AI review. Its own fetch — it
// does not follow the date button. The words are the model's; the numbers in
// them were checked against lib/analytics.ts before the review was stored.
// AN-3: compact — one line until there is a review, then one month open at a time.
type Review = { month: string; label: string; isBaseline: boolean; thin: boolean; writtenAt: string; review: { verdict: string; wentWell: string[]; fellShort: string[]; recommendations: string[] } };

function ReviewList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <h4 className="text-[13.5px] font-semibold text-ink">{title}</h4>
      <ul className="mt-1.5 space-y-1.5">{items.map(i => <li key={i} className="text-[13.5px] text-ink leading-snug pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-2 before:h-0.5 before:bg-fairway">{i}</li>)}</ul>
    </div>
  );
}

function MonthlyReviews() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(-1);
  const load = useCallback(async () => {
    setError('');
    const res = await dfetch<{ reviews: Review[] }>('/api/operator/monthly-reviews');
    if (res.ok) setReviews(res.data.reviews); else setError(res.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <Card id="reviews" className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold text-ink">Monthly review</h2>
        {reviews && reviews.length > 0 && <span className="text-[12.5px] text-ink-muted">Written on the 1st of each month</span>}
      </div>
      {error && <div className="mt-3"><LoadError message={error} onRetry={load} /></div>}
      {!reviews && !error && <div className="py-3 text-center text-ink-muted"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
      {reviews && reviews.length === 0 && (
        <p className="text-[13.5px] text-ink-soft mt-1 leading-snug max-w-[62em]">After your first full month with GreenReserve, you’ll get a short written review here on the 1st of each month: what went well, where the course fell short, and what to try next. Your first month becomes the starting line every later month is measured against.</p>
      )}
      {reviews && reviews.length > 0 && (
        <div className="mt-2 divide-y divide-line-soft">
          {reviews.map((r, i) => (
            <div key={r.month} className="py-2">
              <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i} className="w-full flex items-baseline justify-between gap-3 text-left">
                <span className="text-[14px] font-semibold text-ink">{r.label}{r.isBaseline ? <span className="ml-2 font-normal text-[12.5px] text-ink-muted">Starting line</span> : null}</span>
                <span className="text-[12.5px] font-medium text-pine">{open === i ? 'Hide' : 'Read'}</span>
              </button>
              {open !== i && <p className="text-[13px] text-ink-soft mt-0.5 line-clamp-1">{r.review.verdict}</p>}
              {open === i && (
                <div className="mt-2 max-w-[62em] pb-2">
                  <p className="text-[14px] text-ink leading-relaxed">{r.review.verdict}</p>
                  {r.thin && <p className="text-[12.5px] text-ink-muted mt-1">A quiet month: too few bookings to draw firm conclusions.</p>}
                  <ReviewList title="What went well" items={r.review.wentWell} />
                  <ReviewList title="Where you fell short" items={r.review.fellShort} />
                  <ReviewList title="What to try next" items={r.review.recommendations} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RevenueTab({ d }: { d: Data }) {
  const max = Math.max(...d.revenue.series.map(x => Math.max(x.expectedCents, x.collectedCents)), 1);
  const per = d.revenue.bucket === 'week' ? 'week' : 'day';
  const rangeBalls = Math.max(0, d.revenue.collectedCents - d.revenue.greenCents - d.revenue.cartCents);
  return (
    <div className="space-y-10">
      <Section title={`Revenue each ${per}`}
        why={`What your course was paid for the rounds on each ${per}: green fees, carts and range balls. The light part of a bar is rounds that played (or no-showed) but weren’t paid yet.`}
        action={<><Ask q="Walk me through my revenue for these dates — which days were strongest and why?" /><Download onClick={() => downloadCsv(`revenue-${d.range.from}-${d.range.to}`, [per === 'week' ? 'Week of' : 'Date', 'Paid', 'Played, not paid'], d.revenue.series.map(r => [r.key, r.collectedCents / 100, Math.max(0, r.gapCents) / 100]))} /></>}>
        {d.revenue.series.length === 0 ? <p className="text-[13px] text-ink-soft">No rounds played in these dates yet.</p> : (<>
          <div className="relative">
            <span className="absolute -top-1 left-0 text-[11.5px] text-ink-muted tabular-nums">{usd(max)}</span>
            <div className="flex items-end gap-[2px] h-44 pt-4 border-b border-line">
              {d.revenue.series.map(r => {
                const unpaid = Math.max(0, r.expectedCents - r.collectedCents);
                return (
                  <div key={r.key} className="flex-1 h-full flex flex-col justify-end relative group">
                    {unpaid > 0 && <div className="w-full bg-line-strong/60 rounded-t-[4px] mb-[2px]" style={{ height: `${(unpaid / max) * 100}%` }} />}
                    <div className={'w-full bg-pine ' + (unpaid > 0 ? '' : 'rounded-t-[4px]')} style={{ height: `${(r.collectedCents / max) * 100}%` }} />
                    <div className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-ink text-white text-[11.5px] px-2 py-1 rounded-md hidden group-hover:block z-10">{per === 'week' ? 'Week of ' : ''}{fmtDay(r.key)}: {usd(r.collectedCents)} paid{unpaid > 0 ? `, ${usd(unpaid)} not paid` : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-[12px] text-ink-muted mt-1.5">
            <span>{fmtDay(d.revenue.series[0].key)}</span>
            <span className="flex gap-4 text-ink-soft"><span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-pine inline-block" />Paid</span><span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-line-strong inline-block" />Played, not paid</span></span>
            <span>{fmtDay(d.revenue.series.at(-1)!.key)}</span>
          </div>
        </>)}
      </Section>

      <div className="grid lg:grid-cols-2 gap-10">
        <Section title="What it was for" why="Your revenue split by what golfers paid for. GreenReserve’s booking fee is paid by the golfer on top and isn’t counted here.">
          <div className="divide-y divide-line-soft">
            <Line label="Green fees" value={usd(d.revenue.greenCents)} />
            <Line label="Carts" value={usd(d.revenue.cartCents)} />
            {rangeBalls > 0 && <Line label="Range balls" value={usd(rangeBalls)} />}
            <Line label="Revenue" value={usd(d.revenue.collectedCents)} strong />
            {d.revenue.lateFeesKeptCents > 0 && <Line label="Plus late-cancel fees kept" value={usd(d.revenue.lateFeesKeptCents)} />}
          </div>
        </Section>
        <Section title="How golfers paid" why="Where the money came in, and what is still owed for rounds already played.">
          <div className="divide-y divide-line-soft">
            <Line label="By card" sub="at check-in or with a pay link" value={usd(d.revenue.cardCents)} />
            <Line label="At the counter" sub="cash or your own card machine" value={usd(d.revenue.counterCents)} />
            <Line label="Not paid yet" sub={`${plural(d.revenue.outstandingBookings, 'group')}, no-shows included`} value={usd(d.revenue.outstandingCents)} />
            <Line label="Average per round" sub={plural(d.revenue.roundsPlayed, 'round')} value={usd2(d.revenue.perRoundCents)} />
          </div>
        </Section>
      </div>

      {/* W2-8 (4): money beyond the green fee — its own line, never in revenue. */}
      <Section title="Beyond the green fee" why="Carts and the pro shop. Shop sales are shown here on their own and aren’t counted in your revenue above. Before sales tax.">
        <div className="divide-y divide-line-soft max-w-xl">
          <Line label="Rounds with a cart" sub={`${d.revenue.beyond.cartRounds} of ${plural(d.revenue.beyond.rounds, 'paid booking')}`} value={pctS(d.revenue.beyond.cartPct)} />
          <Line label="Shop items added to rounds" sub={d.revenue.beyond.shopPerRoundCents == null ? undefined : `${usd2(d.revenue.beyond.shopPerRoundCents)} per round played`} value={usd(d.revenue.beyond.shopOnRoundsCents)} />
          <Line label="Walk-up shop sales" sub={plural(d.revenue.beyond.walkUpSales, 'sale')} value={usd(d.revenue.beyond.walkUpCents)} />
        </div>
      </Section>

      {/* W2-8 (2): what golfers paid against the price posted for their tee time. */}
      <Section title="What golfers paid against your posted price"
        why={d.revenue.rates.postedCents === 0
          ? 'Green fees on paid rounds, against the price posted for each tee time. Nothing paid in these dates yet.'
          : `Green fees on paid rounds came to ${pctS(d.revenue.rates.ofPostedPct)} of the price posted for those tee times — ${d.revenue.rates.belowPostedCents >= 0 ? `${usd(d.revenue.rates.belowPostedCents)} below posted` : `${usd(-d.revenue.rates.belowPostedCents)} above posted`}, through member and resident rates and prices staff set by hand. Twilight and other rounds are measured against their own posted price.`}
        action={d.revenue.rates.rows.length > 0 ? <Download onClick={() => downloadCsv(`rate-vs-posted-${d.range.from}-${d.range.to}`, ['Rate', 'Players', 'Paid', 'Posted', '% of posted'], d.revenue.rates.rows.map(r => [r.rate, r.players, r.paidCents / 100, r.postedCents / 100, r.ofPostedPct]))} /> : undefined}>
        <Table head={['Rate', 'Players', 'Paid', 'Posted', 'Of posted']} empty="No paid rounds in these dates."
          rows={d.revenue.rates.rows.map(r => [r.kind === 'member' ? `${r.rate} (member)` : r.rate, r.players, usd(r.paidCents), usd(r.postedCents), pctS(r.ofPostedPct)])} />
      </Section>

      <Section title="Coming up" why="Bookings for tee times that haven’t happened yet, and what they’re worth to you when they play.">
        <div className="divide-y divide-line-soft max-w-xl">
          <Line label="Upcoming bookings" sub={plural(d.revenue.pipeline.upcomingBookings, 'booking')} value={usd(d.revenue.upcomingCents)} />
          {d.revenue.pipeline.cardOnFile.bookings - d.revenue.pipeline.cardOnFile.noCardRequired > 0 && <Line label="With a card saved" sub="covers your late-cancel and no-show fees" value={plural(d.revenue.pipeline.cardOnFile.bookings - d.revenue.pipeline.cardOnFile.noCardRequired, 'booking')} />}
          {d.revenue.pipeline.cardOnFile.noCardRequired > 0 && <Line label="No card needed" sub="they get a pay link before the round" value={plural(d.revenue.pipeline.cardOnFile.noCardRequired, 'booking')} />}
          {d.revenue.holdsHeldCents > 0 && <Line label="Cancellation holds taken" sub="refunded when they check in" value={usd(d.revenue.holdsHeldCents)} />}
        </div>
      </Section>
    </div>
  );
}

function BusyTab({ d }: { d: Data }) {
  const emptiest = [...d.unfilled.rows].sort((a, b) => b.open - a.open || a.date.localeCompare(b.date)).slice(0, 12);
  // W2-8 (1): the same squares, shaded by what each hour EARNED per spot offered.
  const [earned, setEarned] = useState(false);
  const grid = earned ? d.utilization.earnedPerSpot : d.utilization.heatmap;
  const maxEarned = Math.max(1, ...d.utilization.earnedPerSpot.rows.flatMap(r => r.cells.map(c => c ?? 0)));
  const shade = (c: number) => earned ? (c / maxEarned) * 100 : c;
  const u = d.utilization;
  // W2-8 (5): the next two weeks against where the same days usually stand by now.
  const pace = u.pace.filter(p => p.offered > 0);
  const behind = pace.filter(p => p.usual != null && p.usual > 0 && p.booked < p.usual * 0.8);
  return (
    <div className="space-y-10">
      <Section title="The next two weeks"
        why={pace.length === 0 ? 'No tee times are out for the next two weeks yet.'
          : behind.length === 0 ? 'Players booked so far for each coming day, against the same weekday the same number of days out over the last four weeks. Nothing is running well behind.'
          : `Players booked so far for each coming day, against the same weekday the same number of days out over the last four weeks. ${behind.length === 1 ? `${fmtWeekday(behind[0].date)} is` : `${plural(behind.length, 'day')} are`} running behind — there’s still time to fill ${behind.length === 1 ? 'it' : 'them'}.`}>
        <Table head={['Day', 'Booked so far', 'Usually by now', 'Spots offered']} empty="No tee times are out for the next two weeks yet."
          rows={pace.map(p => [
            <span key="d" className="inline-flex items-center gap-2">{fmtWeekday(p.date)}{behind.includes(p) && <StatusDot status="warn" label="behind" />}</span>,
            p.booked, p.usual == null ? '—' : p.usual, p.offered,
          ])} />
      </Section>

      <Section title="When your tee sheet fills"
        why={earned
          ? 'Each square is one hour on one day of the week, and the number is what it earned for every spot you offered — sold or not, tee times already played. A full hour of cheap rounds can earn less than a half-full hour at full price.'
          : 'Each square is one hour on one day of the week, and the number is the share of spots booked. Darker means fuller — the light squares are where there’s room to sell.'}
        action={<><Ask q="Looking at when my tee sheet fills, which hours should I focus on filling?" /><Download onClick={() => downloadCsv(`${earned ? 'earned-per-spot' : 'how-full'}-${d.range.from}-${d.range.to}`, ['Day', ...grid.hours.map(h => `${h}:00`)], grid.rows.map(r => [r.dow, ...r.cells.map(c => c == null ? null : earned ? c / 100 : c)]))} /></>}>
        <div className="flex gap-1 mb-3 text-[12.5px]" role="group" aria-label="Show">
          {([[false, 'How full'], [true, 'Earned per spot']] as [boolean, string][]).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={earned === v} onClick={() => setEarned(v)}
              className={'px-2.5 py-1 rounded-md border ' + (earned === v ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-line hover:text-ink')}>{l}</button>
          ))}
        </div>
        {grid.hours.length === 0 ? <p className="text-[13px] text-ink-soft">No tee times in these dates.</p> : (
          <div className="overflow-x-auto">
            <table className="text-[12px] tabular-nums">
              <thead><tr><th />{grid.hours.map(h => <th key={h} className="px-0.5 pb-1 font-medium text-ink-muted">{fmtHour(h)}</th>)}</tr></thead>
              <tbody>{grid.rows.map(r => (
                <tr key={r.dow}><td className="pr-3 text-ink">{r.dow}</td>{r.cells.map((c, i) => (
                  <td key={i} className="p-[1px]"><div title={c == null ? (earned ? 'Nothing played yet' : 'No tee times') : `${DAY_NAME[r.dow] ?? r.dow} ${fmtHour(grid.hours[i])}: ${earned ? `${usd2(c)} per spot offered` : `${Math.round(c)}% booked`}`}
                    className={'w-12 h-8 rounded-[4px] flex items-center justify-center ' + (c == null ? 'bg-paper text-ink-faint' : shade(c) >= 60 ? 'text-white' : 'text-ink')}
                    style={c == null ? undefined : { background: `color-mix(in srgb, var(--color-pine) ${Math.round(8 + shade(c) * 0.92)}%, white)` }}>{c == null ? '' : earned ? `$${Math.round(c / 100)}` : `${Math.round(c)}`}</div></td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-10">
        <Section title="By day of the week" why="The share of spots booked on each day.">
          <div className="space-y-2">{d.utilization.byDow.map(r => <BarRow key={r.dow} label={DAY_NAME[r.dow] ?? r.dow} value={r.fillPct ?? 0} max={100} right={pctS(r.fillPct)} hint={`${r.booked} of ${r.sale} spots`} />)}</div>
        </Section>
        <Section title="By hour" why="The share of spots booked in each hour of the day.">
          {d.utilization.byHour.length === 0 ? <p className="text-[13px] text-ink-soft">No tee times in these dates.</p>
            : <div className="space-y-2">{d.utilization.byHour.map(r => <BarRow key={r.hour} label={fmtHour(r.hour)} labelW="w-14" value={r.fillPct ?? 0} max={100} right={pctS(r.fillPct)} hint={`${r.booked} of ${r.sale} spots`} />)}</div>}
        </Section>
      </div>

      {/* W2-8 (6): where demand was more than the tee sheet offered. */}
      <Section title="Golfers you turned away"
        why={`${plural(u.soldOutTimes, 'tee time')} sold out. ${u.alerts.count === 0 ? 'Nobody asked to hear when a full time opened up.' : `${plural(u.alerts.count, 'golfer')} (${plural(u.alerts.players, 'player')}) asked to be told when a time opened; ${u.alerts.notified} ${u.alerts.notified === 1 ? 'was' : 'were'} told.`} Hours that keep selling out are where you could add times or hold your price.`}
        action={u.alerts.count > 0 ? <Download onClick={() => downloadCsv(`waiting-for-a-time-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Players', 'Told'], u.alerts.rows.map(a => [a.date, a.time, a.players, a.notified ? 'yes' : 'no']))} /> : undefined}>
        <Table head={['Day', 'Hour', 'Times sold out']} empty="Nothing sold out in these dates."
          rows={u.soldOutByHour.map(r => [DAY_NAME[r.dow] ?? r.dow, fmtHour(r.hour), r.times])} />
      </Section>

      <Section title="Tee times that went out with open spots"
        why={`${plural(d.unfilled.slots, 'tee time')} went out with room left — ${plural(d.unfilled.openSpots, 'spot')} nobody booked. The ones with the most open spots are first.`}
        action={<Download onClick={() => downloadCsv(`open-spots-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Spots open'], d.unfilled.rows.map(r => [r.date, r.time, r.open]))} />}>
        <Table head={['Day', 'Time', 'Spots open']} empty="Every tee time in these dates went out full."
          rows={emptiest.map(r => [fmtDay(r.date), fmtTime(r.time), r.open])} />
      </Section>
    </div>
  );
}

function MissesTab({ d }: { d: Data }) {
  const c = d.cancellations;
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Fig label="No-shows" value={String(d.noShows.count)} sub={`${pctS(d.noShows.ratePct)} of bookings whose tee time has passed`} />
        <Fig label="Worth" value={usd(d.noShows.impactCents)} sub="the no-show groups’ rounds" />
        <Fig label="Cancellations" value={String(c.count)} sub={`${pctS(c.ratePct)} of bookings${c.calledOff.bookings ? ', not counting rounds you called off' : ''}`} />
        <Fig label="Booked again" value={pctS(c.rebookedPct)} sub="of cancelled times, by someone else" />
      </div>
      <div className="grid lg:grid-cols-2 gap-10">
        <Section title="No-shows"
          why={`A group counts as a no-show when it hasn’t checked in ${d.graceMinutes} minutes after its tee time, whether or not your staff marked it.${d.noShows.shortShows.groups ? ` Another ${plural(d.noShows.shortShows.groups, 'group')} turned up short — ${plural(d.noShows.shortShows.missingPlayers, 'player')} fewer than booked.` : ''}`}
          action={<><Ask q="Who didn’t show up in these dates, and what can I do about repeat no-shows?" /><Download onClick={() => downloadCsv(`no-shows-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Golfer', 'Players', 'Worth', 'Marked by staff'], d.noShows.rows.map(r => [r.date, r.time, r.name, r.players, r.valueCents / 100, r.marked ? 'yes' : 'no']))} /></>}>
          {/* W2-8 (7): the evidence a course needs before turning on a no-show fee. */}
          {(d.noShows.byFeePolicy.withFee.bookings > 0 && d.noShows.byFeePolicy.withoutFee.bookings > 0) && (
            <div className="divide-y divide-line-soft mb-5">
              <Line label="With a card and a fee" value={`${pctS(d.noShows.byFeePolicy.withFee.noShowPct)} no-shows`} sub={`${pctS(d.noShows.byFeePolicy.withFee.didntPlayPct)} of booked players didn’t play · ${plural(d.noShows.byFeePolicy.withFee.bookings, 'booking')}`} />
              <Line label="With no fee" value={`${pctS(d.noShows.byFeePolicy.withoutFee.noShowPct)} no-shows`} sub={`${pctS(d.noShows.byFeePolicy.withoutFee.didntPlayPct)} of booked players didn’t play · ${plural(d.noShows.byFeePolicy.withoutFee.bookings, 'booking')}`} />
            </div>
          )}
          <h4 className="text-[13px] font-semibold text-ink mb-1">Missed more than once</h4>
          <Table head={['Golfer', 'Times']} empty="Nobody missed more than once." rows={d.noShows.repeat.map(r => [r.name, r.count])} />
        </Section>
        <Section title="Cancellations"
          why={c.count === 0 ? 'No cancellations in these dates.' : `${plural(c.count, 'booking')} cancelled, worth ${usd(c.lostCents)} after the ${usd(c.lateFeesKeptCents)} in late fees you kept.`}
          action={<><Ask q="How far ahead do golfers cancel, and is my cancellation window right?" /><Download onClick={() => downloadCsv(`cancellations-${d.range.from}-${d.range.to}`, ['Date', 'Time', 'Golfer', 'Players', 'Worth', 'Cancelled at', 'Cancelled by'], c.rows.map(r => [r.date, r.time, r.name, r.players, r.valueCents / 100, r.cancelledAt, r.by ?? 'not tracked']))} /></>}>
          {/* W2-8 (8): weather and closures are the course's call, not the golfer's. */}
          {(c.calledOff.bookings > 0 || d.utilization.closedDays.length > 0) && (
            <p className="text-[13px] text-ink-soft mb-4">
              {c.calledOff.bookings > 0 ? `You called off ${plural(c.calledOff.bookings, 'booking')} (${plural(c.calledOff.players, 'player')})${c.calledOff.weather ? `, ${c.calledOff.weather} for weather` : ''}${c.calledOff.closure ? `, ${c.calledOff.closure} when the course closed` : ''} — not counted as cancellations. ` : ''}
              {d.utilization.closedDays.length > 0 ? `Closed ${plural(d.utilization.closedDays.length, 'day')}: ${d.utilization.closedDays.map(x => `${fmtDay(x.date)}${x.reason ? ` (${x.reason})` : ''}`).join(', ')}.` : ''}
            </p>
          )}
          {c.count > 0 && (<>
            <h4 className="text-[13px] font-semibold text-ink mb-2">How long before the tee time</h4>
            <div className="space-y-2 mb-6">
              {([['Under a day', c.lead.under24h], ['1 to 3 days', c.lead.d1to3], ['More than 3 days', c.lead.over3d]] as [string, number][]).map(([l, v]) => <BarRow key={l} label={l} labelW="w-32" value={v} max={Math.max(c.count, 1)} right={String(v)} />)}
            </div>
            <h4 className="text-[13px] font-semibold text-ink mb-1">Who cancelled</h4>
            {c.byCustomer + c.byStaff === 0 ? <p className="text-[12.5px] text-ink-muted">Tracked from {fmtDay(d.eventLogStart)} on.</p> : (
              <div className="divide-y divide-line-soft">
                <Line label="The golfer" value={String(c.byCustomer)} />
                <Line label="Your staff or GreenReserve" value={String(c.byStaff)} />
                {c.actorUnknown > 0 && <Line label="Before we tracked it" value={String(c.actorUnknown)} />}
              </div>
            )}
          </>)}
        </Section>
      </div>
    </div>
  );
}

function GolfersTab({ d }: { d: Data }) {
  const g = d.customers;
  return (
    <div className="space-y-10">
      <p className="text-[13px] text-ink-soft leading-snug max-w-[62em]">
        Built only from bookings golfers made at your course: their name, email, phone and rounds. GreenReserve’s
        <Link href="/privacy" target="_blank" className="text-pine underline underline-offset-4">Privacy Policy</Link> tells golfers this.
        It’s your course’s data — use it to look after your regulars, not for marketing they didn’t ask for.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Fig label="Golfers" value={g.identified.toLocaleString()} sub={`${g.newCustomers} new, ${g.returning} came back`} />
        <Fig label="Came back" value={pctS(g.returningPct)} sub="booked with you more than once, counting past visits" />
        <Fig label="Kept from before" value={pctS(g.retentionPct)} sub={`${g.retained} of ${g.previousCustomers} from the period before booked with you again`} />
        <Fig label="Members" value={String(g.members.active)} sub={`active, of ${g.members.onFile} on file`} />
      </div>

      <Section title="Your regulars" why="The golfers who booked most often in these dates, and what they spent with you."
        action={<><Ask q="Who are my regulars, and who used to come often but hasn’t been back?" /><Download onClick={() => downloadCsv(`regulars-${d.range.from}-${d.range.to}`, ['Golfer', 'Bookings', 'Players', 'Spent'], g.topByRounds.map(r => [r.name, r.rounds, r.players, r.spendCents / 100]))} /></>}>
        <Table head={['Golfer', 'Bookings', 'Players', 'Spent']} empty="No golfers to show yet." rows={g.topByRounds.map(r => [r.name, r.rounds, r.players, usd(r.spendCents)])} />
        {g.unidentifiedBookings > 0 && <p className="text-[12.5px] text-ink-muted mt-2">{plural(g.unidentifiedBookings, 'walk-in')} had no email or phone, so they can’t be counted here. Take a phone number at the counter.</p>}
      </Section>

      {/* W2-8 (9): the regulars to call — Cam 2026-10-22: name, email and phone shown. */}
      <Section title="Regulars who’ve gone quiet"
        why="Golfers with three or more rounds whose last round was more than twice their usual gap ago (and at least two weeks). A call or a note now is cheaper than finding a new golfer."
        action={g.goneQuiet.length > 0 ? <Download onClick={() => downloadCsv(`gone-quiet-${d.range.to}`, ['Golfer', 'Email', 'Phone', 'Rounds', 'Last played', 'Usually every (days)', 'Days since'], g.goneQuiet.map(r => [r.name, r.email, r.phone, r.rounds, r.lastPlayed, r.usualGapDays, r.daysSince]))} /> : undefined}>
        <Table head={['Golfer', 'Email', 'Phone', 'Rounds', 'Last played', 'Usually every']} empty="Nobody who played regularly has gone quiet."
          rows={g.goneQuiet.slice(0, 15).map(r => [r.name, r.email ? <a href={`mailto:${r.email}`} className="text-pine hover:underline">{r.email}</a> : '—', r.phone ? <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="text-pine hover:underline">{r.phone}</a> : '—', r.rounds, fmtDay(r.lastPlayed), `${r.usualGapDays} days`])} />
      </Section>

      {/* W2-8 (3): the table a city or county asks for, as a download. */}
      {(() => {
        const rows = g.residents.rows;
        const t = rows.reduce((a, r) => ({ rp: a.rp + r.resPlayers, op: a.op + r.otherPlayers, rc: a.rc + r.resCents, oc: a.oc + r.otherCents }), { rp: 0, op: 0, rc: 0, oc: 0 });
        if (t.rp === 0) return null;
        return (
          <Section title="Residents and everyone else"
            why={`Rounds paid for in these dates, from ${fmtDay(g.residents.since)} on (when resident rates started being recorded): ${plural(t.rp, 'resident player')} paid ${usd(t.rc)} in green fees; ${plural(t.op, 'other player')} paid ${usd(t.oc)}. Download it for your city or county.`}
            action={<Download onClick={() => downloadCsv(`residents-${d.range.from}-${d.range.to}`, ['Date', 'Resident players', 'Other players', 'Resident green fees', 'Other green fees'], rows.map(r => [r.date, r.resPlayers, r.otherPlayers, r.resCents / 100, r.otherCents / 100]))} />}>
            <div className="divide-y divide-line-soft max-w-md">
              <Line label="Resident players" value={t.rp.toLocaleString()} sub={usd(t.rc)} />
              <Line label="Everyone else" value={t.op.toLocaleString()} sub={usd(t.oc)} />
            </div>
          </Section>
        );
      })()}
    </div>
  );
}

function BookingTab({ d }: { d: Data }) {
  const b = d.behavior;
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Fig label="Bookings" value={b.bookings.toLocaleString()} sub={plural(b.players, 'player')} />
        <Fig label="Online" value={pctS(b.bookings ? ((b.channel.online ?? 0) / b.bookings) * 100 : null)} sub="booked on your booking page" />
        <Fig label="Group size" value={b.avgGroupSize == null ? '—' : String(b.avgGroupSize)} sub="players per booking, on average" />
        <Fig label="Booked ahead" value={b.avgLeadDays == null ? '—' : `${b.avgLeadDays} days`} sub="on average" />
      </div>
      <div className="grid lg:grid-cols-2 gap-10">
        <Section title="Where bookings came from" why="Online is your booking page; phone and walk-in are the ones your staff added on the tee sheet."
          action={<Ask q="How are golfers booking, and how can I move more of them online?" />}>
          <div className="space-y-2">
            {([['Online', b.channel.online ?? 0], ['Walked in', b.channel.walk_in ?? 0], ['By phone', b.channel.phone ?? 0]] as [string, number][]).map(([l, v]) => <BarRow key={l} label={l} value={v} max={Math.max(b.bookings, 1)} right={String(v)} />)}
          </div>
        </Section>
        <Section title="How far ahead they book" why="How long before the tee time each booking was made. Mostly same-day means golfers decide late; long lead times mean your best times sell out early.">
          <div className="space-y-2">
            {([['Same day', b.lead.sameDay], ['1–2 days', b.lead.d1to2], ['3–7 days', b.lead.d3to7], ['8–14 days', b.lead.d8to14], ['15+ days', b.lead.d15plus]] as [string, number][]).map(([l, v]) => <BarRow key={l} label={l} value={v} max={Math.max(b.bookings, 1)} right={String(v)} />)}
          </div>
        </Section>
      </div>
    </div>
  );
}

const TABS: [Tab, string][] = [['revenue', 'Revenue'], ['busy', 'Busy times'], ['misses', 'No-shows & cancellations'], ['golfers', 'Golfers'], ['booking', 'How they book']];

function AnalyticsInner() {
  const [range, setRange] = useState<DateRange | null>(null);
  const [today, setToday] = useState('');
  const [tab, setTab] = useState<Tab>('revenue');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Review (admin-UX): a refusal is not a failure — a staff login gets a plain
  // explanation and a way back, never a Retry that can only fail again.
  const [denied, setDenied] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const seq = useRef(0); // only the newest request may write state
  const birdieOn = useBirdieReady();

  const load = useCallback(async (r: DateRange | null) => {
    const mine = ++seq.current;
    setLoading(true); setError('');
    // AN-3: the first load asks for the last 7 days; the server knows the course's date.
    const qs = new URLSearchParams({ ...(r ? r : { days: '7' }), compare: '1' });
    const res = await dfetch<Data>(`/api/operator/analytics?${qs}`);
    if (mine !== seq.current) return; // a newer pick superseded this one
    if (res.ok) { setData(res.data); setToday(res.data.today); setRange(res.data.range); }
    else if (res.status === 403) setDenied(true);
    else if (res.status === 401) setSignedOut(true);
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { load(null); }, [load]);

  const prev = data?.compare?.headline;
  const d = data;

  if (denied || signedOut) return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="analytics" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="max-w-xl mx-auto px-6 py-16">
          <Card className="p-6">
            <h1 className="text-[20px] font-serif font-semibold text-ink">{denied ? 'Your login doesn’t include Analytics' : 'Your session ended'}</h1>
            <p className="text-[13.5px] text-ink-soft mt-2">{denied
              ? 'It shows revenue and what each golfer spends. The course owner can turn on “See analytics” for you in Settings → Staff & permissions.'
              : 'Sign in again to see your analytics.'}</p>
            <Link href={denied ? '/dashboard' : '/dashboard/login'} className="inline-flex mt-4 px-4 py-2 rounded-md bg-pine text-white text-[13px] font-semibold hover:bg-pine-hover">{denied ? 'Back to the tee sheet' : 'Sign in'}</Link>
          </Card>
        </div>
      </main>
    </div>
  );

  const notes = d ? insights(d) : [];
  const days = d ? spanDays(d.range) : 7;

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="analytics" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div className="min-w-0 max-w-[46em]">
              <h1 className="text-[30px] font-serif font-semibold leading-none text-ink">Analytics</h1>
              <p className="text-[14px] text-ink-soft mt-2.5 leading-snug">{d ? summary(d) : 'Loading…'}</p>
            </div>
            {range && today && <DateRangeButton value={range} today={today} onChange={r => { setRange(r); load(r); }} />}
          </div>

          {error && <div className="mb-5"><LoadError message={d ? `${error} Still showing ${fmtDay(d.range.from)} – ${fmtDay(d.range.to)}.` : error} onRetry={() => load(range)} /></div>}
          {loading && !d && <div className="py-24 text-center text-ink-muted"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}

          {d && (
            <div className={'space-y-5 ' + (loading ? 'opacity-60 pointer-events-none' : '')}>
              {/* 1. The four numbers */}
              <Card className="overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line">
                  <Big label="Revenue" value={usd(d.revenue.collectedCents)}
                    change={<Change now={d.headline.collectedCents} prev={prev?.collectedCents} unit="pct" days={days} />}
                    explain="Green fees, carts and range balls paid to your course for these dates." />
                  <Big label="Tee sheet filled" value={pctS(d.utilization.fillPct)}
                    change={<Change now={d.headline.fillPct} prev={prev?.fillPct} unit="pts" days={days} />}
                    explain={`${d.utilization.spotsBooked.toLocaleString()} of the ${d.utilization.spotsForSale.toLocaleString()} spots you offered were booked.`} />
                  <Big label="Rounds played" value={d.revenue.roundsPlayed.toLocaleString()}
                    change={<Change now={d.headline.roundsPlayed} prev={prev?.roundsPlayed} unit="pct" days={days} />}
                    explain="Golfers who checked in and paid. One golfer, one round." />
                  <Big label="Average per round" value={usd2(d.revenue.perRoundCents)}
                    change={<Change now={d.headline.perRoundCents} prev={prev?.perRoundCents} unit="usd" days={days} />}
                    explain="Revenue divided by rounds played: what each golfer spent with you." />
                </div>
              </Card>

              {/* 2. What to look at */}
              <Card className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
                  <h2 className="text-[17px] font-semibold text-ink">What to look at</h2>
                  {birdieOn && <span className="text-[12.5px] text-ink-muted">Your assistant can explain any of these</span>}
                </div>
                <ul className="divide-y divide-line-soft">
                  {notes.map((n, i) => (
                    <li key={i} className="flex items-baseline gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="-translate-y-[2px]"><StatusDot status={n.tone} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] text-ink leading-snug">{n.text}</p>
                        {n.tryThis && <p className="text-[13px] text-ink-soft mt-1 leading-snug">{n.tryThis}</p>}
                      </div>
                      <Ask q={n.ask}>Ask the assistant</Ask>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* 3. The monthly review */}
              <MonthlyReviews />

              {/* 4. The detail, one subject at a time */}
              <Card className="p-5">
                <div className="flex gap-x-6 gap-y-1 border-b border-line mb-6 overflow-x-auto" role="tablist">
                  {TABS.map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                      className={'shrink-0 pb-2.5 -mb-px text-[14px] font-semibold border-b-2 transition-colors ' + (tab === k ? 'text-ink border-fairway' : 'text-ink-soft border-transparent hover:text-ink')}>{l}</button>
                  ))}
                </div>
                {tab === 'revenue' && <RevenueTab d={d} />}
                {tab === 'busy' && <BusyTab d={d} />}
                {tab === 'misses' && <MissesTab d={d} />}
                {tab === 'golfers' && <GolfersTab d={d} />}
                {tab === 'booking' && <BookingTab d={d} />}
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AnalyticsPage() {
  return <Suspense fallback={<div className="min-h-screen bg-paper" />}><AnalyticsInner /></Suspense>;
}
