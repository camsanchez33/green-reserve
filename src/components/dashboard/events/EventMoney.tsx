'use client';
// W2-9b: an event's money (Cam 2026-10-22: "completely up to the courses on how
// to handle/charge money"). What the event comes to, what's been paid, and
// every payment: a pay link the organizer opens on their phone, or one taken
// at the course (cash, check, the course's own card machine). Any amount, any
// number of them. Refunds when the course decides to give one. Every action
// shows its pending state, then the result or the server's reason.
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { dfetch } from '@/lib/dashboard-fetch';

export type EventRefund = { id: string; amountCents: number; status: string; reason: string; error: string; createdBy: string; createdAt: string };
export type EventPayment = {
  id: string; kind: string; label: string; amountCents: number; feeCents: number; method: string; methodLabel: string; status: string;
  paidAt: string | null; createdAt: string; payerName: string; payerEmail: string; payerPhone: string; headcount: number | null; note: string;
  refundedCents: number; createdBy: string; payUrl: string | null; refunds: EventRefund[];
  /** 'paying' for longer than a charge can take: Stripe couldn't be asked yet. */
  stuck: boolean;
};
export type Money = { headcount: number; headcountConfirmed: boolean; totalCents: number; paidCents: number; refundedCents: number; keptCents: number; openCents: number; owedCents: number };

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const BTN = 'px-3 py-2 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50';
const PRIMARY = BTN + ' bg-pine hover:bg-pine-hover text-white';
const SECONDARY = BTN + ' bg-white border border-line text-ink hover:bg-paper';
const LINK = 'text-[12.5px] font-medium text-ink-soft hover:text-ink underline underline-offset-2 disabled:opacity-50';
const KINDS = [['deposit', 'Deposit'], ['balance', 'Balance'], ['other', 'Other']] as const;
const HOW = [['cash', 'Cash'], ['check', 'Check'], ['card_counter', 'Card at the course'], ['other', 'Other']] as const;

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={'px-3 py-1.5 rounded-md border text-[13px] ' + (value === k ? 'border-pine bg-pine/[0.06] text-ink font-medium' : 'border-line bg-white text-ink-soft hover:text-ink')}>{l}</button>
      ))}
    </div>
  );
}

