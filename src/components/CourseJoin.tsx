'use client';
// MEM-JOIN (Cam 2026-10-30: "Join online", "Course decides per tier"): on a course's page and
// the golfer's account page there — the memberships a golfer can join online and where they
// stand. "Pay and join" goes to the dues pay link (/membership/[id]); "Request to join" waits
// for the course. Data: /api/courses/[slug]/join. Bundle: small, inside pages that are already
// client components; the course page mounts it only when the course offers joining online.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';

type Tier = { id: string; name: string; joinOnline: string; annualFeeCents: number; initiationFeeCents: number; termMonths: number; greenFeeWeekdayCents: number | null; greenFeeWeekendCents: number | null; cartFeeWeekdayCents: number | null; discountPct: number | null; guestsPayMemberRate: boolean };
type Mine = { status: string; tierName: string; payUrl: string | null } | null;
const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const term = (m: number) => (m === 12 ? 'a year' : m === 1 ? 'a month' : `every ${m} months`);
function perks(t: Tier) {
  const green = t.discountPct != null ? `${t.discountPct}% off green fees`
    : t.greenFeeWeekdayCents === 0 && (t.greenFeeWeekendCents ?? 0) === 0 ? 'green fees included'
    : t.greenFeeWeekdayCents != null ? `green fee ${usd(t.greenFeeWeekdayCents)}${t.greenFeeWeekendCents != null && t.greenFeeWeekendCents !== t.greenFeeWeekdayCents ? ` (${usd(t.greenFeeWeekendCents)} weekends)` : ''}` : '';
  return [green, t.cartFeeWeekdayCents === 0 ? 'cart included' : '', t.guestsPayMemberRate ? 'guests at the member rate' : '', t.initiationFeeCents ? `${usd(t.initiationFeeCents)} to join` : ''].filter(Boolean).join(' · ');
}

export function CourseJoin({ slug, accent, className = '' }: { slug: string; accent: string; className?: string }) {
  const [data, setData] = useState<{ tiers: Tier[]; mine: Mine; signedIn: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  useEffect(() => {
    fetch(`/api/courses/${slug}/join`).then(r => (r.ok ? r.json() : null)).then(d => d && setData(d)).catch(() => {});
  }, [slug, sent]);
  if (!data || (!data.tiers.length && !data.mine)) return null;

  async function join(id: string) {
    if (!data?.signedIn) { window.location.href = `/courses/${slug}/account`; return; }
    setBusy(id); setError('');
    try {
      const r = await fetch(`/api/courses/${slug}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tierId: id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Something went wrong — try again.'); setBusy(''); return; }
      if (d.payUrl) { window.location.href = d.payUrl; return; }
      setBusy(''); setSent(s => !s);
    } catch { setError('Something went wrong — try again.'); setBusy(''); }
  }

  const mine = data.mine;
  return (
    <section className={className}>
      <h2 className="text-[15px] font-semibold text-ink mb-3">Memberships</h2>
      {mine?.status === 'active' && <p className="text-sm text-ink mb-3">You’re a member{mine.tierName ? ` — ${mine.tierName}` : ''}.</p>}
      {mine?.status === 'requested' && <p className="text-sm text-ink mb-3">You asked to join{mine.tierName ? ` ${mine.tierName}` : ''}. The course will email you a link to pay once they approve.</p>}
      {mine?.status === 'awaiting_payment' && mine.payUrl && <p className="text-sm text-ink mb-3">You’re joining {mine.tierName}. <Link href={mine.payUrl} className="font-medium underline underline-offset-4" style={{ color: accent }}>Pay the dues</Link> to finish.</p>}
      {!mine && data.tiers.length > 0 && (
        <Card><ul className="divide-y divide-line-soft">
          {data.tiers.map(t => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-ink">{t.name}</span> <span className="text-ink-soft">{usd(t.annualFeeCents)} {term(t.termMonths)}</span>
                {perks(t) && <span className="block text-ink-muted">{perks(t)}</span>}
              </span>
              <button onClick={() => join(t.id)} disabled={!!busy} className="shrink-0 px-3 py-2 rounded-md text-white font-medium disabled:opacity-50" style={{ backgroundColor: accent }}>
                {busy === t.id ? 'Opening…' : t.joinOnline === 'request' ? 'Request to join' : 'Join'}
              </button>
            </li>
          ))}
        </ul></Card>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
    </section>
  );
}
