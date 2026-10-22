'use client';
// W2-9 Events: one event — what it holds on the tee sheet, its prep checklist,
// and its players with their groups. Every write shows its pending state and
// then the result or the server's reason (dfetch never throws).
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { dfetch } from '@/lib/dashboard-fetch';
import { formatTeeDay, formatTeeTime } from '@/lib/format';
import { KINDS } from './EventSetup';
import EventMoney, { type EventPayment, type Money } from './EventMoney';

export type EventTask = { id: string; label: string; dueDate: string | null; doneAt: string | null; doneBy: string };
export type EventPlayer = { id: string; name: string; email: string; phone: string; groupNo: number | null; startHole: number | null };
export type EventFull = {
  id: string; name: string; kind: string; date: string; format: string; startTime: string; holdFrom: string; holdTo: string; holdToCustom: boolean; shareCourse: boolean; holdNineIds: string[]; keepOpen: string[];
  productId: string | null; holes: number; groups: number; players: number;
  organizerName: string; organizerEmail: string; organizerPhone: string; pricePerPlayerCents: number; includes: string[];
  terms: string; notes: string; status: string; tasks: EventTask[]; entrants: EventPlayer[]; payments: EventPayment[];
};
export type EventData = {
  event: EventFull; today: string; courseHoles: number; money: Money; feeOn: boolean;
  held: { id: string; time: string; round: string | null }[];
  toMove: { time: string; golfers: string }[]; blockedOther: number; unheld: string[];
};

const BTN = 'px-3 py-2 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50';
const PRIMARY = BTN + ' bg-pine hover:bg-pine-hover text-white';
const SECONDARY = BTN + ' bg-white border border-line text-ink hover:bg-paper';

