'use client';
// Settings rework (Cam 2026-10-19: "course details are confusing — needs to be
// step by step"; "you can't name a nine, it just says 36"). One guided path
// instead of three loose tools: how many holes and the par → name each nine
// (27 and 36 only) → the tees → what golfers can book, which is built from the
// nines rather than typed. Each step says what golfers see. Everything here
// saves as it goes; the routes are the owner's (they refuse staff), so a staff
// login reads the same steps without the controls.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { teeColour } from '@/lib/tee-colour';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const smallBtn = 'text-[12.5px] font-medium text-pine border border-pine/30 hover:bg-pine/5 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50';
const primaryBtn = 'bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors';

type Nine = { id: string; name: string; par: number; sortOrder: number };
type CourseProduct = { id: string; label: string; holes: number; nineIds: string[]; active: boolean; sortOrder: number; scheduleCount?: number };
type TeeSetNineRow = { id: string; teeSetId: string; nineId: string; yardage: number };
type ProductRatingRow = { id: string; teeSetId: string; courseProductId: string; rating: number; slope: number };
type TeeSet = { id: string; name: string; yardage: number; rating: number; slope: number; sortOrder: number; nineYardages: TeeSetNineRow[]; productRatings: ProductRatingRow[] };

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> & { error?: string } }> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: 'Network error — nothing was saved. Check your connection and try again.' } };
  }
}

function Step({ n, title, golfersSee, locked, children }: { n: number; title: string; golfersSee?: string; locked?: string; children: React.ReactNode }) {
  return (
    <Card className={'p-5 ' + (locked ? 'opacity-60' : '')}>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="w-6 h-6 shrink-0 rounded-full bg-pine/[0.08] text-pine text-[12.5px] font-semibold flex items-center justify-center tabular-nums" aria-hidden="true">{n}</span>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      </div>
      <div className="pl-9 space-y-3">
        {locked ? <p className="text-sm text-ink-soft">{locked}</p> : children}
        {!locked && golfersSee && (
          <p className="text-[12.5px] text-ink-muted border-t border-line-soft pt-2.5">Golfers see: {golfersSee}</p>
        )}
      </div>
    </Card>
  );
}

function ErrorLine({ msg }: { msg: string }) {
  if (!msg) return null;
  return <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><StatusDot status="bad" />{msg}</p>;
}

/** Every pair of nines as an 18-hole round, then each nine on its own as a 9. */
function candidateRounds(nines: Nine[]): { label: string; holes: number; nineIds: string[] }[] {
  const out: { label: string; holes: number; nineIds: string[] }[] = [];
  for (let i = 0; i < nines.length; i++)
    for (let j = i + 1; j < nines.length; j++)
      out.push({ label: `${nines[i].name} + ${nines[j].name}`, holes: 18, nineIds: [nines[i].id, nines[j].id] });
  for (const n of nines) out.push({ label: `${n.name} only`, holes: 9, nineIds: [n.id] });
  return out;
}
const sameNines = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));

