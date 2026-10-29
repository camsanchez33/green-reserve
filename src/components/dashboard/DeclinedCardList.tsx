'use client';
// Declined cards — the same rows on Home and Money → Needs you (Revamp 3 dead end 16,
// Cam 2026-10-29). Each opens the tee sheet on the round's own day with the golfer
// found, and can (re)send the pay link — the tee sheet's own action and permission
// (`sheet.checkin`). One send at a time; each row says what happened.
import { useState } from 'react';
import Link from 'next/link';
import { StatusDot } from '@/components/ui/StatusDot';
import { dfetch } from '@/lib/dashboard-fetch';
import { formatTeeDate, formatTeeTime } from '@/lib/format';
import type { DeclinedCard } from '@/lib/operator-home';

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BTN = 'text-[13px] font-medium text-ink px-3 py-1.5 rounded-md bg-white border border-line hover:border-line-strong disabled:opacity-50';

export function DeclinedCardList({ rows, total, canSendLink, moreHref }: {
  rows: DeclinedCard[]; total: number; canSendLink: boolean;
  /** Where "and N more" goes — Money lists more of them. */
  moreHref?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { ok: boolean; text: string }>>({});
  async function send(d: DeclinedCard, via: 'sms' | 'email') {
    setBusy(d.id);
    const r = await dfetch<{ sentTo: string }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: d.id, action: 'send_pay_link', via }) });
    setBusy(null);
    setResult(m => ({ ...m, [d.id]: r.ok
      ? { ok: true, text: `${via === 'sms' ? 'Texted' : 'Emailed'} to ${r.data.sentTo}. This clears once they pay.` }
      : { ok: false, text: r.error } }));
  }
  const more = total - rows.length;
  return (
    <>
      {rows.map(d => {
        const res = result[d.id];
        return (
          <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-[13.5px]">
            <StatusDot status="bad" label="" />
            <div className="flex-1 min-w-[12rem]">
              <div className="text-ink truncate">Card declined — {d.name}</div>
              <div className="text-[12.5px] text-ink-muted tabular-nums">{formatTeeDate(d.date)} {formatTeeTime(d.time)}{d.amountCents !== null ? ` · ${usd(d.amountCents)}` : ''}</div>
              {res && <div role={res.ok ? 'status' : 'alert'} className={'text-[12.5px] mt-0.5 ' + (res.ok ? 'text-ok' : 'text-bad')}>{res.text}</div>}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canSendLink && d.canText && <button onClick={() => send(d, 'sms')} disabled={busy !== null} className={BTN}>{busy === d.id ? 'Sending…' : 'Text pay link'}</button>}
              {canSendLink && d.canEmail && <button onClick={() => send(d, 'email')} disabled={busy !== null} className={BTN}>{busy === d.id ? 'Sending…' : 'Email pay link'}</button>}
              {canSendLink && !d.canText && !d.canEmail && <span className="text-[12.5px] text-ink-muted">No phone or email on file</span>}
              <Link href={`/dashboard?date=${d.date}&q=${encodeURIComponent(d.name)}`} className="text-[13px] font-medium text-pine">Open</Link>
            </div>
          </div>
        );
      })}
      {more > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 text-[13px] text-ink-soft">
          <StatusDot status="bad" label="" />
          <span className="flex-1">and {more} more declined card{more === 1 ? '' : 's'}</span>
          {moreHref && <Link href={moreHref} className="text-[13px] font-medium text-pine">See all</Link>}
        </div>
      )}
    </>
  );
}
