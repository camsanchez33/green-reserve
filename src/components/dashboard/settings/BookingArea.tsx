'use client';
// SETTINGS-6: Booking — Booking rules, Carts, Confirmation email (and, until Cam decides where they live, the member
// and resident price switches; see the PR). Each round's own limits are on Schedule.
import { useState } from 'react';
import Link from 'next/link';
import { describePolicy, policyFrom } from '@/lib/cancel-policy';
import { CART_NUMBER_MODES, CART_NUMBER_LABEL, STARTER_COLUMNS, starterColumns, type CartNumberMode } from '@/lib/starter-sheet';
import { type Ctx, type Course, Group, Row, Muted, EditPopup, Field, FIELD, TextEdit, Choices, SwitchLine, LINK, plural, num } from './ui';

const s = (v: unknown) => (v == null ? '' : String(v));
const cents = (v: unknown) => Math.round(Number(v || 0) * 100);

/** The policy as golfers read it — describePolicy(), word for word. The settings route sends fees in dollars. */
export function termsOf(f: Course) {
  return describePolicy(policyFrom({
    cancellationHours: Number(f.cancellationHours ?? 24), lateCancellationFeeCents: cents(f.lateCancellationFee),
    lateFeeBasis: f.lateFeeBasis, lateFeeTiming: f.lateFeeTiming,
    noShowFeeCents: cents(f.noShowFee), noShowFeeBasis: f.noShowFeeBasis,
    autoNoShowMinutes: f.autoNoShowMinutes ? Number(f.autoNoShowMinutes) : null,
    checkInWindowHours: Number(f.checkInWindowHours ?? 3),
  }));
}

type Pop = '' | 'ahead' | 'size' | 'walk' | 'cartcharge' | 'cartnum' | 'starter' | 'note' | 'member' | 'mahead' | 'mgrace' | 'mcounter' | 'resident' | 'rwho' | 'rproof';

