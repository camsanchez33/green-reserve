'use client';
// ANALYTICS-5 (Cam 2026-11-17, approved mockup): the tabs under the chart — Tee sheet, Bookings, Golfers, No-shows,
// Reviews (Pro shop is ShopTab.tsx). Each number appears in one place only; money lives on Revenue. Worded in the
// past tense: the page is a snapshot of the period beside the title. Every part that needs Build's data checks for
// the field and stays hidden without it (projections, no-shows by how they booked, spots filled again, members by
// membership, the written reports). Removed by Cam: "First-timers who came back" and "Missed more than once".
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { askBirdie, useBirdieReady } from '@/lib/birdie/ask';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { SEGMENTS, SEGMENT_LABEL, SEG_UI, type Segment } from '@/lib/golfer-segments';
import { Icon, IconButton } from '@/components/dashboard/money/revenue/ui';
import { Block, BarRow, CellBar, Figures, Heatmap, Note, Pair, PaceBar, Split, Table, useOptional } from './parts';
import { type Data, type Ledger, type NoShowReport, type Projections, type Range, type RefillKey, type Review, dayShort, dayWeek, downloadCsv, gained, hourLong, lost, num, pct, pct1, signed, usd } from './data';

const MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAME: Record<string, string> = { Sun: 'Sun', Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat' };

// ── Tee sheet ───────────────────────────────────────────────────────────────
/** The fullest and emptiest hour of the week, from the heatmap (hours with tee times only). */
function extremes(d: Data) {
  const cells: { dow: string; hour: number; v: number }[] = [];
  for (const r of d.utilization.heatmap.rows) r.cells.forEach((c, i) => { if (c != null) cells.push({ dow: r.dow, hour: d.utilization.heatmap.hours[i], v: c }); });
  if (cells.length < 2) return null;
  const s = [...cells].sort((a, b) => b.v - a.v);
  // Nothing to tell apart (nothing booked, or every hour the same): say nothing rather than "Busiest, 0% full".
  if (s[0].v <= s[s.length - 1].v) return null;
  return { busiest: s[0], quietest: s[s.length - 1] };
}

/** `money`: the login sees money (money.payments); dollar figures only then. */
export function TeeSheetTab({ d, money }: { d: Data; money: boolean }) {
  const u = d.utilization, h = u.heatmap, x = extremes(d);
  const rows = MON_FIRST.map(w => { const r = h.rows.find(y => y.dow === w); return { dow: w, cells: r?.cells ?? h.hours.map(() => null), all: u.byDow.find(y => y.dow === w)?.fillPct ?? null }; });
  return (<>
    <Figures items={[
      { label: 'Unsold player spots', value: num(d.unfilled.openSpots) },
      money && { label: 'Value of unsold spots', value: usd(d.unfilled.lostCents) },
      x && { label: `Busiest, ${pct(x.busiest.v)} full`, value: `${DAY_NAME[x.busiest.dow]} ${hourLong(x.busiest.hour)}` },
      x && { label: `Quietest, ${pct(x.quietest.v)} full`, value: `${DAY_NAME[x.quietest.dow]} ${hourLong(x.quietest.hour)}` },
    ]} />
    <Block title="Busiest and quietest hours">
      {h.hours.length ? <Heatmap hours={h.hours} rows={rows} label="How full each hour was, Monday to Sunday, in this period" /> : <Note>No tee times in these dates.</Note>}
    </Block>
    <Ahead d={d} money={money} range={d.range} />
  </>);
}

/** Build's projections when the route is there; until then the next 7 days against where they usually stand by now. */
function Ahead({ d, money, range }: { d: Data; money: boolean; range: Range }) {
  const P = useOptional<Projections>(`/api/operator/analytics/projections?from=${range.from}&to=${range.to}`);
  if (P.loading) return null;
  if (P.error) return <LoadError message={`Couldn’t load the projections — ${P.error}`} onRetry={P.reload} />;
  const p = P.data;
  if (p) {
    const on = (n: number | null | undefined, unit: '%' | ' pts') => (n == null ? undefined : { text: `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}${unit === ' pts' && Math.abs(Math.round(n)) === 1 ? ' pt' : unit} on the last 30 days` });
    const showRev = money && p.next.revenueCents != null;
    return (
      <Block title="Projections · next 30 days">
        <Figures three={!showRev} items={[
          { label: 'Rounds', value: num(p.next.players), delta: on(p.change.playersPct, '%') },
          showRev && { label: 'Revenue', value: `about ${usd(p.next.revenueCents!)}`, delta: on(p.change.revenuePct, '%') },
          { label: 'Tee sheet filled', value: pct(p.next.fillPct), delta: on(p.change.fillPts, ' pts') },
        ]} />
        <PaceTable expected days={p.week.slice(0, 7).map(w => ({ date: w.date, booked: w.booked, of: w.expected, usual: w.status === 'closed' ? null : w.usualByNow, status: w.status }))} />
      </Block>
    );
  }
  const days = d.utilization.pace.filter(x => x.offered > 0).slice(0, 7);
  if (!days.length) return null;
  return (
    <Block title="Next 7 days">
      <PaceTable days={days.map(x => ({ date: x.date, booked: x.booked, of: x.offered, usual: x.usual, status: x.usual == null || x.usual === 0 ? 'no_history' as const : x.booked >= x.usual * 0.95 ? 'on_pace' as const : 'behind' as const }))} />
    </Block>
  );
}

type PaceRow = { date: string; booked: number; of: number; usual: number | null; status: Projections['week'][number]['status'] };
function PaceTable({ days, expected }: { days: PaceRow[]; expected?: boolean }) {
  const status = (r: PaceRow) => r.status === 'on_pace' ? <StatusDot status="ok" label="On pace" /> : r.status === 'behind' ? <StatusDot status="warn" label="Behind" />
    : r.status === 'short_day' ? <StatusDot status="neutral" label="Short day" />
    : r.status === 'closed' ? <StatusDot status="neutral" label="Closed" /> : null; // a blackout day (Build)
  const grid = 'grid grid-cols-[84px_44px_minmax(40px,1fr)_58px] sm:grid-cols-[110px_150px_minmax(80px,1fr)_100px_130px] gap-2 sm:gap-3 items-center';
  return (
    <div className="flex flex-col" role="table" aria-label="The next 7 days">
      <div role="row" className={grid + ' pb-1 text-[12px] text-ink-muted'}>
        <span role="columnheader">{expected ? 'Next 7 days' : 'Day'}</span><span role="columnheader"><span className="sm:hidden">Booked</span><span className="max-sm:hidden">Players booked so far</span></span>
        <span role="columnheader" /><span role="columnheader">{expected ? 'Expected' : <><span className="sm:hidden">Offered</span><span className="max-sm:hidden">Spots offered</span></>}</span><span role="columnheader" className="max-sm:hidden" />
      </div>
      {days.map(r => (
        <div key={r.date} role="row" className={grid + ' py-[9px] border-t border-line text-[13px] tabular-nums text-ink'}>
          <span role="cell" className="flex flex-col gap-0.5">{dayWeek(r.date)}{status(r) && <span className="sm:hidden">{status(r)}</span>}</span><span role="cell">{num(r.booked)}</span>
          <span role="cell"><PaceBar value={r.booked} of={r.of} usual={r.usual} /></span>
          <span role="cell">{num(r.of)}</span><span role="cell" className="max-sm:hidden">{status(r)}</span>
        </div>
      ))}
      <div className="flex gap-4 pt-2 text-[12px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-2 rounded-[2px] bg-ink" />Booked so far</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-0.5 h-3 bg-warn" />Usually booked by now</span>
      </div>
    </div>
  );
}

export function teeSheetCsv(d: Data): (string | number | null)[][] {
  const h = d.utilization.heatmap;
  return [['Day', ...h.hours.map(hourLong), 'All'], ...MON_FIRST.map(w => { const r = h.rows.find(y => y.dow === w); return [w, ...(r?.cells ?? []).map(c => (c == null ? null : Math.round(c))), d.utilization.byDow.find(y => y.dow === w)?.fillPct ?? null]; })];
}

// ── Bookings ────────────────────────────────────────────────────────────────
export function BookingsTab({ d, ledger }: { d: Data; ledger: Ledger | null }) {
  const b = d.behavior, L = b.lead, c = b.channel;
  const lead: [string, number][] = [['Same day', L.sameDay], ['1–2 days', L.d1to2], ['3–7 days', L.d3to7], ['8+ days', L.d8to14 + L.d15plus]];
  const most = Math.max(1, ...lead.map(x => x[1]));
  const P = ledger?.paid;
  const cart = d.revenue.beyond;
  return (<>
    <Figures items={[
      { label: 'Avg. days booked ahead', value: b.avgLeadDays == null ? '—' : `${b.avgLeadDays} days` },
      { label: 'Avg. group size', value: b.avgGroupSize == null ? '—' : `${b.avgGroupSize} players` },
      b.spotsSold && { label: 'Twilight spots sold', value: pct(b.spotsSold.twilightPct) },
      b.spotsSold && { label: 'Standard spots sold', value: pct(b.spotsSold.standardPct) },
    ]} />
    <Pair>
      <Block title="How golfers booked"><Split label="How golfers booked" parts={[['Online', c.online ?? 0], ['Walked in', c.walk_in ?? 0], ['By phone', c.phone ?? 0]]} /></Block>
      {P && <Block title="Where they paid"><Split label="Where they paid" parts={[['Online', P.onlineCents], ['At the course', P.readerCents + P.cashCents + P.otherCents]]} /></Block>}
      {P && <Block title="Card or cash"><Split label="Card or cash" parts={[['Card', P.onlineCents + P.readerCents], ['Cash', P.cashCents], ...(P.otherCents > 0 ? [['Other', P.otherCents] as [string, number]] : [])]} /></Block>}
      <Block title="Cart or walking"><Split label="Cart or walking" parts={[['Cart', cart.cartRounds], ['Walking', Math.max(0, cart.rounds - cart.cartRounds)]]} /></Block>
      <Block title="How far ahead they booked">
        {b.bookings ? <div className="flex flex-col gap-2">{lead.map(([l, v]) => <BarRow key={l} label={l} value={v} max={most} right={pct((v / b.bookings) * 100)} />)}</div> : <Note>No bookings in these dates.</Note>}
      </Block>
    </Pair>
  </>);
}

export function bookingsCsv(d: Data): (string | number | null)[][] {
  const b = d.behavior;
  return [['Figure', 'Value'], ['Bookings', b.bookings], ['Players', b.players], ['Avg. days booked ahead', b.avgLeadDays], ['Avg. group size', b.avgGroupSize],
    ['Booked online', b.channel.online ?? 0], ['Walked in', b.channel.walk_in ?? 0], ['By phone', b.channel.phone ?? 0],
    ['Booked same day', b.lead.sameDay], ['Booked 1–2 days ahead', b.lead.d1to2], ['Booked 3–7 days ahead', b.lead.d3to7], ['Booked 8+ days ahead', b.lead.d8to14 + b.lead.d15plus],
    ['Rounds with a cart', d.revenue.beyond.cartRounds], ['Rounds walking', Math.max(0, d.revenue.beyond.rounds - d.revenue.beyond.cartRounds)]];
}

// ── Golfers ─────────────────────────────────────────────────────────────────
export function GolfersTab({ d }: { d: Data }) {
  const g = d.customers, M = g.byMembership;
  const top = g.topByRounds.slice(0, 10);
  const hasMember = top.some(r => r.membership), hasLast = top.some(r => r.lastPlayed);
  return (<>
    <Figures three items={[
      { label: 'Golfers who played', value: num(g.identified) },
      { label: 'First-timers', value: num(g.newCustomers), note: 'Played here for the first time in this period.' },
      { label: 'Returning golfers', value: num(g.returning), note: 'Had played here before this period.' },
    ]} />
    <Pair>
      <Block title="First-timers and returning golfers"><Split label="First-timers and returning golfers" parts={[['Returning', g.returning], ['First-timers', g.newCustomers]]} /></Block>
      {M && M.length > 0 && (
        <Block title="Members and public">
          <Split label="Members and public" parts={([['Public', M.filter(r => r.kind === 'public').reduce((s, r) => s + r.rounds, 0)], ['Members', M.filter(r => r.kind === 'membership').reduce((s, r) => s + r.rounds, 0)], ['Season pass', M.filter(r => r.kind === 'pass').reduce((s, r) => s + r.rounds, 0)]] as [string, number][]).filter(x => x[1] > 0)} />
          <Table tight label="Golfers and rounds by membership" head={['Membership', 'Golfers', 'Rounds', 'Share of rounds']} empty="" rows={M.map(r => [r.name, num(r.golfers), num(r.rounds), pct(r.sharePct)])} />
        </Block>
      )}
    </Pair>
    <Block title="Most bookings in this period">
      <Table label="Golfers with the most bookings" head={['Golfer', 'Bookings', 'Players', ...(hasMember ? ['Membership'] : []), ...(hasLast ? ['Last played'] : [])]} empty="No golfers in these dates."
        rows={top.map(r => [r.name, num(r.rounds), num(r.players), ...(hasMember ? [r.membership ?? 'Public'] : []), ...(hasLast ? [r.lastPlayed ? dayShort(r.lastPlayed) : '—'] : [])])} />
      {g.unidentifiedBookings > 0 && <Note>{num(g.unidentifiedBookings)} walk-in booking{g.unidentifiedBookings === 1 ? '' : 's'} had no email or phone, so {g.unidentifiedBookings === 1 ? 'it isn’t' : 'they aren’t'} counted as a golfer.</Note>}
    </Block>
    <Groups d={d} />
    <Residents d={d} />
    {/* AN-3 (kept): where these names come from, and what they're for. */}
    <Note>From bookings at your course, for looking after your regulars, not for marketing they didn’t ask for (<Link href="/privacy" target="_blank" className="underline underline-offset-[3px]">Privacy Policy</Link>).</Note>
  </>);
}

/** SEG-1 (kept, Cam can cut it): every golfer in one group as of the last day picked; pick a group to see who's in it. */
function Groups({ d }: { d: Data }) {
  const s = d.customers.segments;
  const [pick, setPick] = useState<Segment>('regular');
  // Contact only with "See golfer email and phone" (the route blanks it otherwise; this keeps the download's columns honest).
  const contact = useDashboardAccess().can('sheet.golfer_contact');
  const rows = s.rows.filter(r => r.segment === pick);
  const csv = () => downloadCsv(`golfers-${SEGMENT_LABEL[pick].toLowerCase().replace(/\s+/g, '-')}-${s.asOf}`, [contact ? [...SEG_UI.csv] : SEG_UI.csv.filter((_, i) => i !== 1 && i !== 2), ...rows.map(r => contact ? [r.name, r.email, r.phone, r.rounds, r.recentRounds, r.firstPlayed, r.lastPlayed] : [r.name, r.rounds, r.recentRounds, r.firstPlayed, r.lastPlayed])]);
  return (
    <Block title={SEG_UI.title} action={rows.length > 0 ? <IconButton label={`Download ${SEGMENT_LABEL[pick]} as a CSV`} onClick={csv}>{Icon.download}</IconButton> : undefined}>
      <div role="group" aria-label="Golfer group" className="grid grid-cols-2 sm:grid-cols-5 gap-0.5 p-[3px] rounded-[11px] bg-ink/5 border border-line">
        {SEGMENTS.map(k => (
          <button key={k} type="button" aria-pressed={pick === k} onClick={() => setPick(k)}
            className={'min-h-[44px] px-3 py-1.5 rounded-[8px] text-left ' + (pick === k ? 'bg-white shadow-card' : 'hover:bg-ink/5')}>
            <span className="block text-[12.5px] text-ink-soft">{SEGMENT_LABEL[k]}</span>
            <span className="block text-[18px] font-semibold tabular-nums text-ink">{num(s.counts[k])}</span>
          </button>
        ))}
      </div>
      <Table label={`${SEGMENT_LABEL[pick]} golfers`} head={[...SEG_UI.head]} empty={SEG_UI.empty}
        rows={rows.slice(0, 25).map(r => [r.key ? <Link key={r.key} href={`/dashboard/golfers/${encodeURIComponent(r.key)}`} className="text-ink underline underline-offset-[3px] decoration-line hover:decoration-ink">{r.name}</Link> : r.name, num(r.rounds), num(r.recentRounds), dayShort(r.lastPlayed)])} />
      {rows.length > 25 && <Note>{rows.length - 25} {SEG_UI.more}</Note>}
    </Block>
  );
}

/** W2-8 (3) (kept, Cam can cut it): the table a city or county asks for, as a download. Only once residents have played. */
function Residents({ d }: { d: Data }) {
  const rows = d.customers.residents.rows;
  const t = rows.reduce((a, r) => ({ rp: a.rp + r.resPlayers, op: a.op + r.otherPlayers }), { rp: 0, op: 0 });
  if (t.rp === 0) return null;
  const csv = () => downloadCsv(`residents-${d.range.from}-${d.range.to}`, [['Date', 'Resident players', 'Other players', 'Resident green fees', 'Other green fees'], ...rows.map(r => [r.date, r.resPlayers, r.otherPlayers, r.resCents / 100, r.otherCents / 100])]);
  return (
    <Block title="Residents and everyone else" action={<IconButton label="Download the residents report as a CSV" onClick={csv}>{Icon.download}</IconButton>}>
      <Figures items={[{ label: 'Resident players', value: num(t.rp) }, { label: 'Everyone else', value: num(t.op) }]} />
    </Block>
  );
}

export function golfersCsv(d: Data): (string | number | null)[][] {
  return [['Golfer', 'Bookings', 'Players'], ...d.customers.topByRounds.map(r => [r.name, r.rounds, r.players])];
}

// ── No-shows ────────────────────────────────────────────────────────────────
// Build's /api/operator/analytics/no-shows. Its money is value lost at posted prices and money recovered; shown only to
// logins that see money (money.payments), whatever the route sends.
const REFILL: Record<RefillKey, string> = { '7d_plus': '7+ days', '2_7d': '2–7 days', '24_48h': '24–48 hours', under_24h: 'Under 24 hours' };
const HOW: Record<string, string> = {
  online_card_fee: 'Online, card saved, no-show fee', online_card_no_fee: 'Online, card saved, no fee', online_no_card: 'Online, no card',
  counter_card: 'By phone or at the counter, card saved', counter_no_card: 'By phone or at the counter, no card',
};
const Lost = ({ c }: { c: number }) => <span className="text-bad">{lost(c)}</span>;
const Got = ({ c }: { c: number }) => (c ? <span className="text-ok">{gained(c)}</span> : <>—</>);
const Net = ({ c }: { c: number }) => <span className={c < 0 ? 'text-bad' : 'text-ok'}>{signed(c)}</span>;

export function NoShowsTab({ d, money, range }: { d: Data; money: boolean; range: Range }) {
  const R = useOptional<NoShowReport>(`/api/operator/analytics/no-shows?from=${range.from}&to=${range.to}`);
  const r = R.data, t = r?.totals;
  return (<>
    {R.error && <LoadError message={`Couldn’t load the no-shows — ${R.error}`} onRetry={R.reload} />}
    <Figures items={[
      { label: 'No-show rate', value: pct1(t ? t.ratePct : d.noShows.ratePct) },
      money && t && { label: 'Value lost to no-shows', value: lost(t.lostValueCents), tone: 'lost' },
      money && t && { label: 'No-show fees recovered', value: gained(t.recoveredCents), tone: 'gained' },
      money && t && { label: 'Value lost to late cancels', value: lost(t.lateCancelLostValueCents), tone: 'lost' },
      money && t && { label: 'Net', value: signed(t.netCents), tone: t.netCents < 0 ? 'lost' : 'gained', note: 'After fees and rebooking.' },
    ]} />
    {r && r.byHow.length > 0 && (
      <Block title="No-shows by how they booked">
        <Table label="No-shows by how they booked" empty=""
          head={['How they booked', 'Bookings', 'No-shows', 'Rate', ...(money ? ['Value lost', 'Recovered', 'Net'] : [])]}
          rows={[...r.byHow.map(x => ({ ...x, label: HOW[x.key] ?? 'Other' })), { label: 'All bookings', key: 'all', bookings: r.totals.bookings, noShows: r.totals.noShows, ratePct: r.totals.ratePct, lostValueCents: r.totals.lostValueCents, recoveredCents: r.totals.recoveredCents, netCents: r.totals.recoveredCents - r.totals.lostValueCents }]
            .map((x, i) => [i === r.byHow.length ? <b key="a" className="font-semibold">{x.label}</b> : x.label, num(x.bookings), num(x.noShows), pct1(x.ratePct),
              ...(money ? [<Lost key="l" c={x.lostValueCents} />, <Got key="g" c={x.recoveredCents} />, <Net key="n" c={x.netCents} />] : [])])} />
      </Block>
    )}
    {r && (
      <Pair>
        <Block title="When they cancelled">
          <Table tight label="Spots filled again by how far ahead they were cancelled" head={['How far ahead', 'Spots cancelled', 'Filled again', 'Spots filled again']} empty="No cancellations in these dates."
            rows={r.refill.buckets.filter(b => b.cancelledSpots > 0).map(b => [REFILL[b.key], num(b.cancelledSpots), num(b.refilledSpots), <CellBar key="p" pct={b.pct} />])} />
          {r.refill.under48hPct != null && <Note>Spots cancelled less than 48 hours out were filled again {pct(r.refill.under48hPct)} of the time. Your late-cancel fee starts at {r.lateCancelHours} hours.</Note>}
        </Block>
        {money && r.lateCancels.spots > 0 && (
          <Block title={`Late cancels, under ${r.lateCancelHours} hours`}>
            <Table tight label="Late cancels" head={['', 'Player spots', 'Value lost', 'Recovered']} empty=""
              rows={[
                ['Cancelled late', num(r.lateCancels.spots), <Lost key="l" c={r.lateCancels.lostValueCents} />, '—'],
                ['Filled again by another golfer', num(r.lateCancels.refilledSpots), '—', <Got key="g" c={r.lateCancels.refilledCents} />],
                ['Late-cancel fees', '—', '—', <Got key="f" c={r.lateCancels.feesCents} />],
                [<b key="n" className="font-semibold">Net</b>, '', <b key="v" className="font-semibold"><Net c={r.lateCancels.netCents} /></b>, ''],
              ]} />
          </Block>
        )}
      </Pair>
    )}
  </>);
}

export function noShowsCsv(d: Data): (string | number | null)[][] {
  return [['Date', 'Time', 'Golfer', 'Players'], ...d.noShows.rows.map(r => [r.date, r.time, r.name, r.players])];
}

// ── Reviews ─────────────────────────────────────────────────────────────────
// BI-1's monthly review, its own load (it doesn't follow the dates). Build (2026-11-17): no Forecast (Projections covers
// it), recommendations read "What to try", By area only when the stored review has it, and a PDF per month at
// /api/operator/monthly-reviews/<YYYY-MM>/pdf — its icon shows only once that route answers.
export function ReviewsTab() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(-1);
  const [pdf, setPdf] = useState(false);
  const [q, setQ] = useState('');
  const birdie = useBirdieReady();
  const load = useCallback(async () => {
    setError('');
    const res = await dfetch<{ reviews: Review[] }>('/api/operator/monthly-reviews');
    if (!res.ok) { setError(res.error); return; }
    setReviews(res.data.reviews);
    const first = res.data.reviews[0];
    if (first) { const h = await fetch(pdfUrl(first.month), { method: 'HEAD' }).catch(() => null); setPdf(!!h && h.status !== 404 && h.status < 500); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (<>
    {birdie && (
      <Block title="Ask about your numbers">
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (q.trim()) askBirdie(q.trim()); }}>
          <label htmlFor="an-ask" className="sr-only">Ask about your numbers</label>
          <input id="an-ask" value={q} onChange={e => setQ(e.target.value)} className="flex-1 min-h-[44px] px-3.5 text-[14px] text-ink bg-ink/5 border border-line rounded-[10px]" />
          <button type="submit" aria-label="Ask" title="Ask" className="w-11 h-11 grid place-items-center rounded-[10px] text-ink hover:bg-ink/5">{Icon.chevron}</button>
        </form>
      </Block>
    )}
    <Block title="Monthly reports">
      {error && <LoadError message={`Couldn’t load your monthly reports — ${error}`} onRetry={load} />}
      {!reviews && !error && <Note>Loading…</Note>}
      {reviews && reviews.length === 0 && <Note>The first report is written after your first full month.</Note>}
      {reviews && reviews.length > 0 && (
        <div className="flex flex-col">
          {reviews.map((r, i) => (
            <div key={r.month} className="border-t border-line">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}
                  className="flex-1 flex items-center justify-between gap-3 min-h-[44px] py-3 text-left text-[14px] text-ink">
                  <b className="font-semibold">{r.label}{r.isBaseline && <span className="ml-2 font-normal text-[12.5px] text-ink-muted">Starting line</span>}</b>
                  <span className="text-[13px] text-ink-soft underline underline-offset-[3px] decoration-line">{open === i ? 'Close' : 'Read'}</span>
                </button>
                {pdf && <a href={pdfUrl(r.month)} aria-label={`Download ${r.label} as a PDF`} title={`Download ${r.label} as a PDF`} className="w-10 h-10 grid place-items-center rounded-[10px] text-ink-soft hover:bg-ink/5 hover:text-ink">{Icon.download}</a>}
              </div>
              {open === i && <Report r={r} />}
            </div>
          ))}
        </div>
      )}
    </Block>
  </>);
}
const pdfUrl = (month: string) => `/api/operator/monthly-reviews/${encodeURIComponent(month)}/pdf`;

function Report({ r }: { r: Review }) {
  const H = ({ children }: { children: string }) => <h4 className="mt-4 mb-1.5 text-[14px] font-semibold text-ink">{children}</h4>;
  const P = ({ children }: { children: ReactNode }) => <p className="m-0 mb-2.5 leading-[1.6] text-ink-soft">{children}</p>;
  const List = ({ title, items }: { title: string; items: string[] }) => items.length ? <><H>{title}</H>{items.map(t => <P key={t}>{t}</P>)}</> : null;
  const A = r.review.byArea;
  return (
    <article className="max-w-[72ch] pb-[18px] text-[14px]">
      <H>Summary</H><P>{r.review.verdict}</P>
      {r.thin && <Note>A quiet month: too few bookings to draw firm conclusions.</Note>}
      <List title="Where it beat expectations" items={r.review.wentWell} />
      <List title="Where it fell short" items={r.review.fellShort} />
      {A && A.length > 0 && (<><H>By area</H><Table tight label="By area" head={['Area', 'This month', 'Month before', 'Change']} empty="" rows={A.map(a => [a.area, a.thisMonth, a.lastMonth, a.change])} /></>)}
      <List title="What to try" items={r.review.recommendations} />
    </article>
  );
}
