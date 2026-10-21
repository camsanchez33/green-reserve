'use client';
// AW-1: the emailed "approve a new device" link lands here. Opening it changes
// nothing; the button approves. It never signs anyone in.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/Card';

function Approve() {
  const token = useSearchParams().get('token') ?? '';
  const [info, setInfo] = useState<{ device: string; requestedAt: string | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/cam/device?token=${encodeURIComponent(token)}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (r.ok) setInfo(d); else setError(d.error || 'This link can’t be used.'); })
      .catch(() => setError('Network error — check your connection and reload.'));
  }, [token]);

  async function approve() {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/cam/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Couldn’t approve it — sign in again for a new link.'); return; }
      setDone(true);
    } catch { setError('Network error — nothing was approved. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <Card className="p-8">
      <h1 className="text-[22px] font-serif font-semibold text-ink mb-3">{done ? 'Device approved' : 'Approve this device?'}</h1>
      {error && <p className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-ink text-sm mb-4" role="alert">{error}</p>}
      {done ? (
        <p className="text-[14px] text-ink">Go back to the device you were signing in on and sign in again.</p>
      ) : info ? (
        <>
          <p className="text-[14px] text-ink mb-1">{info.device}</p>
          {info.requestedAt && <p className="text-[13px] text-ink-muted mb-5">Asked {new Date(info.requestedAt).toLocaleString()}</p>}
          <p className="text-[13.5px] text-ink mb-5">Only approve it if you just tried to sign in on it. If you didn’t, close this page and change your password.</p>
          <button type="button" onClick={approve} disabled={busy} className="w-full bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[13px] font-medium py-2.5 rounded-md transition-colors">{busy ? 'Approving…' : 'Approve this device'}</button>
        </>
      ) : !error ? <p className="text-sm text-ink-muted">Checking the link…</p> : null}
    </Card>
  );
}

export default function ApproveDevicePage() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={190} height={36} priority className="w-[190px] max-w-full h-auto mx-auto" />
        </div>
        <Suspense fallback={<p className="text-sm text-ink-muted text-center">Loading…</p>}><Approve /></Suspense>
      </div>
    </div>
  );
}
