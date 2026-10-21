'use client';
// W2-7 part B (Cam 2026-10-20): Settings → Pro shop → Sales tax. Stripe Tax
// works out pro-shop sales tax from the course's address and each item's tax
// type, on the course's own Stripe account. Set-up is two facts the owner
// knows: the course's address (already on file) and the state(s) it holds a
// sales-tax permit in. Owner only — the route refuses staff.
import { useCallback, useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { US_STATES } from '@/lib/tax-categories';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';

type Status = { connected: boolean; active: boolean; missing: string[]; states: string[]; on: boolean };

export function SalesTaxCard({ homeState }: { homeState: string }) {
  const [s, setS] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState('');
  const [state, setState] = useState(homeState || 'NJ');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    const r = await dfetch<Status>('/api/operator/sales-tax');
    if (!r.ok) { setLoadError(r.error); return; }
    setS(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (homeState) setState(homeState); }, [homeState]);

  async function call(method: 'POST' | 'PATCH', body: object, done: string) {
    setBusy(true); setError(''); setNote('');
    const r = await dfetch<Status>('/api/operator/sales-tax', { method, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setS(r.data); setNote(done);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft -mt-1">Stripe works out the sales tax on pro-shop items — rung up on the Pro shop page or added to a group&apos;s round from the tee sheet — from your course&apos;s address and what the item is (clothing, snacks and drinks are taxed differently in some states), adds it to the total, and keeps a record for your tax returns. You still file and pay the tax yourself. Green fees, carts and the booking fee are not taxed here.</p>
      {loadError && (
        <div className="rounded-md bg-bad/5 border border-bad/20 px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-bad">{loadError}</p>
          <button type="button" onClick={load} className="text-xs font-medium text-ink-soft hover:text-ink">Retry</button>
        </div>
      )}
      {!s && !loadError && <p className="text-xs text-ink-muted">Checking your tax settings…</p>}
      {s && !s.connected && <p className="text-sm text-ink">Connect your Stripe account first (Money → Getting paid), then come back here.</p>}
      {s && s.connected && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <StatusDot status={s.on ? 'ok' : s.active && s.states.length ? 'neutral' : 'warn'} label={s.on ? 'Collecting sales tax on pro-shop items' : s.active && s.states.length ? 'Set up, but turned off' : 'Not set up — pro-shop sales have no tax'} />
            {s.states.length > 0 && <span className="text-ink-muted">Registered in {s.states.join(', ')}</span>}
          </div>
          {(!s.active || !s.states.length) && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="w-44"><span className="block text-[12.5px] text-ink-soft mb-1">State on your sales-tax permit</span>
                <select value={state} onChange={e => setState(e.target.value)} className={INPUT + ' w-full'}>
                  {US_STATES.map(x => <option key={x} value={x}>{x}</option>)}
                </select></label>
              <button type="button" disabled={busy} onClick={() => call('POST', { states: [state] }, 'Sales tax is set up. Pro-shop items now include it.')}
                className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm px-4 py-2 disabled:opacity-50">{busy ? 'Setting up…' : 'Set up sales tax'}</button>
            </div>
          )}
          {s.active && s.states.length > 0 && (
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => call('PATCH', { on: !s.on }, s.on ? 'Turned off. New sales have no tax.' : 'Turned on. New sales include sales tax.')}
                className="text-sm text-ink border border-line rounded-md px-3 py-1.5 hover:border-pine/40 disabled:opacity-50">{busy ? '…' : s.on ? 'Turn off' : 'Turn on'}</button>
            </div>
          )}
          {s.missing.length > 0 && <p className="text-[12.5px] text-ink-muted">Stripe still needs: {s.missing.join(', ').replace(/_/g, ' ')}.</p>}
          <p className="text-[12.5px] text-ink-muted">Uses your course address on file. Your Stripe account is the seller, so the tax is collected for you; Stripe Tax charges a small fee. If you refund a card sale in Stripe, note it for your return — the tax record isn't reversed automatically yet.</p>
        </>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
      {note && <p className="text-xs text-ok">{note}</p>}
    </div>
  );
}
