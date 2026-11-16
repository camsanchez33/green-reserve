'use client';
// SCHEDULE-3 Bookable rounds (Cam 2026-11-16): the rounds the course sells, each with its holes and a bar showing when
// it can be booked against the weekday hours. A pencil opens the edit pop-up (with "Stop selling this round"), a bare
// plus adds one. Rounds not sold aren't listed, and there's no hour scale under the bars.
// The name and holes are the round itself (/api/operator/course-products, saved straight away, owner only); when it
// can be booked is part of the schedule plan, saved with the page's Review and save.
// Its own booking rules (fewest and most players, how far ahead the public can book) sit in the same pop-up (Cam
// 2026-11-16, "when editing it it all is together"; /api/operator/round-rules, owner only, saved straight away).
// Blank = the course's rule from Settings.
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { formatTeeTime as fmtTime } from '@/lib/format';
import type { CoursePlan, RoundSale } from '@/lib/course-plan';
import { CardHead, PlusButton, PenButton, Popup, PopupFoot, Block, Tiles, FIELD, LABEL, LINK, LINK_BAD, PRIMARY } from './ui';

export type Product = { id: string; label: string; holes: number; nineIds: string[]; active: boolean };
export type NineRow = { id: string; name: string; sortOrder: number };
/** A round on the page: a CourseProduct, or (key '') the course as a whole when it has none. */
export type PageRound = { key: string; label: string; holes: number; nineIds: string[] } & Rules;
export type Rules = { minPlayers: number | null; maxPlayers: number | null; publicAdvanceDays: number | null };
export type CourseRules = { minPlayers: number; maxPlayers: number; publicAdvanceDays: number };

type Holes = 'all' | 'front' | 'back' | '18' | '9';
/** The hole choices this course can offer: front and back nine on a two-nine course; else 18 or 9. */
function holeOptions(nines: NineRow[]): { key: Holes; title: string; holes: number; nineIds: string[] }[] {
  if (nines.length === 2) return [
    { key: 'all', title: 'Holes 1–18', holes: 18, nineIds: nines.map(n => n.id) },
    { key: 'front', title: 'Front 9 · holes 1–9', holes: 9, nineIds: [nines[0].id] },
    { key: 'back', title: 'Back 9 · holes 10–18', holes: 9, nineIds: [nines[1].id] },
  ];
  if (nines.length === 0) return [{ key: '18', title: '18 holes', holes: 18, nineIds: [] }, { key: '9', title: '9 holes', holes: 9, nineIds: [] }];
  return [];
}
function holesOf(r: PageRound, nines: NineRow[]): Holes | null {
  const os = holeOptions(nines);
  const exact = os.find(x => x.holes === r.holes && x.nineIds.join() === r.nineIds.join());
  if (exact) return exact.key;
  // An 18-hole round stored without its nines is still "1–18"; a nine we can't place gets no tiles.
  return os.find(x => x.holes === r.holes && (x.key === 'all' || x.key === '18' || x.key === '9'))?.key ?? null;
}
/** "Holes 1–18", "Holes 10–18", or the nines' names on a course with more than two. */
export function holesChip(r: PageRound, nines: NineRow[]): string {
  if (nines.length === 2) {
    if (r.holes === 18) return 'Holes 1–18';
    if (r.holes === 9 && r.nineIds.length === 1) return r.nineIds[0] === nines[0].id ? 'Holes 1–9' : r.nineIds[0] === nines[1].id ? 'Holes 10–18' : '9 holes';
  }
  if (nines.length > 2 && r.nineIds.length) return r.nineIds.map(id => nines.find(n => n.id === id)?.name).filter(Boolean).join(' + ');
  return `${r.holes} holes`;
}
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export function whenSold(s: RoundSale): string {
  if (s.from && s.to) return `${fmtTime(s.from)} – ${fmtTime(s.to)}`;
  if (s.from) return `From ${fmtTime(s.from)}`;
  if (s.to) return `Until ${fmtTime(s.to)}`;
  return 'All day';
}

type Draft = { key: string | null; label: string; holes: Holes | null; from: string; to: string; min: string; max: string; days: string };
const str = (n: number | null | undefined) => (n == null ? '' : String(n));

