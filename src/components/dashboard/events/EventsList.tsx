'use client';
// EVENTS-3 (Cam 2026-11-17, "events is good"; mockup lanes/dashboard/events-mockup.html): the Events list. Four
// numbers on top, then Coming up as a table split into This week and Later, Past events folded under it, and the
// To do list beside it (above it on a phone). Every figure comes from GET /api/operator/events as it is today:
// - Money: the list returns what each event still owes. "Collected of total" shows once the list returns
//   collectedCents and totalCents (Build, agreed shape); until then the column says what's owed, and the top number
//   for money collected is not shown. Never a guessed figure.
// - To do and Set up come from the event's own state: who pays, its price, its sign-up page (when players pay) and its
//   checklist (tasks open and overdue).
import { useState } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatTeeTime } from '@/lib/format';
import { PlusButton } from '@/components/dashboard/schedule/ui';
import { KINDS } from './EventSetup';
import { Stats, Stat, StatNote, Bar, ROW, HEAD, Chevron, Fold, usd, plural, daysUntil, inDays } from './ui';

export type ListRow = {
  id: string; name: string; kind: string; date: string; format: string; startTime: string; holes: number; status: string;
  players: number; entrantCount: number; heldCount: number; tasksOpen: number; tasksOverdue: number;
  payer: string; signupOpen: boolean;
  /** DENSE-8: what the event still owes (0 when it has no price). */
  owedCents?: number; pricePerPlayerCents?: number;
  /** Build (agreed shape, not returned yet): paid less refunded, and the event's total. */
  collectedCents?: number; totalCents?: number;
  /** Build (agreed shape, not returned yet): sign-ups on the waiting list. */
  waitingCount?: number;
};

export const kindLabel = (k: string) => KINDS.find(x => x.key === k)?.label ?? 'Event';
export const formatLine = (e: { format: string; holes: number; startTime: string }) =>
  e.format === 'shotgun' ? `${e.holes}-hole shotgun at ${formatTeeTime(e.startTime)}` : `tee times from ${formatTeeTime(e.startTime)}`;
const dayParts = (d: string) => {
  const t = new Date(d + 'T12:00:00');
  return { md: t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), wd: t.toLocaleDateString('en-US', { weekday: 'short' }) };
};
export const longDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** The next thing an event needs, from what the list knows about it; null = set up. */
function nextStep(e: ListRow): string | null {
  if (!e.payer) return 'Choose who pays';
  if (!e.pricePerPlayerCents) return 'Set a price per player';
  if (e.payer === 'players' && !e.signupOpen) return 'Open the sign-up page';
  if (e.tasksOverdue) return `${plural(e.tasksOverdue, 'checklist step')} overdue`;
  if (e.tasksOpen) return `${plural(e.tasksOpen, 'checklist step')} left`;
  return null;
}
const isSetUp = (e: ListRow) => !!e.payer && !!e.pricePerPlayerCents && (e.payer !== 'players' || e.signupOpen) && !e.tasksOverdue;