export default function EventMoney({ eventId, live, pricePerPlayerCents, organizer, money, payments, canRefund, reload }: {
  eventId: string; live: boolean; pricePerPlayerCents: number;
  organizer: { name: string; email: string; phone: string };
  money: Money; payments: EventPayment[]; canRefund: boolean; reload: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'' | 'link' | 'record'>('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [made, setMade] = useState<{ payUrl: string; sent: string | null; sendError: string | null } | null>(null);
  const [copied, setCopied] = useState('');
  const [link, setLink] = useState({ kind: 'deposit' as 'deposit' | 'balance' | 'other', amount: '', label: '', headcount: String(money.headcount || ''), payerName: organizer.name, payerEmail: organizer.email, payerPhone: organizer.phone, via: (organizer.email ? 'email' : organizer.phone ? 'sms' : 'none') as 'email' | 'sms' | 'none' });
  const [rec, setRec] = useState({ kind: 'deposit' as 'deposit' | 'balance' | 'other', amount: '', method: 'cash' as string, payerName: organizer.name, label: '', note: '' });
  const [paidOther, setPaidOther] = useState<{ id: string; method: string } | null>(null);
  const [refund, setRefund] = useState<{ id: string; amount: string; reason: string; confirm: boolean } | null>(null);

  // The balance: price × the confirmed headcount, less what's already been kept.
  const balanceFor = (h: string) => {
    const n = Number(h);
    if (!pricePerPlayerCents || !Number.isInteger(n) || n < 1) return '';
    return (Math.max(0, pricePerPlayerCents * n - money.keptCents) / 100).toFixed(2);
  };

  async function post(key: string, body: Record<string, unknown>, done?: (d: Record<string, unknown>) => string) {
    setBusy(key); setError(''); setNote('');
    const r = await dfetch<Record<string, unknown>>(`/api/operator/events/${eventId}/payments`, { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) { setBusy(''); setError(r.error); return null; }
    await reload();
    setBusy('');
    if (done) setNote(done(r.data ?? {}));
    return r.data ?? {};
  }

  async function copy(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(''), 2000); }
    catch { setError('Couldn’t copy — select the link and copy it by hand.'); }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="text-[15px] font-semibold text-ink">Money</h2>
        {live && (
          <div className="flex gap-2">
            <button onClick={() => { setMode(mode === 'link' ? '' : 'link'); setMade(null); setError(''); }} className={SECONDARY} aria-expanded={mode === 'link'}>Send a pay link</button>
            <button onClick={() => { setMode(mode === 'record' ? '' : 'record'); setError(''); }} className={SECONDARY} aria-expanded={mode === 'record'}>Record a payment</button>
          </div>
        )}
      </div>

      <div className="divide-y divide-line-soft text-[13.5px] max-w-lg">
        <div className="flex justify-between gap-3 py-1.5">
          <span className="text-ink">{pricePerPlayerCents ? `${usd(pricePerPlayerCents)} × ${money.headcount} player${money.headcount === 1 ? '' : 's'}` : 'Price per player not set'}
            <span className="ml-2 text-[12.5px] text-ink-muted">{pricePerPlayerCents ? (money.headcountConfirmed ? 'headcount confirmed' : 'headcount not confirmed yet') : 'set it in Change details'}</span></span>
          <span className="tabular-nums text-ink">{pricePerPlayerCents ? usd(money.totalCents) : '—'}</span>
        </div>
        <div className="flex justify-between gap-3 py-1.5"><span className="text-ink">Paid</span><span className="tabular-nums text-ink">{usd(money.paidCents)}</span></div>
        {money.refundedCents > 0 && <div className="flex justify-between gap-3 py-1.5"><span className="text-ink">Refunded</span><span className="tabular-nums text-ink">−{usd(money.refundedCents)}</span></div>}
        {money.openCents > 0 && <div className="flex justify-between gap-3 py-1.5"><span className="text-ink">Sent, not paid yet</span><span className="tabular-nums text-ink-soft">{usd(money.openCents)}</span></div>}
        {pricePerPlayerCents > 0 && <div className="flex justify-between gap-3 py-1.5 font-semibold"><span className="text-ink">Still owed</span><span className="tabular-nums text-ink">{usd(money.owedCents)}</span></div>}
      </div>

      {(error || note) && <p role={error ? 'alert' : 'status'} className={'mt-3 text-[13.5px] ' + (error ? 'text-bad' : 'text-ink')}>{error || note}</p>}

      {mode === 'link' && (
        <form className="mt-4 bg-paper/70 rounded-md p-4 space-y-3 max-w-lg" onSubmit={async e => {
          e.preventDefault();
          const r = await post('link', { action: 'link', ...link, via: link.via === 'none' ? null : link.via });
          if (r) { setMade({ payUrl: String(r.payUrl ?? ''), sent: (r.sent as string | null) ?? null, sendError: (r.sendError as string | null) ?? null }); }
        }}>
          <div><span className="block text-[13px] font-medium text-ink mb-1.5">What it’s for</span>
            <Segmented label="What it’s for" value={link.kind} options={KINDS} onChange={k => setLink(l => ({ ...l, kind: k, amount: k === 'balance' ? balanceFor(l.headcount) : l.amount }))} /></div>
          {link.kind === 'balance' && (
            <div>
              <label className="block"><span className="block text-[13px] font-medium text-ink mb-1.5">Final headcount</span>
                <input type="number" min={1} max={1000} inputMode="numeric" required className={INPUT + ' w-32'} value={link.headcount}
                  onChange={e => setLink(l => ({ ...l, headcount: e.target.value, amount: balanceFor(e.target.value) || l.amount }))} /></label>
              {pricePerPlayerCents > 0 && <p className="text-[12.5px] text-ink-muted mt-1">{usd(pricePerPlayerCents)} × the headcount, less the {usd(money.keptCents)} already paid. Change the amount if you need to.</p>}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1.5">Amount</span>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                <input inputMode="decimal" required className={INPUT + ' w-full pl-7'} value={link.amount} onChange={e => setLink(l => ({ ...l, amount: e.target.value }))} /></div></label>
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1.5">Shown to them as <span className="font-normal text-ink-muted">(optional)</span></span>
              <input className={INPUT + ' w-full'} maxLength={80} value={link.label} placeholder={link.kind === 'deposit' ? 'Deposit' : link.kind === 'balance' ? 'Balance' : 'Payment'} onChange={e => setLink(l => ({ ...l, label: e.target.value }))} /></label>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1.5">To</span><input className={INPUT + ' w-full'} value={link.payerName} onChange={e => setLink(l => ({ ...l, payerName: e.target.value }))} /></label>
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1.5">Email</span><input type="email" className={INPUT + ' w-full'} value={link.payerEmail} onChange={e => setLink(l => ({ ...l, payerEmail: e.target.value }))} /></label>
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1.5">Mobile</span><input type="tel" className={INPUT + ' w-full'} value={link.payerPhone} onChange={e => setLink(l => ({ ...l, payerPhone: e.target.value }))} /></label>
          </div>
          <div><span className="block text-[13px] font-medium text-ink mb-1.5">Send it by</span>
            <Segmented label="Send it by" value={link.via} options={[['email', 'Email'], ['sms', 'Text'], ['none', 'I’ll send it myself']] as const} onChange={v => setLink(l => ({ ...l, via: v }))} /></div>
          <div className="flex gap-2">
            <button type="submit" disabled={!!busy} className={PRIMARY}>{busy === 'link' ? 'Making the link…' : link.via === 'none' ? 'Make the link' : 'Send the link'}</button>
            <button type="button" onClick={() => setMode('')} className={SECONDARY}>Close</button>
          </div>
          {made && (
            <div className="border-l-[3px] border-ok pl-3 text-[13.5px] text-ink">
              <p>{made.sent ? `Sent by ${made.sent === 'sms' ? 'text' : 'email'}.` : made.sendError ? `The link is ready, but ${made.sendError.charAt(0).toLowerCase()}${made.sendError.slice(1)} Copy it and send it yourself:` : 'The link is ready — copy it and send it:'}</p>
              <div className="flex gap-2 mt-1.5"><input readOnly className={INPUT + ' flex-1 text-[12.5px]'} value={made.payUrl} onFocus={e => e.target.select()} />
                <button type="button" onClick={() => copy(made.payUrl, 'made')} className={SECONDARY}>{copied === 'made' ? 'Copied' : 'Copy'}</button></div>
            </div>
          )}
        </form>
      )}

      {mode === 'record' && (
        <form className="mt-4 bg-paper/70 rounded-md p-4 space-y-3 max-w-lg" onSubmit={async e => {
          e.preventDefault();
          if (await post('record', { action: 'record', ...rec }, () => 'Payment recorded.')) { setMode(''); setRec(r => ({ ...r, amount: '', note: '', label: '' })); }
        }}>
          <div><span className="block text-[13px] font-medium text-ink mb-1.5">What it’s for</span>
            <Segmented label="What it’s for" value={rec.kind} options={KINDS} onChange={k => setRec(r => ({ ...r, kind: k }))} /></div>
          <div><span className="block text-[13px] font-medium text-ink mb-1.5">How it was paid</span>
            <Segmented label="How it was paid" value={rec.method} options={HOW} onChange={m => setRec(r => ({ ...r, method: m }))} /></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1.5">Amount</span>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                <input inputMode="decimal" required className={INPUT + ' w-full pl-7'} value={rec.amount} onChange={e => setRec(r => ({ ...r, amount: e.target.value }))} /></div></label>
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1.5">From</span><input className={INPUT + ' w-full'} value={rec.payerName} onChange={e => setRec(r => ({ ...r, payerName: e.target.value }))} /></label>
          </div>
          <label className="block"><span className="block text-[13px] font-medium text-ink mb-1.5">Note <span className="font-normal text-ink-muted">(check number, receipt…)</span></span><input className={INPUT + ' w-full'} maxLength={300} value={rec.note} onChange={e => setRec(r => ({ ...r, note: e.target.value }))} /></label>
          <p className="text-[12.5px] text-ink-muted">Nothing is charged — this records money the course already took.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={!!busy} className={PRIMARY}>{busy === 'record' ? 'Saving…' : 'Record it'}</button>
            <button type="button" onClick={() => setMode('')} className={SECONDARY}>Close</button>
          </div>
        </form>
      )}

      {payments.length > 0 && (
        <ul className="divide-y divide-line-soft mt-4">
          {payments.map(p => {
            const left = p.amountCents - p.refundedCents;
            return (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <div className="text-[13.5px] text-ink">{p.label} <span className="text-ink-muted">· {p.methodLabel}{p.payerName ? ` · ${p.payerName}` : ''}</span></div>
                    <div className="text-[12px] text-ink-muted">{p.status === 'paid' ? `Paid ${day(p.paidAt ?? p.createdAt)}` : `Sent ${day(p.createdAt)}`}{p.note ? ` · ${p.note}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-[13.5px] text-ink">{usd(p.amountCents)}</span>
                    {p.status === 'paid' ? <StatusDot status={p.refundedCents >= p.amountCents ? 'neutral' : 'ok'} label={p.refundedCents >= p.amountCents ? 'Refunded' : p.refundedCents ? 'Part refunded' : 'Paid'} />
                      : p.status === 'void' ? <StatusDot status="neutral" label="Cancelled" />
                      : <StatusDot status="warn" label={p.status !== 'paying' ? 'Waiting' : p.stuck ? 'Couldn\u2019t confirm with Stripe yet — reload in a few minutes' : 'Paying now'} />}
                  </div>
                </div>

                {p.status === 'open' && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                    {/* On a cancelled event an open link can still be closed or marked paid — never sent again. */}
                    {live && p.payUrl && <button onClick={() => copy(p.payUrl!, p.id)} className={LINK}>{copied === p.id ? 'Copied' : 'Copy link'}</button>}
                    {live && p.payerEmail && <button disabled={!!busy} onClick={() => post('resend' + p.id, { action: 'resend', paymentId: p.id, via: 'email' }, () => 'Emailed again.')} className={LINK}>Email again</button>}
                    {live && p.payerPhone && <button disabled={!!busy} onClick={() => post('resend' + p.id, { action: 'resend', paymentId: p.id, via: 'sms' }, () => 'Texted again.')} className={LINK}>Text again</button>}
                    <button onClick={() => setPaidOther(paidOther?.id === p.id ? null : { id: p.id, method: 'cash' })} className={LINK}>Paid another way</button>
                    <button disabled={!!busy} onClick={() => post('void' + p.id, { action: 'void', paymentId: p.id }, () => 'Link cancelled — it can’t be paid now.')} className={LINK}>{busy === 'void' + p.id ? 'Cancelling…' : 'Cancel link'}</button>
                  </div>
                )}
                {paidOther?.id === p.id && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Segmented label="How it was paid" value={paidOther.method} options={HOW} onChange={m => setPaidOther({ id: p.id, method: m })} />
                    <button disabled={!!busy} onClick={async () => { if (await post('other' + p.id, { action: 'paid_other', paymentId: p.id, method: paidOther.method }, () => 'Marked paid. The link was closed.')) setPaidOther(null); }} className={SECONDARY}>{busy === 'other' + p.id ? 'Saving…' : 'Mark paid'}</button>
                  </div>
                )}

                {p.refunds.map(r => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-3 text-[12.5px] mt-1.5">
                    <span className="text-ink-soft">Refund −{usd(r.amountCents)} {day(r.createdAt)}{r.reason ? ` · ${r.reason}` : ''}</span>
                    {r.status === 'pending' && <><StatusDot status="warn" label="Not confirmed by Stripe yet" />
                      {canRefund && <button disabled={!!busy} onClick={() => post('retry' + r.id, { action: 'refund_retry', refundId: r.id }, d => d.refund === 'done' ? 'Refund went through.' : 'Stripe still hasn’t confirmed it — try again in a few minutes.')} className={LINK}>Try again</button>}</>}
                    {r.status === 'failed' && <StatusDot status="bad" label={`Didn’t go through: ${r.error}`} />}
                  </div>
                ))}

                {p.status === 'paid' && left > 0 && canRefund && (
                  refund?.id !== p.id
                    ? <button onClick={() => setRefund({ id: p.id, amount: (left / 100).toFixed(2), reason: '', confirm: false })} className={LINK + ' mt-1.5'}>Refund</button>
                    : (
                      <div className="mt-2 bg-paper/70 rounded-md p-3 space-y-2 max-w-lg">
                        <div className="grid sm:grid-cols-[140px_1fr] gap-2">
                          <label className="block"><span className="block text-[12.5px] font-medium text-ink mb-1">Amount</span>
                            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                              <input inputMode="decimal" className={INPUT + ' w-full pl-7'} value={refund.amount} onChange={e => setRefund({ ...refund, amount: e.target.value, confirm: false })} /></div></label>
                          <label className="block"><span className="block text-[12.5px] font-medium text-ink mb-1">Reason <span className="font-normal text-ink-muted">(for your records)</span></span>
                            <input className={INPUT + ' w-full'} maxLength={300} value={refund.reason} onChange={e => setRefund({ ...refund, reason: e.target.value })} /></label>
                        </div>
                        <p className="text-[12.5px] text-ink-soft">{p.method === 'link' ? 'Goes back to the card they paid with. It can’t be undone.' : 'Recorded only — hand the money back yourself.'} Up to {usd(left)} can be refunded.</p>
                        <div className="flex gap-2">
                          {!refund.confirm
                            ? <button onClick={() => setRefund({ ...refund, confirm: true })} className={SECONDARY}>Refund ${refund.amount || '0'}</button>
                            : <button disabled={!!busy} onClick={async () => { if (await post('refund' + p.id, { action: 'refund', paymentId: p.id, amount: refund.amount, reason: refund.reason }, d => d.refund === 'done' ? 'Refunded.' : 'Sent to Stripe — it hasn’t confirmed yet. Check back in a few minutes.')) setRefund(null); }}
                                className={BTN + ' bg-bad text-white'}>{busy === 'refund' + p.id ? 'Refunding…' : `Yes, refund $${refund.amount}`}</button>}
                          <button onClick={() => setRefund(null)} className={SECONDARY}>Close</button>
                        </div>
                      </div>
                    )
                )}
              </li>
            );
          })}
        </ul>
      )}
      {payments.length === 0 && <p className="text-[13.5px] text-ink-muted mt-3">No payments yet.</p>}
    </Card>
  );
}