export function BookableRounds({ plan, rounds, nines, canEdit, canEditRounds, setRound, saveRound, addRound, course, saveRules }: {
  plan: CoursePlan; rounds: PageRound[]; nines: NineRow[]; canEdit: boolean; canEditRounds: boolean;
  course: CourseRules | null; saveRules: (key: string, r: { minPlayers: string; maxPlayers: string; publicAdvanceDays: string }) => Promise<string | null>;
  setRound: (key: string, patch: Partial<RoundSale>) => void;
  saveRound: (key: string, patch: { label?: string; holes?: number; nineIds?: string[] }) => Promise<string | null>;
  addRound: (r: { label: string; holes: number; nineIds: string[]; from: string | null; to: string | null; existing: string | null }) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const day = plan.usual;
  const sold = plan.rounds.filter(s => s.on && rounds.some(r => r.key === s.key));
  const notSold = rounds.filter(r => !sold.some(s => s.key === r.key));
  const opts = holeOptions(nines);
  const span = Math.max(1, toMin(day.last) - toMin(day.first));
  const at = (t: string) => Math.max(0, Math.min(100, ((toMin(t) - toMin(day.first)) / span) * 100));

  function open(key: string | null) {
    setErr('');
    const r = key === null ? null : rounds.find(x => x.key === key)!;
    const s = key === null ? null : plan.rounds.find(x => x.key === key)!;
    setDraft({ key, label: r?.label ?? '', holes: r ? holesOf(r, nines) : (opts[0]?.key ?? null), from: s?.from ?? day.first, to: s?.to ?? day.last,
      min: str(r?.minPlayers), max: str(r?.maxPlayers), days: str(r?.publicAdvanceDays) });
  }
  // A window that covers the whole weekday is "all day" (null), the way the plan stores it.
  const windowOf = (d: Draft) => ({ from: d.from && d.from > day.first ? d.from : null, to: d.to && d.to < day.last ? d.to : null });

  async function submit() {
    if (!draft) return;
    if (draft.from && draft.to && draft.from >= draft.to) { setErr('It has to start being sold before it stops.'); return; }
    const w = windowOf(draft);
    const o = opts.find(x => x.key === draft.holes);
    setBusy(true); setErr('');
    try {
      if (draft.key === null) {
        if (!draft.label.trim()) { setErr('Give the round a name.'); return; }
        // A round the course already has but doesn't sell is switched back on rather than made twice.
        const same = notSold.find(r => r.label.trim().toLowerCase() === draft.label.trim().toLowerCase() && (!o || (r.holes === o.holes && r.nineIds.join() === o.nineIds.join())));
        const why = await addRound({ label: draft.label.trim(), holes: o?.holes ?? 18, nineIds: o?.nineIds ?? [], ...w, existing: same?.key ?? null });
        if (why) { setErr(why); return; }
      } else {
        const r = rounds.find(x => x.key === draft.key)!;
        const patch: { label?: string; holes?: number; nineIds?: string[] } = {};
        if (draft.key && draft.label.trim() && draft.label.trim() !== r.label) patch.label = draft.label.trim();
        if (draft.key && o && (o.holes !== r.holes || o.nineIds.join() !== r.nineIds.join())) { patch.holes = o.holes; patch.nineIds = o.nineIds; }
        if (Object.keys(patch).length) {
          const why = await saveRound(draft.key, patch);
          if (why) { setErr(why); return; }
        }
        if (draft.key && canEditRounds && (draft.min !== str(r.minPlayers) || draft.max !== str(r.maxPlayers) || draft.days !== str(r.publicAdvanceDays))) {
          const why = await saveRules(draft.key, { minPlayers: draft.min, maxPlayers: draft.max, publicAdvanceDays: draft.days });
          if (why) { setErr(why); return; }
        }
        setRound(draft.key, w);
      }
      setDraft(null);
    } finally { setBusy(false); }
  }

  const editing = draft?.key != null ? rounds.find(x => x.key === draft.key) : null;
  return (
    <Card className="px-1.5 pt-1.5 pb-2.5">
      <CardHead title="Bookable rounds" line="What golfers can book on your tee sheet, and when.">
        {canEdit && canEditRounds && <PlusButton label="Add a round" onClick={() => open(null)} />}
      </CardHead>
      {sold.length === 0 && <p className="px-3 py-3 text-[13.5px] text-ink-muted border-t border-line">No rounds are on sale.</p>}
      {sold.map(s => {
        const r = rounds.find(x => x.key === s.key)!;
        const from = s.from ?? day.first, to = s.to ?? day.last;
        return (
          <div key={s.key} className="grid grid-cols-[minmax(0,1fr)_34px] md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_34px] gap-x-4 gap-y-2 items-center p-3 border-t border-line">
            <div className="min-w-0">
              <b className="block font-semibold text-[14px] text-ink truncate">{r.label}</b>
              <span className="inline-block mt-1 text-[12px] text-ink-soft border border-line rounded-full px-2.5 py-px">{holesChip(r, nines)}</span>
            </div>
            <div className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto min-w-0">
              <span className="relative block h-2 rounded bg-paper" aria-hidden="true">
                <i className="absolute inset-y-0 rounded bg-ok opacity-75" style={{ left: `${at(from)}%`, right: `${100 - at(to)}%` }} />
              </span>
              <small className="block mt-1.5 text-[12.5px] text-ink-muted tabular-nums">{whenSold(s)}</small>
            </div>
            <div className="md:col-start-3 row-start-1 col-start-2">{canEdit && <PenButton label={`Edit ${r.label}`} onClick={() => open(s.key)} />}</div>
          </div>
        );
      })}

      {draft && (
        <Popup title={editing ? `Edit ${editing.label}` : 'Add a round'} onClose={() => !busy && setDraft(null)}>
          <Block label="Name">
            <input value={draft.label} disabled={(draft.key !== null && !draft.key) || !canEditRounds} aria-label="Name" onChange={e => setDraft({ ...draft, label: e.target.value })} className={FIELD} />
          </Block>
          {opts.length > 0 && draft.holes && draft.key !== '' && (
            <Block label="Which holes">
              <Tiles label="Which holes" options={opts.map(o => ({ key: o.key, title: o.title }))} value={draft.holes} disabled={!canEditRounds} onChange={k => setDraft({ ...draft, holes: k })} />
            </Block>
          )}
          <Block label="When golfers can book it">
            <div className="grid grid-cols-2 gap-2.5">
              <label className={LABEL}>From<input type="time" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} className={FIELD} /></label>
              <label className={LABEL}>Until<input type="time" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} className={FIELD} /></label>
            </div>
          </Block>
          {draft.key && (
            <Block label="Booking rules">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className={LABEL}>Fewest players<input type="number" inputMode="numeric" min={1} max={8} value={draft.min} disabled={!canEditRounds} onChange={e => setDraft({ ...draft, min: e.target.value })} className={FIELD} /></label>
                <label className={LABEL}>Most players<input type="number" inputMode="numeric" min={1} max={8} value={draft.max} disabled={!canEditRounds} onChange={e => setDraft({ ...draft, max: e.target.value })} className={FIELD} /></label>
                <label className={LABEL}>Public can book, days ahead<input type="number" inputMode="numeric" min={1} max={course?.publicAdvanceDays ?? 365} value={draft.days} disabled={!canEditRounds} onChange={e => setDraft({ ...draft, days: e.target.value })} className={FIELD} /></label>
              </div>
              {course && <p className="text-[12.5px] text-ink-muted">Blank uses your course’s rule from Settings: {course.minPlayers}–{course.maxPlayers} players, up to {course.publicAdvanceDays} days ahead.</p>}
              {course && editing && <p className="text-[12.5px] text-ink-soft">Golfers booking {editing.label} now: {editing.minPlayers ?? course.minPlayers}–{editing.maxPlayers ?? course.maxPlayers} players, {editing.publicAdvanceDays ?? course.publicAdvanceDays} days ahead.</p>}
            </Block>
          )}
          {draft.key !== null && (
            <button type="button" disabled={sold.length < 2} title={sold.length < 2 ? 'Golfers need at least one round to book.' : undefined}
              onClick={() => { setRound(draft.key!, { on: false }); setDraft(null); }} className={LINK_BAD}>Stop selling this round</button>
          )}
          {draft.key !== null && <p className="text-[12.5px] text-ink-muted -mt-2">Changes to when it’s sold go on your tee sheet when you review and save. Booked rounds stay booked.</p>}
          {err && <p role="alert" className="text-[13px] text-bad">{err}</p>}
          <PopupFoot onCancel={() => setDraft(null)}>
            <button type="button" onClick={submit} disabled={busy} className={PRIMARY}>{busy ? 'Saving…' : draft.key === null ? 'Add round' : 'Done'}</button>
          </PopupFoot>
        </Popup>
      )}
    </Card>
  );
}
