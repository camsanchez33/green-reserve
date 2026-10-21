'use client';
// AW-6a (Cam 2026-10-21: "board by stage"): the Inquiries board. Each card is
// the course, who to call and their number, the next call if one is booked,
// and ONE next step. A resend runs in place; every other step opens the
// inquiry. A card stuck 7+ days in its stage carries the amber left edge.
import { useState } from 'react';
import Link from 'next/link';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { BOARD_COLUMNS, BOARD_STUCK_DAYS, LIVE_ON_BOARD_DAYS, boardColumn, nextStep, type BoardColumn, type BoardInquiry } from '@/lib/inquiry-board';
import { nextCall, fmtCallTime } from '@/lib/inquiry-call';
import { stageEnteredAt, daysSince, compareQueue, type QueueSignal } from '@/lib/inquiry-status';

export type BoardCardInquiry = BoardInquiry & {
  courseName: string; contactName: string; contactTitle: string; phone: string;
  wentLiveAt?: string | null;
};

type Fire = 'idle' | 'pending' | 'done' | 'error';

export default function InquiryBoard<T extends BoardCardInquiry>({ inquiries, signal, href, canResend }: {
  inquiries: T[];
  signal: (inq: T) => QueueSignal;
  href: (inq: T) => string;
  /** Resending a sheet or a preview is manager+ on the server. */
  canResend: boolean;
}) {
  const [fire, setFire] = useState<Record<string, Fire>>({});
  const [fireError, setFireError] = useState<Record<string, string>>({});
  const now = new Date();

  const cols: Record<BoardColumn, T[]> = { talking: [], setup: [], live: [] };
  for (const inq of inquiries) {
    const col = boardColumn(inq.status);
    if (!col) continue;
    if (col === 'live') {
      const liveAt = inq.wentLiveAt ? new Date(inq.wentLiveAt) : stageEnteredAt(inq.status, inq.createdAt, inq.events ?? []);
      if (daysSince(liveAt, now) > LIVE_ON_BOARD_DAYS) continue;
    }
    cols[col].push(inq);
  }
  // Your move first, most overdue first — the queue's own order.
  cols.talking.sort((a, b) => compareQueue(signal(a), signal(b)));
  cols.setup.sort((a, b) => compareQueue(signal(a), signal(b)));

  async function resend(inq: T, kind: 'resend_sheet' | 'resend_preview') {
    // It emails the course — one tap mustn't do that by accident.
    if (!window.confirm(kind === 'resend_sheet' ? `Email ${inq.courseName} their setup sheet link again?` : `Email ${inq.courseName} their preview again?`)) return;
    setFire(s => ({ ...s, [inq.id]: 'pending' }));
    try {
      const res = kind === 'resend_sheet'
        ? await fetch('/api/admin/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: inq.id, action: 'resend_details' }) })
        : await fetch('/api/preview/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: inq.id }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFireError(s => ({ ...s, [inq.id]: d.error || `Didn’t send (${res.status}).` }));
      }
      setFire(s => ({ ...s, [inq.id]: res.ok ? 'done' : 'error' }));
    } catch {
      setFireError(s => ({ ...s, [inq.id]: 'Network error — nothing was sent.' }));
      setFire(s => ({ ...s, [inq.id]: 'error' }));
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
      {BOARD_COLUMNS.map(c => (
        <section key={c.key} aria-label={c.label} className="min-w-0">
          <div className="flex items-baseline justify-between px-1 mb-2">
            <h2 className="text-[15px] font-semibold text-ink">{c.label} <span className="text-ink-muted font-normal">{cols[c.key].length}</span></h2>
            <span className="text-[12px] text-ink-muted">{c.hint}</span>
          </div>
          <div className="space-y-2.5">
            {cols[c.key].length === 0 && <p className="px-1 py-3 text-[13px] text-ink-muted">Nothing here.</p>}
            {cols[c.key].map(inq => {
              const s = signal(inq);
              const step = nextStep(inq, s, now);
              const days = daysSince(s.enteredAt, now);
              const call = nextCall(inq.calls ?? [], now);
              // Today's rule exactly (src/lib/admin-today.ts): a call still ahead is progress, not a stall.
              const callAhead = (inq.calls ?? []).some(x => x.outcome === 'scheduled' && new Date(x.scheduledAt) > now);
              const stuck = c.key !== 'live' && s.waitingOn !== 'snoozed' && !callAhead && days >= BOARD_STUCK_DAYS;
              const firing = fire[inq.id] ?? 'idle';
              const inPlace = step && step.action !== 'open' && canResend;
              return (
                <Card key={inq.id} className={`p-3.5 ${stuck ? 'border-l-[3px] border-warn' : ''}`}>
                  <Link href={href(inq)} className="block text-[14px] font-semibold text-ink hover:text-pine truncate">{inq.courseName}</Link>
                  <div className="mt-1 text-[13px] text-ink-soft truncate">
                    {inq.contactName}{inq.contactTitle ? ` · ${inq.contactTitle}` : ''}
                    {inq.phone && <> · <a href={`tel:${inq.phone.replace(/[^\d+]/g, '')}`} className="text-pine hover:text-pine-hover underline decoration-fairway underline-offset-2">{inq.phone}</a></>}
                  </div>
                  {call && <div className="mt-1 text-[13px] text-ink">Call {fmtCallTime(call.scheduledAt)} ET</div>}
                  {stuck && <div className="mt-1 text-[12px] text-warn">{days} days in this stage</div>}
                  {step && (
                    <div className="mt-2.5 flex items-center gap-2">
                      {firing === 'done' ? (
                        <span className="text-[12.5px] text-ok flex items-center gap-1.5"><StatusDot status="ok" />Sent</span>
                      ) : inPlace ? (
                        <button
                          type="button" disabled={firing === 'pending'}
                          onClick={() => resend(inq, step.action as 'resend_sheet' | 'resend_preview')}
                          className="text-[12.5px] font-medium text-white bg-pine hover:bg-pine-hover rounded-md px-2.5 py-1.5 disabled:opacity-50"
                        >
                          {firing === 'pending' ? 'Sending…' : firing === 'error' ? 'Try again' : step.label}
                        </button>
                      ) : (
                        <Link href={href(inq)} className="text-[12.5px] font-medium text-white bg-pine hover:bg-pine-hover rounded-md px-2.5 py-1.5">{step.label}</Link>
                      )}
                    </div>
                  )}
                  {firing === 'error' && fireError[inq.id] && <p role="alert" className="mt-1.5 text-[12px] text-bad">{fireError[inq.id]}</p>}
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