export default function CourseLayoutTab({ holes, par, readOnly, onCourseSaved }: {
  holes: number | null;
  par: number | null;
  readOnly: boolean;
  onCourseSaved: (patch: { holes: number; par: number }) => void;
}) {
  const [nines, setNines] = useState<Nine[]>([]);
  const [products, setProducts] = useState<CourseProduct[]>([]);
  const [teeSets, setTeeSets] = useState<TeeSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [ninesRes, productsRes, teeSetsRes] = await Promise.all([
        fetch('/api/operator/nines'),
        fetch('/api/operator/course-products'),
        fetch('/api/operator/tee-sets'),
      ]);
      if (!ninesRes.ok || !productsRes.ok || !teeSetsRes.ok) throw new Error();
      setNines(await ninesRes.json());
      setProducts(await productsRes.json());
      setTeeSets(await teeSetsRes.json());
    } catch {
      setLoadError('Could not load your course layout.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-sm text-ink-muted py-10 text-center">Loading…</div>;
  if (loadError) return (
    <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm flex items-center justify-between gap-3" role="alert">
      <span className="flex items-center gap-2"><StatusDot status="bad" />{loadError}</span>
      <button onClick={() => { setLoading(true); load(); }} className="text-xs font-medium underline shrink-0">Retry</button>
    </div>
  );

  const multi = (holes ?? 0) > 18;
  const ninesNeeded = multi ? Math.round((holes ?? 0) / 9) : 0;
  const step1Done = !!holes && !!par;
  const ninesDone = !multi || nines.length >= ninesNeeded;
  let n = 1;

  return (
    <div className="space-y-4">
      {readOnly && (
        <p className="text-sm text-ink-soft">The course layout is set from the course owner&apos;s login. This is what golfers see.</p>
      )}
      <HolesStep n={n++} holes={holes} par={par} readOnly={readOnly} onSaved={onCourseSaved} />
      {multi && (
        <NinesStep n={n++} needed={ninesNeeded} nines={nines} setNines={setNines} readOnly={readOnly}
          locked={step1Done ? '' : 'Set the holes and par first.'} />
      )}
      <TeesStep n={n++} teeSets={teeSets} setTeeSets={setTeeSets} nines={multi ? nines : []} products={products.filter(p => p.active)} readOnly={readOnly}
        locked={!step1Done ? 'Set the holes and par first.' : !ninesDone ? 'Name your nines first.' : ''} />
      <RoundsStep n={n++} multi={multi} holes={holes} nines={nines} products={products} setProducts={setProducts} readOnly={readOnly}
        locked={!step1Done ? 'Set the holes and par first.' : !ninesDone ? 'Name your nines first.' : ''} />
    </div>
  );
}

// ── 1. Holes and par ─────────────────────────────────────────────────────
function HolesStep({ n, holes, par, readOnly, onSaved }: { n: number; holes: number | null; par: number | null; readOnly: boolean; onSaved: (p: { holes: number; par: number }) => void }) {
  const [h, setH] = useState<number>(holes || 18);
  const [p, setP] = useState<string>(par ? String(par) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const dirty = h !== holes || Number(p) !== par;

  async function save() {
    const parN = Number(p);
    if (!parN || parN < 27 || parN > 80) { setErr(h === 9 ? 'Enter the par for your nine holes, e.g. 36.' : 'Enter the par for 18 holes, e.g. 72.'); return; }
    if (h === 9 && parN > 40) { setErr('That looks like an 18-hole par. Enter the par for your nine holes, e.g. 36.'); return; }
    if (h !== 9 && parN < 54) { setErr('Enter the par for 18 holes, e.g. 72.'); return; }
    setSaving(true); setErr('');
    const r = await send('/api/operator/settings', 'PATCH', { holes: h, par: parN });
    setSaving(false);
    if (!r.ok) { setErr(r.data.error || 'Could not save. Nothing was changed.'); return; }
    onSaved({ holes: h, par: parN });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  const shown = holes && par ? `${holes} holes · Par ${par}, at the top of your booking page.` : 'nothing yet.';
  if (readOnly) return <Step n={n} title="Holes and par" golfersSee={shown}>{null}</Step>;
  return (
    <Step n={n} title="How many holes?" golfersSee={shown}>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Holes">
        {[9, 18, 27, 36].map(v => (
          <button key={v} role="radio" aria-checked={h === v} onClick={() => setH(v)}
            className={'w-16 py-2 rounded-md border text-sm font-medium tabular-nums transition-colors ' + (h === v ? 'border-pine bg-pine/[0.07] text-pine' : 'border-line bg-white text-ink-soft hover:border-line-strong')}>
            {v}
          </button>
        ))}
      </div>
      {h > 18 && <p className="text-[12.5px] text-ink-soft">With {h} holes you have {h / 9} nines. You&apos;ll name them next, and choose which pairs golfers can book.</p>}
      <div className="max-w-[220px]">
        <label className="block text-[13px] font-semibold text-ink mb-1.5">{h === 9 ? 'Par for the nine holes' : 'Par for 18 holes'}</label>
        <input type="number" value={p} onChange={e => setP(e.target.value)} placeholder={h === 9 ? '36' : '72'} className={iCls} />
      </div>
      <ErrorLine msg={err} />
      <button onClick={save} disabled={saving || (!dirty && !saved)} className={primaryBtn}>
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </button>
    </Step>
  );
}

// ── 2. Name each nine (27 / 36 holes) ────────────────────────────────────
function NinesStep({ n, needed, nines, setNines, readOnly, locked }: {
  n: number; needed: number; nines: Nine[]; setNines: (n: Nine[]) => void; readOnly: boolean; locked: string;
}) {
  const missing = Math.max(0, needed - nines.length);
  const [drafts, setDrafts] = useState<{ name: string; par: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setDrafts(Array.from({ length: missing }, () => ({ name: '', par: '36' }))); }, [missing]);

  async function saveNew() {
    if (drafts.some(d => !d.name.trim())) { setErr('Give every nine a name — North, South, West, or whatever your course calls them.'); return; }
    setBusy('new'); setErr('');
    let next = [...nines];
    for (const d of drafts) {
      const r = await send('/api/operator/nines', 'POST', { name: d.name.trim(), par: Number(d.par) || 36 });
      if (!r.ok) { setErr(r.data.error || `Could not add "${d.name}".`); break; }
      next = [...next, r.data as unknown as Nine];
    }
    setNines(next);
    setBusy('');
  }

  async function update(nine: Nine, patch: Partial<Nine>) {
    setBusy(nine.id); setErr('');
    const r = await send('/api/operator/nines', 'PATCH', { id: nine.id, ...patch });
    setBusy('');
    if (!r.ok) { setErr(r.data.error || 'Could not save that nine.'); return; }
    setNines(nines.map(x => x.id === nine.id ? r.data as unknown as Nine : x));
  }

  async function remove(nine: Nine) {
    if (!confirm(`Remove the ${nine.name} nine?`)) return;
    setBusy(nine.id); setErr('');
    const r = await send('/api/operator/nines', 'DELETE', { id: nine.id });
    setBusy('');
    if (!r.ok) { setErr(r.data.error || 'Could not remove that nine.'); return; }
    setNines(nines.filter(x => x.id !== nine.id));
  }

  const shown = nines.length ? `${nines.map(x => `${x.name} (par ${x.par})`).join(', ')}, under “The tees” on your page.` : 'nothing yet.';
  return (
    <Step n={n} title="Name each nine" golfersSee={shown} locked={locked}>
      {readOnly ? (
        <p className="text-sm text-ink">{nines.length ? nines.map(x => `${x.name} · par ${x.par}`).join('   ') : 'No nines named yet.'}</p>
      ) : (
        <>
          <p className="text-sm text-ink-soft">Golfers choose a round by its nines, so use the names on your scorecard.</p>
          <div className="space-y-2">
            {nines.map((nine, i) => (
              <div key={nine.id} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[12.5px] text-ink-muted">Nine {i + 1}</span>
                <input defaultValue={nine.name} aria-label={`Nine ${i + 1} name`} className={iCls + ' flex-1'}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== nine.name) update(nine, { name: v }); }} />
                <span className="text-[12.5px] text-ink-muted">Par</span>
                <input type="number" defaultValue={nine.par} aria-label={`Nine ${i + 1} par`} className={iCls + ' w-16'}
                  onBlur={e => { const v = Number(e.target.value); if (v && v !== nine.par) update(nine, { par: v }); }} />
                {busy === nine.id ? <span className="text-xs text-ink-faint w-14">Saving…</span>
                  : i >= needed ? <button onClick={() => remove(nine)} className="text-[12.5px] text-ink-muted hover:text-bad w-14">Remove</button>
                  : <span className="w-14" />}
              </div>
            ))}
            {drafts.map((d, i) => (
              <div key={`d${i}`} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[12.5px] text-ink-muted">Nine {nines.length + i + 1}</span>
                <input value={d.name} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder={['North', 'South', 'West', 'East'][nines.length + i] ?? 'Name'} aria-label={`Nine ${nines.length + i + 1} name`} className={iCls + ' flex-1'} />
                <span className="text-[12.5px] text-ink-muted">Par</span>
                <input type="number" value={d.par} onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, par: e.target.value } : x))}
                  aria-label={`Nine ${nines.length + i + 1} par`} className={iCls + ' w-16'} />
                <span className="w-14" />
              </div>
            ))}
          </div>
          {nines.length > needed && <p className="text-[12.5px] text-ink-soft">You have more nines than your {needed * 9} holes need. Remove the extra one, or change the holes above.</p>}
          <ErrorLine msg={err} />
          {drafts.length > 0 && (
            <button onClick={saveNew} disabled={busy === 'new'} className={primaryBtn}>
              {busy === 'new' ? 'Saving…' : drafts.length === 1 ? 'Save this nine' : `Save ${drafts.length} nines`}
            </button>
          )}
        </>
      )}
    </Step>
  );
}

