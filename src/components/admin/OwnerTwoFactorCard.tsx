'use client';
// OWNER TOTP 2FA — the enrolment card on /admin/profile (owner only).
// Start → scan the QR (or type the secret) → one correct code confirms →
// the ten recovery codes, shown exactly once → done. "Make new codes"
// needs a current code and invalidates all ten.
// My profile re-skin (Cam approved the mockup 2026-11-15): full width, an "Authenticator app" row with "Move to a new
// phone" (or "Set up") and a "Recovery codes" row with "Make new codes"; the flows, calls and errors are as before.
import { useEffect, useState } from 'react';
import { shortDay, codesLow } from '@/app/admin/profile/logic';
import { ProfileCard, ProfileRow, Msg, profileStyles as s } from './ProfileCard';

type Status = { enrolled: boolean; enrolledAt: string | null; recoveryCodesLeft: number };

export default function OwnerTwoFactorCard({ mfaSession }: { mfaSession: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState<{ qrSvg: string; secret: string; enrolToken: string; replacing: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);

  const load = () => {
    setLoadError('');
    fetch('/api/admin/two-factor')
      .then(async r => { if (!r.ok) throw new Error(r.status === 403 ? 'Sign in through the owner login (with 2FA) to manage this.' : `Could not load (${r.status}).`); return r.json() as Promise<Status>; })
      .then(setStatus)
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Could not load.'));
  };
  useEffect(() => { if (mfaSession) load(); }, [mfaSession]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/admin/two-factor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
    return d;
  };

  const start = async () => {
    setBusy(true); setError(''); setCodes(null); setRegenOpen(false);
    try { setSetup(await post({ action: 'start' })); setCode(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start.'); }
    finally { setBusy(false); }
  };
  const confirmCode = async () => {
    if (!setup) return;
    setBusy(true); setError('');
    try {
      const d = await post({ action: 'confirm', enrolToken: setup.enrolToken, code });
      setCodes(d.recoveryCodes); setSetup(null); setCode(''); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not confirm.'); }
    finally { setBusy(false); }
  };
  const regenerate = async () => {
    setBusy(true); setError('');
    try {
      const d = await post({ action: 'regenerate', code });
      setCodes(d.recoveryCodes); setRegenOpen(false); setCode(''); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not regenerate.'); }
    finally { setBusy(false); }
  };
  const copyAll = async () => {
    if (!codes) return;
    try { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('Clipboard blocked — select the codes and copy them by hand.'); }
  };

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
  const open = !!setup || regenOpen || !!codes;   // a flow is open: the row links step aside (as on the mockup)
  const enrolled = !!status?.enrolled;

  return (
    <ProfileCard title="Two-factor" labelId="pf-2fa" wide lead="The app replaces the emailed code, so holding the inbox isn’t enough.">
      {!mfaSession && <p className={s.clr}><a href="/cam" className={s.lnk}>Sign in again</a> to manage this.</p>}
      {mfaSession && loadError && <Msg ok={false}>{loadError} <button type="button" onClick={load} className={s.lnk}>Retry</button></Msg>}
      {mfaSession && !loadError && !status && <p className={s.clr}>Loading…</p>}

      {status && (
        <>
          <ProfileRow dot={enrolled ? 'ok' : 'warn'}
            sub={enrolled ? `Set up${status.enrolledAt ? ` ${shortDay(status.enrolledAt)}` : ''} · asked for at every /cam sign-in` : 'Not set up — emailed codes in use'}
            right={open ? undefined : <button type="button" onClick={start} disabled={busy} className={s.lnk}>{busy ? 'Working…' : enrolled ? 'Move to a new phone' : 'Set up'}</button>}>
            Authenticator app
          </ProfileRow>
          {enrolled && (
            <ProfileRow dot={codesLow(status.recoveryCodesLeft) ? 'warn' : 'ok'} sub={`${status.recoveryCodesLeft} of 10 left · each works once`}
              right={open ? undefined : <button type="button" onClick={() => { setRegenOpen(true); setCode(''); setError(''); }} disabled={busy} className={s.lnk}>Make new codes</button>}>
              Recovery codes
            </ProfileRow>
          )}
        </>
      )}

      {setup && (
        <div className={s.sec}>
          <p className={s.clr}>
            {setup.replacing && 'This replaces the current authenticator. The old device stops working once you confirm. '}
            Scan with your authenticator app. Can’t scan? Enter <span className={s.mono}>{setup.secret}</span> by hand.
          </p>
          <div className={s.inl}>
            <div className={s.qr} role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="tf-code">The 6-digit code it shows</label>
              <div className={s.line}>
                <input id="tf-code" value={code} onChange={e => setCode(digits(e.target.value))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                  className={`${s.fld} ${s.code}`} onKeyDown={e => { if (e.key === 'Enter' && !e.repeat && !busy && code.length === 6) confirmCode(); }} />
                <button type="button" onClick={confirmCode} disabled={busy || code.length < 6} className={`${s.btn} ${s.pri}`}>{busy ? 'Checking…' : 'Confirm'}</button>
                <button type="button" onClick={() => { setSetup(null); setCode(''); setError(''); }} disabled={busy} className={s.btn}>Cancel</button>
              </div>
              <p className={s.clr} style={{ margin: 0 }}>Nothing is saved until a code matches.</p>
            </div>
          </div>
        </div>
      )}

      {regenOpen && !setup && (
        <div className={s.sec}>
          <p className={s.clr} style={{ margin: 0 }}>The ten codes you have now stop working the moment new ones are issued.</p>
          <label htmlFor="tf-regen">Current app code</label>
          <div className={s.line}>
            <input id="tf-regen" value={code} onChange={e => setCode(digits(e.target.value))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
              className={`${s.fld} ${s.code}`} onKeyDown={e => { if (e.key === 'Enter' && !e.repeat && !busy && code.length === 6) regenerate(); }} />
            <button type="button" onClick={regenerate} disabled={busy || code.length < 6} className={`${s.btn} ${s.pri}`}>{busy ? 'Working…' : 'Replace all ten'}</button>
            <button type="button" onClick={() => { setRegenOpen(false); setCode(''); setError(''); }} disabled={busy} className={s.btn}>Cancel</button>
          </div>
        </div>
      )}

      {codes && (
        <div className={s.sec}>
          <span className={s.flowTitle}>Your new recovery codes</span>
          <p className={s.clr} style={{ margin: 0 }}>Save them somewhere safe. Each works once, in place of the app code. They won’t be shown again.</p>
          <div className={s.codes}>{codes.map(c => <span key={c}>{c}</span>)}</div>
          <div className={s.line}>
            <button type="button" onClick={copyAll} className={s.btn}>{copied ? 'Copied' : 'Copy all'}</button>
            <button type="button" onClick={() => setCodes(null)} className={s.btn}>I saved them</button>
          </div>
        </div>
      )}

      {error && <Msg ok={false}>{error}</Msg>}
    </ProfileCard>
  );
}
