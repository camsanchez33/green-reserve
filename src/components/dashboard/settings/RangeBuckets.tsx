'use client';
// RANGE-1 (Cam 2026-11-17/18): the course's ONE range-bucket list — name, balls, price — and "Sell range balls with
// tee times". Every place a bucket is sold reads this list (lib/range-buckets): online bookings (only with the switch
// on), checkout's Range balls rows, the register (they are pro-shop items in the "Range" category), receipts and
// Revenue's Range line. Each row saves itself (/api/operator/range-buckets, shop.catalog); the switch is the owner's
// (/api/operator/settings). Minimal on purpose: the Dashboard lane moves it into the rebuilt Settings / Pro shop.
import { useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { FIELD } from './ui';

type Bucket = { id: string; name: string; rangeBalls: number | null; priceCents: number; active: boolean };
type Data = { buckets: Bucket[]; sellRangeOnline: boolean; rangeBallsFree: boolean; ownerLogin: boolean };

const dollars = (c: number) => (c / 100).toFixed(2);
const cents = (v: string) => Math.round(Number(v) * 100);
const BTN = 'rounded-[7px] border border-line px-3 py-1.5 text-[13px] text-ink hover:bg-paper disabled:opacity-40';

function Row({ b, onSaved }: { b: Bucket; onSaved: (b: Bucket) => void }) {
  const [name, setName] = useState(b.name);
  const [balls, setBalls] = useState(String(b.rangeBalls ?? ''));
  const [price, setPrice] = useState(dollars(b.priceCents));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = name.trim() !== b.name || Number(balls) !== b.rangeBalls || cents(price) !== b.priceCents;
  async function save(body: Record<string, unknown>) {
    setBusy(true); setError('');
    const r = await dfetch<{ bucket: Bucket }>('/api/operator/range-buckets', { method: 'PATCH', body: JSON.stringify({ id: b.id, ...body }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onSaved(r.data.bucket);
  }
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} aria-label="Bucket name" className={FIELD + ' !w-40'} disabled={!b.active} />
        <input value={balls} onChange={e => setBalls(e.target.value)} aria-label="Balls" inputMode="numeric" className={FIELD + ' !w-20'} disabled={!b.active} />
        <span className="text-[13px] text-ink-muted">balls · $</span>
        <input value={price} onChange={e => setPrice(e.target.value)} aria-label="Price" inputMode="decimal" className={FIELD + ' !w-24'} disabled={!b.active} />
        {b.active && changed && <button type="button" disabled={busy} onClick={() => save({ name, balls: Number(balls), priceCents: cents(price) })} className={BTN}>{busy ? 'Saving…' : 'Save'}</button>}
        <button type="button" disabled={busy} onClick={() => save({ active: !b.active })} className={BTN}>{b.active ? 'Stop selling' : 'Sell again'}</button>
      </div>
      {error && <p role="alert" className="mt-1 text-[12.5px] text-bad">{error}</p>}
    </li>
  );
}

export function RangeBuckets() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState('');
  const [add, setAdd] = useState({ name: '', balls: '', price: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dfetch<Data>('/api/operator/range-buckets').then(r => { if (r.ok) setData(r.data); else setLoadError(r.error); });
  }, []);
  if (loadError) return <p role="alert" className="text-[12.5px] text-bad">Range buckets didn’t load — {loadError}</p>;
  if (!data) return <p className="text-[12.5px] text-ink-muted">Loading range buckets…</p>;

  const put = (b: Bucket) => setData(d => d && { ...d, buckets: d.buckets.some(x => x.id === b.id) ? d.buckets.map(x => (x.id === b.id ? b : x)) : [...d.buckets, b] });
  async function addBucket() {
    setBusy(true); setError('');
    const r = await dfetch<{ bucket: Bucket }>('/api/operator/range-buckets', { method: 'POST', body: JSON.stringify({ name: add.name, balls: Number(add.balls), priceCents: cents(add.price) }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    put(r.data.bucket);
    setAdd({ name: '', balls: '', price: '' });
  }
  async function flipOnline() {
    if (!data) return;
    const next = !data.sellRangeOnline;
    setBusy(true); setError('');
    const r = await dfetch('/api/operator/settings', { method: 'PATCH', body: JSON.stringify({ sellRangeOnline: next }) });
    setBusy(false);
    if (!r.ok) { setError(`Couldn’t save — ${r.error}`); return; }
    setData({ ...data, sellRangeOnline: next });
  }

  return (
    <div className="mt-3">
      <h4 className="text-[13px] font-semibold text-ink">Range buckets</h4>
      <p className="text-[12.5px] text-ink-muted">One price for each bucket, online, at checkout and at the register.</p>
      <ul className="divide-y divide-line-soft">
        {data.buckets.map(b => <Row key={b.id} b={b} onSaved={put} />)}
      </ul>
      <div className="flex flex-wrap items-center gap-2 py-2">
        <input value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} aria-label="New bucket name" className={FIELD + ' !w-40'} />
        <input value={add.balls} onChange={e => setAdd({ ...add, balls: e.target.value })} aria-label="New bucket balls" inputMode="numeric" className={FIELD + ' !w-20'} />
        <span className="text-[13px] text-ink-muted">balls · $</span>
        <input value={add.price} onChange={e => setAdd({ ...add, price: e.target.value })} aria-label="New bucket price" inputMode="decimal" className={FIELD + ' !w-24'} />
        <button type="button" disabled={busy || !add.name.trim() || !add.balls || !add.price} onClick={addBucket} className={BTN}>Add bucket</button>
      </div>
      <label className="flex items-center gap-2 py-1 text-[14px] text-ink">
        <input type="checkbox" checked={data.sellRangeOnline} disabled={!data.ownerLogin || busy || data.rangeBallsFree} onChange={flipOnline} className="accent-pine" />
        Sell range balls with tee times
      </label>
      {data.rangeBallsFree && <p className="text-[12.5px] text-ink-muted">Balls come with a round, so golfers aren’t offered buckets online. Checkout adds them at $0.</p>}
      {!data.ownerLogin && <p className="text-[12.5px] text-ink-muted">Only the course owner can change this switch.</p>}
      {error && <p role="alert" className="mt-1 text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}
