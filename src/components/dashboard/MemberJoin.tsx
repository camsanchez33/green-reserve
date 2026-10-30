'use client';
// MEM-JOIN (Cam 2026-10-30: "Join online", "Course decides per tier"): the Members page's
// online joining. JoinOnlineSelect sets a tier's mode; JoinRequests lists golfers who asked to
// join (approve → the dues pay link is emailed; decline) and those who joined but haven't paid.
// Data: /api/operator/members (actions approve_join / decline_join), lib/membership-join.ts.
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { dfetch } from '@/lib/dashboard-fetch';

export function JoinOnlineSelect({ value, onChange, className }: { value: string | undefined; onChange: (v: string) => void; className: string }) {
  return (
    <label className="col-span-2 block text-[13.5px] text-ink">Join online
      <select value={value ?? 'off'} onChange={e => onChange(e.target.value)} className={className + ' mt-1'}>
        <option value="off">Off — staff add members</option>
        <option value="instant">Pay and join — a member once the dues are paid</option>
        <option value="request">Request to join — you approve, then they pay</option>
      </select>
    </label>
  );
}

type Row = { id: string; name: string; email: string; tierName: string; status: string; createdAt: string };

export function JoinRequests({ members, canEdit, onChanged }: { members: Row[]; canEdit: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const rows = members.filter(m => m.status === 'requested' || m.status === 'awaiting_payment');
  if (!rows.length) return null;
  async function act(id: string, action: 'approve_join' | 'decline_join') {
    setBusy(id + action); setError(''); setNote('');
    const r = await dfetch<{ sent?: boolean; note?: string }>('/api/operator/members', { method: 'PATCH', body: JSON.stringify({ id, action }) });
    setBusy('');
    if (!r.ok) { setError(r.error); return; }
    if (action === 'approve_join') setNote(r.data?.sent ? 'Approved — the pay link is on its way.' : `Approved, but the pay link wasn’t sent: ${r.data?.note ?? ''}`);
    onChanged();
  }
  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold text-ink">Joining online</h2>
      <ul className="mt-2 divide-y divide-line-soft text-[13.5px]">
        {rows.map(m => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="text-ink font-medium">{m.name || m.email}</span>
            <span className="text-ink-muted">{m.tierName}</span>
            <StatusDot status={m.status === 'requested' ? 'warn' : 'neutral'} label={m.status === 'requested' ? 'Asked to join' : 'Not paid yet'} />
            {canEdit && (
              <span className="ml-auto flex gap-3">
                {m.status === 'requested' && <button onClick={() => act(m.id, 'approve_join')} disabled={!!busy} className="text-pine font-medium hover:underline underline-offset-4 disabled:opacity-50">{busy === m.id + 'approve_join' ? 'Approving…' : 'Approve'}</button>}
                <button onClick={() => act(m.id, 'decline_join')} disabled={!!busy} className="text-ink-soft hover:text-ink disabled:opacity-50">{busy === m.id + 'decline_join' ? 'Removing…' : m.status === 'requested' ? 'Decline' : 'Remove'}</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-[12.5px] text-ink-muted">{note}</p>}
      {error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{error}</p>}
    </Card>
  );
}
