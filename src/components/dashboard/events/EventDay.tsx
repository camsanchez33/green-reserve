'use client';
// Event day (Cam 2026-10-31: "check-in, day-of view, printable sheets"): on the event's date its page
// opens with this — who's here, who still owes, group by group in starting order. Check a player in
// as they arrive, or a whole group; "Take payment" opens that player's payment in the list below.
// Writes go through the event route ('checkin'); the page shows pending and errors.
import type { EventPlayer } from './EventDetail';
import { Card } from '@/components/ui/Card';

export function EventDay({ groups, ungrouped, startOf, onList, owes, busy, onCheck, onTakePayment, onPrintSigns }: {
  groups: [number, EventPlayer[]][]; ungrouped: EventPlayer[]; startOf: (g: number, hole: number | null) => string;
  onList: EventPlayer[]; owes: (p: EventPlayer) => boolean; busy: string;
  onCheck: (ids: string[], on: boolean, key: string) => void; onTakePayment?: (p: EventPlayer) => void; onPrintSigns: () => void;
}) {
  const here = onList.filter(p => p.checkedInAt).length;
  const unpaid = onList.filter(owes).length;
  const row = (p: EventPlayer) => (
    <li key={p.id} className="flex items-center gap-2 py-1">
      <label className="flex items-center gap-2 min-w-0">
        <input type="checkbox" className="accent-pine w-4 h-4" checked={busy === 'ci:' + p.id ? !p.checkedInAt : !!p.checkedInAt} disabled={!!busy} aria-label={`${p.name} is here`}
          onChange={ev => onCheck([p.id], ev.target.checked, 'ci:' + p.id)} />
        <span className={'truncate ' + (p.checkedInAt ? 'text-ink' : 'text-ink-soft')}>{p.name}</span>
      </label>
      {owes(p) && onTakePayment && <button type="button" onClick={() => onTakePayment(p)} className="ml-auto text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2">Take payment</button>}
    </li>
  );
  return (
    <Card className="p-5 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Today</h2>
        <span className="text-[13.5px] text-ink tabular-nums">{here} of {onList.length} here{unpaid ? ` · ${unpaid} not paid` : ''}</span>
        {groups.length > 0 && <button type="button" onClick={onPrintSigns} className="text-[13px] text-pine font-medium hover:underline">Print cart signs</button>}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
        {groups.map(([g, ps]) => {
          const notHere = ps.filter(p => !p.checkedInAt).map(p => p.id);
          return (
            <div key={g} className="bg-paper/70 rounded-md px-3.5 py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[13.5px] font-semibold text-ink">Group {g}</span>
                <span className="text-[12.5px] text-ink-soft truncate">{startOf(g, ps[0]?.startHole ?? null)}</span>
                {notHere.length > 0 && <button type="button" disabled={!!busy} onClick={() => onCheck(notHere, true, 'cg:' + g)} className="ml-auto text-[12.5px] text-pine font-medium hover:underline disabled:opacity-50">{busy === 'cg:' + g ? 'Saving…' : 'All here'}</button>}
              </div>
              <ul className="mt-1 text-[13.5px]">{ps.map(row)}</ul>
            </div>
          );
        })}
        {ungrouped.length > 0 && (
          <div className="bg-paper/70 rounded-md px-3.5 py-3">
            <div className="text-[13.5px] font-semibold text-ink">No group yet</div>
            <ul className="mt-1 text-[13.5px]">{ungrouped.map(row)}</ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/** One sign per group for the cart: the start (hole or time) in large type and the names. Print only. */
export function CartSigns({ eventName, groups, startOf }: { eventName: string; groups: [number, EventPlayer[]][]; startOf: (g: number, hole: number | null) => string }) {
  return (
    <div className="hidden print:block">
      {groups.map(([g, ps]) => (
        <section key={g} className="break-after-page last:break-after-auto flex flex-col justify-center min-h-[90vh] text-center">
          <p className="text-[18px] text-ink">{eventName}</p>
          <p className="font-serif text-[64px] font-semibold text-ink leading-tight mt-4">Group {g}</p>
          <p className="text-[32px] text-ink mt-2">{startOf(g, ps[0]?.startHole ?? null)}</p>
          <ul className="text-[28px] text-ink mt-8 space-y-2">{ps.map(p => <li key={p.id}>{p.name}</li>)}</ul>
        </section>
      ))}
    </div>
  );
}
