'use client';
// MEM-ACCT (Cam 2026-10-30: member billing; "course sets one [limit] per tier"): the Members
// page's side of member accounts. AccountFields — a tier's account on/off and limit.
// MemberAccount — one member's balance and what is on it (not billed yet), and a credit
// with a reason (money.refund). Part 2: how the tier's statements are paid (a pay link, or the card
// the member saves for it), and the member's statements — mark one paid at the shop, email it again.
// Data: /api/operator/member-accounts (lib/member-account.ts).
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { StatusDot } from '@/components/ui/StatusDot';
import { ChangeAccount } from '@/components/dashboard/ChangeAccount';

const usd = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;

export function AccountFields({ on, limit, limitCents, settle, onChange, className }: { on: boolean | undefined; limit: string | number | null | undefined; limitCents: number | null | undefined; settle: string | undefined; onChange: (k: 'accountOn' | 'accountLimit' | 'accountSettle', v: unknown) => void; className: string }) {
  const shown = limit !== undefined ? (limit ?? '') : limitCents != null ? (limitCents / 100).toFixed(2) : '';
  return (
    <div className="col-span-2 flex flex-wrap items-end gap-x-4 gap-y-2 text-[13.5px] text-ink">
      <label className="flex items-center gap-2"><input type="checkbox" className="accent-pine" checked={!!on} onChange={e => onChange('accountOn', e.target.checked)} />Member account — rounds, guests and shop on account</label>
      {on && <label className="text-[12.5px] text-ink-soft">Limit $ (blank = none)<input value={shown} onChange={e => onChange('accountLimit', e.target.value)} inputMode="decimal" className={className + ' block mt-1 w-28'} /></label>}
      {on && (
        <label className="text-[12.5px] text-ink-soft">Monthly statement
          <select value={settle ?? 'link'} onChange={e => onChange('accountSettle', e.target.value)} className={className + ' block mt-1'}>
            <option value="link">Emailed — they pay the link</option>
            <option value="auto">Charged to a card they save</option>
          </select>
        </label>
      )}
    </div>
  );
}

type Line = { id: string; kind: string; amountCents: number; note: string; createdBy: string; createdAt: string };
type Statement = { id: string; period: string; totalCents: number; status: string; dueAt: string; paidAt: string | null; autoChargeAt: string | null; autoFailedAt: string | null };
type View = { balanceCents: number; unbilledCents: number; limitCents: number | null; lines: Line[]; statements: Statement[]; cardSaved: boolean };
const monthOf = (p: string) => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };

export function MemberAccount({ id, canCredit, canEdit, canMove = false }: { id: string; canCredit: boolean; canEdit: boolean; canMove?: boolean }) {
  const [view, setView] = useState<View | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [credit, setCredit] = useState({ amount: '', reason: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await dfetch<View>(`/api/operator/member-accounts?membershipId=${encodeURIComponent(id)}`);
    if (r.ok) { setView(r.data); setError(''); } else setError(r.error);
  }
  async function toggle() { if (!open) await load(); setOpen(!open); }
  async function act(statementId: string, action: 'mark_paid' | 'email_statement', method?: 'cash' | 'check') {
    if (action === 'mark_paid' && !confirm(`Mark this statement paid at the course by ${method}?`)) return;
    setBusy(true); setError('');
    const r = await dfetch('/api/operator/member-accounts', { method: 'POST', body: JSON.stringify({ action, statementId, method }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    await load();
  }
  async function give() {
    setBusy(true); setError('');
    const cents = Math.round(Number(credit.amount) * 100);
    const r = await dfetch('/api/operator/member-accounts', { method: 'POST', body: JSON.stringify({ membershipId: id, amountCents: cents, reason: credit.reason }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setCredit({ amount: '', reason: '' });
    await load();
  }

  return (
    <>
      <button onClick={toggle} className="text-[13px] font-medium text-pine hover:underline">{open ? 'Hide account' : 'Account'}</button>
      {open && (
        <div className="w-full mt-2 bg-paper/70 rounded-md p-3 text-[13px]">
          {view && (
            <>
              <p className="text-ink"><b className="tabular-nums">{usd(view.balanceCents)}</b> owed{view.limitCents != null ? ` · limit ${usd(view.limitCents)}` : ''}{view.cardSaved ? ' · card saved for statements' : ''}</p>
              {view.statements.length > 0 && (
                <ul className="mt-2 divide-y divide-line-soft">
                  {view.statements.map(st => {
                    const late = st.status === 'open' && new Date(st.dueAt) < new Date();
                    return (
                      <li key={st.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                        <span className="text-ink font-medium">{monthOf(st.period)}</span>
                        <span className="tabular-nums text-ink">{usd(st.totalCents)}</span>
                        <StatusDot status={st.status !== 'open' ? 'ok' : late || st.autoFailedAt ? 'bad' : 'warn'} label={st.status === 'paid' ? 'Paid by card' : st.status === 'paid_offline' ? 'Paid at the course' : late ? 'Past due' : st.autoFailedAt ? 'Card declined' : 'Not paid yet'} />
                        {st.status === 'open' && canEdit && (
                          <span className="ml-auto flex gap-3">
                            <button onClick={() => act(st.id, 'mark_paid', 'cash')} disabled={busy} className="text-pine font-medium hover:underline disabled:opacity-50">Paid cash</button>
                            <button onClick={() => act(st.id, 'mark_paid', 'check')} disabled={busy} className="text-pine font-medium hover:underline disabled:opacity-50">Paid by check</button>
                            <button onClick={() => act(st.id, 'email_statement')} disabled={busy} className="text-ink-soft hover:text-ink disabled:opacity-50">Email again</button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {view.lines.length > 0 ? (
                <ul className="mt-2 divide-y divide-line-soft">
                  {view.lines.map(l => (
                    <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 py-1">
                      <span className="text-ink-muted tabular-nums">{new Date(l.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span className="text-ink">{l.note || l.kind}</span>
                      {l.createdBy && <span className="text-ink-muted">{l.createdBy}</span>}
                      <span className="ml-auto tabular-nums text-ink">{usd(l.amountCents)}</span>
                      {canMove && l.kind !== 'credit' && <ChangeAccount target={{ chargeId: l.id }} className="text-pine font-medium hover:underline" inputClass="bg-white border border-line rounded-md px-2 py-1.5 text-ink" onDone={() => load()} />}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-ink">Nothing new on the account.</p>}
              {canCredit && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="text-[12.5px] text-ink-soft">Credit $<input value={credit.amount} onChange={e => setCredit({ ...credit, amount: e.target.value })} inputMode="decimal" className="block mt-1 w-24 bg-white border border-line rounded-md px-2 py-1.5 text-ink" /></label>
                  <label className="text-[12.5px] text-ink-soft flex-1 min-w-[10rem]">Reason<input value={credit.reason} onChange={e => setCredit({ ...credit, reason: e.target.value })} maxLength={200} className="block mt-1 w-full bg-white border border-line rounded-md px-2 py-1.5 text-ink" /></label>
                  <button onClick={give} disabled={busy || !credit.amount || !credit.reason.trim()} className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{busy ? 'Crediting…' : 'Credit'}</button>
                </div>
              )}
            </>
          )}
          {error && <p role="alert" className="mt-2 text-bad">{error}</p>}
        </div>
      )}
    </>
  );
}
