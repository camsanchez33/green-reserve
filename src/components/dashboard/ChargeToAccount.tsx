'use client';
// MEM-ACCT (Cam 2026-10-30: member billing — rounds and guest fees "on account"): the tee-sheet
// card's "On account". Pick the member; the whole group (their guests included) goes on that
// member's account and is checked in, like cash at the counter. A charge past the tier's limit,
// or for a member who isn't active, is refused with the reason.
// Data: /api/operator/member-accounts (picker), PATCH /api/operator/bookings action charge_account.
import { useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';

type Member = { id: string; name: string; tierName: string; balanceCents: number; limitCents: number | null };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function ChargeToAccount({ booking, onDone, className }: { booking: { id: string; golferName: string; players: number }; onDone: (msg: string, note?: string | null) => void; className: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await dfetch<{ members: Member[] }>(`/api/operator/member-accounts?q=${encodeURIComponent(q)}`);
      if (!live) return;
      if (r.ok) { setMembers(r.data.members); setError(''); } else setError(r.error);
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [open, q]);

  async function charge(m: Member) {
    if (!confirm(`Put ${booking.golferName}'s round (${booking.players} player${booking.players === 1 ? '' : 's'}) on ${m.name}'s account and check them in?`)) return;
    setBusy(m.id); setError('');
    const r = await dfetch<{ amountCents: number; fee?: string | null }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: booking.id, action: 'charge_account', membershipId: m.id }) });
    setBusy('');
    if (!r.ok) { setError(r.error); return; }
    setOpen(false);
    onDone(`${usd(r.data.amountCents)} on ${m.name}'s account — ${booking.golferName} is checked in.`, r.data.fee);
  }

  if (!open) return <button onClick={() => setOpen(true)} className={className}>On account</button>;
  return (
    <div className="w-full mt-2 bg-paper/70 rounded-md p-2 text-[13px]">
      <div className="flex items-center gap-2">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find the member" aria-label="Find the member" className="flex-1 bg-white border border-line rounded-md px-2 py-1.5 text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10" />
        <button onClick={() => { setOpen(false); setError(''); }} className="text-ink-soft hover:text-ink px-1">Cancel</button>
      </div>
      {members && members.length === 0 && <p className="mt-2 text-ink">No active members with an account{q ? ' match' : ''}.</p>}
      {members && members.length > 0 && (
        <ul className="mt-1 divide-y divide-line-soft">
          {members.map(m => (
            <li key={m.id}>
              <button onClick={() => charge(m)} disabled={!!busy} className="w-full flex flex-wrap items-baseline gap-x-2 py-1.5 text-left hover:bg-white disabled:opacity-50">
                <span className="font-medium text-ink">{busy === m.id ? 'Charging…' : m.name}</span>
                <span className="text-ink-muted">{m.tierName}</span>
                <span className="ml-auto tabular-nums text-ink-soft">{usd(m.balanceCents)}{m.limitCents != null ? ` of ${usd(m.limitCents)}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-bad">{error}</p>}
    </div>
  );
}
