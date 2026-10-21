'use client';
// AW-1c (Cam 2026-10-21: risky actions re-confirmed): "Confirm it's you". Mounted
// once in the admin layout for the owner; stepUpFetch opens it when a risky
// route asks, and the refused request is sent again once it resolves true.
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { INPUT } from '@/components/ui/field';
import { registerStepUpHandler } from '@/lib/step-up-client';

type Factors = { passkey: Record<string, unknown> | null; code: boolean };

async function post(body: unknown) {
  const r = await fetch('/api/cam/step-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data: data as { error?: string } };
}

export default function StepUpDialog() {
  const [open, setOpen] = useState(false);
  const [factors, setFactors] = useState<Factors | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  async function loadFactors() {
    setFactors(null); setError('');
    try {
      const r = await fetch('/api/cam/step-up');
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error || 'Couldn’t start — sign in again.'); return; }
      setFactors({ passkey: data.passkey ?? null, code: !!data.code });
    } catch { setError('Network error — check your connection and try again.'); }
  }

  useEffect(() => {
    registerStepUpHandler(() => new Promise<boolean>(resolve => {
      resolver.current = resolve;
      setCode(''); setOpen(true); loadFactors();
    }));
    return () => registerStepUpHandler(null);
  }, []);

  function finish(ok: boolean) {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  }

  async function confirmWithPasskey() {
    if (!factors?.passkey) return;
    setBusy(true); setError('');
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser');
      let response;
      try { response = await startAuthentication({ optionsJSON: factors.passkey as unknown as Parameters<typeof startAuthentication>[0]['optionsJSON'] }); }
      catch { setError('The passkey prompt was cancelled or didn’t work — try again, or use a code.'); await loadFactors(); return; }
      const r = await post({ response });
      if (!r.ok) { setError(r.data.error || 'That didn’t check out — try again.'); await loadFactors(); return; }
      finish(true);
    } catch { setError('Network error — check your connection and try again.'); }
    finally { setBusy(false); }
  }

  async function confirmWithCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await post({ code });
      if (!r.ok) { setError(r.data.error || 'That code didn’t match — try again.'); return; }
      finish(true);
    } catch { setError('Network error — check your connection and try again.'); }
    finally { setBusy(false); }
  }

  if (!open) return null;
  return (
    <Modal title="Confirm it’s you" size="sm" onClose={() => finish(false)}>
      <p className="text-[13.5px] text-ink-soft mb-4">This change needs a fresh check. Once confirmed, it goes through and you won’t be asked again for five minutes.</p>
      {!factors && !error && <p className="text-[13.5px] text-ink-muted">Loading…</p>}
      {factors?.passkey && (
        <button type="button" onClick={confirmWithPasskey} disabled={busy} className="w-full bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[13px] font-medium py-2.5 rounded-md transition-colors mb-3">
          {busy ? 'Waiting for your passkey…' : 'Use your passkey'}
        </button>
      )}
      {factors?.code && (
        <form onSubmit={confirmWithCode} className="space-y-2">
          <label htmlFor="step-up-code" className="block text-[13px] font-medium text-ink">{factors.passkey ? 'Or enter an authenticator or recovery code' : 'Authenticator or recovery code'}</label>
          <input id="step-up-code" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode="text" className={`${INPUT} w-full`} />
          <button type="submit" disabled={busy || !code.trim()} className={`w-full ${factors.passkey ? 'border border-line text-ink hover:bg-paper' : 'bg-pine hover:bg-pine-hover text-white'} disabled:opacity-50 text-[13px] font-medium py-2.5 rounded-md transition-colors`}>Confirm</button>
        </form>
      )}
      {factors && !factors.passkey && !factors.code && <p className="text-[13.5px] text-ink">Set up the authenticator app on My profile first.</p>}
      {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
      {error && !factors && <button type="button" onClick={loadFactors} className="mt-2 text-[13px] text-pine underline">Try again</button>}
    </Modal>
  );
}
