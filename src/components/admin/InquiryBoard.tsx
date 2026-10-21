'use client';
// AW-6a (Cam 2026-10-21: "board by stage"): the Inquiries board. Each card is
// the course, who to call and their number, the next call if one is booked,
// and ONE next step. A resend runs in place; every other step opens the
// inquiry. A card stuck 7+ days in its stage carries the amber left edge.
// AW-6c: Leads come first — "Add a lead" heads the column, and a lead's step,
// Move to Talking, runs in place.
import { useState } from 'react';
import Link from 'next/link';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { BOARD_COLUMNS, BOARD_STUCK_DAYS, LIVE_ON_BOARD_DAYS, boardColumn, nextStep, type BoardColumn, type BoardInquiry } from '@/lib/inquiry-board';
import { nextCall, fmtCallTime } from '@/lib/inquiry-call';
import { stageEnteredAt, daysSince, compareQueue, type QueueSignal } from '@/lib/inquiry-status';
import { AddLeadDialog, MoveToTalkingDialog } from '@/components/admin/LeadDialogs';

export type BoardCardInquiry = BoardInquiry & {
  courseName: string; contactName: string; contactTitle: string; phone: string; email: string;
  wentLiveAt?: string | null; source?: string | null;
};

type Fire = 'idle' | 'pending' | 'done' | 'error';

export default function InquiryBoard<T extends BoardCardInquiry>({ inquiries, signal, href, canResend, onChanged }: {
  inquiries: T[];
  signal: (inq: T) => QueueSignal;
  href: (inq: T) => string;
  /** Resending, adding a lead and moving one on are manager+ on the server. */
  canResend: boolean;
  /** Reload after a lead is added or moved on. */
  onChanged: () => void;
}) {
  const [fire, setFire] = useState<Record<string, Fire>>({});
  const [fireError, setFireError] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<T | null>(null);
  const now = new Date();

  const cols: Record<BoardColumn, T[]> = { leads: [], talking: [], setup: [], live: [] };
  for (const inq of inquiries) {
    const col = boardColumn(inq.status);
    if (!col) continue;
    if (col === 'live') {
      const liveAt = inq.wentLiveAt ? new Date(inq.wentLiveAt) : stageEnteredAt(inq.status, inq.createdAt, inq.events ?? []);
      if (daysSince(liveAt, now) > LIVE_ON_BOARD_DAYS) continue;
    }
    cols[col].push(inq);
  }
  // Leads newest first; the rest your move first, most overdue first — the queue's own order.
  cols.leads.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
    <>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
      {BOARD_COLUMNS.map(c => (
        <section key={c.key} aria-label={c.label} className="min-w-0">
          <div className="flex items-baseline justify-between gap-2 px-1 mb-2">
            <h2 className="text-[15px] font-semibold text-ink">{c.label} <span className="text-ink-muted font-normal">{cols[c.key].length}</span></h2>
            {c.key === 'leads' && canResend
              ? <button type="button" onClick={() => setAdding(true)} className="text-[12.5px] font-medium text-pine hover:text-pine-hover">Add a lead</button>
              : <span className="text-[12px] text-ink-muted truncate">{c.hint}</span>}
          </div>
          <div className="space-y-2.5">
            {cols[c.key].length === 0 && <p className="px-1 py-3 text-[13px] text-ink-muted">{c.key === 'leads' ? 'No leads. Add a course you found.' : 'Nothing here.'}</p>}
            {cols[c.key].map(inq => {
              const s = signal(inq);
              const step = nextStep(inq, s, now);
              const days = daysSince(s.enteredAt, now);
              const call = nextCall(inq.calls ?? [], now);
              // Today's rule exactly (src/lib/admin-today.ts): a call still ahead is progress, not a stall.
              const callAhead = (inq.calls ?? []).some(x => x.outcome === 'scheduled' && new Date(x.scheduledAt) > now);
              const stuck = c.key !== 'live' && c.key !== 'leads' && s.waitingOn !== 'snoozed' && !callAhead && days >= BOARD_STUCK_DAYS;
              const firing = fire[inq.id] ?? 'idle';
              const inPlace = step && step.action !== 'open' && canResend;
              const isLead = step?.action === 'start_talking';
              return (
                <Card key={inq.id} className={`p-3.5 ${stuck ? 'border-l-[3px] border-warn' : ''}`}>
                  <Link href={href(inq)} className="block text-[14px] font-semibold text-ink hover:text-pine truncate">{inq.courseName}</Link>
                  <div className="mt-1 text-[13px] text-ink-soft truncate">
                    {inq.contactName}{inq.contactTitle ? ` · ${inq.contactTitle}` : ''}
                    {inq.phone && <> · <a href={`tel:${inq.phone.replace(/[^\d+]/g, '')}`} className="text-pine hover:text-pine-hover underline decoration-fairway underline-offset-2">{inq.phone}</a></>}
                  </div>
                  {isLead && <div className="mt-1 text-[12px] text-ink-muted">Added {new Date(inq.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{inq.source ? ` · ${inq.source}` : ''}</div>}
                  {call && <div className="mt-1 text-[13px] text-ink">Call {fmtCallTime(call.scheduledAt)} ET</div>}
                  {stuck && <div className="mt-1 text-[12px] text-warn">{days} days in this stage</div>}
                  {step && (
                    <div className="mt-2.5 flex items-center gap-2">
                      {firing === 'done' ? (
                        <span className="text-[12.5px] text-ok flex items-center gap-1.5"><StatusDot status="ok" />Sent</span>
                      ) : inPlace ? (
                        <button
                          type="button" disabled={firing === 'pending'}
                          onClick={() => isLead ? setMoving(inq) : resend(inq, step.action as 'resend_sheet' | 'resend_preview')}
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
    {adding && <AddLeadDialog onClose={() => setAdding(false)} onAdded={() => { setAdding(false); onChanged(); }} />}
    {moving && <MoveToTalkingDialog lead={moving} onClose={() => setMoving(null)} onMoved={() => { setMoving(null); onChanged(); }} />}
    </>
  );
}
