'use client';
// Declined cards — the same rows on Home and Money → Action needed (Revamp 3 dead end 16, Cam 2026-10-29).
// MONEY-1 (Cam 2026-11-09, Money notes): "get rid of Text pay link"; "option to delete an item from the list";
// "Open should open the issue right there, not take you to a new tab". So each row:
//  • Open — shows the group, what the card is charged and why it was declined, in place, with a link to the tee sheet;
//  • Email pay link — the tee sheet's own action and permission (`sheet.checkin`);
//  • Remove — takes it off this list (POST /api/operator/declined). It still owes: Payments → Not paid yet.
// One action at a time; each row says what happened.
import { useState } from 'react';
import Link from 'next/link';
import { StatusDot } from '@/components/ui/StatusDot';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { formatTeeDate, formatTeeTime } from '@/lib/format';
import type { DeclinedCard } from '@/lib/operator-home';

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BTN = 'text-[13px] font-medium text-ink px-3 py-1.5 rounded-[7px] bg-white border border-line hover:border-line-strong disabled:opacity-50';

export function DeclinedCardList({ rows, total, canSendLink, moreHref, onRemoved }: {
  rows: DeclinedCard[]; total: number; canSendLink: boolean;
  /** After a remove, so the page's counts re-read (Home's "Cards declined"). */
  onRemoved?: () => void;
  /** Where "and N more" goes — Money lists more of them. */
  moreHref?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  // A long list shows the newest five until asked for the rest.
  const [all, setAll] = useState(false);
  const [result, setResult] = useState<Record<string, { ok: boolean; text: string }>>({});
  async function send(d: DeclinedCard) {
    setBusy(d.id);
    const r = await dfetch<{ sentTo: string }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: d.id, action: 'send_pay_link', via: 'email' }) });
    setBusy(null);
    setResult(m => ({ ...m, [d.id]: r.ok ? { ok: true, text: `Sent to ${r.data.sentTo}.` } : { ok: false, text: r.error } }));
  }
  async function remove(d: DeclinedCard) {
    setBusy('rm:' + d.id);
    const r = await dfetch('/api/operator/declined', { method: 'POST', body: JSON.stringify({ id: d.id }) });
    setBusy(null);
    // Say what happened: the row goes, the money is still owed (no-silent-failures audit 2026-11-09).
    if (r.ok) { setGone(g => new Set(g).add(d.id)); toast(`${d.name} removed. Still owed under Payments → Not paid yet.`, 'ok'); onRemoved?.(); }
    else setResult(m => ({ ...m, [d.id]: { ok: false, text: r.error } }));
  }
  const left = rows.filter(d => !gone.has(d.id));
  const shown = all ? left : left.slice(0, 5);
  const more = total - rows.length;
  if (left.length === 0 && more <= 0) return <p className="px-4 py-3 text-[13.5px] text-ink-muted">None.</p>;
  return (
    <>
      {shown.map(d => {
        const res = result[d.id];
        const isOpen = open === d.id;
        return (
          <div key={d.id} className="px-4 py-3 text-[13.5px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusDot status="bad" label="" />
              <div className="flex-1 min-w-[12rem]">
                <div className="text-ink truncate">Card declined — {d.name}</div>
                <div className="text-[12.5px] text-ink-muted tabular-nums">{formatTeeDate(d.date)} {formatTeeTime(d.time)}{d.amountCents !== null ? ` · ${usd(d.amountCents)}` : ''}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button type="button" onClick={() => setOpen(isOpen ? null : d.id)} aria-expanded={isOpen} className="text-[13px] font-medium text-pine hover:underline underline-offset-4">{isOpen ? 'Close' : 'Open'}</button>
                {canSendLink && !d.canEmail && <span className="text-[12.5px] text-ink-muted">No email on file</span>}
                {canSendLink && d.canEmail && <button type="button" onClick={() => send(d)} disabled={busy !== null} className={BTN}>{busy === d.id ? 'Sending…' : 'Email pay link'}</button>}
                {canSendLink && <button type="button" onClick={() => remove(d)} disabled={busy !== null} className="text-[13px] text-ink-soft hover:text-bad disabled:opacity-50">{busy === 'rm:' + d.id ? 'Removing…' : 'Remove'}</button>}
              </div>
            </div>
            {res && <div role={res.ok ? 'status' : 'alert'} className={'text-[12.5px] mt-1 pl-4 ' + (res.ok ? 'text-ok' : 'text-bad')}>{res.text}</div>}
            {isOpen && (
              <dl className="mt-2 ml-4 rounded-md bg-paper/70 px-3 py-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                {d.players != null && <><dt className="text-ink-muted">Players</dt><dd className="text-ink">{d.players}</dd></>}
                {d.amountCents !== null && <><dt className="text-ink-muted">Owes</dt><dd className="text-ink tabular-nums">{usd(d.amountCents)}</dd></>}
                {d.reason && <><dt className="text-ink-muted">Reason</dt><dd className="text-ink">{d.reason}</dd></>}
                {!d.canEmail && <><dt className="text-ink-muted">Pay link</dt><dd className="text-ink">No email</dd></>}
                <dd className="col-span-2 pt-1"><Link href={`/dashboard?date=${d.date}&q=${encodeURIComponent(d.name)}`} className="font-medium text-pine hover:underline underline-offset-4">Tee sheet</Link></dd>
              </dl>
            )}
          </div>
        );
      })}
      {!all && left.length > 5 && (
        <button type="button" onClick={() => setAll(true)} className="w-full px-4 py-2.5 text-left text-[13px] font-medium text-pine hover:underline underline-offset-4">Show all {left.length}</button>
      )}
      {more > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 text-[13px] text-ink-soft">
          <StatusDot status="bad" label="" />
          <span className="flex-1">+{more} more</span>
          {moreHref && <Link href={moreHref} className="text-[13px] font-medium text-pine">See all</Link>}
        </div>
      )}
    </>
  );
}
