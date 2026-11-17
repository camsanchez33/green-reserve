'use client';
// W2-9b: an event's money (Cam 2026-10-22: "completely up to the courses on how
// to handle/charge money"). What the event comes to, what's been paid, and
// every payment: a pay link the organizer opens on their phone, or one taken
// at the course (cash, check, the course's own card machine). Any amount, any
// number of them. Refunds when the course decides to give one. Every action
// shows its pending state, then the result or the server's reason.
// EVENTS-3 (Cam 2026-11-17; mockup lanes/dashboard/events-mockup.html, Payments tab): the payments as rows (date,
// from, how, amount, status), each opening its own pop-up with its links, refunds and "Paid another way"; Send a pay
// link and the plus (Record a payment) open pop-ups; The bill sums it up. The handlers are unchanged.
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import SmsConsentAsk from '@/components/dashboard/SmsConsentAsk';
import { useState } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { dfetch } from '@/lib/dashboard-fetch';
import { formatTeeDay } from '@/lib/format';
import { Popup, PopupFoot, PlusButton, Block, LINK, PRIMARY, DANGER, FIELD, LABEL } from '@/components/dashboard/schedule/ui';
import { Section, KV, Chevron, DownChevron, MailIcon, TOOL, usd2 as usd, RED_LINK } from './ui';

export type EventRefund = { id: string; amountCents: number; status: string; reason: string; error: string; createdBy: string; createdAt: string };
export type EventPayment = {
  id: string; kind: string; label: string; amountCents: number; feeCents: number; method: string; methodLabel: string; status: string;
  paidAt: string | null; createdAt: string; payerName: string; payerEmail: string; payerPhone: string; headcount: number | null; note: string;
  refundedCents: number; createdBy: string; payUrl: string | null; refunds: EventRefund[];
  /** 'paying' for longer than a charge can take: Stripe couldn't be asked yet. */
  stuck: boolean;
  /** W2-9c: a player's own payment; null = the organizer's. */
  playerId: string | null;
  /** W2-9d: a sign-up group's one payment for everyone in it; '' = not a group's. */
  groupKey: string;
};
export type Money = { headcount: number; headcountConfirmed: boolean; totalCents: number; paidCents: number; refundedCents: number; keptCents: number; openCents: number; owedCents: number };

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** A payment row: date · from · how · amount · status · chevron (a phone keeps date, from and amount). */
const PAYROW = 'grid grid-cols-[48px_minmax(0,1fr)_auto_16px] md:grid-cols-[52px_minmax(0,1fr)_150px_96px_120px_16px] gap-3 items-center';
const KINDS = [['deposit', 'Deposit'], ['balance', 'Balance'], ['other', 'Other']] as const;
const HOW = [['cash', 'Cash'], ['check', 'Check'], ['card_counter', 'Card at the course'], ['other', 'Other']] as const;

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={'px-3 py-1.5 min-h-[36px] rounded-[10px] border text-[13px] ' + (value === k ? 'border-ink text-ink font-semibold shadow-[inset_0_0_0_1px_var(--color-ink)]' : 'border-line bg-paper text-ink-soft hover:text-ink')}>{l}</button>
      ))}
    </div>
  );
}

/** Organizer events: the number they guaranteed, and when it's due (Cam 2026-10-24). */
export type Guarantee = { due: string | null; players: number | null; at: string | null; today: string; onList: number };

