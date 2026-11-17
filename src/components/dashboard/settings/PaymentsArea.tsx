'use client';
// SETTINGS-6: Payments — Cancellations, Sales tax, Register. The cancellation policy, sales tax and card readers are
// the owner's alone (the routes refuse staff too); a staff login reads the policy and changes nothing here but
// "Takes cash" when the owner allowed "Edit course settings".
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LATE_FEE_TIMINGS } from '@/lib/cancel-policy';
import { dfetch } from '@/lib/dashboard-fetch';
import { StatusDot } from '@/components/ui/StatusDot';
import { toast } from '@/components/dashboard/Toast';
import { SalesTaxCard } from '@/components/dashboard/SalesTaxCard';
import { termsOf } from './BookingArea';
import { type Ctx, Group, Row, Muted, EditPopup, Field, FIELD, TextEdit, Choices, SwitchLine, Switch, LINK, plural, num } from './ui';

const s = (v: unknown) => (v == null ? '' : String(v));
const usd = (v: unknown) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(v || 0)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const per = (basis: unknown) => (basis === 'player' ? 'per player' : 'per booking');
const hrs = (h: number) => plural(h, 'hour');

type Pop = '' | 'card' | 'free' | 'late' | 'noshow' | 'auto' | 'repeat' | 'checkin' | 'rain' | 'tax' | 'addreader';
type Reader = { id: string; label: string; online: boolean; simulated: boolean; device: string };
type Readers = { readers: Reader[]; testMode: boolean; simulatedCode: string | null };
type Tax = { connected: boolean; active: boolean; missing: string[]; states: string[]; on: boolean };

function FeePopup({ ctx, title, hint, fee, basis, dflt, onClose }: {
  ctx: Ctx; title: string; hint: string; fee: 'lateCancellationFee' | 'noShowFee'; basis: 'lateFeeBasis' | 'noShowFeeBasis'; dflt: number;
  onClose: () => void;
}) {
  const f = ctx.form;
  const [on, setOn] = useState(!!f[fee]);
  const [amt, setAmt] = useState(s(f[fee] || dflt));
  const [b, setB] = useState(s(f[basis]) || 'booking');
  const [timing, setTiming] = useState(s(f.lateFeeTiming) || 'hold_at_cutoff');
  return (
    <EditPopup title={title} hint={hint} onClose={onClose}
      onSave={() => ctx.save({ [fee]: on ? Number(amt) || 0 : 0, [basis]: b, ...(fee === 'lateCancellationFee' && on ? { lateFeeTiming: timing } : {}) })}>
      <SwitchLine label={title} on={on} onChange={setOn} />
      {on && <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fee ($)"><input inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} className={FIELD} /></Field>
          <Field label="Charged"><select value={b} onChange={e => setB(e.target.value)} className={FIELD}><option value="booking">Per booking</option><option value="player">Per player</option></select></Field>
        </div>
        {fee === 'lateCancellationFee' && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-ink-muted">When the fee is taken</span>
            <Choices name="When the fee is taken" value={timing} onChange={setTiming} options={LATE_FEE_TIMINGS.map(t => ({ key: t.key, label: t.label, help: t.help }))} />
          </div>
        )}
      </>}
      <p className="text-[12.5px] text-ink-soft">Golfers who already booked keep the policy they booked under.</p>
    </EditPopup>
  );
}

