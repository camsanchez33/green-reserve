'use client';
// W2-9d: the sign-up form — whoever fills it in, plus up to three more players.
// Name and email for the person signing up; name for each other player (their
// email and mobile are optional); the course's own questions for everyone.
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { INPUT as FIELD } from '@/components/ui/field';

type Question = { id: string; label: string; required: boolean };
type Player = { name: string; email: string; phone: string; answers: Record<string, string> };
const INPUT = `${FIELD} w-full`;
const blank = (): Player => ({ name: '', email: '', phone: '', answers: {} });
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SignupForm({ eventId, accent, maxGroup, questions, payNow, priceCents, feeCents, spotsLeft, courseName }: {
  eventId: string; accent: string; maxGroup: number; questions: Question[]; payNow: boolean; priceCents: number; feeCents: number; spotsLeft: number | null; courseName: string;
}) {
  const [players, setPlayers] = useState<Player[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ status: 'in' | 'waitlist'; names: string[] } | null>(null);
  const n = players.length;
  const wouldWait = spotsLeft != null && n > spotsLeft;
  const set = (i: number, p: Partial<Player>) => setPlayers(ps => ps.map((x, j) => j === i ? { ...x, ...p } : x));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/event-signup/${eventId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ players }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'That didn’t go through — try again.'); setBusy(false); return; }
      if (data.status === 'pay' && data.payUrl) { window.location.href = data.payUrl; return; }
      setDone({ status: data.status, names: data.names ?? [] });
    } catch {
      setError('Network error — nothing was saved. Check your connection and try again.');
    }
    setBusy(false);
  }

  if (done) return (
    <Card className="p-5">
      <h2 className="font-serif text-[24px] font-semibold text-ink">{done.status === 'waitlist' ? 'You’re on the waiting list' : 'You’re signed up'}</h2>
      <p className="text-sm text-ink mt-2">
        {done.status === 'waitlist'
          ? `The event is full, so ${done.names.join(', ')} ${done.names.length === 1 ? 'is' : 'are'} on the waiting list. ${courseName} will email you if a spot opens. Nothing was charged.`
          : `${done.names.join(', ')} ${done.names.length === 1 ? 'is' : 'are'} on the list.${priceCents > 0 ? ` ${courseName} will collect the entry before the event.` : ''}`}
      </p>
      <p className="text-sm text-ink-soft mt-2">We’ve emailed you the details.</p>
    </Card>
  );

  const total = (priceCents + feeCents) * n;
  return (
    <form onSubmit={submit} className="space-y-4">
      {players.map((p, i) => (
        <Card key={i} className="p-5">
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h2 className="text-[15px] font-semibold text-ink">{i === 0 ? 'You' : `Player ${i + 1}`}</h2>
            {i > 0 && <button type="button" onClick={() => setPlayers(ps => ps.filter((_, j) => j !== i))} className="text-[13px] text-ink-soft hover:text-bad">Remove</button>}
          </div>
          <div className="space-y-3">
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1">Name</span>
              <input required maxLength={120} autoComplete={i === 0 ? 'name' : 'off'} className={INPUT} value={p.name} onChange={ev => set(i, { name: ev.target.value })} /></label>
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1">Email{i > 0 && <span className="font-normal text-ink-muted"> (optional)</span>}</span>
              <input type="email" required={i === 0} maxLength={200} autoComplete={i === 0 ? 'email' : 'off'} className={INPUT} value={p.email} onChange={ev => set(i, { email: ev.target.value })} /></label>
            <label className="block"><span className="block text-[13px] font-medium text-ink mb-1">Mobile <span className="font-normal text-ink-muted">(optional)</span></span>
              <input type="tel" maxLength={40} autoComplete={i === 0 ? 'tel' : 'off'} className={INPUT} value={p.phone} onChange={ev => set(i, { phone: ev.target.value })} /></label>
            {questions.map(q => (
              <label key={q.id} className="block"><span className="block text-[13px] font-medium text-ink mb-1">{q.label}{!q.required && <span className="font-normal text-ink-muted"> (optional)</span>}</span>
                <input required={q.required} maxLength={300} className={INPUT} value={p.answers[q.id] ?? ''} onChange={ev => set(i, { answers: { ...p.answers, [q.id]: ev.target.value } })} /></label>
            ))}
          </div>
        </Card>
      ))}
      {n < maxGroup && <button type="button" onClick={() => setPlayers(ps => [...ps, blank()])} className="px-3 py-2 rounded-md text-[13px] font-medium bg-white border border-line text-ink hover:bg-paper">Add a player</button>}

      {wouldWait && <p className="text-sm text-ink border-l-[3px] border-warn pl-3">{spotsLeft === 0 ? 'The event is full.' : `Only ${spotsLeft} spot${spotsLeft === 1 ? ' is' : 's are'} left, so your group of ${n} can’t all fit.`} Signing up puts you on the waiting list{payNow ? ' — nothing is charged' : ''}.</p>}
      {error && <p className="text-sm text-bad bg-bad/5 border border-bad/20 rounded-md px-3 py-2" role="alert">{error}</p>}
      {payNow && !wouldWait && <p className="text-sm text-ink">You’ll pay {usd(total)}{feeCents ? ` (including GreenReserve’s ${usd(feeCents)}-per-player service fee)` : ''} on the next page. Your spot{n === 1 ? ' is' : 's are'} held for 30 minutes while you do.</p>}
      <button type="submit" disabled={busy} className="w-full py-3.5 rounded-md font-medium text-white text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-70" style={{ backgroundColor: accent || '#173B2A' }}>
        {busy ? <><Loader2 size={16} className="animate-spin" /> Signing up…</> : wouldWait ? 'Join the waiting list' : payNow ? 'Continue to payment' : `Sign up${n > 1 ? ` ${n} players` : ''}`}
      </button>
    </form>
  );
}
