'use client';
// MEM-ACCT 1b (Cam 2026-10-31: pro shop on account): the register's member picker for the
// "On account" tender — find the member, see their balance against the limit, pick one.
// Data: /api/operator/member-accounts?q= (the same list the tee sheet's On account uses).
import { useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';

export type AccountMember = { id: string; name: string; tierName: string; balanceCents: number; limitCents: number | null };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function AccountPicker({ picked, onPick, className }: { picked: AccountMember | null; onPick: (m: AccountMember | null) => void; className: string }) {
  const [q, setQ] = useState('');
  const [members, setMembers] = useState<AccountMember[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (picked) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await dfetch<{ members: AccountMember[] }>(`/api/operator/member-accounts?q=${encodeURIComponent(q)}`);
      if (!live) return;
      if (r.ok) { setMembers(r.data.members); setError(''); } else setError(r.error);
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, picked]);

  if (picked) return (
    <div className="flex items-baseline gap-2 text-[13.5px]">
      <span className="font-medium text-ink">{picked.name}</span>
      <span className="tabular-nums text-ink-muted">{usd(picked.balanceCents)}{picked.limitCents != null ? ` of ${usd(picked.limitCents)}` : ''}</span>
      <button type="button" onClick={() => onPick(null)} className="ml-auto text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2">Change</button>
    </div>
  );
  return (
    <div className="space-y-1">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find the member" aria-label="Find the member" className={className + ' w-full'} />
      {error && <p role="alert" className="text-[12.5px] text-bad">{error}</p>}
      {members && members.length === 0 && <p className="text-[12.5px] text-ink">No active members with an account{q ? ' match' : ''}.</p>}
      {members && members.length > 0 && (
        <ul className="divide-y divide-line-soft max-h-48 overflow-y-auto text-[13px]">
          {members.map(m => (
            <li key={m.id}>
              <button type="button" onClick={() => onPick(m)} className="w-full flex flex-wrap items-baseline gap-x-2 py-1.5 text-left hover:bg-paper">
                <span className="font-medium text-ink">{m.name}</span>
                <span className="text-ink-muted">{m.tierName}</span>
                <span className="ml-auto tabular-nums text-ink-soft">{usd(m.balanceCents)}{m.limitCents != null ? ` of ${usd(m.limitCents)}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