function RepeatPopup({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const f = ctx.form;
  const [on, setOn] = useState(!!(f.onlineBlockNoShows || f.onlineBlockLateCancels));
  const [ns, setNs] = useState(s(f.onlineBlockNoShows ?? (on ? '' : 3)));
  const [lc, setLc] = useState(s(f.onlineBlockLateCancels ?? ''));
  const [mo, setMo] = useState(s(f.onlineBlockMonths ?? 12));
  return (
    <EditPopup title="Repeat no-shows" hint="After too many missed rounds, those golfers can no longer book online; they book by phone." onClose={onClose}
      onSave={() => ctx.save(on ? { onlineBlockNoShows: num(ns), onlineBlockLateCancels: num(lc), onlineBlockMonths: num(mo) ?? 12 } : { onlineBlockNoShows: null, onlineBlockLateCancels: null })}>
      <SwitchLine label="Repeat no-shows book by phone" on={on} onChange={setOn} />
      {on && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="No-shows"><input inputMode="numeric" value={ns} onChange={e => setNs(e.target.value)} className={FIELD} /></Field>
          <Field label="Late cancels"><input inputMode="numeric" value={lc} onChange={e => setLc(e.target.value)} className={FIELD} /></Field>
          <Field label="In months"><input inputMode="numeric" value={mo} onChange={e => setMo(e.target.value)} className={FIELD} /></Field>
        </div>
      )}
    </EditPopup>
  );
}

