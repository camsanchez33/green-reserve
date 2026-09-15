'use client';
// OWNER TOTP 2FA — the enrolment card on /admin/profile (owner only).
// Start → scan the QR (or type the secret) → one correct code confirms →
// the ten recovery codes, shown exactly once → done. "Regenerate codes"
// needs a current code and invalidates all ten.
import { useEffect, useState } from 'react';
import { ShieldCheck, Copy, Check, KeyRound } from 'lucide-react';

type Status = { enrolled: boolean; enrolledAt: string | null; recoveryCodesLeft: number };
const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors w-full';
const btnP = 'bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[12.5px] font-medium px-4 py-2 rounded-md transition-colors';
const btnO = 'bg-paper hover:bg-line border border-line text-ink disabled:opacity-50 text-[12.5px] font-medium px-4 py-2 rounded-md transition-colors';

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
    setBusy(true); setError(''); setCodes(null);
    try { setSetup(await post({ action: 'start' })); setCode(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start.'); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
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

  return (
    <div className="bg-white border border-line rounded-lg p-5 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-pine" />
        <span className="text-sm font-medium text-ink">Two-factor authentication</span>
      </div>
      <p className="text-xs text-ink-muted mb-4">An authenticator app on your phone replaces the emailed code. Once set up, the owner login requires it — holding the inbox is no longer enough.</p>

      {!mfaSession && (
        <p className="text-sm text-ink-soft">Sign in through the <a href="/admin/owner-login" className="text-pine underline">owner login</a> (with 2FA) to manage this.</p>
      )}
      {mfaSession && loadError && (
        <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad text-sm flex items-center justify-between gap-3">{loadError}<button onClick={load} className="text-xs underline">Retry</button></div>
      )}
      {mfaSession && !loadError && !status && <p className="text-xs text-ink-faint">Loading…</p>}

      {status && !setup && !codes && (
        <div>
          <div className="flex items-center justify-between py-2 border-b border-line-soft">
            <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">Authenticator app</span>
            <span className={'text-sm font-medium ' + (status.enrolled ? 'text-ok' : 'text-ink-soft')}>
              {status.enrolled ? `On · since ${new Date(status.enrolledAt as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Not set up — emailed codes in use'}
            </span>
          </div>
          {status.enrolled && (
            <div className="flex items-center justify-between py-2 border-b border-line-soft">
              <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">Recovery codes left</span>
              <span className={'text-sm font-medium ' + (status.recoveryCodesLeft <= 2 ? 'text-warn' : 'text-ink')}>{status.recoveryCodesLeft} of 10</span>
            </div>
          )}
          {error && <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad text-sm mt-3">{error}</div>}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button onClick={start} disabled={busy} className={status.enrolled ? btnO : btnP}>{busy ? 'Working…' : status.enrolled ? 'Set up a new device' : 'Set up authenticator'}</button>
            {status.enrolled && !regenOpen && <button onClick={() => { setRegenOpen(true); setCode(''); setError(''); }} disabled={busy} className={btnO}>Regenerate recovery codes</button>}
          </div>
          {regenOpen && (
            <div className="mt-3 flex items-end gap-2 flex-wrap">
              <div className="w-40">
                <label className="block text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-1.5">Current app code</label>
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className={iCls + ' text-center font-mono tracking-[0.25em]'} />
              </div>
              <button onClick={regenerate} disabled={busy || code.length < 6} className={btnP}>{busy ? 'Working…' : 'Replace all ten'}</button>
              <button onClick={() => setRegenOpen(false)} className="text-xs text-ink-muted hover:text-ink px-1 py-2">Cancel</button>
              <p className="w-full text-[11px] text-ink-faint">The ten codes you have now stop working the moment new ones are issued.</p>
            </div>
          )}
        </div>
      )}

      {setup && (
        <div>
          {setup.replacing && <p className="text-xs text-warn mb-3">This replaces the current authenticator. The old device stops working once you confirm.</p>}
          <div className="grid grid-cols-[200px_1fr] gap-5 items-start">
            <div className="border border-line rounded-md p-2 bg-white" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
            <div className="min-w-0">
              <p className="text-sm text-ink mb-2">Scan with your authenticator app (KeePassXC, 1Password, Google Authenticator…). Can&rsquo;t scan? Enter this secret by hand:</p>
              <code className="block text-xs font-mono bg-paper border border-line rounded-md px-3 py-2 break-all select-all">{setup.secret}</code>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-ink-muted mt-4 mb-1.5">Enter the 6-digit code it shows</label>
              <div className="flex items-center gap-2">
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" autoFocus className={iCls + ' w-40 text-center font-mono tracking-[0.25em]'} onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) confirm(); }} />
                <button onClick={confirm} disabled={busy || code.length < 6} className={btnP}>{busy ? 'Checking…' : 'Confirm'}</button>
                <button onClick={() => { setSetup(null); setCode(''); setError(''); }} disabled={busy} className="text-xs text-ink-muted hover:text-ink px-1 py-2">Cancel</button>
              </div>
              <p className="text-[11px] text-ink-faint mt-2">Nothing is saved until a code matches — an unverified secret would lock you out.</p>
              {error && <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad text-sm mt-3">{error}</div>}
            </div>
          </div>
        </div>
      )}

      {codes && (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-ink mb-1"><KeyRound className="w-4 h-4 text-pine" />Your recovery codes</div>
          <p className="text-sm text-ink-soft mb-3">Save these in KeePassXC now. Each works once, in place of the app code, if the phone is lost. <b className="text-ink">They are shown only this once.</b></p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 bg-paper border border-line rounded-md px-4 py-3 font-mono text-sm select-all">
            {codes.map(c => <span key={c}>{c}</span>)}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={copyAll} className={btnO}>{copied ? <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Copied</span> : <span className="inline-flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" />Copy all</span>}</button>
            <button onClick={() => setCodes(null)} className={btnP}>I saved them</button>
          </div>
        </div>
      )}
    </div>
  );
}