export default function EventsList({ events, today, onOpen, onNew, canNew }: {
  events: ListRow[]; today: string; onOpen: (id: string) => void; onNew: () => void; canNew: boolean;
}) {
  const [showPast, setShowPast] = useState(false);
  const [showTodo, setShowTodo] = useState(true);
  const coming = events.filter(e => e.status === 'planned' && e.date >= today);
  const past = events.filter(e => !(e.status === 'planned' && e.date >= today)).reverse();
  const thisWeek = coming.filter(e => daysUntil(today, e.date) <= 6);
  const later = coming.filter(e => daysUntil(today, e.date) > 6);
  const todos = coming.map(e => ({ e, step: nextStep(e) })).filter((t): t is { e: ListRow; step: string } => !!t.step);
  const overdue = coming.reduce((n, e) => n + (e.tasksOverdue ? 1 : 0), 0);
  const nx = coming[0];
  const on = coming.reduce((n, e) => n + e.entrantCount, 0);
  const cap = coming.reduce((n, e) => n + e.players, 0);
  const hasCollected = coming.length > 0 && coming.every(e => typeof e.collectedCents === 'number' && typeof e.totalCents === 'number');
  const coll = coming.reduce((n, e) => n + (e.collectedCents ?? 0), 0);
  const total = coming.reduce((n, e) => n + (e.totalCents ?? 0), 0);

  const money = (e: ListRow) => {
    if (e.status === 'cancelled') return <><b className="block font-medium text-[13.5px]">—</b><small className="block text-[12px] text-ink-muted">cancelled</small></>;
    if (!e.pricePerPlayerCents) return <><b className="block font-medium text-[13.5px]">—</b><small className="block text-[12px] text-ink-muted">no price yet</small></>;
    if (typeof e.collectedCents === 'number' && typeof e.totalCents === 'number')
      return <><b className="block font-medium text-[13.5px] tabular-nums">{usd(e.collectedCents)} of {usd(e.totalCents)}</b><small className="block text-[12px] text-ink-muted">collected</small></>;
    return e.owedCents
      ? <><b className="block font-medium text-[13.5px] tabular-nums">{usd(e.owedCents)}</b><small className="block text-[12px] text-ink-muted">owed</small></>
      : <><b className="block font-medium text-[13.5px]">Paid</b><small className="block text-[12px] text-ink-muted">nothing owed</small></>;
  };
  const row = (e: ListRow, old = false) => {
    const d = dayParts(e.date);
    const ok = isSetUp(e);
    return (
      <button key={e.id} type="button" onClick={() => onOpen(e.id)}
        className={ROW + ' w-full text-left border-t border-line px-2.5 py-3 min-h-[56px] hover:bg-paper ' + (old ? 'opacity-70' : '')}>
        <span><b className="block font-semibold text-[14px]">{d.md}</b><small className="block text-[12px] text-ink-muted">{d.wd}</small></span>
        <span className="min-w-0"><b className="block font-semibold truncate">{e.name}</b><small className="block text-[12px] text-ink-muted truncate">{kindLabel(e.kind)} · {formatLine(e)}</small></span>
        <span className="max-md:hidden"><b className="block font-medium text-[13.5px] tabular-nums">{e.players ? `${e.entrantCount} of ${e.players}` : e.entrantCount}</b><small className="block text-[12px] text-ink-muted">players</small></span>
        <span className="max-md:hidden">{money(e)}</span>
        <span className="text-[13px]">
          {e.status === 'cancelled' ? <StatusDot status="neutral" label="Cancelled" />
            : old ? <StatusDot status="ok" label="Done" />
            : <StatusDot status={ok ? 'ok' : 'bad'} label={ok ? 'Set up' : 'Not set up'} />}
        </span>
        <Chevron />
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-[30px] font-semibold leading-none text-ink mr-auto">Events</h1>
        {canNew && <PlusButton label="Set up an event" onClick={onNew} />}
      </div>

      {coming.length > 0 && (
        <Stats>
          <Stat label="Next event" value={nx.name}><StatNote>{longDay(nx.date)} · {inDays(daysUntil(today, nx.date)).toLowerCase()}</StatNote></Stat>
          <Stat label="Players signed up" value={cap ? `${on} of ${cap}` : String(on)}>{cap > 0 && <Bar value={on} of={cap} />}</Stat>
          {hasCollected && <Stat label="Money collected" value={`${usd(coll)} of ${usd(total)}`}><Bar value={coll} of={total} ok /></Stat>}
          <Stat label="To do" value={String(todos.length)}><StatNote>{overdue ? <span className="text-bad">{overdue} overdue</span> : 'none overdue'}</StatNote></Stat>
        </Stats>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-[22px] items-start mt-1">
        <section className="min-w-0 flex flex-col">
          <h2 className="px-1 pt-3.5 pb-2 text-[13px] font-semibold text-ink">Coming up</h2>
          {coming.length === 0 ? (
            <p className="px-2.5 py-6 border-t border-line text-[13.5px] text-ink-muted">No events coming up. Outings, tournaments and league nights you set up show here.</p>
          ) : <>
            <div className={HEAD}><span>Date</span><span>Event</span><span>Players</span><span>Money</span><span>Status</span><span /></div>
            {thisWeek.length > 0 && <div className="text-[12px] font-semibold text-ink-muted px-2.5 pt-3 pb-1.5 border-t border-line">This week</div>}
            {thisWeek.map(e => row(e))}
            {later.length > 0 && <div className="text-[12px] font-semibold text-ink-muted px-2.5 pt-3 pb-1.5 border-t border-line">Later</div>}
            {later.map(e => row(e))}
          </>}
          {past.length > 0 && <Fold open={showPast} onToggle={() => setShowPast(v => !v)}>Past events · {past.length}</Fold>}
          {showPast && past.map(e => row(e, true))}
        </section>

        <aside className="max-lg:order-first border border-line rounded-[14px] px-1.5 pt-1 pb-2 lg:sticky lg:top-4">
          <Fold top open={showTodo} onToggle={() => setShowTodo(v => !v)}>To do · {todos.length}</Fold>
          {showTodo && (todos.length === 0
            ? <p className="border-t border-line px-2 py-3 text-[12.5px] text-ink-muted">Nothing to do. Every event coming up is set up.</p>
            : todos.map(({ e, step }) => (
              <button key={e.id} type="button" onClick={() => onOpen(e.id)} className="w-full flex gap-2.5 items-start text-left border-t border-line px-2 py-2.5 min-h-[44px] hover:bg-paper">
                <span className="mt-1.5"><StatusDot status={e.tasksOverdue ? 'bad' : 'warn'} /></span>
                <span className="min-w-0"><b className="block text-[13px] font-semibold text-ink">{e.name}</b><small className="block text-[12px] text-ink-muted">{step} · {longDay(e.date)}</small></span>
              </button>
            )))}
        </aside>
      </div>
    </div>
  );
}