function AutoNoShowPopup({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [on, setOn] = useState(!!ctx.form.autoNoShowMinutes);
  const [m, setM] = useState(s(ctx.form.autoNoShowMinutes || 30));
  return (
    <EditPopup title="Mark no-shows automatically" hint="Checked hourly. Nothing is charged until midnight; “Undo no-show” or a check-in clears it." onClose={onClose}
      onSave={() => ctx.save({ autoNoShowMinutes: on ? num(m) : null })}>
      <SwitchLine label="Mark no-shows automatically" on={on} onChange={setOn} />
      {on && <Field label="Minutes after the tee time with nobody checked in"><input inputMode="numeric" value={m} onChange={e => setM(e.target.value)} className={FIELD} /></Field>}
    </EditPopup>
  );
}

/** CARD-1: "no card" IS both fees at $0 (cardRequired() in lib/cancel-policy); picking it clears them. */
function CardPopup({ ctx, cardNeeded, onClose }: { ctx: Ctx; cardNeeded: boolean; onClose: () => void }) {
  const [v, setV] = useState<'card' | 'none'>(cardNeeded ? 'card' : 'none');
  return (
    <EditPopup title="Card at booking" onClose={onClose}
      onSave={async () => (v === 'none' ? (cardNeeded ? ctx.save({ lateCancellationFee: 0, noShowFee: 0 }) : null) : cardNeeded ? null : ctx.save({ lateCancellationFee: 10 }))}>
      <Choices name="Card at booking" value={v} onChange={setV} options={[
        { key: 'card', label: 'Ask for a card at booking', help: 'Lets you charge a late-cancellation or no-show fee. Nothing is charged at booking.' },
        { key: 'none', label: 'No card at booking', help: 'Golfers book with their name and email, then get a link to check in and pay before their round. No late or no-show fees: there would be no card to charge.' },
      ]} />
      {v === 'card' && !cardNeeded && <p className="text-[12.5px] text-ink-soft">This turns on a $10 late-cancellation fee; change it under Late cancellation.</p>}
      <p className="text-[12.5px] text-ink-soft">Golfers who already booked keep the policy they booked under.</p>
    </EditPopup>
  );
}

/** The register's card readers (Stripe hardware, the owner's): a dot for online/offline, what to do when one is
 *  offline, Add a reader and Remove. */
function ReaderList({ list, onAdd, reload }: { list: Readers | null; onAdd: () => void; reload: () => void }) {
  const [busy, setBusy] = useState('');
  async function remove(r: Reader) {
    if (!confirm(`Remove ${r.label}? It stops taking payments until it is connected again.`)) return;
    setBusy(r.id);
    const res = await dfetch(`/api/operator/card-readers?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
    setBusy('');
    if (!res.ok) { toast(res.error); return; }
    toast(`${r.label} removed.`, 'ok');
    reload();
  }
  return (
    <div className="border-t border-line px-3 py-[11px]" id="r-register-readers">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[13.5px] font-medium text-ink">Card readers</span>
        <button type="button" className={LINK + ' min-h-[36px]'} onClick={onAdd}>Add a reader</button>
      </div>
      {!list ? <p className="text-[12.5px] text-ink-muted py-2">Loading…</p>
        : !list.readers.length ? <p className="text-[12.5px] text-ink-soft py-2">No reader yet. Add one to take tap, insert or swipe at the register, paid to your Stripe account.</p>
        : list.readers.map((r, i) => (
          <div key={r.id} className={'grid grid-cols-[14px_minmax(0,1fr)_auto] gap-2.5 items-start py-2.5 text-[13.5px] ' + (i ? 'border-t border-line' : '')}>
            <span className="mt-[3px]"><StatusDot status={r.online ? 'ok' : 'bad'} /></span>
            <div className="min-w-0">
              <b className="block font-medium text-ink">{r.label}</b>
              <small className="block mt-0.5 text-[12.5px] text-ink-soft">{r.online ? 'Online' : 'Offline'}{r.simulated ? ' · simulated (test mode)' : ''}</small>
              {!r.online && <small className="block mt-0.5 text-[12.5px] text-bad">Check it’s turned on and connected to Wi-Fi. It can’t take payments until it reconnects.</small>}
            </div>
            <button type="button" className={LINK + ' min-h-[36px]'} disabled={!!busy} onClick={() => remove(r)}>{busy === r.id ? 'Removing…' : 'Remove'}</button>
          </div>
        ))}
    </div>
  );
}

function AddReaderPopup({ list, onDone, onClose }: { list: Readers | null; onDone: () => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('Front counter');
  const add = async (withCode: string) => {
    const r = await dfetch<{ reader: Reader }>('/api/operator/card-readers', { method: 'POST', body: JSON.stringify({ code: withCode.trim(), label }) });
    if (!r.ok) return r.error;
    onDone();
    return null;
  };
  return (
    <EditPopup title="Add a card reader" saveLabel="Add reader" savedText="Reader connected. Pick “Card reader” at the register." canSave={!!code.trim()} onClose={onClose} onSave={() => add(code)}
      hint="Turn the reader on and connect it to Wi-Fi. In its settings choose “Generate pairing code”, then type the code it shows.">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Code on the reader"><input value={code} onChange={e => setCode(e.target.value)} autoComplete="off" className={FIELD} autoFocus /></Field>
        <Field label="Where it is"><input value={label} onChange={e => setLabel(e.target.value)} maxLength={60} className={FIELD} /></Field>
      </div>
      {list?.simulatedCode && (
        <p className="text-[12.5px] text-ink-soft">No reader yet? <button type="button" className={LINK} onClick={async () => { const e = await add(list.simulatedCode!); if (e) toast(e); else { toast('Simulated reader added.', 'ok'); onClose(); } }}>Add a simulated reader</button> to try the register (test mode only).</p>
      )}
    </EditPopup>
  );
}

export function PaymentsArea({ ctx }: { ctx: Ctx }) {
  const f = ctx.form;
  const [pop, setPop] = useState<Pop>('');
  const close = () => setPop('');
  const ownerEdit = ctx.owner ? (p: Pop) => () => setPop(p) : () => undefined;
  const t = termsOf(f);
  const late = Number(f.lateCancellationFee) > 0, noShow = Number(f.noShowFee) > 0;
  const hoursFree = Number(f.cancellationHours ?? 24);
  const repeatOn = !!(f.onlineBlockNoShows || f.onlineBlockLateCancels);
  const timing = LATE_FEE_TIMINGS.find(x => x.key === (s(f.lateFeeTiming) || 'hold_at_cutoff'));

  const [readers, setReaders] = useState<Readers | null>(null);
  const [tax, setTax] = useState<Tax | null>(null);
  const [cash, setCash] = useState(f.takesCash === true);
  const [cashBusy, setCashBusy] = useState(false);
  useEffect(() => { setCash(f.takesCash === true); }, [f.takesCash]);
  const loadReaders = useCallback(() => { dfetch<Readers>('/api/operator/card-readers').then(r => { if (r.ok) setReaders(r.data); else toast(`Couldn’t load your card readers — ${r.error}`); }); }, []);
  const loadTax = useCallback(() => { dfetch<Tax>('/api/operator/sales-tax').then(r => { if (r.ok) setTax(r.data); }); }, []);
  useEffect(() => { if (ctx.owner) { loadReaders(); loadTax(); } }, [ctx.owner, loadReaders, loadTax]);
  useEffect(() => { if (pop === '' && ctx.owner) loadTax(); }, [pop, ctx.owner, loadTax]);

  // HOME-3: one switch that saves itself. Today it decides only whether Home asks you to open the register.
  async function flipCash(next: boolean) {
    setCashBusy(true);
    const e = await ctx.save({ takesCash: next });
    setCashBusy(false);
    if (e) toast(`Couldn’t save — ${e}`); else toast(next ? 'Cash is on.' : 'Cash is off.', 'ok');
  }

  const taxValue = !tax ? '…' : !tax.connected ? <Muted>Connect payments first</Muted>
    : tax.on ? `Collecting on shop items${tax.states.length ? ` · registered in ${tax.states.join(', ')}` : ''}`
    : tax.active && tax.states.length ? 'Set up, turned off' : <Muted>Not set up</Muted>;

  return (
    <>
      <Group id="cancel" setup="cancellation-policy" title="Cancellations"
        note={ctx.owner ? 'Owner only. Golfers see this exact wording when they book and in their confirmation email, and keep the policy they booked under.' : 'Only the course owner’s login can change the cancellation policy.'}>
        <Row id="cancel-card" label="Card at booking" note="Golfers save a card online so a fee can be taken if they cancel late or don’t show." value={t.cardNeeded ? 'Asked for, nothing charged until check-in' : 'Not asked for'} onOpen={ownerEdit('card')} />
        {t.cardNeeded && <Row id="cancel-free" label="Free cancellation" note="Up to this point golfers cancel online and pay nothing." value={`Until ${hrs(hoursFree)} before`} onOpen={ownerEdit('free')} />}
        {t.cardNeeded && <Row id="cancel-late" label="Late cancellation" note={late ? timing?.label : 'Taken from the saved card after free cancellation ends.'} value={late ? `${usd(f.lateCancellationFee)} ${per(f.lateFeeBasis)}` : 'Off'} onOpen={ownerEdit('late')} />}
        {t.cardNeeded && <Row id="cancel-noshow" label="No-show" note="Charged at midnight when a group marked a no-show never checked in." value={noShow ? `${usd(f.noShowFee)} ${per(f.noShowFeeBasis)}` : 'Off'} onOpen={ownerEdit('noshow')} />}
        <Row id="cancel-auto" label="Mark no-shows automatically" note="When nobody in the group checks in." value={f.autoNoShowMinutes ? `${f.autoNoShowMinutes} minutes after the time` : 'Off'} onOpen={ownerEdit('auto')} />
        <Row id="cancel-repeat" label="Repeat no-shows" note="Those golfers can no longer book online." value={repeatOn
          ? `Phone only after ${[f.onlineBlockNoShows && plural(Number(f.onlineBlockNoShows), 'no-show'), f.onlineBlockLateCancels && plural(Number(f.onlineBlockLateCancels), 'late cancel')].filter(Boolean).join(' or ')} in ${plural(Number(f.onlineBlockMonths ?? 12), 'month')}`
          : 'Off'} onOpen={ownerEdit('repeat')} />
        <Row id="cancel-checkin" label={t.cardNeeded ? 'Check-in reminder' : 'Pay link'} note={t.cardNeeded ? 'Golfers get their check-in link this long before their time.' : 'Golfers get a link this long before their time to check in and pay.'} value={`${hrs(Number(f.checkInWindowHours ?? 3))} before`} onOpen={ownerEdit('checkin')} />
        <Row id="cancel-rain" label="Rain checks" note="Your rain check policy, in your words." value={s(f.rainCheckPolicy).trim() || <Muted>Not set</Muted>} onOpen={ownerEdit('rain')} />
        <div className="border-t border-line px-3 py-[11px]">
          <span className="block text-[13.5px] font-medium text-ink-soft mb-1">What golfers read</span>
          <ul className="flex flex-col gap-0.5 text-[13px] text-ink">{t.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          <p className="mt-1.5 text-[12.5px] text-ink-soft">{t.cardNeeded ? 'A card is saved at booking because a fee above can be charged.' : 'No card is asked for at booking; there is nothing to charge it for.'} Weather and course-closed cancellations are always free. Golfers pay $1.50 per player on each online booking, added to your price.</p>
        </div>
      </Group>

      {ctx.owner && (
        <Group id="tax" title="Sales tax" note="Owner only. Stripe adds sales tax to pro-shop items from your address and the item type. You still file and pay it.">
          <Row id="tax-rate" label="Sales tax" note="Green fees, carts and the booking fee aren’t taxed here." value={taxValue} onOpen={() => setPop('tax')} />
        </Group>
      )}

      <Group id="register" setup="register" title="Register" note={ctx.owner ? 'Owner only, except Takes cash.' : undefined}>
        <div className="w-full grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-start px-3 py-[11px] border-t border-line text-[13.5px]" id="r-register-cash">
          <span className="min-w-0">
            <span className="block font-medium text-ink">Takes cash</span>
            <small className="block mt-0.5 text-[12.5px] leading-snug text-ink-soft">{cash ? 'On: Home reminds you to open the register before the first sale.' : 'Off: Home doesn’t ask you to open the register.'}</small>
          </span>
          <Switch on={cash} onChange={flipCash} label="Takes cash" disabled={!ctx.canEdit || cashBusy} />
        </div>
        {ctx.owner && <ReaderList list={readers} onAdd={() => setPop('addreader')} reload={loadReaders} />}
      </Group>

      {/* The range-buckets section (Build's PR) goes here when it lands. */}

      <p className="text-[13px] text-ink-soft">Prices are on <Link href="/dashboard/schedules" className={LINK}>Schedule</Link>. Payouts and fees are on <Link href="/dashboard/money" className={LINK}>Revenue</Link>. Shop items are on <Link href="/dashboard/shop" className={LINK}>Pro shop</Link>.</p>

      {pop === 'card' && <CardPopup ctx={ctx} cardNeeded={t.cardNeeded} onClose={close} />}
      {pop === 'free' && <TextEdit ctx={ctx} field="cancellationHours" title="Free cancellation" type="number" hint="Hours before the tee time that golfers can still cancel for free." onClose={close} />}
      {pop === 'late' && <FeePopup ctx={ctx} title="Late cancellation" fee="lateCancellationFee" basis="lateFeeBasis" dflt={10} hint="Taken from the saved card when a golfer cancels after free cancellation ends." onClose={close} />}
      {pop === 'noshow' && <FeePopup ctx={ctx} title="No-show" fee="noShowFee" basis="noShowFeeBasis" dflt={20} hint="Charged at midnight when a group marked a no-show never checked in. Under “cancel late or don’t show” this replaces the late fee for a no-show." onClose={close} />}
      {pop === 'auto' && <AutoNoShowPopup ctx={ctx} onClose={close} />}
      {pop === 'repeat' && <RepeatPopup ctx={ctx} onClose={close} />}
      {pop === 'checkin' && <TextEdit ctx={ctx} field="checkInWindowHours" title={t.cardNeeded ? 'Check-in reminder' : 'Pay link'} type="number" hint="Hours before the round." onClose={close} />}
      {pop === 'rain' && <TextEdit ctx={ctx} field="rainCheckPolicy" title="Rain checks" hint="e.g. Rain checks issued for 9 or more holes of rain." onClose={close} />}
      {pop === 'tax' && <EditPopup title="Sales tax" size="lg" onClose={close}><SalesTaxCard homeState={s(f.state)} /></EditPopup>}
      {pop === 'addreader' && <AddReaderPopup list={readers} onDone={loadReaders} onClose={close} />}
    </>
  );
}
