'use client';
// Settings rework (Cam 2026-10-19: "course details are confusing — needs to be
// step by step"). W2-6 (Cam 2026-10-20: "if its only 18 there shouldnt still be
// the 27 holes from before"): step 1 is ONE save — what kind of course it is,
// the names, the par and the rounds golfers book — shown as a list of changes
// before it is made; what the old setup had and the new one doesn't is retired
// by the same save (lib/course-shape-setup.ts). Then par per nine and the tees,
// which save as they go. The routes are the owner's (they refuse staff), so a
// staff login reads the same steps without the controls.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { teeColour } from '@/lib/tee-colour';
import { sameNines } from '@/lib/course-rounds';
import { SHAPES, shapeDef, shapeNines, shapeRounds, guessShape, type ShapeDef, type ShapeKey } from '@/lib/course-shape';
import type { SetupPreview } from '@/lib/course-shape-setup';

const iBase = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const iCls = 'w-full ' + iBase;
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
  const step1Done = !!holes && !!par;

  return (
    <div className="space-y-4">
      {readOnly && (
        <p className="text-sm text-ink-soft">The course layout is set from the course owner&apos;s login. This is what golfers see.</p>
      )}
      <ShapeStep n={1} holes={holes} par={par} nines={nines} products={products} readOnly={readOnly}
        onSaved={async patch => { onCourseSaved(patch); await load(); }} />
      {multi && step1Done && <NinePars nines={nines} setNines={setNines} readOnly={readOnly} />}
      <TeesStep n={2} teeSets={teeSets} setTeeSets={setTeeSets} nines={multi ? nines : []} products={products.filter(p => p.active)} readOnly={readOnly}
        locked={!step1Done ? 'Set up your course first.' : ''} />
    </div>
  );
}

// ── 1. Your course: its shape, names, par and rounds (W2-6) ───────────────
// One save sets all of it, after the owner has seen what changes; whatever the
// old setup had that the new one doesn't is retired by the same save.
type RoundPick = { key: string; on: boolean; label: string };

function startingNames(shape: ShapeDef, nines: Nine[]): string[] {
  if (shape.namesAreCourses) return shape.nameFields.map((f, i) => (nines[i * 2]?.name ?? '').replace(/ front$/i, '') || f.default);
  return shape.nameFields.map((f, i) => nines[i]?.name || f.default);
}

/** Ticks as the course has them now: a round is on when an active round sells the same nines and holes. */
function startingRounds(shape: ShapeDef, names: string[], nines: Nine[], products: CourseProduct[]): RoundPick[] {
  const ids = shapeNines(shape, names).map((_, i) => nines[i]?.id);
  return shapeRounds(shape, names).map(r => {
    const want = r.nines.map(i => ids[i]);
    const p = want.every(Boolean) ? products.find(x => x.active && x.holes === r.holes && x.nineIds.length === want.length && sameNines(x.nineIds, want as string[])) : undefined;
    // Keep a name the owner gave the round; a name that was only its nines ("North + South") follows the new shape.
    const auto = p ? p.nineIds.map(id => nines.find(x => x.id === id)?.name).join(' + ') : '';
    return { key: r.key, on: products.length ? !!p : r.on, label: p && p.label !== auto ? p.label : '' };
  });
}

function previewLines(pv: SetupPreview): string[] {
  const out: string[] = [];
  const list = (xs: string[]) => xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
  if (pv.ninesAdded.length) out.push(`Adds ${list(pv.ninesAdded)}.`);
  for (const r of pv.ninesRenamed) out.push(`Renames ${r.from} to ${r.to}.`);
  if (pv.ninesRemoved.length) out.push(`Removes ${list(pv.ninesRemoved)}, and the tee yardages set for ${pv.ninesRemoved.length === 1 ? 'it' : 'them'}.`);
  if (pv.roundsStarted.length) out.push(`Golfers can book ${list(pv.roundsStarted)}.`);
  if (pv.roundsStopped.length) out.push(`Stops selling ${list(pv.roundsStopped)}.${pv.schedulesPaused ? ` ${pv.schedulesPaused === 1 ? 'Its schedule is' : `${pv.schedulesPaused} schedules are`} paused, so no new times are made.` : ''}`);
  if (pv.bookedTimesKept) out.push(`${pv.bookedTimesKept} booked tee time${pv.bookedTimesKept === 1 ? ' stays' : 's stay'} booked — nobody loses a booking.`);
  if (pv.schedulesMoved) out.push(`${pv.schedulesMoved === 1 ? 'Your schedule moves' : `Your ${pv.schedulesMoved} schedules move`} onto ${list(pv.schedulesMovedTo)}, so your tee sheet keeps its times. Change their hours on Schedule.`);
  return out;
}