function GroupSizePopup({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [min, setMin] = useState(s(ctx.form.minPlayers || 1));
  const [max, setMax] = useState(s(ctx.form.maxPlayers || 4));
  return (
    <EditPopup title="Group size" hint="The smallest and largest group in one booking. A round's own limits on Schedule come first." onClose={onClose}
      onSave={async () => (Number(min) > Number(max) ? 'The fewest players can’t be more than the most.' : ctx.save({ minPlayers: num(min), maxPlayers: num(max) }))}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fewest players"><input inputMode="numeric" value={min} onChange={e => setMin(e.target.value)} className={FIELD} autoFocus /></Field>
        <Field label="Most players"><input inputMode="numeric" value={max} onChange={e => setMax(e.target.value)} className={FIELD} /></Field>
      </div>
    </EditPopup>
  );
}

function StarterPopup({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [cols, setCols] = useState<string[]>(() => starterColumns(ctx.form.starterColumns as string[]));
  return (
    <EditPopup title="Starter’s sheet shows" hint="The columns on the printed starter’s sheet. It needs at least one." onClose={onClose} onSave={() => ctx.save({ starterColumns: cols })}>
      <div className="flex flex-col gap-1">
        {STARTER_COLUMNS.map(c => {
          const on = cols.includes(c.key);
          return (
            <label key={c.key} className="flex items-center gap-2.5 text-[14px] text-ink min-h-[36px]">
              <input type="checkbox" checked={on} disabled={on && cols.length === 1} title={on && cols.length === 1 ? 'At least one column' : undefined} className="accent-pine w-4 h-4"
                onChange={() => setCols(cur => on ? cur.filter(k => k !== c.key) : [...cur, c.key])} />{c.label}
            </label>
          );
        })}
      </div>
      <Link href="/dashboard/starter" className={LINK + ' self-start'}>Open today’s starter’s sheet</Link>
    </EditPopup>
  );
}

function OnOffPopup({ ctx, field, title, help, on: onText, off: offText, onClose }: { ctx: Ctx; field: string; title: string; help?: string; on: string; off: string; onClose: () => void }) {
  const [on, setOn] = useState(!!ctx.form[field]);
  return (
    <EditPopup title={title} hint={help} onClose={onClose} onSave={() => ctx.save({ [field]: on })}>
      <SwitchLine label={title} help={on ? onText : offText} on={on} onChange={setOn} />
    </EditPopup>
  );
}

function ResidentWhoPopup({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [county, setCounty] = useState(s(ctx.form.residentCounty));
  const [state, setState] = useState(s(ctx.form.residentState));
  return (
    <EditPopup title="Who counts as a resident" onClose={onClose} onSave={() => ctx.save({ residentCounty: county, residentState: state.toUpperCase() })}>
      <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
        <Field label="County"><input value={county} onChange={e => setCounty(e.target.value)} className={FIELD} autoFocus /></Field>
        <Field label="State"><input value={state} onChange={e => setState(e.target.value)} maxLength={2} className={FIELD} /></Field>
      </div>
    </EditPopup>
  );
}

/** What the confirmation email says today, drawn from the same fields sendBookingConfirmation() reads: the policy
 *  (describePolicy lines, or the free-cancellation wording), the course's address and its note (or the default).
 *  The booking itself is an example. */
function EmailPreview({ f }: { f: Course }) {
  const t = termsOf(f);
  const lateFee = cents(f.lateCancellationFee) > 0;
  const address = [s(f.address), s(f.city), [s(f.state), s(f.zipCode)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const note = s(f.confirmationNote).trim();
  return (
    <div className="op-keep-light rounded-[10px] bg-white text-ink p-4 text-[13px] leading-normal" aria-label="Preview of the confirmation email">
      <p className="text-[12px] text-ink-muted mb-1.5">{s(f.name) || 'Your course'}</p>
      <h4 className="text-[15px] font-semibold mb-1">You’re on the tee sheet.</h4>
      <p className="mb-2 text-ink-soft">Example booking: Sat at 8:40 AM · 18 holes · 4 players</p>
      <div className="border-l-[3px] border-line-strong pl-2.5 mb-2 text-ink-soft">
        <span className="block text-[11.5px] text-ink-muted">From your cancellation policy</span>
        {!t.cardNeeded ? <p>Free cancellation any time — no fees, no card on file.</p>
          : lateFee ? t.lines.map((l, i) => <p key={i}>{l}</p>)
          : <>
              <p>Free cancellation any time — this course has no late-cancellation fee.</p>
              {t.lines.filter(l => /no-show/i.test(l)).map((l, i) => <p key={i}>{l}</p>)}
            </>}
      </div>
      {address && <p className="font-semibold">{address}</p>}
      <p className="whitespace-pre-line">{note || 'Arrive 15 minutes early and check in at the pro shop.'}</p>
    </div>
  );
}

export function BookingArea({ ctx }: { ctx: Ctx }) {
  const f = ctx.form;
  const [pop, setPop] = useState<Pop>('');
  const close = () => setPop('');
  const edit = ctx.canEdit ? (p: Pop) => () => setPop(p) : () => undefined;
  const ownerEdit = ctx.owner ? (p: Pop) => () => setPop(p) : () => undefined;
  const ownerNote = (n: string) => (ctx.owner ? n : `${n} Only the course owner can change this.`);
  const ahead = Number(f.publicAdvanceDays) || 0;
  const cols = starterColumns(f.starterColumns as string[]);
  const members = !!f.hasMemberPricing, residents = !!f.hasResidentPricing;

  return (
    <>
      <Group id="rules" title="Booking rules">
        <Row id="rules-ahead" label="How far ahead" note={`How far ahead your booking page shows tee times to the public: today plus the next ${plural(ahead, 'day')}.`} value={plural(ahead, 'day')} onOpen={edit('ahead')} />
        <Row id="rules-size" label="Group size" note="The smallest and largest group in one booking." value={`${f.minPlayers || 1} to ${f.maxPlayers || 4} players`} onOpen={edit('size')} />
      </Group>

      <Group id="carts" title="Carts" note={<>When golfers can walk, and what a cart costs, is set for each round on <Link href="/dashboard/schedules" className={LINK}>Schedule</Link>.</>}>
        <Row id="carts-walk" label="Walking and carts note" note="One sentence on your booking page." value={s(f.walkingNote).trim() || <Muted>None</Muted>} onOpen={edit('walk')} />
        <Row id="carts-charge" label="How carts are charged" note={ownerNote(f.cartPricing === 'per_cart' ? '2 riders a cart, rounded up. Members too.' : 'Each rider pays.')} value={f.cartPricing === 'per_cart' ? 'Per cart (2 riders)' : 'Per player'} onOpen={ownerEdit('cartcharge')} />
        <Row id="carts-num" label="Cart numbers" note="Whether the starter assigns cart numbers at check-in." value={CART_NUMBER_LABEL[(s(f.cartNumbers) || 'off') as CartNumberMode] ?? s(f.cartNumbers)} onOpen={edit('cartnum')} />
        <Row id="carts-starter" label="Starter’s sheet shows" note="The columns on the printed starter’s sheet." value={STARTER_COLUMNS.filter(c => cols.includes(c.key)).map(c => c.label).join(', ')} onOpen={edit('starter')} />
      </Group>

      <Group id="email" title="Confirmation email" note="Every golfer gets this the moment they book. You write the note in your words; the cancellation wording comes from your policy, so it always matches what you charge.">
        <div className="grid md:grid-cols-2 border-t border-line">
          <div className="min-w-0 [&>*:first-child]:border-t-0">
            <Row stack id="email-note" label="Your note" note="Arrival, parking, anything golfers should know. 400 characters." value={s(f.confirmationNote).trim() ? <span className="font-normal whitespace-pre-line">{s(f.confirmationNote)}</span> : <Muted>Not set: golfers read “Arrive 15 minutes early and check in at the pro shop.”</Muted>} onOpen={edit('note')} />
            <Row stack id="email-policy" label="Cancellation and payment"
              note={<>From your cancellation policy · <button type="button" className={LINK} onClick={() => ctx.goArea('payments', 'g-cancel')}>Change</button></>}
              value={<Muted>Written for you</Muted>} />
          </div>
          <div className="p-3 md:border-l border-t md:border-t-0 border-line">
            <div className="text-[12.5px] text-ink-soft mb-2">Preview</div>
            <EmailPreview f={f} />
          </div>
        </div>
      </Group>

      {/* Not on the approved mockup (Memberships owns rates), but no other page has these switches yet and Schedule
          reads them. "Never lose a setting": they stay here until Cam decides where they live (asked via Build). */}
      <Group id="members" title="Members and residents" note={<>Each membership’s rates and booking window are on <Link href="/dashboard/members" className={LINK}>Memberships</Link>; the member and resident prices are on <Link href="/dashboard/schedules" className={LINK}>Schedule</Link>.</>}>
        <Row id="members-on" label="Member prices" note={members ? 'Members pay their membership’s price, or the member price on Schedule.' : 'Off: members pay the public price, online and at the counter.'} value={members ? 'On' : 'Off'} onOpen={edit('member')} />
        {members && <Row id="members-ahead" label="Days ahead members can book" note="Each membership can set its own on Memberships." value={plural(Number(f.memberAdvanceDays) || 0, 'day')} onOpen={edit('mahead')} />}
        {members && <Row id="members-grace" label="Member rates after it ends" note="Days a lapsed member keeps the member price." value={plural(Number(f.memberGraceDays) || 0, 'day')} onOpen={edit('mgrace')} />}
        {members && <Row id="members-counter" label="Member rate at the counter" note={ownerNote('Who gets a member rate when staff ring them up.')} value={f.counterMemberRate === 'any' ? 'Any membership, staff’s call' : 'The member shows their membership'} onOpen={ownerEdit('mcounter')} />}
        <Row id="residents-on" label="Resident prices" note={residents ? 'A resident books one player at the resident price: themselves.' : 'Off: residents pay the public price, online and at the counter.'} value={residents ? 'On' : 'Off'} onOpen={edit('resident')} />
        {residents && <Row id="residents-who" label="Who counts as a resident" value={[s(f.residentCounty) && `${s(f.residentCounty)} County`, s(f.residentState)].filter(Boolean).join(', ') || <Muted>Not set</Muted>} onOpen={edit('rwho')} />}
        {residents && <Row id="residents-proof" label="Proof at check-in" note="Residents show proof of residency when they check in." value={f.residentProofRequired ? 'Asked for' : 'Not asked for'}
          onOpen={edit('rproof')} />}
      </Group>

      <p className="text-[13px] text-ink-soft">Each round’s own hours and limits are on <Link href="/dashboard/schedules" className={LINK}>Schedule</Link>. Member booking windows and member rates are on <Link href="/dashboard/members" className={LINK}>Memberships</Link>.</p>

      {pop === 'ahead' && <TextEdit ctx={ctx} field="publicAdvanceDays" title="How far ahead" type="number" hint="Days ahead anyone can book. Golfers see today plus this many days." onClose={close} />}
      {pop === 'size' && <GroupSizePopup ctx={ctx} onClose={close} />}
      {pop === 'walk' && <TextEdit ctx={ctx} field="walkingNote" title="Walking and carts note" maxLength={500} hint="Optional, one sentence, e.g. Push carts are free at the pro shop." onClose={close} />}
      {pop === 'cartcharge' && <ChoicePopup ctx={ctx} field="cartPricing" title="How carts are charged" options={[{ key: 'per_player', label: 'Per player', help: 'Each rider pays.' }, { key: 'per_cart', label: 'Per cart (2 riders)', help: '2 riders a cart, rounded up. Members too.' }]} onClose={close} />}
      {pop === 'cartnum' && <ChoicePopup ctx={ctx} field="cartNumbers" title="Cart numbers" options={CART_NUMBER_MODES.map(m => ({ key: m, label: CART_NUMBER_LABEL[m] }))} onClose={close} />}
      {pop === 'starter' && <StarterPopup ctx={ctx} onClose={close} />}
      {pop === 'note' && <TextEdit ctx={ctx} field="confirmationNote" title="Your note" lines={4} maxLength={400} hint="Shown after booking and in the confirmation email, e.g. Check in at the pro shop 15 minutes before your time." onClose={close} />}
      {pop === 'member' && <OnOffPopup ctx={ctx} field="hasMemberPricing" title="Member prices" on="Members pay their membership’s price, or the member price on Schedule." off="Members pay the public price, online and at the counter." onClose={close} />}
      {pop === 'mahead' && <TextEdit ctx={ctx} field="memberAdvanceDays" title="Days ahead members can book" type="number" onClose={close} />}
      {pop === 'mgrace' && <TextEdit ctx={ctx} field="memberGraceDays" title="Member rates after it ends" type="number" hint="Days a lapsed member keeps the member price." toValue={v => num(v) ?? 0} onClose={close} />}
      {pop === 'mcounter' && <ChoicePopup ctx={ctx} field="counterMemberRate" title="Member rate at the counter" options={[{ key: 'member', label: 'The member shows their membership' }, { key: 'any', label: 'Any membership, staff’s call' }]} onClose={close} />}
      {pop === 'resident' && <OnOffPopup ctx={ctx} field="hasResidentPricing" title="Resident prices" on="The resident price is set on Schedule. A resident books one player at it: themselves." off="Residents pay the public price, online and at the counter." onClose={close} />}
      {pop === 'rwho' && <ResidentWhoPopup ctx={ctx} onClose={close} />}
      {pop === 'rproof' && <OnOffPopup ctx={ctx} field="residentProofRequired" title="Proof at check-in" on="Residents show proof of residency when they check in." off="Residents aren’t asked for proof." onClose={close} />}
    </>
  );
}

function ChoicePopup({ ctx, field, title, options, onClose }: { ctx: Ctx; field: string; title: string; options: { key: string; label: string; help?: string }[]; onClose: () => void }) {
  const [v, setV] = useState(s(ctx.form[field]) || options[0].key);
  return (
    <EditPopup title={title} onClose={onClose} onSave={() => ctx.save({ [field]: v })}>
      <Choices name={title} value={v} options={options} onChange={setV} />
    </EditPopup>
  );
}