// ── 3. Tees ──────────────────────────────────────────────────────────────
function TeesStep({ n, teeSets, setTeeSets, nines, products, readOnly, locked }: {
  n: number; teeSets: TeeSet[]; setTeeSets: (t: TeeSet[]) => void; nines: Nine[]; products: CourseProduct[]; readOnly: boolean; locked: string;
}) {
  const [draft, setDraft] = useState<{ name: string; yardage: string; rating: string; slope: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(false);

  async function add() {
    if (!draft?.name.trim()) { setErr('Name the tee — usually its marker colour, like Blue.'); return; }
    setBusy('new'); setErr('');
    const r = await send('/api/operator/tee-sets', 'POST', { name: draft.name.trim(), yardage: Number(draft.yardage) || 0, rating: Number(draft.rating) || 0, slope: Number(draft.slope) || 0 });
    setBusy('');
    if (!r.ok) { setErr(r.data.error || 'Could not add that tee.'); return; }
    setTeeSets([...teeSets, r.data as unknown as TeeSet]);
    setDraft(null);
  }

  async function patch(t: TeeSet, body: Record<string, unknown>) {
    setBusy(t.id); setErr('');
    const r = await send('/api/operator/tee-sets', 'PATCH', { id: t.id, ...body });
    setBusy('');
    if (!r.ok) { setErr(r.data.error || `Could not save the ${t.name} tees.`); return; }
    setTeeSets(teeSets.map(x => x.id === t.id ? r.data as unknown as TeeSet : x));
  }

  async function remove(t: TeeSet) {
    if (!confirm(`Remove the ${t.name} tees?`)) return;
    setBusy(t.id); setErr('');
    const r = await send('/api/operator/tee-sets', 'DELETE', { id: t.id });
    setBusy('');
    if (!r.ok) { setErr(r.data.error || `Could not remove the ${t.name} tees.`); return; }
    setTeeSets(teeSets.filter(x => x.id !== t.id));
  }

  function setNineYardage(t: TeeSet, nineId: string, yardage: number) {
    const rows = t.nineYardages.filter(y => y.nineId !== nineId).map(y => ({ nineId: y.nineId, yardage: y.yardage }));
    patch(t, { nineYardages: [...rows, { nineId, yardage }] });
  }
  function setRoundRating(t: TeeSet, courseProductId: string, field: 'rating' | 'slope', value: number) {
    const existing = t.productRatings.find(r => r.courseProductId === courseProductId);
    const rows = t.productRatings.filter(r => r.courseProductId !== courseProductId).map(r => ({ courseProductId: r.courseProductId, rating: r.rating, slope: r.slope }));
    rows.push({ courseProductId, rating: field === 'rating' ? value : (existing?.rating ?? 0), slope: field === 'slope' ? value : (existing?.slope ?? 0) });
    patch(t, { productRatings: rows });
  }

  const swatch = (name: string) => {
    const c = teeColour(name);
    return <span className="w-3.5 h-3.5 rounded-full border border-line-strong shrink-0" style={{ backgroundColor: c ?? 'transparent' }} aria-hidden="true" />;
  };
  const shown = teeSets.length ? 'each tee with its yardage, rating and slope, under “The tees” on your page.' : 'nothing yet.';

  return (
    <Step n={n} title="Your tees" golfersSee={shown} locked={locked}>
      {!readOnly && <p className="text-sm text-ink-soft">One row per set of tee markers. Name them the way your scorecard does — the colour dot follows the name.</p>}
      {teeSets.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-left text-[12.5px] text-ink-muted">
                <th className="font-medium pb-1.5">Tee</th>
                <th className="font-medium pb-1.5 w-24">Yards</th>
                <th className="font-medium pb-1.5 w-20">Rating</th>
                <th className="font-medium pb-1.5 w-20">Slope</th>
                {!readOnly && <th className="w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {teeSets.map(t => readOnly ? (
                <tr key={t.id}>
                  <td className="py-2"><span className="flex items-center gap-2">{swatch(t.name)}{t.name}</span></td>
                  <td className="py-2 tabular-nums">{t.yardage || '—'}</td>
                  <td className="py-2 tabular-nums">{t.rating || '—'}</td>
                  <td className="py-2 tabular-nums">{t.slope || '—'}</td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td className="py-1.5 pr-2"><span className="flex items-center gap-2">{swatch(t.name)}
                    <input defaultValue={t.name} aria-label="Tee name" className={iCls}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.name) patch(t, { name: v }); }} /></span></td>
                  <td className="py-1.5 pr-2"><input type="number" defaultValue={t.yardage || ''} aria-label={`${t.name} yards`} className={iCls}
                    onBlur={e => { const v = Number(e.target.value) || 0; if (v !== t.yardage) patch(t, { yardage: v }); }} /></td>
                  <td className="py-1.5 pr-2"><input type="number" step="0.1" defaultValue={t.rating || ''} aria-label={`${t.name} rating`} className={iCls}
                    onBlur={e => { const v = Number(e.target.value) || 0; if (v !== t.rating) patch(t, { rating: v }); }} /></td>
                  <td className="py-1.5 pr-2"><input type="number" defaultValue={t.slope || ''} aria-label={`${t.name} slope`} className={iCls}
                    onBlur={e => { const v = Number(e.target.value) || 0; if (v !== t.slope) patch(t, { slope: v }); }} /></td>
                  <td className="py-1.5 text-right">
                    {busy === t.id ? <span className="text-xs text-ink-faint">Saving…</span>
                      : <button onClick={() => remove(t)} className="text-[12.5px] text-ink-muted hover:text-bad">Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {readOnly && teeSets.length === 0 && <p className="text-sm text-ink-soft">No tees added yet.</p>}
      {!readOnly && (draft ? (
        <div className="grid grid-cols-[1fr_90px_80px_80px] gap-2 items-center">
          <input autoFocus value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Blue" aria-label="New tee name" className={iCls} />
          <input type="number" value={draft.yardage} onChange={e => setDraft({ ...draft, yardage: e.target.value })} placeholder="Yards" aria-label="New tee yards" className={iCls} />
          <input type="number" step="0.1" value={draft.rating} onChange={e => setDraft({ ...draft, rating: e.target.value })} placeholder="Rating" aria-label="New tee rating" className={iCls} />
          <input type="number" value={draft.slope} onChange={e => setDraft({ ...draft, slope: e.target.value })} placeholder="Slope" aria-label="New tee slope" className={iCls} />
          <div className="col-span-4 flex items-center gap-3">
            <button onClick={add} disabled={busy === 'new'} className={primaryBtn}>{busy === 'new' ? 'Adding…' : 'Add tee'}</button>
            <button onClick={() => { setDraft(null); setErr(''); }} className="text-[12.5px] text-ink-muted hover:text-ink">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setDraft({ name: '', yardage: '', rating: '', slope: '' })} className={smallBtn}>Add a tee</button>
      ))}
      <ErrorLine msg={err} />
      {!readOnly && nines.length > 0 && teeSets.length > 0 && (
        <div className="border-t border-line-soft pt-3">
          <button onClick={() => setDetail(d => !d)} aria-expanded={detail} className="text-[12.5px] font-medium text-pine hover:underline">
            {detail ? 'Hide yards by nine and rating by round' : 'Yards by nine and rating by round (optional)'}
          </button>
          {detail && (
            <div className="mt-3 space-y-4">
              {teeSets.map(t => (
                <div key={t.id} className="bg-paper/70 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">{swatch(t.name)}{t.name}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {nines.map(nine => {
                      const row = t.nineYardages.find(y => y.nineId === nine.id);
                      return (
                        <label key={nine.id} className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                          {nine.name} yards
                          <input type="number" defaultValue={row?.yardage || ''} placeholder="0" className={iCls + ' w-20 py-1 text-xs'}
                            onBlur={e => { const v = Number(e.target.value) || 0; if (v !== (row?.yardage ?? 0)) setNineYardage(t, nine.id, v); }} />
                        </label>
                      );
                    })}
                  </div>
                  {products.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {products.map(p => {
                        const row = t.productRatings.find(r => r.courseProductId === p.id);
                        return (
                          <span key={p.id} className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                            {p.label}
                            <input type="number" step="0.1" defaultValue={row?.rating || ''} placeholder="Rating" aria-label={`${t.name} ${p.label} rating`} className={iCls + ' w-20 py-1 text-xs'}
                              onBlur={e => { const v = Number(e.target.value) || 0; if (v !== (row?.rating ?? 0)) setRoundRating(t, p.id, 'rating', v); }} />
                            <input type="number" defaultValue={row?.slope || ''} placeholder="Slope" aria-label={`${t.name} ${p.label} slope`} className={iCls + ' w-20 py-1 text-xs'}
                              onBlur={e => { const v = Number(e.target.value) || 0; if (v !== (row?.slope ?? 0)) setRoundRating(t, p.id, 'slope', v); }} />
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Step>
  );
}

// ── 4. What golfers can book ─────────────────────────────────────────────
function RoundsStep({ n, multi, holes, nines, products, setProducts, readOnly, locked }: {
  n: number; multi: boolean; holes: number | null; nines: Nine[]; products: CourseProduct[]; setProducts: (p: CourseProduct[]) => void; readOnly: boolean; locked: string;
}) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  // A simple 9 or 18 with no rounds set up: what golfers book comes from Schedule.
  if (!multi && products.length === 0) {
    return (
      <Step n={n} title="What golfers can book" locked={locked}>
        <p className="text-sm text-ink">
          Golfers book {holes === 9 ? '9 holes' : '18 holes'}, plus any 9-hole times your schedule offers.
          Which times run, and at what price, is on <Link href="/dashboard/schedules" className="text-pine font-medium hover:underline">Schedule</Link>.
        </p>
      </Step>
    );
  }

  const candidates = multi ? candidateRounds(nines) : [];
  const matched = new Set<string>();
  const rows = candidates.map(c => {
    const p = products.find(x => sameNines(x.nineIds, c.nineIds) && x.holes === c.holes);
    if (p) matched.add(p.id);
    return { key: c.nineIds.join('+') + c.holes, label: p?.label ?? c.label, holes: c.holes, nineIds: c.nineIds, product: p };
  });
  // Rounds set up earlier that aren't a plain pair or single nine stay listed.
  for (const p of products) if (!matched.has(p.id)) rows.push({ key: p.id, label: p.label, holes: p.holes, nineIds: p.nineIds, product: p });

  async function toggle(row: typeof rows[number], on: boolean) {
    setBusy(row.key); setErr('');
    const p = row.product;
    if (p) {
      if (!on && (p.scheduleCount ?? 0) > 0 && !confirm(`Stop offering ${p.label}? Its schedule stops making new tee times. Times already booked stay booked.`)) { setBusy(''); return; }
      const r = await send('/api/operator/course-products', 'PATCH', { id: p.id, active: on });
      setBusy('');
      if (!r.ok) { setErr(r.data.error || `Could not change ${p.label}.`); return; }
      setProducts(products.map(x => x.id === p.id ? { ...(r.data as unknown as CourseProduct), scheduleCount: p.scheduleCount } : x));
    } else {
      const r = await send('/api/operator/course-products', 'POST', { label: row.label, holes: row.holes, nineIds: row.nineIds, active: true });
      setBusy('');
      if (!r.ok) { setErr(r.data.error || `Could not add ${row.label}.`); return; }
      setProducts([...products, { ...(r.data as unknown as CourseProduct), scheduleCount: 0 }]);
    }
  }

  const offered = rows.filter(r => r.product?.active);
  const noSchedule = offered.filter(r => !(r.product?.scheduleCount && r.product.scheduleCount > 0));
  const shown = offered.length ? `${offered.map(r => r.label).join(', ')} when they pick a tee time.` : 'nothing bookable yet.';

  return (
    <Step n={n} title="What golfers can book" golfersSee={shown} locked={locked}>
      {!readOnly && <p className="text-sm text-ink-soft">Tick each round you sell. Two rounds that share a nine can&apos;t start at the same time — Schedule keeps them apart.</p>}
      <ul className="divide-y divide-line-soft">
        {rows.map(r => {
          const on = !!r.product?.active;
          return (
            <li key={r.key} className="flex items-center justify-between gap-3 py-2">
              <label className={'flex items-center gap-2.5 text-sm ' + (readOnly ? '' : 'cursor-pointer')}>
                {readOnly ? <StatusDot status={on ? 'ok' : 'neutral'} /> : (
                  <input type="checkbox" checked={on} disabled={busy === r.key} onChange={e => toggle(r, e.target.checked)} className="accent-pine w-4 h-4" />
                )}
                <span className={on ? 'text-ink font-medium' : 'text-ink-soft'}>{r.label}</span>
                <span className="text-[12.5px] text-ink-muted">{r.holes} holes</span>
              </label>
              {busy === r.key ? <span className="text-xs text-ink-faint">Saving…</span>
                : on && !(r.product?.scheduleCount && r.product.scheduleCount > 0) ? <span className="text-[12.5px] text-warn">No schedule yet</span> : null}
            </li>
          );
        })}
      </ul>
      <ErrorLine msg={err} />
      {noSchedule.length > 0 && (
        <p className="text-[12.5px] text-ink-soft">
          A round makes no tee times until it has a schedule. <Link href="/dashboard/schedules" className="text-pine font-medium hover:underline">Set the hours on Schedule</Link>.
        </p>
      )}
    </Step>
  );
}
