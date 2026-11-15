'use client';
// AW-1c (Cam 2026-10-21): the devices approved for the owner sign-in. Removing
// one signs it out at once; signing in from it again needs a new approval.
// My profile re-skin (Cam approved the mockup 2026-11-15): one row per device, "· this device" on the current one; the
// calls, the step-up and every error are as before.
import { useCallback, useEffect, useState } from 'react';
import { stepUpFetch } from '@/lib/step-up-client';
import { deviceLine } from '@/app/admin/profile/logic';
import { ProfileCard, ProfileRow, Msg, useConfirm, profileStyles as s } from './ProfileCard';

type Device = { id: string; name: string; approvedAt: string; lastUsedAt: string | null; current: boolean };

async function call(method: string, body?: unknown) {
  const r = await stepUpFetch('/api/admin/owner-devices', { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export default function OwnerDevicesCard() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [dialog, ask] = useConfirm();

  const load = useCallback(async () => {
    setError('');
    const r = await call('GET').catch(() => ({ ok: false, data: { error: 'Network error — couldn’t load your devices.' } }));
    if (!r.ok) { setError(r.data.error || 'Couldn’t load your devices.'); return; }
    setDevices(r.data.devices);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(d: Device) {
    const warn = d.current ? 'This is the device you’re using — you’ll be signed out now, and signing in here again will need a new approval.' : 'It will be signed out now, and signing in from it again will need a new approval.';
    if (!await ask(`Remove ${d.name}?`, warn, 'Remove')) return;
    setBusy(d.id); setError('');
    const r = await call('DELETE', { id: d.id }).catch(() => ({ ok: false, data: { error: 'Network error — nothing was removed.' } }));
    setBusy('');
    if (!r.ok) { setError(r.data.error || 'Couldn’t remove it — try again.'); return; }
    if (r.data.signedOut) { window.location.assign('/cam'); return; }
    setDevices(r.data.devices);
  }

  return (
    <ProfileCard title="Your devices" labelId="pf-devices" lead="Approved for the owner sign-in. Remove any you don’t recognise.">
      {devices && devices.map(d => (
        <ProfileRow key={d.id} dot={d.current ? 'ok' : 'none'} sub={deviceLine(d.approvedAt, d.lastUsedAt)}
          right={<button type="button" onClick={() => remove(d)} disabled={busy !== ''} className={`${s.btn} ${s.dng} ${s.sm}`}>{busy === d.id ? 'Removing…' : 'Remove'}</button>}>
          {d.name}{d.current && <span className={s.tag}> · this device</span>}
        </ProfileRow>
      ))}
      {devices && devices.length === 0 && <p className={s.clr}>No approved devices.</p>}
      {devices === null && !error && <p className={s.clr}>Loading…</p>}
      {error && <Msg ok={false}>{error} {devices === null && <button type="button" onClick={load} className={s.lnk}>Try again</button>}</Msg>}
      {dialog}
    </ProfileCard>
  );
}
