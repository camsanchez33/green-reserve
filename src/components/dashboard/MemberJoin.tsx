'use client';
// The Members page's membership odds and ends. MEM-RENEW: AutoRenewFields (a tier's automatic renewal) and AutoRenewStop
// (staff turn a member's off, never on). UnpaidMembers: members added at the counter who haven't paid yet, with Remove
// (/api/operator/members action remove_unpaid). Join online is gone for good (GOLFER-SIGNIN-RETIRED, Cam 2026-11-18).
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { dfetch } from '@/lib/dashboard-fetch';

/** MEM-RENEW: the tier's automatic renewal (golfers agree when they pay) and what a declined renewal does. */
export function AutoRenewFields({ on, retry, onChange }: { on: boolean | undefined; retry: boolean | undefined; onChange: (k: 'autoRenew' | 'autoRenewRetry', v: boolean) => void }) {
  return (
    <div className="col-span-2 space-y-1.5 text-[13.5px] text-ink">
      <label className="flex items-center gap-2"><input type="checkbox" className="accent-pine" checked={!!on} onChange={e => onChange('autoRenew', e.target.checked)} />Renew automatically — golfers agree when they pay, and can turn it off</label>
      {on && <label className="flex items-center gap-2 pl-6"><input type="checkbox" className="accent-pine" checked={retry !== false} onChange={e => onChange('autoRenewRetry', e.target.checked)} />If the card is declined, try once more 3 days later</label>}
    </div>
  );
}

/** MEM-RENEW: a member's automatic renewal on the Members row — staff can turn it off, never on. */
export function AutoRenewStop({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function stop() {
    setBusy(true); setError('');
    const r = await dfetch('/api/operator/members', { method: 'PATCH', body: JSON.stringify({ id, action: 'stop_auto_renew' }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onChanged();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <StatusDot status="ok" label="Auto-renew on" />
      <button onClick={stop} disabled={busy} className="text-[13px] font-medium text-ink-soft hover:text-ink disabled:opacity-50">{busy ? 'Turning off…' : 'Turn off'}</button>
      {error && <span role="alert" className="text-[12.5px] text-bad">{error}</span>}
    </span>
  );
}

type Row = { id: string; name: string; email: string; tierName: string; status: string; createdAt: string };

/** Members of this membership who haven't paid yet (added at the counter, then walked away): Remove drops them. */
export function UnpaidMembers({ members, canEdit, onChanged }: { members: Row[]; canEdit: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const rows = members.filter(m => m.status === 'requested' || m.status === 'awaiting_payment');
  if (!rows.length) return null;
  async function remove(id: string) {
    setBusy(id); setError('');
    const r = await dfetch('/api/operator/members', { method: 'PATCH', body: JSON.stringify({ id, action: 'remove_unpaid' }) });
    setBusy('');
    if (!r.ok) { setError(r.error); return; }
    onChanged();
  }
  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold text-ink">Not paid yet</h2>
      <ul className="mt-2 divide-y divide-line-soft text-[13.5px]">
        {rows.map(m => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="text-ink font-medium">{m.name || m.email}</span>
            <span className="text-ink-muted">{m.tierName}</span>
            <StatusDot status="neutral" label="Not paid yet" />
            {canEdit && (
              <span className="ml-auto flex gap-3">
                <button onClick={() => remove(m.id)} disabled={!!busy} className="text-ink-soft hover:text-ink disabled:opacity-50">{busy === m.id ? 'Removing…' : 'Remove'}</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{error}</p>}
    </Card>
  );
}
