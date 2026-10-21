'use client';
// AW-1c (Cam 2026-10-21): the devices approved for the owner sign-in. Removing
// one signs it out at once; signing in from it again needs a new approval.
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { stepUpFetch } from '@/lib/step-up-client';

type Device = { id: string; name: string; approvedAt: string; lastUsedAt: string | null; current: boolean };
const day = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

async function call(method: string, body?: unknown) {
  const r = await stepUpFetch('/api/admin/owner-devices', { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export default function OwnerDevicesCard() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const r = await call('GET').catch(() => ({ ok: false, data: { error: 'Network error — couldn’t load your devices.' } }));
    if (!r.ok) { setError(r.data.error || 'Couldn’t load your devices.'); return; }
    setDevices(r.data.devices);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(d: Device) {
    const warn = d.current ? 'This is the device you’re using — you’ll be signed out now, and signing in here again will need a new approval.' : 'It will be signed out now, and signing in from it again will need a new approval.';
    if (!confirm(`Remove "${d.name}"? ${warn}`)) return;
    setBusy(d.id); setError('');
    const r = await call('DELETE', { id: d.id }).catch(() => ({ ok: false, data: { error: 'Network error — nothing was removed.' } }));
    setBusy('');
    if (!r.ok) { setError(r.data.error || 'Couldn’t remove it — try again.'); return; }
    if (r.data.signedOut) { window.location.assign('/cam'); return; }
    setDevices(r.data.devices);
  }

  return (
    <Card className="p-5 mb-5">
      <h2 className="text-[15px] font-semibold text-ink mb-1">Your devices</h2>
      <p className="text-[13.5px] text-ink-soft mb-3">Devices you’ve approved for the owner sign-in. Remove one you no longer use or don’t recognise.</p>
      {devices && devices.length > 0 && (
        <ul className="divide-y divide-line-soft">
          {devices.map(d => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
              <span className="text-ink">{d.name}{d.current ? ' (this device)' : ''}<span className="text-ink-muted"> · approved {day(d.approvedAt)}{d.lastUsedAt ? ` · last used ${day(d.lastUsedAt)}` : ''}</span></span>
              <button type="button" onClick={() => remove(d)} disabled={busy !== ''} className="text-[13px] text-ink-soft hover:text-bad disabled:opacity-50">{busy === d.id ? 'Removing…' : 'Remove'}</button>
            </li>
          ))}
        </ul>
      )}
      {devices && devices.length === 0 && <p className="text-[13.5px] text-ink">No approved devices.</p>}
      {devices === null && !error && <p className="text-[13.5px] text-ink-muted">Loading…</p>}
      {error && <p className="text-[13px] text-bad mt-3" role="alert">{error} {devices === null && <button type="button" onClick={load} className="underline">Try again</button>}</p>}
    </Card>
  );
}
