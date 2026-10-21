'use client';
// AW-1b (Cam 2026-10-21): the owner's passkeys — Face ID, Touch ID or a
// security key — as the second factor at /cam. The authenticator app must be
// set up first; it stays the backup. Each passkey can be removed here.
import { stepUpFetch } from '@/lib/step-up-client';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT } from '@/components/ui/field';

type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null };
const day = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

async function call(method: string, body?: unknown) {
  const r = await stepUpFetch('/api/admin/passkeys', { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export default function OwnerPasskeysCard() {
  const [keys, setKeys] = useState<Passkey[] | null>(null);
  const [appSetUp, setAppSetUp] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setError('');
    const r = await call('GET');
    if (!r.ok) { setError(r.data.error || 'Couldn’t load your passkeys.'); return; }
    setKeys(r.data.passkeys); setAppSetUp(!!r.data.appSetUp);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setBusy('add'); setError(''); setNote('');
    try {
      const o = await call('POST', { action: 'options' });
      if (!o.ok) { setError(o.data.error || 'Couldn’t start — try again.'); return; }
      const { startRegistration } = await import('@simplewebauthn/browser');
      let response;
      try { response = await startRegistration({ optionsJSON: o.data }); }
      catch (e) { setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Cancelled — nothing was added.' : 'This device couldn’t make a passkey. Try another device or browser.'); return; }
      const r = await call('POST', { action: 'add', response, name: name.trim() || 'Passkey' });
      if (!r.ok) { setError(r.data.error || 'Couldn’t add it — try again.'); return; }
      setKeys(r.data.passkeys); setName(''); setNote('Added. Next time you sign in at /cam, use it.');
    } catch { setError('Network error — nothing was added. Try again.'); }
    finally { setBusy(''); }
  }

  async function remove(k: Passkey) {
    if (!confirm(`Remove "${k.name}"? It won’t be able to sign in any more.`)) return;
    setBusy(k.id); setError(''); setNote('');
    const r = await call('DELETE', { id: k.id }).catch(() => ({ ok: false, data: { error: 'Network error — nothing was removed.' } }));
    setBusy('');
    if (!r.ok) { setError(r.data.error || 'Couldn’t remove it — try again.'); return; }
    setKeys(r.data.passkeys);
  }

  return (
    <Card className="p-5 mb-5">
      <h2 className="text-[15px] font-semibold text-ink mb-1">Passkeys</h2>
      <p className="text-[13.5px] text-ink-soft mb-3">Sign in with Face ID, Touch ID or a security key. Your authenticator app stays the backup.</p>
      {!appSetUp ? (
        <p className="text-[13.5px] text-ink flex items-center gap-1.5"><StatusDot status="warn" />Set up the authenticator app below first — it’s how you get in if you lose the device your passkey is on.</p>
      ) : (
        <>
          {keys && keys.length > 0 && (
            <ul className="divide-y divide-line-soft mb-3">
              {keys.map(k => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                  <span className="text-ink">{k.name}<span className="text-ink-muted"> · added {day(k.createdAt)}{k.lastUsedAt ? ` · last used ${day(k.lastUsedAt)}` : ''}</span></span>
                  <button type="button" onClick={() => remove(k)} disabled={busy !== ''} className="text-[13px] text-ink-soft hover:text-bad disabled:opacity-50">{busy === k.id ? 'Removing…' : 'Remove'}</button>
                </li>
              ))}
            </ul>
          )}
          {keys && keys.length === 0 && <p className="text-[13.5px] text-ink mb-3">No passkeys yet — you sign in with the authenticator app.</p>}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[13px] font-semibold text-ink mb-1.5" htmlFor="pk-name">Name it</label>
              <input id="pk-name" value={name} onChange={e => setName(e.target.value)} placeholder="iPhone, MacBook…" maxLength={60} className={`w-full ${INPUT_COMPACT}`} />
            </div>
            <button type="button" onClick={add} disabled={busy !== '' || keys === null} className="bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md text-[13px] font-medium disabled:opacity-50">{busy === 'add' ? 'Waiting for your device…' : 'Add a passkey'}</button>
          </div>
        </>
      )}
      {note && <p className="text-[13px] text-ink mt-3 flex items-center gap-1.5"><StatusDot status="ok" />{note}</p>}
      {error && <p className="text-[13px] text-bad mt-3" role="alert">{error} {keys === null && <button type="button" onClick={load} className="underline">Try again</button>}</p>}
    </Card>
  );
}
