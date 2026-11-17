'use client';
// Member and resident pricing (Cam 2026-11-17, via Build: "move to the Memberships page as a small section, with the
// same PATCH /api/operator/settings fields"). The course-wide switches that used to sit in Settings → Prices & fees and
// Booking rules: whether members and residents get their own price, the members' default booking window and grace
// days, who gets a member rate at the counter (the owner's call), and who counts as a resident. The settings route
// gates them (settings.edit; counterMemberRate owner only). Each row opens its own popup, as in Settings.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { LoadError } from '@/components/dashboard/LoadError';
import { ChoicePopup } from '@/components/dashboard/settings/BookingArea';
import { type Ctx, type Course, Group, Row, Muted, EditPopup, Field, FIELD, TextEdit, SwitchLine, LINK, plural, num, saveSettings } from '@/components/dashboard/settings/ui';

const s = (v: unknown) => (v == null ? '' : String(v));
const FIELDS = ['hasMemberPricing', 'memberAdvanceDays', 'memberGraceDays', 'counterMemberRate', 'hasResidentPricing', 'residentCounty', 'residentState', 'residentProofRequired'] as const;
type Pop = '' | 'member' | 'mahead' | 'mgrace' | 'mcounter' | 'resident' | 'rwho' | 'rproof';

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

export function PricingCard() {
  const access = useDashboardAccess();
  const [form, setForm] = useState<Course | null>(null);
  const [error, setError] = useState('');
  const [pop, setPop] = useState<Pop>('');
  const load = useCallback(async () => {
    const r = await dfetch<Course>('/api/operator/settings');
    if (r.ok && r.data) { setForm(Object.fromEntries(FIELDS.map(k => [k, r.data![k]]))); setError(''); } else if (!r.ok) setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <LoadError message={`Couldn’t load member and resident pricing — ${error}`} onRetry={load} />;
  if (!form) return null;

  const owner = access.loaded && !access.isStaff;
  const ctx: Ctx = {
    form, merge: p => setForm(f => ({ ...f, ...p })),
    save: async p => { const e = await saveSettings(p); if (!e) setForm(f => ({ ...f, ...p })); return e; },
    canEdit: access.can('settings.edit'), owner, accessLoaded: access.loaded, email: '', goArea: () => undefined,
  };
  const f = form;
  const close = () => setPop('');
  const edit = ctx.canEdit ? (p: Pop) => () => setPop(p) : () => undefined;
  const ownerEdit = owner ? (p: Pop) => () => setPop(p) : () => undefined;
  const ownerNote = (n: string) => (owner ? n : `${n} Only the course owner can change this.`);
  const members = !!f.hasMemberPricing, residents = !!f.hasResidentPricing;

  return (
    <>
      <Group id="pricing" title="Member and resident pricing" note={<>Whether members and residents get their own price. The prices themselves are on each membership and on <Link href="/dashboard/schedules" className={LINK}>Schedule</Link>.</>}>
        <Row id="members-on" label="Member prices" note={members ? 'Members pay their membership’s price, or the member price on Schedule.' : 'Off: members pay the public price, online and at the counter.'} value={members ? 'On' : 'Off'} onOpen={edit('member')} />
        {members && <Row id="members-ahead" label="Days ahead members can book" note="The default; each membership can set its own." value={plural(Number(f.memberAdvanceDays) || 0, 'day')} onOpen={edit('mahead')} />}
        {members && <Row id="members-grace" label="Member rates after it ends" note="Days a lapsed member keeps the member price." value={plural(Number(f.memberGraceDays) || 0, 'day')} onOpen={edit('mgrace')} />}
        {members && <Row id="members-counter" label="Member rate at the counter" note={ownerNote('Who gets a member rate when staff ring them up.')} value={f.counterMemberRate === 'any' ? 'Any membership, staff’s call' : 'The member shows their membership'} onOpen={ownerEdit('mcounter')} />}
        <Row id="residents-on" label="Resident prices" note={residents ? 'A resident books one player at the resident price: themselves.' : 'Off: residents pay the public price, online and at the counter.'} value={residents ? 'On' : 'Off'} onOpen={edit('resident')} />
        {residents && <Row id="residents-who" label="Who counts as a resident" value={[s(f.residentCounty) && `${s(f.residentCounty)} County`, s(f.residentState)].filter(Boolean).join(', ') || <Muted>Not set</Muted>} onOpen={edit('rwho')} />}
        {residents && <Row id="residents-proof" label="Proof at check-in" note="Residents show proof of residency when they check in." value={f.residentProofRequired ? 'Asked for' : 'Not asked for'} onOpen={edit('rproof')} />}
      </Group>

      {pop === 'member' && <OnOffPopup ctx={ctx} field="hasMemberPricing" title="Member prices" on="Members pay their membership’s price, or the member price on Schedule." off="Members pay the public price, online and at the counter." onClose={close} />}
      {pop === 'mahead' && <TextEdit ctx={ctx} field="memberAdvanceDays" title="Days ahead members can book" type="number" hint="The default; each membership can set its own." onClose={close} />}
      {pop === 'mgrace' && <TextEdit ctx={ctx} field="memberGraceDays" title="Member rates after it ends" type="number" hint="Days a lapsed member keeps the member price." toValue={v => num(v) ?? 0} onClose={close} />}
      {pop === 'mcounter' && <ChoicePopup ctx={ctx} field="counterMemberRate" title="Member rate at the counter" options={[{ key: 'member', label: 'The member shows their membership' }, { key: 'any', label: 'Any membership, staff’s call' }]} onClose={close} />}
      {pop === 'resident' && <OnOffPopup ctx={ctx} field="hasResidentPricing" title="Resident prices" on="The resident price is set on Schedule. A resident books one player at it: themselves." off="Residents pay the public price, online and at the counter." onClose={close} />}
      {pop === 'rwho' && <ResidentWhoPopup ctx={ctx} onClose={close} />}
      {pop === 'rproof' && <OnOffPopup ctx={ctx} field="residentProofRequired" title="Proof at check-in" on="Residents show proof of residency when they check in." off="Residents aren’t asked for proof." onClose={close} />}
    </>
  );
}
