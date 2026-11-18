'use client';
// A member's card (Cam 2026-11-16, members-mockup): photo, number, membership, dues, rounds, payments, and what
// staff do for them — take dues paid at the shop or email the dues link, change membership, edit details, turn
// off auto-renew, the member account, end the membership. Every action is the one the Members row had
// (Revamp 3 dead end 21, MEM-RENEW, MEM-ACCT); only where it sits changed. The member number, the photo and the
// list of payments show once the Memberships data PRs return them.
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { INPUT } from '@/components/ui/field';
import { AutoRenewStop } from '@/components/dashboard/MemberJoin';
import { MemberAccount } from '@/components/dashboard/MemberAccount';
import { type Member, type Tier, type Dues, Popup, KV, Label, LINK, LINK_BAD, PRIMARY, longDate, sinceYear, shortDate, usd0, dollars, DuesText } from './shared';

export function MemberCard({ m, tier, tiers, dues, owed, can, onChanged, onClose }: {
  m: Member; tier: Tier | undefined; tiers: Tier[]; dues: Dues; owed: number;
  can: { edit: boolean; credit: boolean; move: boolean }; onChanged: () => Promise<void> | void; onClose: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // LEDGER-2: what was taken and how — the ledger and the cash drawer need both.
  const [duesForm, setDuesForm] = useState<{ amount: string; method: 'cash' | 'check' } | null>(null);
  const [change, setChange] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; email: string; phone: string; expiresAt: string; notes: string } | null>(null);
  const initials = (m.name || m.email).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  const owes = dues.kind === 'unpaid' || dues.kind === 'expired' || dues.kind === 'renewing';

  const patch = async (what: string, body: Record<string, unknown>) => {
    setBusy(what); setError('');
    const r = await dfetch('/api/operator/members', { method: 'PATCH', body: JSON.stringify({ id: m.id, ...body }) });
    setBusy('');
    if (!r.ok) { setError(r.error); return false; }
    return true;
  };
  const markPaid = async () => {
    if (!duesForm) return;
    const cents = Math.round(Number(duesForm.amount) * 100);
    if (!duesForm.amount.trim() || !Number.isFinite(cents) || cents < 1) { setError('Enter the amount taken.'); return; }
    if (await patch('paid', { action: 'mark_paid', amountCents: cents, method: duesForm.method })) {
      setDuesForm(null); await onChanged(); toast(`${m.name || m.email}: dues recorded as paid.`, 'ok');
    }
  };
  const sendLink = async () => { if (await patch('link', { action: 'send_pay_link' })) toast(`Dues link emailed to ${m.email}.`, 'ok'); };
  const saveChange = async () => { if (change && await patch('change', { tierId: change })) { setChange(null); await onChanged(); toast('Membership changed.', 'ok'); } };
  const saveDetails = async () => {
    if (!edit) return;
    if (await patch('edit', { notes: edit.notes, expiresAt: edit.expiresAt || null, name: edit.name, email: edit.email, phone: edit.phone })) { setEdit(null); await onChanged(); }
  };
  const setActive = async (on: boolean) => {
    if (!on && !confirm(`End ${m.name || m.email}'s membership? They stop getting member rates. You can make it active again.`)) return;
    if (await patch('status', { status: on ? 'active' : 'inactive' })) { await onChanged(); toast(on ? 'Membership active again.' : 'Membership ended.', 'ok'); }
  };
  const remove = async () => {
    if (!confirm(`Remove ${m.name || m.email} from this course?`)) return;
    setBusy('remove'); setError('');
    const r = await dfetch(`/api/operator/members?id=${m.id}`, { method: 'DELETE' });
    setBusy('');
    if (!r.ok) { setError(r.error); return; }
    toast(`${m.name || m.email} removed.`, 'ok'); await onChanged(); onClose();
  };

  return (
    <Popup label={m.name || m.email} onClose={onClose}>
      <div className="flex gap-3.5 items-center">
        {m.photoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={m.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
          : <span aria-hidden="true" className="w-14 h-14 rounded-full grid place-items-center shrink-0 text-[18px] font-semibold text-white" style={{ background: m.tierColor || tier?.color }}>{initials}</span>}
        <div className="min-w-0"><h3 className="text-[18px] font-semibold truncate">{m.name || m.email}</h3>
          <p className="text-[12px] text-ink-muted mt-0.5 truncate">{[m.name ? m.email : '', m.phone].filter(Boolean).join(' · ')}</p></div>
      </div>

      <div className="border-t border-line">
        {m.memberNumber && <KV first k="Member number" v={<span className="font-mono">{m.memberNumber}</span>} />}
        <KV first={!m.memberNumber} k="Membership" v={<span className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: m.tierColor }} />{m.tierName}</span>} />
        <KV k="Dues" v={<DuesText d={dues} />} />
        <KV k="Member since" v={sinceYear(m)} />
        <KV k="Rounds this year" v={m.roundsThisYear ?? 0} />
        {m.spendThisYearCents != null && <KV k="Spend this year" v={usd0(m.spendThisYearCents)} />}
        <KV k="Last round" v={m.lastRound ? shortDate(m.lastRound) : 'None yet'} />
        {m.autoRenew && <KV k="Renews itself" v="Yes" />}
        <KV k="Online" v={<span className="font-normal text-ink-soft">{'Gets member rates online once they log in with this email.'}</span>} />
        {m.notes && <KV k="Note" v={<span className="font-normal">{m.notes}</span>} />}
      </div>

      <div>
        <div className="text-[12.5px] text-ink-muted">Payments</div>
        <div className="border-t border-line mt-1.5">
          {m.lastPaidAt ? <KV first k={`Last paid ${longDate(m.lastPaidAt)}`} v={m.annualFee ? dollars(m.annualFee) : ''} /> : <p className="py-2 text-[13px] text-ink-muted">No dues paid yet.</p>}
        </div>
      </div>

      {can.edit && <>
        {owes && !duesForm && (
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className={PRIMARY} onClick={() => { setError(''); setDuesForm({ amount: owed ? owed.toFixed(2) : '', method: 'cash' }); }}>Paid at the shop{owed ? ` · ${dollars(owed)}` : ''}</button>
            {m.email && <button type="button" className={LINK} disabled={!!busy} onClick={sendLink}>{busy === 'link' ? 'Sending…' : 'Email dues link'}</button>}
          </div>
        )}
        {duesForm && (
          <div className="flex flex-wrap items-end gap-2.5 bg-ink/5 rounded-md p-3">
            <div><Label htmlFor="mc-amt">Amount</Label><input id="mc-amt" inputMode="decimal" className={INPUT + ' w-28'} value={duesForm.amount} onChange={e => setDuesForm({ ...duesForm, amount: e.target.value })} /></div>
            <div><Label htmlFor="mc-how">Method</Label><select id="mc-how" className={INPUT} value={duesForm.method} onChange={e => setDuesForm({ ...duesForm, method: e.target.value as 'cash' | 'check' })}><option value="cash">Cash</option><option value="check">Check</option></select></div>
            <button type="button" className={PRIMARY} disabled={!!busy} onClick={markPaid}>{busy === 'paid' ? 'Saving…' : 'Save'}</button>
            <button type="button" className={LINK} onClick={() => setDuesForm(null)}>Cancel</button>
          </div>
        )}
        {change !== null && (
          <div className="flex flex-wrap items-end gap-2.5 bg-ink/5 rounded-md p-3">
            <div className="flex-1 min-w-[12rem]"><Label htmlFor="mc-tier">New membership</Label>
              <select id="mc-tier" className={INPUT + ' w-full'} value={change} onChange={e => setChange(e.target.value)}>{tiers.filter(t => t.active || t.id === m.tierId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <button type="button" className={PRIMARY} disabled={!!busy || change === m.tierId} onClick={saveChange}>{busy === 'change' ? 'Saving…' : 'Save'}</button>
            <button type="button" className={LINK} onClick={() => setChange(null)}>Cancel</button>
          </div>
        )}
        {edit && (
          <div className="grid sm:grid-cols-2 gap-2.5 bg-ink/5 rounded-md p-3">
            <>
              <div className="sm:col-span-2"><Label htmlFor="mc-name">Full name</Label><input id="mc-name" className={INPUT + ' w-full'} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label htmlFor="mc-email">Email</Label><input id="mc-email" type="email" className={INPUT + ' w-full'} value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} /></div>
              <div><Label htmlFor="mc-phone">Phone</Label><input id="mc-phone" type="tel" className={INPUT + ' w-full'} value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></div>
            </>
            <div><Label htmlFor="mc-exp">Runs until</Label><input id="mc-exp" type="date" className={INPUT + ' w-full'} value={edit.expiresAt} onChange={e => setEdit({ ...edit, expiresAt: e.target.value })} /></div>
            <div><Label htmlFor="mc-note">Note for your staff</Label><input id="mc-note" className={INPUT + ' w-full'} value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></div>
            <div className="sm:col-span-2 flex gap-4 items-center">
              <button type="button" className={PRIMARY} disabled={!!busy} onClick={saveDetails}>{busy === 'edit' ? 'Saving…' : 'Save'}</button>
              <button type="button" className={LINK} onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" className={LINK} onClick={() => { setError(''); setEdit(null); setChange(m.tierId ?? ''); }}>Change membership</button>
          <button type="button" className={LINK} onClick={() => { setError(''); setChange(null); setEdit({ name: m.name, email: m.email, phone: m.phone, expiresAt: m.expiresAt ? m.expiresAt.slice(0, 10) : '', notes: m.notes }); }}>Edit details</button>
          {m.autoRenew && <AutoRenewStop id={m.id} onChanged={onChanged} />}
          {tier?.accountOn && <MemberAccount id={m.id} canCredit={can.credit} canEdit={can.edit} canMove={can.move} />}
          <span className="flex-1" />
          {m.status === 'active'
            ? <button type="button" className={LINK_BAD} disabled={!!busy} onClick={() => setActive(false)}>End membership</button>
            : <button type="button" className={LINK} disabled={!!busy} onClick={() => setActive(true)}>Make active</button>}
          <button type="button" className={LINK_BAD} disabled={!!busy} onClick={remove}>{busy === 'remove' ? 'Removing…' : 'Remove'}</button>
        </div>
      </>}

      {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
      <div className="flex items-center border-t border-line pt-3"><span className="flex-1" /><button type="button" className={LINK} onClick={onClose}>Close</button></div>
    </Popup>
  );
}