function ShapeStep({ n, holes, par, nines, products, readOnly, onSaved }: {
  n: number; holes: number | null; par: number | null; nines: Nine[]; products: CourseProduct[]; readOnly: boolean;
  onSaved: (p: { holes: number; par: number }) => Promise<void>;
}) {
  const sorted = [...nines].sort((a, b) => a.sortOrder - b.sortOrder);
  const [shapeKey, setShapeKey] = useState<ShapeKey>(() => guessShape(holes, nines.length));
  const shape = shapeDef(shapeKey)!;
  const [names, setNames] = useState<string[]>(() => startingNames(shape, sorted));
  const [p, setP] = useState<string>(par ? String(par) : '');
  const [picks, setPicks] = useState<RoundPick[]>(() => startingRounds(shape, startingNames(shape, sorted), sorted, products));
  const [preview, setPreview] = useState<SetupPreview | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'save'>('');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  // Par arrives with the settings form, which can load after this mounts.
  useEffect(() => { if (par && !p) setP(String(par)); }, [par]); // eslint-disable-line react-hooks/exhaustive-deps

  const rounds = shapeRounds(shape, names);
  const pickOf = (key: string) => picks.find(x => x.key === key);
  const isOn = (key: string) => pickOf(key)?.on ?? rounds.find(r => r.key === key)?.on ?? false;
  const edited = () => { setPreview(null); setSaved(false); setErr(''); };

  function pickShape(k: ShapeKey) {
    const s = shapeDef(k)!;
    const nm = startingNames(s, sorted);
    setShapeKey(k); setNames(nm); setPicks(startingRounds(s, nm, sorted, products)); edited();
  }

  const body = () => ({
    shape: shapeKey, names, par: Number(p),
    rounds: rounds.map(r => ({ key: r.key, on: isOn(r.key), label: pickOf(r.key)?.label || undefined })),
  });

  async function review() {
    setBusy('preview'); setErr('');
    const r = await send('/api/operator/course-shape', 'POST', { ...body(), preview: true });
    setBusy('');
    if (!r.ok) { setErr(r.data.error || 'Could not check that. Nothing was changed.'); return; }
    setPreview(r.data as unknown as SetupPreview);
  }

  async function save() {
    setBusy('save'); setErr('');
    const r = await send('/api/operator/course-shape', 'POST', body());
    if (!r.ok) { setBusy(''); setErr(r.data.error || 'Could not save. Nothing was changed.'); return; }
    const pv = r.data as unknown as SetupPreview;
    await onSaved({ holes: pv.holes, par: pv.par });
    setBusy(''); setPreview(null); setSaved(true);
  }

  const active = products.filter(x => x.active);
  const shown = holes && par
    ? `${holes} holes · Par ${par} at the top of your booking page${active.length ? `, and ${active.map(x => x.label).join(', ')} when they pick a tee time` : ''}.`
    : 'nothing yet.';
  const noSchedule = active.filter(x => !(x.scheduleCount && x.scheduleCount > 0));

  if (readOnly) {
    return (
      <Step n={n} title="Your course" golfersSee={shown}>
        <p className="text-sm text-ink">{holes ? `${holes} holes` : 'Not set up yet.'}{sorted.length > 1 ? ` · ${sorted.map(x => x.name).join(', ')}` : ''}</p>
      </Step>
    );
  }

  const lines = preview ? previewLines(preview) : [];
  return (
    <Step n={n} title="Your course" golfersSee={shown}>
      <div>
        <p className="text-[13px] font-semibold text-ink mb-2">What kind of course is it?</p>
        <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Kind of course">
          {SHAPES.map(s => (
            <button key={s.key} role="radio" aria-checked={shapeKey === s.key} onClick={() => pickShape(s.key)}
              className={'text-left rounded-md border px-3 py-2.5 transition-colors ' + (shapeKey === s.key ? 'border-pine bg-pine/[0.07]' : 'border-line bg-white hover:border-line-strong')}>
              <span className={'block text-sm font-medium ' + (shapeKey === s.key ? 'text-pine' : 'text-ink')}>{s.label}</span>
              <span className="block text-[12.5px] text-ink-soft mt-0.5">{s.example}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {shape.nameFields.map((f, i) => (
          <div key={`${shapeKey}-${i}`}>
            <label className="block text-[13px] font-semibold text-ink mb-1.5" htmlFor={`shape-name-${i}`}>{f.label}</label>
            <input id={`shape-name-${i}`} value={names[i] ?? ''} placeholder={f.placeholder} className={iCls}
              onChange={e => { const v = e.target.value; setNames(ns => ns.map((x, j) => j === i ? v : x)); edited(); }} />
          </div>
        ))}
        <div>
          <label className="block text-[13px] font-semibold text-ink mb-1.5" htmlFor="shape-par">{shape.holes === 9 ? 'Par for the nine holes' : 'Par for 18 holes'}</label>
          <input id="shape-par" type="number" value={p} placeholder={shape.holes === 9 ? '36' : '72'} className={iCls + ' max-w-[140px]'}
            onChange={e => { setP(e.target.value); edited(); }} />
        </div>
      </div>
      {shape.namesAreCourses && <p className="text-[12.5px] text-ink-soft">Each course gets a front and a back nine, so you can also sell 9-hole times on it.</p>}

      <div>
        <p className="text-[13px] font-semibold text-ink mb-1">What golfers can book</p>
        <p className="text-[12.5px] text-ink-soft mb-1.5">Each round you tick gets its own tab on Schedule, with its own hours and prices.</p>
        <ul className="divide-y divide-line-soft">
          {rounds.map(r => {
            const on = isOn(r.key);
            return (
              <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                <label className="flex items-start gap-2.5 text-sm cursor-pointer min-w-0">
                  <input type="checkbox" checked={on} className="accent-pine w-4 h-4 mt-0.5 shrink-0"
                    onChange={e => { const v = e.target.checked; setPicks(ps => ps.some(x => x.key === r.key) ? ps.map(x => x.key === r.key ? { ...x, on: v } : x) : [...ps, { key: r.key, on: v, label: '' }]); edited(); }} />
                  <span className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2.5 min-w-0">
                    <span className={on ? 'text-ink font-medium' : 'text-ink-soft'}>{pickOf(r.key)?.label || r.label}</span>
                    <span className="text-[12.5px] text-ink-muted">{r.hint}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <ErrorLine msg={err} />
      {preview ? (
        <div className="bg-paper/70 rounded-md px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-ink">{lines.length ? 'Saving this:' : 'That’s how your course is set up already.'}</p>
          {lines.length > 0 && <ul className="text-sm text-ink space-y-1 list-disc pl-5">{lines.map(l => <li key={l}>{l}</li>)}</ul>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={save} disabled={busy !== ''} className={primaryBtn}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setPreview(null)} disabled={busy !== ''} className={smallBtn}>Keep editing</button>
          </div>
        </div>
      ) : (
        <button onClick={review} disabled={busy !== '' || !p || saved} className={primaryBtn}>{busy === 'preview' ? 'Checking…' : saved ? 'Saved' : 'Review changes'}</button>
      )}
      {saved && noSchedule.length > 0 && (
        <p className="text-[12.5px] text-ink-soft flex items-center gap-1.5">
          <StatusDot status="warn" />{noSchedule.map(x => x.label).join(', ')} {noSchedule.length === 1 ? 'has' : 'have'} no hours yet.{' '}
          <Link href="/dashboard/schedules" className="text-pine font-medium hover:underline">Set them on Schedule</Link>
        </p>
      )}
    </Step>
  );
}

// ── Par for each nine (27 / 36 holes) — names come from Your course ─────────
function NinePars({ nines, setNines, readOnly }: { nines: Nine[]; setNines: (n: Nine[]) => void; readOnly: boolean }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const sorted = [...nines].sort((a, b) => a.sortOrder - b.sortOrder);
  async function update(nine: Nine, par: number) {
    setBusy(nine.id); setErr('');
    const r = await send('/api/operator/nines', 'PATCH', { id: nine.id, par });
    setBusy('');
    if (!r.ok) { setErr(r.data.error || 'Could not save that par.'); return; }
    setNines(nines.map(x => x.id === nine.id ? r.data as unknown as Nine : x));
  }
  if (!sorted.length) return null;
  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-ink mb-1">Par for each nine</h3>
      <p className="text-[12.5px] text-ink-muted mb-3">Golfers see it under “The tees” on your page. Saves as you leave the box.</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {sorted.map(nine => (
          <label key={nine.id} className="flex items-center gap-2 text-sm text-ink">
            {nine.name}
            {readOnly ? <span className="tabular-nums">{nine.par}</span> : (
              <input type="number" defaultValue={nine.par} aria-label={`${nine.name} par`} className={iBase + ' w-16'}
                onBlur={e => { const v = Number(e.target.value); if (!v || v === nine.par) return; if (v < 27 || v > 40) { setErr('Each nine’s par is usually 34 to 37.'); e.target.value = String(nine.par); return; } update(nine, v); }} />
            )}
            {busy === nine.id && <span className="text-xs text-ink-faint">Saving…</span>}
          </label>
        ))}
      </div>
      <div className="mt-2"><ErrorLine msg={err} /></div>
    </Card>
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
                          <input type="number" defaultValue={row?.yardage || ''} placeholder="0" className={iBase + ' w-20 py-1 text-xs'}
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
                            <input type="number" step="0.1" defaultValue={row?.rating || ''} placeholder="Rating" aria-label={`${t.name} ${p.label} rating`} className={iBase + ' w-20 py-1 text-xs'}
                              onBlur={e => { const v = Number(e.target.value) || 0; if (v !== (row?.rating ?? 0)) setRoundRating(t, p.id, 'rating', v); }} />
                            <input type="number" defaultValue={row?.slope || ''} placeholder="Slope" aria-label={`${t.name} ${p.label} slope`} className={iBase + ' w-20 py-1 text-xs'}
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