export default function EventMoney({ eventId, live, pricePerPlayerCents, organizer, money, payments, canRefund, reload, guarantee }: {
  eventId: string; live: boolean; pricePerPlayerCents: number; guarantee: Guarantee | null;
  organizer: { name: string; email: string; phone: string };
  money: Money; payments: EventPayment[]; canRefund: boolean; reload: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'' | 'link' | 'record'>('');
  // Events audit 23: recording money taken another way needs "Mark paid at the counter" (the route checks it too).
  const canRecord = useDashboardAccess().can('sheet.counter_payment');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [made, setMade] = useState<{ payUrl: string; sent: string | null; sendError: string | null } | null>(null);
  const [copied, setCopied] = useState('');
  const [link, setLink] = useState({ kind: 'deposit' as 'deposit' | 'balance' | 'other', amount: '', label: '', headcount: String(money.headcount || ''), payerName: organizer.name, payerEmail: organizer.email, payerPhone: organizer.phone, via: (organizer.email ? 'email' : organizer.phone ? 'sms' : 'none') as 'email' | 'sms' | 'none' });
  // SMS-1: the payer said yes to texts after staff read the script. Never on by default.
  const [smsYes, setSmsYes] = useState(false);
  const [rec, setRec] = useState({ kind: 'deposit' as 'deposit' | 'balance' | 'other', amount: '', method: 'cash' as string, payerName: organizer.name, label: '', note: '' });
  const [paidOther, setPaidOther] = useState<{ id: string; method: string } | null>(null);
  const [refund, setRefund] = useState<{ id: string; amount: string; reason: string; confirm: boolean } | null>(null);
  // W2-9c: players' own payments are folded under one line (a big outing has one per player).
  const [showPlayers, setShowPlayers] = useState(false);
  const [guaranteeInput, setGuaranteeInput] = useState<string | null>(null);
  // EVENTS-3: a payment opens in its own pop-up (its links, refunds, Paid another way).
  const [openPay, setOpenPay] = useState<string | null>(null);
  const showGuarantee = !!guarantee && (guarantee.due != null || guarantee.players != null);
  const pastDue = !!guarantee?.due && guarantee.players == null && guarantee.today > guarantee.due;
  const playerPays = payments.filter(p => p.playerId || p.kind === 'player');
  const playersPaid = playerPays.filter(p => p.status === 'paid').length;
  const playersWaiting = playerPays.filter(p => p.status === 'open' || p.status === 'paying').length;
  const shown = payments.filter(p => showPlayers || !(p.playerId || p.kind === 'player'));

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

  async function saveGuarantee(value: string) {
    setBusy('guarantee'); setError(''); setNote('');
    const r = await dfetch(`/api/operator/events/${eventId}`, { method: 'PATCH', body: JSON.stringify({ action: 'guarantee', guaranteedPlayers: value }) });
    if (!r.ok) { setBusy(''); setError(r.error); return; }
    await reload();
    setBusy(''); setGuaranteeInput(null);
    setNote(value ? `Guaranteed headcount saved: ${value}.` : 'Guaranteed headcount cleared.');
  }

  async function copy(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(''), 2000); }
    catch { setError('Couldn’t copy — select the link and copy it by hand.'); }
  }

  const payRow = (p: EventPayment) => {
    const refunded = p.status === 'paid' && p.refundedCents >= p.amountCents;
    const st = p.status === 'paid' ? (refunded ? 'Refunded' : p.refundedCents ? 'Part refunded' : 'Paid') : p.status === 'void' ? 'Cancelled' : p.status === 'paying' ? (p.stuck ? 'Checking' : 'Paying now') : 'Waiting';
    const tone = p.status === 'paid' ? (refunded ? 'neutral' : 'ok') : p.status === 'void' ? 'neutral' : 'warn';
    return (
      <button key={p.id} type="button" onClick={() => { setOpenPay(p.id); setError(''); setNote(''); setPaidOther(null); setRefund(null); }}
        className={PAYROW + ' w-full text-left border-t border-line px-2.5 py-3 min-h-[56px] hover:bg-paper'}>
        <span><b className="block font-semibold text-[14px]">{day(p.status === 'paid' ? p.paidAt ?? p.createdAt : p.createdAt)}</b></span>
        <span className="min-w-0"><b className="block font-semibold truncate">{p.payerName || 'No name'}</b><small className="block text-[12px] text-ink-muted truncate">{p.label}<span className="md:hidden"> · {st}</span></small></span>
        <span className="max-md:hidden text-[13.5px] font-medium truncate">{p.methodLabel}</span>
        <span className="text-[13.5px] font-medium tabular-nums text-right md:text-left">{usd(p.amountCents)}</span>
        <span className="max-md:hidden text-[13px]"><StatusDot status={tone} label={st} /></span>
        <Chevron />
      </button>
    );
  };
  const pay = openPay ? payments.find(p => p.id === openPay) ?? null : null;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 pt-3.5 pb-2.5">
        <span className="text-[12.5px] text-ink-muted mr-auto">Every payment here also counts in Revenue under Events.</span>
        {live && <button type="button" className={TOOL} onClick={() => { setMode('link'); setMade(null); setError(''); setNote(''); setLink(l => ({ ...l, headcount: String(money.headcount || '') })); }}><MailIcon /><span>Send a pay link</span></button>}
        {live && canRecord && <PlusButton label="Record a payment" onClick={() => { setMode('record'); setError(''); setNote(''); }} />}
      </div>

      {!mode && !pay && (error || note) && <p role={error ? 'alert' : 'status'} className={'px-1 pb-2 text-[13.5px] ' + (error ? 'text-bad' : 'text-ink')}>{error || note}</p>}

      <section className="flex flex-col">
        <div className={PAYROW + ' max-md:hidden px-2.5 pb-1.5 text-[12px] text-ink-muted'}><span>Date</span><span>From</span><span>How</span><span>Amount</span><span>Status</span><span /></div>
        {shown.map(payRow)}
        {payments.length === 0 && <p className="px-2.5 py-4 border-t border-line text-[13.5px] text-ink-muted">No payments yet.</p>}
        {playerPays.length > 0 && (
          <button type="button" onClick={() => setShowPlayers(v => !v)} aria-expanded={showPlayers} className="flex items-center gap-1.5 text-left px-2.5 py-3 min-h-[44px] border-t border-line text-[13px] text-ink-soft hover:text-ink">
            <DownChevron open={showPlayers} />Players’ own payments · {playersPaid} paid{playersWaiting ? `, ${playersWaiting} waiting` : ''}
          </button>
        )}
      </section>

      {showGuarantee && guarantee && (
        <Section title="Final headcount">
          <KV k="Guaranteed" onEdit={live ? () => { setGuaranteeInput(guarantee.players != null ? String(guarantee.players) : ''); setError(''); } : undefined} editLabel={guarantee.players != null ? 'Change the headcount' : 'Record the headcount'}>
            {guarantee.players != null ? `${guarantee.players} players` : <span className={pastDue ? 'text-warn' : ''}>Not given yet{guarantee.due ? ` · ${pastDue ? 'was due' : 'due'} ${formatTeeDay(guarantee.due)}` : ''}</span>}
          </KV>
          <KV k="On the list">{guarantee.onList}{guarantee.at ? ` · given ${day(guarantee.at)}` : ''}</KV>
          {pastDue && <p className="px-1 py-1 text-[12.5px] text-ink-soft">Ask the organizer for their number. Until you have it, the bill counts the players on the list, or the number expected while the list is empty.</p>}
        </Section>
      )}

      <Section title="The bill">
        <KV k={pricePerPlayerCents ? `${money.headcount} players × ${usd(pricePerPlayerCents)}` : 'Price per player'}>
          {pricePerPlayerCents ? <>{usd(money.totalCents)} <span className="text-[12.5px] font-normal text-ink-muted">· {money.headcountConfirmed ? 'headcount confirmed' : guarantee?.players != null ? 'the guarantee or the list, whichever is more' : 'headcount not confirmed yet'}</span></> : 'Not set. Set it under Change details.'}
        </KV>
        <KV k="Collected">−{usd(money.keptCents)}</KV>
        {money.refundedCents > 0 && <KV k="Refunded">{usd(money.refundedCents)} <span className="text-[12.5px] font-normal text-ink-muted">· already taken off Collected</span></KV>}
        {money.openCents > 0 && <KV k="Sent, not paid yet">{usd(money.openCents)}</KV>}
        {pricePerPlayerCents > 0 && <KV k="Owed" total>{usd(money.owedCents)}</KV>}
      </Section>

      {guaranteeInput !== null && guarantee && (
        <Popup title="Final headcount" onClose={() => setGuaranteeInput(null)}>
          <label className={LABEL + ' max-w-[200px]'}>Players the organizer guarantees
            <input type="number" min={1} max={1000} inputMode="numeric" className={FIELD} value={guaranteeInput} onChange={e => setGuaranteeInput(e.target.value)} />
          </label>
          <p className="text-[12.5px] text-ink-muted">The balance bills the higher of this and the players on the list.</p>
          {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
          <div className="flex items-center gap-3 pt-1">
            {guarantee.players != null ? <button type="button" disabled={!!busy} className={RED_LINK} onClick={() => saveGuarantee('')}>Clear it</button> : <button type="button" className={LINK} onClick={() => setGuaranteeInput(null)}>Cancel</button>}
            <span className="flex-1" />
            <button type="button" disabled={!!busy || !guaranteeInput.trim()} className={PRIMARY} onClick={() => saveGuarantee(guaranteeInput.trim())}>{busy === 'guarantee' ? 'Saving…' : 'Save'}</button>
          </div>
        </Popup>
      )}

      {mode === 'link' && (
        <Popup title="Send a pay link" onClose={() => setMode('')}>
          <form className="flex flex-col gap-4" onSubmit={async e => {
            e.preventDefault();
            const r = await post('link', { action: 'link', ...link, via: link.via === 'none' ? null : link.via, ...(link.via === 'sms' && smsYes ? { smsConsent: 'verbal' } : {}) });
            if (r) { setMade({ payUrl: String(r.payUrl ?? ''), sent: (r.sent as string | null) ?? null, sendError: (r.sendError as string | null) ?? null }); }
          }}>
            <Block label="What it’s for"><Segmented label="What it’s for" value={link.kind} options={KINDS} onChange={k => setLink(l => ({ ...l, kind: k, amount: k === 'balance' ? balanceFor(l.headcount) : l.amount }))} /></Block>
            {link.kind === 'balance' && (
              <div>
                <label className={LABEL + ' max-w-[200px]'}>Final headcount
                  <input type="number" min={1} max={1000} inputMode="numeric" required className={FIELD} value={link.headcount}
                    onChange={e => setLink(l => ({ ...l, headcount: e.target.value, amount: balanceFor(e.target.value) || l.amount }))} /></label>
                {pricePerPlayerCents > 0 && <p className="text-[12.5px] text-ink-muted mt-1">{usd(pricePerPlayerCents)} × the headcount, less the {usd(money.keptCents)} already paid. Change the amount if you need to.</p>}
                {guarantee?.players != null && Number(link.headcount) > 0 && Number(link.headcount) < guarantee.players && (
                  <p className="text-[12.5px] text-warn mt-1">That’s fewer than the {guarantee.players} they guaranteed. You can still bill fewer if you choose.</p>
                )}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className={LABEL}>Amount
                <span className="flex items-center gap-1 border border-line bg-paper rounded-[10px] px-2.5 focus-within:border-ink-soft"><span className="text-ink-muted text-[13.5px]" aria-hidden="true">$</span>
                  <input inputMode="decimal" required aria-label="Amount" className="w-full bg-transparent border-0 outline-none py-2 text-[13.5px] text-ink tabular-nums" value={link.amount} onChange={e => setLink(l => ({ ...l, amount: e.target.value }))} /></span></label>
              <label className={LABEL}>Shown to them as (optional)
                <input className={FIELD} maxLength={80} value={link.label} onChange={e => setLink(l => ({ ...l, label: e.target.value }))} /></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <label className={LABEL}>To<input className={FIELD} value={link.payerName} onChange={e => setLink(l => ({ ...l, payerName: e.target.value }))} /></label>
              <label className={LABEL}>Email<input type="email" className={FIELD} value={link.payerEmail} onChange={e => setLink(l => ({ ...l, payerEmail: e.target.value }))} /></label>
              <label className={LABEL}>Mobile<input type="tel" className={FIELD} value={link.payerPhone} onChange={e => { setLink(l => ({ ...l, payerPhone: e.target.value })); setSmsYes(false); }} /></label>
            </div>
            <Block label="Send it by"><Segmented label="Send it by" value={link.via} options={[['email', 'Email'], ['sms', 'Text'], ['none', 'I’ll send it myself']] as const} onChange={v => setLink(l => ({ ...l, via: v }))} /></Block>
            {link.via === 'sms' && link.payerPhone.replace(/\D/g, '').length >= 10 && <SmsConsentAsk courseName="" checked={smsYes} onChange={setSmsYes} />}
            {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
            {made && (
              <div className="border-l-[3px] border-ok pl-3 text-[13.5px] text-ink">
                <p>{made.sent ? `Sent by ${made.sent === 'sms' ? 'text' : 'email'}.` : made.sendError ? `The link is ready, but ${made.sendError.charAt(0).toLowerCase()}${made.sendError.slice(1)} Copy it and send it yourself:` : 'The link is ready. Copy it and send it:'}</p>
                <div className="flex gap-2 mt-1.5 items-center"><input readOnly aria-label="Pay link" className={FIELD + ' flex-1 text-[12.5px]'} value={made.payUrl} onFocus={e => e.target.select()} />
                  <button type="button" onClick={() => copy(made.payUrl, 'made')} className={LINK}>{copied === 'made' ? 'Copied' : 'Copy'}</button></div>
              </div>
            )}
            <PopupFoot onCancel={() => setMode('')} cancel={made ? 'Close' : 'Cancel'}>
              {!made && <button type="submit" disabled={!!busy} className={PRIMARY}>{busy === 'link' ? 'Making the link…' : link.via === 'none' ? 'Make the link' : 'Send the link'}</button>}
            </PopupFoot>
          </form>
        </Popup>
      )}

      {mode === 'record' && (
        <Popup title="Record a payment" onClose={() => setMode('')}>
          <form className="flex flex-col gap-4" onSubmit={async e => {
            e.preventDefault();
            if (await post('record', { action: 'record', ...rec }, () => 'Payment recorded.')) { setMode(''); setRec(r => ({ ...r, amount: '', note: '', label: '' })); }
          }}>
            <Block label="What it’s for"><Segmented label="What it’s for" value={rec.kind} options={KINDS} onChange={k => setRec(r => ({ ...r, kind: k }))} /></Block>
            <Block label="How it was paid"><Segmented label="How it was paid" value={rec.method} options={HOW} onChange={m => setRec(r => ({ ...r, method: m }))} /></Block>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className={LABEL}>Amount
                <span className="flex items-center gap-1 border border-line bg-paper rounded-[10px] px-2.5 focus-within:border-ink-soft"><span className="text-ink-muted text-[13.5px]" aria-hidden="true">$</span>
                  <input inputMode="decimal" required aria-label="Amount" className="w-full bg-transparent border-0 outline-none py-2 text-[13.5px] text-ink tabular-nums" value={rec.amount} onChange={e => setRec(r => ({ ...r, amount: e.target.value }))} /></span></label>
              <label className={LABEL}>From<input className={FIELD} value={rec.payerName} onChange={e => setRec(r => ({ ...r, payerName: e.target.value }))} /></label>
            </div>
            <label className={LABEL}>Note (check number, receipt)<input className={FIELD} maxLength={300} value={rec.note} onChange={e => setRec(r => ({ ...r, note: e.target.value }))} /></label>
            <p className="text-[12.5px] text-ink-muted">Nothing is charged. This records money the course already took.</p>
            {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
            <PopupFoot onCancel={() => setMode('')}>
              <button type="submit" disabled={!!busy} className={PRIMARY}>{busy === 'record' ? 'Saving…' : 'Record it'}</button>
            </PopupFoot>
          </form>
        </Popup>
      )}

      {pay && (() => {
        const p = pay;
        const left = p.amountCents - p.refundedCents;
        return (
          <Popup title={p.label} onClose={() => { setOpenPay(null); setRefund(null); setPaidOther(null); }}>
            <div>
              <KV k="From">{[p.payerName, p.payerEmail, p.payerPhone].filter(Boolean).join(' · ') || '—'}</KV>
              <KV k="Amount">{usd(p.amountCents)}{p.feeCents ? <span className="text-[12.5px] font-normal text-ink-muted"> + {usd(p.feeCents)} fee</span> : null}</KV>
              <KV k="How">{p.methodLabel}</KV>
              <KV k={p.status === 'paid' ? 'Paid' : 'Sent'}>{day(p.status === 'paid' ? p.paidAt ?? p.createdAt : p.createdAt)}{p.createdBy ? ` · by ${p.createdBy}` : ''}</KV>
              <KV k="Status">{p.status === 'paid' ? <StatusDot status={p.refundedCents >= p.amountCents ? 'neutral' : 'ok'} label={p.refundedCents >= p.amountCents ? 'Refunded' : p.refundedCents ? 'Part refunded' : 'Paid'} />
                : p.status === 'void' ? <StatusDot status="neutral" label="Cancelled" />
                : <StatusDot status="warn" label={p.status !== 'paying' ? 'Waiting' : p.stuck ? 'Couldn’t confirm with Stripe yet. Reload in a few minutes.' : 'Paying now'} />}</KV>
              {p.headcount != null && <KV k="Headcount">{p.headcount}</KV>}
              {p.note && <KV k="Note">{p.note}</KV>}
              {p.refunds.map(r => (
                <KV key={r.id} k={`Refund ${day(r.createdAt)}`}>
                  <span className="flex flex-wrap items-center gap-x-3">−{usd(r.amountCents)}{r.reason ? <span className="font-normal text-ink-soft">{r.reason}</span> : null}
                    {r.status === 'pending' && <><StatusDot status="warn" label="Not confirmed by Stripe yet" />
                      {canRefund && <button type="button" disabled={!!busy} className={LINK} onClick={() => post('retry' + r.id, { action: 'refund_retry', refundId: r.id }, d => d.refund === 'done' ? 'Refund went through.' : 'Stripe still hasn’t confirmed it. Try again in a few minutes.')}>Try again</button>}</>}
                    {r.status === 'failed' && <StatusDot status="bad" label={`Didn’t go through: ${r.error}`} />}
                  </span>
                </KV>
              ))}
            </div>

            {(error || note) && <p role={error ? 'alert' : 'status'} className={'text-[13.5px] ' + (error ? 'text-bad' : 'text-ink')}>{error || note}</p>}

            {p.status === 'open' && !paidOther && (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {/* On a cancelled event an open link can still be closed or marked paid — never sent again. */}
                {live && p.payUrl && <button type="button" onClick={() => copy(p.payUrl!, p.id)} className={LINK}>{copied === p.id ? 'Copied' : 'Copy link'}</button>}
                {live && p.payerEmail && <button type="button" disabled={!!busy} onClick={() => post('resend' + p.id, { action: 'resend', paymentId: p.id, via: 'email' }, () => 'Emailed again.')} className={LINK}>Email again</button>}
                {live && p.payerPhone && <button type="button" disabled={!!busy} onClick={() => post('resend' + p.id, { action: 'resend', paymentId: p.id, via: 'sms' }, () => 'Texted again.')} className={LINK}>Text again</button>}
                {canRecord && <button type="button" onClick={() => setPaidOther({ id: p.id, method: 'cash' })} className={LINK}>Paid another way</button>}
                <button type="button" disabled={!!busy} onClick={() => post('void' + p.id, { action: 'void', paymentId: p.id }, () => 'Link cancelled. It can’t be paid now.')} className={RED_LINK}>{busy === 'void' + p.id ? 'Cancelling…' : 'Cancel link'}</button>
              </div>
            )}
            {paidOther?.id === p.id && (
              <Block label="Paid another way">
                <Segmented label="How it was paid" value={paidOther.method} options={HOW} onChange={m => setPaidOther({ id: p.id, method: m })} />
                <div className="flex items-center gap-3">
                  <button type="button" className={LINK} onClick={() => setPaidOther(null)}>Back</button>
                  <span className="flex-1" />
                  <button type="button" disabled={!!busy} className={PRIMARY} onClick={async () => { if (await post('other' + p.id, { action: 'paid_other', paymentId: p.id, method: paidOther.method }, () => 'Marked paid. The link was closed.')) setPaidOther(null); }}>{busy === 'other' + p.id ? 'Saving…' : 'Mark paid'}</button>
                </div>
              </Block>
            )}

            {p.status === 'paid' && left > 0 && canRefund && (
              refund?.id !== p.id
                ? <button type="button" onClick={() => setRefund({ id: p.id, amount: (left / 100).toFixed(2), reason: '', confirm: false })} className={LINK + ' self-start'}>Refund</button>
                : (
                  <Block label="Refund">
                    <div className="grid sm:grid-cols-[140px_1fr] gap-3">
                      <label className={LABEL}>Amount
                        <span className="flex items-center gap-1 border border-line bg-paper rounded-[10px] px-2.5 focus-within:border-ink-soft"><span className="text-ink-muted text-[13.5px]" aria-hidden="true">$</span>
                          <input inputMode="decimal" aria-label="Refund amount" className="w-full bg-transparent border-0 outline-none py-2 text-[13.5px] text-ink tabular-nums" value={refund.amount} onChange={e => setRefund({ ...refund, amount: e.target.value, confirm: false })} /></span></label>
                      <label className={LABEL}>Reason (for your records)<input className={FIELD} maxLength={300} value={refund.reason} onChange={e => setRefund({ ...refund, reason: e.target.value })} /></label>
                    </div>
                    <p className="text-[12.5px] text-ink-soft">{p.method === 'link' ? 'Goes back to the card they paid with. It can’t be undone.' : 'Recorded only: hand the money back yourself.'} Up to {usd(left)} can be refunded.</p>
                    <div className="flex items-center gap-3">
                      <button type="button" className={LINK} onClick={() => setRefund(null)}>Back</button>
                      <span className="flex-1" />
                      {!refund.confirm
                        ? <button type="button" onClick={() => setRefund({ ...refund, confirm: true })} className={PRIMARY}>Refund ${refund.amount || '0'}</button>
                        : <button type="button" disabled={!!busy} onClick={async () => { if (await post('refund' + p.id, { action: 'refund', paymentId: p.id, amount: refund.amount, reason: refund.reason }, d => d.refund === 'done' ? 'Refunded.' : 'Sent to Stripe. It hasn’t confirmed yet; check back in a few minutes.')) setRefund(null); }}
                            className={DANGER}>{busy === 'refund' + p.id ? 'Refunding…' : `Yes, refund $${refund.amount}`}</button>}
                    </div>
                  </Block>
                )
            )}

            <div className="flex items-center pt-1"><span className="flex-1" /><button type="button" className={LINK} onClick={() => { setOpenPay(null); setRefund(null); setPaidOther(null); }}>Close</button></div>
          </Popup>
        );
      })()}
    </div>
  );
}
