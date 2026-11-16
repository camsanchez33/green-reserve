'use client';
import { CARD } from '@/components/ui/Card';
// REVENUE-1 (approved mockup): Pending payments — money still owed, one list with a Filter and a side card. Declined
// cards are the same rows as Home (lib/operator-home declinedCards) with the same actions: Email pay link (sheet.checkin)
// and Remove from the list (it still owes). Rounds played and not paid yet are one line that opens Payments on them,
// as Money's "Not paid yet" did. Event invoices join this list when a route returns them.
import { useState } from 'react';
import Link from 'next/link';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import type { DeclinedCard } from '@/lib/operator-home';
import { FilterMenu, SideCard, Dl, Dot, Kv, BTN, BTN_GHOST, LINK, ROW, ROW_SEL, usd2, dayLong, clock12 } from './ui';

export function PendingPayments({ declined, declinedTotal, notPaid, canSendLink, onSeeUnpaid, onChanged }: {
  declined: DeclinedCard[]; declinedTotal: number;
  notPaid: { cents: number; groups: number; noShowCents: number; noShowGroups: number } | null;
  canSendLink: boolean;
  onSeeUnpaid?: () => void;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'declined' | 'unpaid'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState<Record<string, { ok: boolean; text: string }>>({});
  const unpaidRow = notPaid && notPaid.groups > 0;
  const showDeclined = filter !== 'unpaid', showUnpaid = filter !== 'declined' && unpaidRow;
  const d = declined.find(x => x.id === sel) ?? null;
  const count = declined.length + (unpaidRow ? 1 : 0);

  async function send(x: DeclinedCard) {
    setBusy(x.id);
    const r = await dfetch<{ sentTo: string }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: x.id, action: 'send_pay_link', via: 'email' }) });
    setBusy('');
    setDone(m => ({ ...m, [x.id]: r.ok ? { ok: true, text: `Pay link sent to ${r.data.sentTo}.` } : { ok: false, text: r.error } }));
  }
  async function remove(x: DeclinedCard) {
    setBusy('rm:' + x.id);
    const r = await dfetch('/api/operator/declined', { method: 'POST', body: JSON.stringify({ id: x.id }) });
    setBusy('');
    if (r.ok) { toast(`${x.name} removed from this list. Still owed under Payments → Not paid yet.`, 'ok'); setSel(null); onChanged(); }
    else setDone(m => ({ ...m, [x.id]: { ok: false, text: r.error } }));
  }

  return (
    <>
      <div className="flex items-center gap-2 -mb-1.5 mt-0.5">
        <h3 id="pp-h" className="text-[15px] font-semibold text-ink">Pending payments</h3>
        <span className="flex-1" />
        <FilterMenu active={filter !== 'all'} onPick={k => { setFilter(k as typeof filter); setSel(null); }} items={[
          { key: 'all', label: 'All', on: filter === 'all', count },
          { key: 'declined', label: 'Declined cards', on: filter === 'declined', count: declined.length },
          ...(unpaidRow ? [{ key: 'unpaid', label: 'Not paid yet', on: filter === 'unpaid', count: 1 }] : []),
        ]} />
      </div>
      <div className={'grid gap-4 items-start ' + (d ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : '')}>
        <section className={`${CARD} !rounded-[16px] p-1.5`} aria-labelledby="pp-h">
          {showDeclined && declined.map(x => (
            <div key={x.id} role="button" tabIndex={0} onClick={() => setSel(sel === x.id ? null : x.id)} onKeyDown={e => { if (e.key === 'Enter') setSel(sel === x.id ? null : x.id); }}
              className={ROW + ' grid-cols-[8px_minmax(0,1fr)_auto] md:grid-cols-[8px_minmax(0,1fr)_minmax(0,1.5fr)_150px_96px]' + (sel === x.id ? ROW_SEL : '')}>
              <Dot tone="bad" />
              <span className="truncate font-semibold text-ink">{x.name}</span>
              <span className="truncate text-ink-soft max-md:hidden">Card declined at check-in · Tee time {clock12(x.time)}{x.players ? `, ${x.players} player${x.players === 1 ? '' : 's'}` : ''}</span>
              <span className="truncate text-ink-muted tabular-nums max-md:hidden">{dayLong(x.date)}</span>
              <span className="text-right font-semibold tabular-nums text-ink">{x.amountCents !== null ? usd2(x.amountCents) : '—'}</span>
            </div>
          ))}
          {showUnpaid && notPaid && (
            <div role="button" tabIndex={0} onClick={onSeeUnpaid} onKeyDown={e => { if (e.key === 'Enter') onSeeUnpaid?.(); }}
              className={ROW + ' grid-cols-[8px_minmax(0,1fr)_auto] md:grid-cols-[8px_minmax(0,1fr)_minmax(0,1.5fr)_150px_96px]'}>
              <Dot tone="warn" />
              <span className="truncate font-semibold text-ink">{notPaid.groups} {notPaid.groups === 1 ? 'group' : 'groups'} not paid yet</span>
              <span className="truncate text-ink-soft max-md:hidden">Rounds played and not paid{notPaid.noShowGroups ? ` · ${notPaid.noShowGroups} no-show${notPaid.noShowGroups === 1 ? '' : 's'} ${usd2(notPaid.noShowCents)}` : ''}</span>
              <span className="truncate text-ink-muted max-md:hidden">Last 7 days</span>
              <span className="text-right font-semibold tabular-nums text-ink">{usd2(notPaid.cents)}</span>
            </div>
          )}
          {declinedTotal > declined.length && showDeclined && <p className="px-3 py-2.5 text-[12.5px] text-ink-muted border-t border-line">+{declinedTotal - declined.length} more declined cards, newest shown first</p>}
          {(!showDeclined || declined.length === 0) && !showUnpaid && <p className="px-2.5 py-3.5 text-[13.5px] text-ink-muted">Nothing owed.</p>}
        </section>
        {d && (
          <SideCard title={d.name} sub={`Card declined at check-in · Tee time ${clock12(d.time)}${d.players ? `, ${d.players} player${d.players === 1 ? '' : 's'}` : ''}`} onClose={() => setSel(null)}>
            <Dl rows={[
              ['Declined', dayLong(d.date)],
              ...(d.reason ? [['Reason', d.reason, 'bad'] as [string, string, 'bad']] : []),
              ...(!d.canEmail ? [['Pay link', 'No email on file'] as [string, string]] : []),
            ]} />
            {d.amountCents !== null && <div className="border-t border-line mb-3"><Kv first total label="Owed" value={usd2(d.amountCents)} /></div>}
            <div className="flex flex-wrap items-center gap-2">
              {canSendLink && d.canEmail && <button type="button" className={BTN} disabled={!!busy} onClick={() => send(d)}>{busy === d.id ? 'Sending…' : 'Email pay link'}</button>}
              <Link href={`/dashboard?date=${d.date}&q=${encodeURIComponent(d.name)}`} className={LINK + ' ml-1'}>Open in tee sheet</Link>
              {canSendLink && <button type="button" className={BTN_GHOST + ' ml-auto'} disabled={!!busy} onClick={() => remove(d)}>{busy === 'rm:' + d.id ? 'Removing…' : 'Remove'}</button>}
            </div>
            {done[d.id] && <p role={done[d.id].ok ? 'status' : 'alert'} className={'text-[12.5px] mt-2.5 ' + (done[d.id].ok ? 'text-ok' : 'text-bad')}>{done[d.id].text}</p>}
          </SideCard>
        )}
      </div>
    </>
  );
}
