'use client';
// AW-1b (Cam 2026-10-21): the owner's passkeys — Face ID, Touch ID or a
// security key — as the second factor at /cam. The authenticator app must be
// set up first; it stays the backup. Each passkey can be removed here.
// My profile re-skin (Cam approved the mockup 2026-11-15): a bare plus top right opens "Name it" → Add → "Waiting for
// your device…"; the calls, the step-up and every error are as before.
import { stepUpFetch } from '@/lib/step-up-client';
import { useCallback, useEffect, useState } from 'react';
import { passkeyLine } from '@/app/admin/profile/logic';
import { ProfileCard, ProfileRow, Msg, useConfirm, profileStyles as s } from './ProfileCard';

type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

async function call(method: string, body?: unknown) {
  const r = await stepUpFetch('/api/admin/passkeys', { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export default function OwnerPasskeysCard() {
  const [keys, setKeys] = useState<Passkey[] | null>(null);
  const [appSetUp, setAppSetUp] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [dialog, ask] = useConfirm();

  const load = useCallback(async () => {
    setError('');
    const r = await call('GET').catch(() => ({ ok: false, data: { error: 'Network error — couldn’t load your passkeys.' } }));
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
      setKeys(r.data.passkeys); setName(''); setAdding(false); setNote('Added. Next time you sign in at /cam, use it.');
    } catch { setError('Network error — nothing was added. Try again.'); }
    finally { setBusy(''); }
  }

  async function remove(k: Passkey) {
    if (!await ask(`Remove ${k.name}?`, 'It won’t be able to sign in any more. Your authenticator app still works.', 'Remove')) return;
    setBusy(k.id); setError(''); setNote('');
    const r = await call('DELETE', { id: k.id }).catch(() => ({ ok: false, data: { error: 'Network error — nothing was removed.' } }));
    setBusy('');
    if (!r.ok) { setError(r.data.error || 'Couldn’t remove it — try again.'); return; }
    setKeys(r.data.passkeys);
  }

  const plus = adding ? null : (
    <button type="button" className={s.plus} onClick={() => { setAdding(true); setNote(''); setError(''); }}
      disabled={!appSetUp || keys === null || busy !== ''} aria-label="Add a passkey" title={appSetUp ? 'Add a passkey' : 'Set up the authenticator app first'}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  );

  return (
    <ProfileCard title="Passkeys" labelId="pf-passkeys" lead="Face ID, Touch ID or a security key. The app stays the backup." top={plus}>
      {keys === null && !error && <p className={s.clr}>Loading…</p>}
      {keys && keys.map(k => (
        <ProfileRow key={k.id} dot="ok" sub={passkeyLine(k.createdAt, k.lastUsedAt)}
          right={<button type="button" onClick={() => remove(k)} disabled={busy !== ''} className={`${s.btn} ${s.dng} ${s.sm}`}>{busy === k.id ? 'Removing…' : 'Remove'}</button>}>
          {k.name}
        </ProfileRow>
      ))}
      {keys && keys.length === 0 && <p className={s.clr}>No passkeys yet — you sign in with the authenticator app.</p>}
      {adding && busy !== 'add' && (
        <div className={s.sec}>
          <label htmlFor="pk-name">Name it</label>
          <div className={s.line}>
            <input id="pk-name" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus className={`${s.fld} ${s.grow}`}
              onKeyDown={e => { if (e.key === 'Enter') add(); }} />
            <button type="button" onClick={add} disabled={busy !== ''} className={`${s.btn} ${s.pri}`}>Add</button>
            <button type="button" onClick={() => { setAdding(false); setName(''); setError(''); }} className={s.btn}>Cancel</button>
          </div>
        </div>
      )}
      {busy === 'add' && <p className={s.clr} role="status">Waiting for your device…</p>}
      {!appSetUp && <p className={s.clr}>Set up the authenticator app first — it’s how you get in if you lose the device your passkey is on.</p>}
      {note && <Msg ok>{note}</Msg>}
      {error && <Msg ok={false}>{error} {keys === null && <button type="button" onClick={load} className={s.lnk}>Try again</button>}</Msg>}
      {dialog}
    </ProfileCard>
  );
}