export default function EventDetail({ data, onChange, onEdit, onBack, canRefund, reload }: {
  data: EventData; onChange: (d: EventData) => void; onEdit: () => void; onBack: () => void;
  canRefund: boolean; reload: () => Promise<void>;
}) {
  const { event: e, today, held, toMove } = data;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [newTask, setNewTask] = useState({ label: '', dueDate: '' });
  const [paste, setPaste] = useState('');
  const [size, setSize] = useState(4);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const live = e.status === 'planned';
  // W2-9c: players' own payments.
  const price = e.pricePerPlayerCents ? (e.pricePerPlayerCents / 100).toFixed(2) : '';
  const [askAmount, setAskAmount] = useState(price);
  const [askVia, setAskVia] = useState<'email' | 'sms'>('email');
  const [paidHere, setPaidHere] = useState<{ id: string; amount: string; method: string } | null>(null);
  const [copied, setCopied] = useState('');
  const theirs = (id: string) => e.payments.filter(x => x.playerId === id);
  const stateOf = (id: string): 'paid' | 'paying' | 'sent' | 'none' => {
    const ps = theirs(id);
    if (ps.some(x => x.status === 'paid' && x.amountCents > x.refundedCents)) return 'paid';
    if (ps.some(x => x.status === 'paying')) return 'paying';
    if (ps.some(x => x.status === 'open' || x.status === 'paying')) return 'sent';
    return 'none';
  };
  const unpaid = e.entrants.filter(p => stateOf(p.id) === 'none').length;

  /** A payment action (the payments route), then refresh the event in place. */
  async function payAct(key: string, body: Record<string, unknown>, done?: (r: Record<string, unknown>) => string) {
    setBusy(key); setError(''); setNote('');
    const r = await dfetch<Record<string, unknown>>(`/api/operator/events/${e.id}/payments`, { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) { setBusy(''); setError(r.error); return false; }
    await reload();
    setBusy('');
    if (done) setNote(done(r.data ?? {}));
    return true;
  }

  async function act(key: string, body: Record<string, unknown>, done?: (r: EventData & Record<string, unknown>) => string) {
    setBusy(key); setError(''); setNote('');
    const r = await dfetch<EventData & Record<string, unknown>>(`/api/operator/events/${e.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setBusy('');
    if (!r.ok) { setError(r.error); return false; }
    onChange(r.data);
    if (done) setNote(done(r.data));
    return true;
  }

  const open = e.tasks.filter(t => !t.doneAt);
  const overdue = open.filter(t => t.dueDate && t.dueDate < today);
  const groups = new Map<number, EventPlayer[]>();
  for (const p of e.entrants) if (p.groupNo != null) groups.set(p.groupNo, [...(groups.get(p.groupNo) ?? []), p]);
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  const ungrouped = e.entrants.filter(p => p.groupNo == null);
  const heldTimes = [...new Set(held.map(h => h.time))];
  const startOf = (g: number, hole: number | null) => e.format === 'shotgun'
    ? `${formatTeeTime(e.startTime)}${hole ? `, hole ${hole}` : ''}`
    : formatTeeTime(heldTimes[g - 1] ?? e.startTime);
  const kind = KINDS.find(k => k.key === e.kind)?.label ?? 'Event';
  const maxHole = Math.min(e.holes, data.courseHoles);

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <button onClick={onBack} className="text-[13px] text-ink-soft hover:text-ink">← All events</button>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-2">
          <div>
            <h1 className="font-serif text-[30px] font-semibold leading-none text-ink">{e.name}</h1>
            <p className="text-[14px] text-ink mt-2">
              {kind} · {formatTeeDay(e.date)} · {e.format === 'shotgun' ? `${e.holes}-hole shotgun at ${formatTeeTime(e.startTime)}` : `tee times from ${formatTeeTime(e.startTime)}`}
            </p>
            {!live && <div className="mt-2"><StatusDot status="neutral" label="Cancelled — its tee times went back on sale" /></div>}
          </div>
          {live && (
            <div className="flex gap-2">
              <button onClick={onEdit} className={SECONDARY}>Change details</button>
              {!confirmCancel
                ? <button onClick={() => setConfirmCancel(true)} className={SECONDARY + ' text-bad'}>Cancel event</button>
                : <span className="flex items-center gap-2">
                    <button disabled={!!busy} onClick={async () => { if (await act('cancel', { action: 'cancel' }, r => { const errs = (r.linkErrors as string[] | undefined) ?? []; const v = Number(r.linksVoided ?? 0); return `Cancelled. ${Number(r.released ?? 0)} tee time${r.released === 1 ? '' : 's'} went back on sale.${v ? ` ${v} unpaid pay link${v === 1 ? ' was' : 's were'} cancelled.` : ''}${errs.length ? ` ${errs.length === 1 ? 'A pay link' : `${errs.length} pay links`} couldn\u2019t be cancelled — cancel ${errs.length === 1 ? 'it' : 'them'} under Money: ${errs.join('; ')}` : ''}`; })) setConfirmCancel(false); }}
                      className={BTN + ' bg-bad text-white'}>{busy === 'cancel' ? 'Cancelling…' : 'Yes, cancel it'}</button>
                    <button onClick={() => setConfirmCancel(false)} className={SECONDARY}>Keep it</button>
                  </span>}
            </div>
          )}
        </div>
      </div>

      {(error || note) && (
        <p role={error ? 'alert' : 'status'} className={'print:hidden text-[13.5px] ' + (error ? 'text-bad' : 'text-ink')}>{error || note}</p>
      )}

      <div className="grid lg:grid-cols-[1fr_1fr] gap-5 print:hidden">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink mb-2">On the tee sheet</h2>
          {held.length === 0 && live
            ? <p className="text-[13.5px] text-ink">No tee times held yet{toMove.length ? '' : ' — the day’s tee times will be held as they are made'}.</p>
            : <p className="text-[13.5px] text-ink">{live ? 'Holding' : 'Held'} {formatTeeTime(e.holdFrom)} to {formatTeeTime(e.holdTo)}{held.length ? ` — ${held.length} tee time${held.length === 1 ? '' : 's'}` : ''}.</p>}
          {e.shareCourse && (
            <p className="text-[13px] text-ink-soft mt-1">
              Shares the course{e.holdNineIds.length ? ' — only the holes chosen for it are held' : ''}.
              {e.keepOpen.length > 0 && ` Kept open for golfers: ${e.keepOpen.map(formatTeeTime).join(', ')}.`}
            </p>
          )}
          {(toMove.length > 0 || data.unheld.length > 0) && (
            <div className="border-l-[3px] border-warn pl-3 mt-3 text-[13.5px] text-ink">
              {toMove.length > 0 && <>
                <p>{toMove.length} booked time{toMove.length === 1 ? '' : 's'} in the window {toMove.length === 1 ? 'isn’t' : 'aren’t'} held. Move these groups from the tee sheet, then hold the open times:</p>
                <ul className="mt-1 text-ink-soft">{toMove.map(b => <li key={b.time}>{formatTeeTime(b.time)} — {b.golfers}</li>)}</ul>
              </>}
              {data.unheld.length > 0 && (
                <p className={toMove.length ? 'mt-2' : ''}>{data.unheld.length === 1 ? `${formatTeeTime(data.unheld[0])} is` : `${data.unheld.map(formatTeeTime).join(', ')} are`} open in the window and golfers can book {data.unheld.length === 1 ? 'it' : 'them'}. Hold {data.unheld.length === 1 ? 'it' : 'them'} for the event:</p>
              )}
              <button disabled={!!busy} onClick={() => act('rehold', { action: 'rehold' }, r => {
                const h = (r.hold as { held: number } | undefined)?.held ?? 0;
                return h ? `Held ${h} more tee time${h === 1 ? '' : 's'}.` : 'Nothing new to hold — those times are still booked.';
              })} className={SECONDARY + ' mt-2'}>{busy === 'rehold' ? 'Holding…' : 'Hold the open times'}</button>
            </div>
          )}
          {data.blockedOther > 0 && <p className="text-[13px] text-ink-soft mt-2">{data.blockedOther} time{data.blockedOther === 1 ? ' is' : 's are'} held by another event.</p>}
          <div className="divide-y divide-line-soft text-[13.5px] mt-4">
            {[
              ['Players', [e.players && `${e.players} expected`, e.groups && `${e.groups} groups`, e.entrants.length && `${e.entrants.length} on the list`].filter(Boolean).join(', ') || 'Not set yet'],
              ['Organizer', [e.organizerName, e.organizerEmail, e.organizerPhone].filter(Boolean).join(' · ') || 'Not set yet'],
              ['Price', e.pricePerPlayerCents ? `$${(e.pricePerPlayerCents / 100).toFixed(2)} per player` : 'Not set yet'],
              ['Included', e.includes.join(', ') || 'Nothing listed'],
              ...(e.terms ? [['Terms', e.terms]] : []),
              ...(e.notes ? [['Notes', e.notes]] : []),
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[90px_1fr] gap-3 py-2"><span className="text-ink-muted">{k}</span><span className="text-ink whitespace-pre-line">{v}</span></div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-[15px] font-semibold text-ink">Checklist</h2>
            <span className="text-[12.5px] text-ink-muted">{e.tasks.length - open.length} of {e.tasks.length} done</span>
          </div>
          {overdue.length > 0 && <div className="mb-2"><StatusDot status="bad" label={`${overdue.length} overdue`} /></div>}
          <ul className="divide-y divide-line-soft">
            {e.tasks.map(t => {
              const late = !t.doneAt && t.dueDate && t.dueDate < today;
              return (
                <li key={t.id} className="flex items-start gap-3 py-2">
                  <input type="checkbox" className="mt-1 accent-pine" checked={!!t.doneAt} disabled={!live || !!busy}
                    aria-label={t.label} onChange={ev => act('task:' + t.id, { action: 'task_toggle', taskId: t.id, done: ev.target.checked })} />
                  <div className="flex-1 min-w-0">
                    <div className={'text-[13.5px] ' + (t.doneAt ? 'text-ink-muted line-through' : 'text-ink')}>{t.label}</div>
                    <div className={'text-[12px] ' + (late ? 'text-bad' : 'text-ink-muted')}>
                      {t.doneAt ? `Done${t.doneBy ? ` by ${t.doneBy}` : ''}` : t.dueDate ? `${late ? 'Was due' : 'Due'} ${formatTeeDay(t.dueDate)}` : 'No due date'}
                    </div>
                  </div>
                  {live && <button disabled={!!busy} onClick={() => act('taskdel:' + t.id, { action: 'task_remove', taskId: t.id })} aria-label={`Remove ${t.label}`} className="text-[12.5px] text-ink-soft hover:text-bad">Remove</button>}
                </li>
              );
            })}
          </ul>
          {live && (
            <form className="flex flex-wrap gap-2 mt-3" onSubmit={async ev => { ev.preventDefault(); if (await act('task_add', { action: 'task_add', ...newTask, dueDate: newTask.dueDate || null })) setNewTask({ label: '', dueDate: '' }); }}>
              <input className={INPUT + ' flex-1 min-w-[160px]'} placeholder="Add an item" value={newTask.label} maxLength={200} onChange={ev => setNewTask(t => ({ ...t, label: ev.target.value }))} />
              <input type="date" aria-label="Due date" className={INPUT + ' w-40'} value={newTask.dueDate} onChange={ev => setNewTask(t => ({ ...t, dueDate: ev.target.value }))} />
              <button type="submit" disabled={!!busy || !newTask.label.trim()} className={SECONDARY}>{busy === 'task_add' ? 'Adding…' : 'Add'}</button>
            </form>
          )}
        </Card>
      </div>

      <div className="print:hidden">
        <EventMoney eventId={e.id} live={live} pricePerPlayerCents={e.pricePerPlayerCents} money={data.money} payments={e.payments} canRefund={canRefund} reload={reload}
          organizer={{ name: e.organizerName, email: e.organizerEmail, phone: e.organizerPhone }} />
      </div>

      <Card className="p-5 print:shadow-none print:p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3 print:hidden">
          <h2 className="text-[15px] font-semibold text-ink">Players and pairings</h2>
          <span className="text-[12.5px] text-ink-muted">{e.entrants.length} player{e.entrants.length === 1 ? '' : 's'}{sortedGroups.length ? ` in ${sortedGroups.length} group${sortedGroups.length === 1 ? '' : 's'}` : ''}</span>
        </div>

        {live && (
          <div className="print:hidden mb-4">
            <label className="block text-[13px] font-medium text-ink mb-1.5" htmlFor="paste-players">Add players — one per line: name, email, phone. You can paste from a spreadsheet.</label>
            <textarea id="paste-players" rows={3} className={INPUT + ' w-full font-sans'} value={paste} onChange={ev => setPaste(ev.target.value)} placeholder={'Jane Smith, jane@example.com, 555-201-3344\nTom Lee'} />
            <button disabled={!!busy || !paste.trim()} onClick={async () => { if (await act('players_add', { action: 'players_add', text: paste })) setPaste(''); }} className={SECONDARY + ' mt-2'}>
              {busy === 'players_add' ? 'Adding…' : 'Add players'}
            </button>
          </div>
        )}

        {e.entrants.length > 0 && live && (
          <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
            <label className="text-[13px] text-ink-soft flex items-center gap-2">Groups of
              <select className={INPUT} value={size} onChange={ev => setSize(Number(ev.target.value))}>{[2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select>
            </label>
            <button disabled={!!busy} onClick={() => act('auto', { action: 'pairings_auto', size }, () => 'Players put into groups in list order. Change any group or hole below.')} className={SECONDARY}>
              {busy === 'auto' ? 'Pairing…' : 'Pair in list order'}
            </button>
            {sortedGroups.length > 0 && <>
              <button disabled={!!busy} onClick={() => act('clear', { action: 'pairings_clear' })} className={SECONDARY}>Clear groups</button>
              <button onClick={() => window.print()} className={SECONDARY}>Print pairings</button>
              <button disabled={!!busy} onClick={() => act('send', { action: 'pairings_send' }, r => {
                const sent = Number(r.sent ?? 0); const failed = (r.failed as string[] | undefined) ?? []; const none = Number(r.noEmail ?? 0); const notSent = (r.notSent as string[] | undefined) ?? [];
                return [`Emailed ${sent} player${sent === 1 ? '' : 's'} their group.`, notSent.length ? `Ran out of time before emailing ${notSent.join(', ')} — press it again for them, or print theirs.` : '', failed.length ? `Couldn’t reach ${failed.join(', ')} — try again or print theirs.` : '', none ? `${none} without an email — give them a printed copy.` : ''].filter(Boolean).join(' ');
              })} className={PRIMARY}>{busy === 'send' ? 'Emailing…' : 'Email pairings to players'}</button>
            </>}
          </div>
        )}

        {e.entrants.length > 0 && live && unpaid > 0 && (
          <form className="flex flex-wrap items-end gap-2 mb-4 print:hidden bg-paper/70 rounded-md px-3 py-3" onSubmit={async ev => {
            ev.preventDefault();
            await payAct('ask', { action: 'player_links', amount: askAmount, via: askVia }, r => {
              const asked = Number(r.asked ?? 0), already = Number(r.already ?? 0);
              const none = (r.noContact as string[] | undefined) ?? [], failed = (r.failed as string[] | undefined) ?? [], late = (r.notSent as string[] | undefined) ?? [];
              return [`Sent ${asked} pay link${asked === 1 ? '' : 's'}.`, already ? `${already} had already paid or had a link.` : '',
                none.length ? `No email or phone for ${none.join(', ')} — take theirs at the course.` : '',
                failed.length ? `Didn\u2019t send: ${failed.join('; ')} — their links are made; copy them below.` : '',
                late.length ? `Ran out of time before ${late.join(', ')} — press it again for them.` : ''].filter(Boolean).join(' ');
            });
          }}>
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1">Ask the {unpaid} player{unpaid === 1 ? '' : 's'} who haven’t paid for</span>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                <input inputMode="decimal" required aria-label="Amount each" className={INPUT + ' w-32 pl-7'} value={askAmount} onChange={ev => setAskAmount(ev.target.value)} placeholder="each" /></div></label>
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1">Send by</span>
              <select className={INPUT} value={askVia} onChange={ev => setAskVia(ev.target.value as 'email' | 'sms')}>
                <option value="email">Email (text if no email)</option><option value="sms">Text (email if no mobile)</option>
              </select></label>
            <button type="submit" disabled={!!busy || !askAmount} className={PRIMARY}>{busy === 'ask' ? 'Sending…' : 'Send pay links'}</button>
          </form>
        )}

        {/* What prints: the pairings sheet alone. */}
        <div className="hidden print:block mb-4">
          <h1 className="font-serif text-[26px] font-semibold text-ink">{e.name}</h1>
          <p className="text-[14px] text-ink">{formatTeeDay(e.date)} · {e.format === 'shotgun' ? `Shotgun at ${formatTeeTime(e.startTime)}` : `Tee times from ${formatTeeTime(e.startTime)}`}</p>
        </div>
        {sortedGroups.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4 print:grid-cols-3">
            {sortedGroups.map(([g, ps]) => (
              <div key={g} className="bg-paper/70 rounded-md px-3.5 py-3 break-inside-avoid">
                <div className="text-[13.5px] font-semibold text-ink">Group {g} <span className="font-normal text-ink-soft">· {startOf(g, ps[0]?.startHole ?? null)}</span></div>
                <ul className="mt-1 text-[13.5px] text-ink">{ps.map(p => <li key={p.id}>{p.name}</li>)}</ul>
              </div>
            ))}
          </div>
        )}

        {e.entrants.length > 0 && (
          <div className="overflow-x-auto print:hidden">
            <table className="w-full text-[13.5px]">
              <thead><tr className="text-left text-ink-muted border-b border-line">
                <th className="py-2 pr-3 font-medium">Player</th><th className="py-2 pr-3 font-medium">Contact</th>
                <th className="py-2 pr-3 font-medium">Group</th>{e.format === 'shotgun' && <th className="py-2 pr-3 font-medium">Hole</th>}<th className="py-2 pr-3 font-medium">Paid</th><th />
              </tr></thead>
              <tbody className="divide-y divide-line-soft">
                {[...sortedGroups.flatMap(([, ps]) => ps), ...ungrouped].map(p => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3 text-ink">{p.name}</td>
                    <td className="py-2 pr-3 text-ink-soft">{[p.email, p.phone].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="py-2 pr-3">
                      <input type="number" min={1} max={250} aria-label={`Group for ${p.name}`} disabled={!live || !!busy} defaultValue={p.groupNo ?? ''} key={`g${p.id}${p.groupNo}`}
                        className={INPUT + ' w-20'} onBlur={ev => { const v = ev.target.value === '' ? null : Number(ev.target.value); if (v !== p.groupNo) act('set:' + p.id, { action: 'player_set', playerId: p.id, groupNo: v, startHole: p.startHole }); }} />
                    </td>
                    {e.format === 'shotgun' && (
                      <td className="py-2 pr-3">
                        <input type="number" min={1} max={maxHole} aria-label={`Starting hole for ${p.name}`} disabled={!live || !!busy} defaultValue={p.startHole ?? ''} key={`h${p.id}${p.startHole}`}
                          className={INPUT + ' w-20'} onBlur={ev => { const v = ev.target.value === '' ? null : Number(ev.target.value); if (v !== p.startHole) act('set:' + p.id, { action: 'player_set', playerId: p.id, groupNo: p.groupNo, startHole: v }); }} />
                      </td>
                    )}
                    <td className="py-2 pr-3">
                      {(() => {
                        const st = stateOf(p.id);
                        const link = theirs(p.id).find(x => x.status === 'open')?.payUrl ?? null;
                        if (st === 'paid') return <StatusDot status="ok" label="Paid" />;
                        // Their card is going through: nothing to do until it lands.
                        if (st === 'paying') return <StatusDot status="warn" label="Paying now" />;
                        const openLink = theirs(p.id).find(x => x.status === 'open');
                        if (paidHere?.id === p.id) return (
                          <span className="flex flex-wrap items-center gap-1.5">
                            {/* With a link out, it's that link that gets paid — its amount, not a new one. */}
                            {openLink
                              ? <span className="text-[12.5px] text-ink-soft">Closes their {`$${(openLink.amountCents / 100).toFixed(2)}`} link</span>
                              : <input inputMode="decimal" aria-label={`Amount ${p.name} paid`} className={INPUT + ' w-24'} value={paidHere.amount} onChange={ev => setPaidHere({ ...paidHere, amount: ev.target.value })} />}
                            <select aria-label="How they paid" className={INPUT} value={paidHere.method} onChange={ev => setPaidHere({ ...paidHere, method: ev.target.value })}>
                              <option value="cash">Cash</option><option value="check">Check</option><option value="card_counter">Card at the course</option><option value="other">Other</option>
                            </select>
                            <button disabled={!!busy || (!openLink && !paidHere.amount)} onClick={async () => {
                              // A link they were sent is closed first, so they can't pay twice.
                              const ok = openLink
                                ? await payAct('here' + p.id, { action: 'paid_other', paymentId: openLink.id, method: paidHere.method }, () => `${p.name} marked paid; their link was closed.`)
                                : await payAct('here' + p.id, { action: 'record', playerId: p.id, amount: paidHere.amount, method: paidHere.method }, () => `${p.name} marked paid.`);
                              if (ok) setPaidHere(null);
                            }} className={SECONDARY}>{busy === 'here' + p.id ? 'Saving…' : 'Save'}</button>
                            <button onClick={() => setPaidHere(null)} className="text-[12.5px] text-ink-soft hover:text-ink">Close</button>
                          </span>
                        );
                        return (
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {st === 'sent' ? <StatusDot status="warn" label="Link sent" /> : <span className="text-ink-muted">—</span>}
                            {live && st === 'sent' && link && <button onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(p.id); setTimeout(() => setCopied(''), 2000); } catch { setError('Couldn\u2019t copy — open Money to see the link.'); } }} className="text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2">{copied === p.id ? 'Copied' : 'Copy link'}</button>}
                            {live && st === 'none' && ((p.email && !p.email.endsWith('@noemail.greenreserve.app')) || p.phone.replace(/\D/g, '').length >= 10) && <button disabled={!!busy || !price} title={price ? undefined : 'Set a price per player first'}
                              onClick={() => payAct('link' + p.id, { action: 'link', playerId: p.id, amount: price, via: p.email && !p.email.endsWith('@noemail.greenreserve.app') ? 'email' : 'sms' }, r => r.sent ? `Pay link sent to ${p.name}.` : `Link made for ${p.name}, but it didn\u2019t send${r.sendError ? `: ${String(r.sendError)}` : ''} — copy it here.`)}
                              className="text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2 disabled:opacity-50">{busy === 'link' + p.id ? 'Sending…' : 'Send link'}</button>}
                            {<button disabled={!!busy} onClick={() => setPaidHere({ id: p.id, amount: price, method: 'cash' })} className="text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2">Paid at the course</button>}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2 text-right">{live && <button disabled={!!busy} onClick={() => act('del:' + p.id, { action: 'player_remove', playerId: p.id })} className="text-[12.5px] text-ink-soft hover:text-bad">Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {e.entrants.length === 0 && <p className="text-[13.5px] text-ink-muted print:hidden">No players yet.</p>}
      </Card>
    </div>
  );
}
