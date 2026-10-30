'use client';
// PRICE-3 (Cam 2026-10-30: round packs sold "online + counter"): on a course's page and the
// golfer's account page there — the rounds they have left here, and the packs the course sells online. Buying
// goes to the pack's pay link (/pay/shop/[id]), paid on the course's Stripe account; the
// rounds are the signed-in golfer's. Data: /api/courses/[slug]/packs. Bundle: a few hundred
// bytes inside pages that are already client components; the course page mounts it only when
// the course sells packs online (course.sells_packs), so most visits never fetch.
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';

type Pack = { id: string; name: string; rounds: number; priceCents: number; coversCart: boolean; guests: boolean; validDays: number | null };
type Mine = { name: string; left: number; expiresAt: string | null };
const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

export function CoursePacks({ slug, accent, className = '' }: { slug: string; accent: string; className?: string }) {
  const [data, setData] = useState<{ packs: Pack[]; mine: Mine[]; signedIn: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    fetch(`/api/courses/${slug}/packs`).then(r => (r.ok ? r.json() : null)).then(d => d && setData(d)).catch(() => {});
  }, [slug]);
  if (!data || (!data.packs.length && !data.mine.length)) return null;

  async function buy(id: string) {
    // Not signed in: sign in first (the rounds go on the account), then buy from the account page.
    if (!data?.signedIn) { window.location.href = `/courses/${slug}/account`; return; }
    setBusy(id); setError('');
    try {
      const r = await fetch(`/api/courses/${slug}/packs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packId: id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.payUrl) { setError(d.error || 'Something went wrong — try again.'); setBusy(''); return; }
      window.location.href = d.payUrl;
    } catch { setError('Something went wrong — try again.'); setBusy(''); }
  }

  return (
    <section className={className}>
      <h2 className="text-[15px] font-semibold text-ink mb-3">Round packs</h2>
      {data.mine.length > 0 && (
        <ul className="mb-3 text-sm text-ink space-y-1">
          {data.mine.map((m, i) => <li key={i}>{m.name}: <b>{m.left}</b> round{m.left === 1 ? '' : 's'} left{m.expiresAt ? `, until ${new Date(m.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}. Tick “Use my round pack” when you book.</li>)}
        </ul>
      )}
      {data.packs.length > 0 && (
        <Card><ul className="divide-y divide-line-soft">
          {data.packs.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-ink">{p.name}</span>
                <span className="block text-ink-muted">{p.rounds} rounds{p.coversCart ? ', cart included' : ''}{p.guests ? ', for you and your guests' : ''}{p.validDays ? `, good for ${p.validDays} days` : ''}</span>
              </span>
              <button onClick={() => buy(p.id)} disabled={!!busy} className="shrink-0 px-3 py-2 rounded-md text-white font-medium disabled:opacity-50" style={{ backgroundColor: accent }}>
                {busy === p.id ? 'Opening…' : `Buy ${usd(p.priceCents)}`}
              </button>
            </li>
          ))}
        </ul></Card>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
    </section>
  );
}
