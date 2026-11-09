'use client';
// W2-9 Events: the guided setup (Cam 2026-10-21: "help walk through a course working how to input an outing or
// tournament"). EVENTS-2 (Cam 2026-11-09, his Events notes: "a much clearer and organized process … if we are going
// to offer 4 different events we better be able to accommodate for all"; When "jumbled and clunky"; Who and what
// "not organized"; Review "needs to be better and have purpose"; required fields go red where they are):
//  1. What it is — the kind sets sensible starting answers for that kind (a new event only; every one can change).
//  2. When — the day, how it starts, its size, then how much of the course it takes, each its own short section.
//  3. Who and what — players, who pays and the price, the organizer, what's included, terms and notes.
//  4. Review — what saving does to the tee sheet first, then the details with a Change on each, what is still
//     missing (fine to add later), and the checklist saving builds with its dates.
// A required field left empty turns red under itself, never only a line at the bottom. The server checks again.
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { INPUT } from '@/components/ui/field';
import { dfetch } from '@/lib/dashboard-fetch';
import { formatTeeDay, formatTeeTime } from '@/lib/format';
import { addDaysStr } from '@/lib/course-time';
import { DEFAULT_TASKS, HEADCOUNT_TASK, shotgunWindow } from '@/lib/course-events';

export type EventForm = {
  name: string; kind: string; date: string; format: 'shotgun' | 'tee_times'; startTime: string; holes: number;
  groups: string; players: string; productId: string; holdTo: string;
  /** Cam 2026-10-22: false = the event closes the course in its window; true = it shares it. */
  shareCourse: boolean; holdNineIds: string[]; keepOpen: string[];
  organizerName: string; organizerEmail: string; organizerPhone: string;
  pricePerPlayer: string; includes: string[]; terms: string; notes: string;
  /** Cam 2026-10-24: who pays the course — one organizer, or each player on the sign-up page. '' = not chosen yet. */
  payer: '' | 'organizer' | 'players';
  /** Organizer events: the guaranteed headcount is due this many days before; '' = not asked for. */
  guaranteeDaysBefore: string;
};
type Preview = { holdFrom: string; holdTo: string; teeTimes: number; teeTimesFound: number | null; booked: { time: string; golfers: string }[]; otherEvent: boolean; windowTimes: string[] };
export type NineOpt = { id: string; name: string };
export type Product = { id: string; label: string; holes: number };

/** EVENTS-2: each kind starts with the answers that kind usually has (a new event only). */
type KindDefaults = { format: 'shotgun' | 'tee_times'; payer: '' | 'organizer' | 'players'; guaranteeDaysBefore: string };
export const KINDS: { key: string; label: string; hint: string; name: string; defaults: KindDefaults | null; sets: string }[] = [
  { key: 'outing', label: 'Outing', hint: 'A company, charity or club day — one organizer, one bill.', name: 'Rotary Club Charity Scramble',
    defaults: { format: 'shotgun', payer: 'organizer', guaranteeDaysBefore: '7' }, sets: 'a shotgun start, the organizer pays, headcount due a week before' },
  { key: 'tournament', label: 'Tournament', hint: 'Players enter and play for a result.', name: 'Club Championship',
    defaults: { format: 'shotgun', payer: 'players', guaranteeDaysBefore: '' }, sets: 'a shotgun start, each player pays when they sign up' },
  { key: 'league', label: 'League night', hint: 'A regular group taking a block of times.', name: 'Tuesday Men’s League',
    defaults: { format: 'tee_times', payer: 'players', guaranteeDaysBefore: '' }, sets: 'tee times one after another, each player pays' },
  { key: 'other', label: 'Other', hint: 'Anything else that needs the course held.', name: 'Junior clinic',
    defaults: null, sets: '' },
];
// Cam 2026-10-24, after how courses run outings: a company or private outing is one bill to the
// organizer (deposit, then the balance on the final headcount); a charity or open event has each
// player pay as they sign up.
export const PAYERS: { key: 'organizer' | 'players'; label: string; hint: string }[] = [
  { key: 'organizer', label: 'The organizer', hint: 'One bill: a deposit, then the balance.' },
  { key: 'players', label: 'Each player', hint: 'Each pays when they sign up online.' },
];
const INCLUDES = ['Cart', 'Range balls', 'Food', 'Drinks', 'Prizes', 'Gift bag'];
const STEPS = ['What it is', 'When', 'Who and what', 'Review'];

export const blankForm = (date: string): EventForm => ({
  name: '', kind: 'outing', date, format: 'shotgun', startTime: '08:00', holes: 18, groups: '', players: '', productId: '', holdTo: '', shareCourse: false, holdNineIds: [], keepOpen: [],
  organizerName: '', organizerEmail: '', organizerPhone: '', pricePerPlayer: '', includes: [], terms: '', notes: '', payer: 'organizer', guaranteeDaysBefore: '7',
});

type Field = 'name' | 'date' | 'startTime' | 'groups' | 'payer' | 'guaranteeDaysBefore' | 'organizerName' | 'organizerContact';
/** What each step requires, field by field — shown under the field itself. */
export function fieldErrors(f: EventForm, s: number): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (s === 0 && !f.name.trim()) e.name = 'Give the event a name.';
  if (s === 1) {
    if (!f.date) e.date = 'Pick the date.';
    if (!f.startTime) e.startTime = f.format === 'shotgun' ? 'Pick the shotgun start time.' : 'Pick the first tee time.';
    if (f.format === 'tee_times' && !(Number(f.groups) > 0)) e.groups = 'How many groups go off? It sets how many tee times are held.';
  }
  if (s === 2) {
    if (!f.payer) e.payer = 'Say who pays the course.';
    if (f.payer === 'organizer') {
      if (f.guaranteeDaysBefore !== '' && !(Number.isInteger(Number(f.guaranteeDaysBefore)) && Number(f.guaranteeDaysBefore) >= 1 && Number(f.guaranteeDaysBefore) <= 60)) e.guaranteeDaysBefore = '1 to 60 days, or leave it blank.';
      // One bill to the organizer: the course has to know who that is and how to reach them.
      if (!f.organizerName.trim()) e.organizerName = 'Who is the bill for?';
      if (!f.organizerEmail.trim() && f.organizerPhone.replace(/\D/g, '').length < 10) e.organizerContact = 'An email or a phone.';
    }
  }
  return e;
}

const LABEL = 'block text-[13px] font-medium text-ink mb-1.5';
const BTN = 'px-4 py-2.5 rounded-md text-[13.5px] font-medium transition-colors disabled:opacity-50';
const PRIMARY = BTN + ' bg-pine hover:bg-pine-hover text-white';
const SECONDARY = BTN + ' bg-white border border-line text-ink hover:bg-paper';
const CHOICE = (on: boolean, bad = false) => 'text-left rounded-md border px-3.5 py-3 transition-colors ' + (on ? 'border-pine bg-pine/[0.05]' : (bad ? 'border-bad' : 'border-line') + ' bg-white hover:bg-paper');
/** A step's section: a short heading, its fields, a hairline above all but the first. */
const SECTION = 'space-y-3 pt-5 border-t border-line-soft first:pt-0 first:border-0';
const H3 = 'text-[15px] font-semibold text-ink';

export default function EventSetup({ initial, eventId, products, nines, courseHoles, today, onSaved, onCancel }: {
  initial: EventForm; eventId?: string; products: Product[]; nines: NineOpt[]; courseHoles: number;
  /** The course's today: a checklist date already past is due today, as the server makes it. */
  today: string;
  onSaved: (id: string, held: number, booked: number) => void; onCancel: () => void;
}) {
  const [f, setF] = useState<EventForm>(initial);
  const [step, setStep] = useState(eventId ? 3 : 0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState('');
  // The steps whose Next was pressed: their empty required fields show red.
  const [tried, setTried] = useState<Set<number>>(new Set());
  // Changing the hold's end keeps the review on screen but has to be checked again before saving.
  const [stale, setStale] = useState(false);
  const set = <K extends keyof EventForm>(k: K, v: EventForm[K]) => { setF(p => ({ ...p, [k]: v })); if (k === 'holdTo' || k === 'keepOpen') setStale(true); else setPreview(null); };

  const errs = (s: number) => tried.has(s) ? fieldErrors(f, s) : {};
  const err = { ...errs(0), ...errs(1), ...errs(2) };
  // A field with a gap wears the bad colour in place of its usual line.
  const IN = (k: Field) => err[k] ? INPUT.replace('border-line', 'border-bad') : INPUT;
  const Msg = ({ k }: { k: Field }) => err[k] ? <p className="text-[12.5px] text-bad mt-1">{err[k]}</p> : null;

  const body = () => ({
    ...f,
    groups: f.groups === '' ? 0 : Number(f.groups), players: f.players === '' ? 0 : Number(f.players),
    productId: f.format === 'tee_times' ? f.productId || null : null,
  });

  async function loadPreview() {
    setBusy(true); setError('');
    const url = eventId ? `/api/operator/events/${eventId}` : '/api/operator/events';
    const r = await dfetch<{ preview: Preview }>(url, { method: eventId ? 'PATCH' : 'POST', body: JSON.stringify({ ...body(), action: 'update', preview: true }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setPreview(r.data.preview); setStale(false);
  }

  // Changing an event opens on Review: work out its hold straight away, so Save is ready.
  useEffect(() => { if (eventId) loadPreview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function go(to: number) {
    // Going forward checks every step on the way; the first one with a gap opens, its gaps in red.
    for (let s = 0; s < Math.min(to, 3); s++) {
      if (Object.keys(fieldErrors(f, s)).length) {
        setTried(t => new Set(t).add(s)); setStep(s); setError('');
        setTimeout(() => document.querySelector('[data-event-setup] .border-bad')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
        return;
      }
    }
    setError(''); setStep(to);
    if (to === 3) loadPreview();
  }

  async function save() {
    setBusy(true); setSaving(true); setError('');
    const r = eventId
      ? await dfetch<{ event: { id: string }; hold: { held: number; booked: unknown[] } }>(`/api/operator/events/${eventId}`, { method: 'PATCH', body: JSON.stringify({ ...body(), action: 'update' }) })
      : await dfetch<{ event: { id: string }; hold: { held: number; booked: unknown[] } }>('/api/operator/events', { method: 'POST', body: JSON.stringify(body()) });
    setBusy(false); setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    onSaved(r.data.event.id, r.data.hold?.held ?? 0, r.data.hold?.booked?.length ?? 0);
  }

  function pickKind(key: string) {
    const k = KINDS.find(x => x.key === key);
    // A new event takes the kind's usual answers; an event being changed keeps what it has.
    if (!eventId && k?.defaults) {
      const d = k.defaults;
      setF(p => ({ ...p, kind: key, format: d.format, payer: d.payer, guaranteeDaysBefore: d.guaranteeDaysBefore, ...(d.format === 'shotgun' ? { productId: '' } : {}) }));
      setPreview(null);
    } else set('kind', key);
  }

  const toggleInclude = (x: string) => set('includes', f.includes.includes(x) ? f.includes.filter(i => i !== x) : [...f.includes, x]);
  const shotgunHoles = [9, 18].filter(h => h <= Math.max(courseHoles, 9));
  const kind = KINDS.find(k => k.key === f.kind);
  const orgPays = f.payer === 'organizer';
  const price = Number(f.pricePerPlayer) || 0;
  const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const win = f.format === 'shotgun' && f.startTime ? shotgunWindow(f.startTime, f.holes) : null;

  // Review: what's still empty — none of it stops the save, each has its own Add.
  const missing: [string, number][] = [
    ...(!f.pricePerPlayer ? [['A price per player', 2] as [string, number]] : []),
    ...(!f.players ? [['How many players are expected', 2] as [string, number]] : []),
    ...(!orgPays && !f.organizerName && !f.organizerEmail ? [['Someone to contact about it', 2] as [string, number]] : []),
    ...(f.includes.length === 0 ? [['What’s included', 2] as [string, number]] : []),
  ];
  const tasks = DEFAULT_TASKS.map(t => {
    const days = t.label === HEADCOUNT_TASK && orgPays && f.guaranteeDaysBefore ? Number(f.guaranteeDaysBefore) : t.daysBefore;
    const due = f.date ? addDaysStr(f.date, -days) : '';
    return { label: t.label, due: due && due < today ? today : due };
  });

  const ChangeLink = ({ to }: { to: number }) => <button type="button" onClick={() => setStep(to)} className="text-[13px] font-medium text-pine hover:underline underline-offset-4">Change</button>;

  return (
    <Card className="p-5 sm:p-6" data-event-setup>
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h2 className="font-serif text-[22px] font-semibold leading-tight text-ink">{eventId ? 'Change the event' : 'Set up an event'}</h2>
        <button onClick={onCancel} className="text-[13px] text-ink-soft hover:text-ink">Close</button>
      </div>

      <ol className="grid grid-cols-4 gap-2 mb-6" aria-label="Steps">
        {STEPS.map((s, i) => {
          const done = i < step;
          return (
            <li key={s}>
              <button onClick={() => go(i)} aria-current={step === i ? 'step' : undefined} className="w-full text-left">
                <span className={'block h-1 rounded-full ' + (step === i ? 'bg-pine' : done ? 'bg-fairway' : 'bg-line')} />
                <span className={'block mt-1.5 text-[12.5px] ' + (step === i ? 'font-semibold text-ink' : 'text-ink-soft hover:text-ink')}>
                  <span className="tabular-nums">{i + 1}.</span> {s}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <div className="space-y-5 max-w-xl">
          <section className={SECTION}>
            <h3 className={H3}>What kind of event?</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {KINDS.map(k => (
                <button key={k.key} onClick={() => pickKind(k.key)} aria-pressed={f.kind === k.key} className={CHOICE(f.kind === k.key)}>
                  <div className="text-[14px] font-medium text-ink">{k.label}</div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">{k.hint}</div>
                </button>
              ))}
            </div>
            {!eventId && kind?.sets && <p className="text-[12.5px] text-ink-muted">Starts as {kind.sets}. Change any later.</p>}
          </section>
          <section className={SECTION}>
            <label className="block">
              <span className={LABEL}>Name</span>
              <input className={IN('name') + ' w-full'} value={f.name} maxLength={120} onChange={e => set('name', e.target.value)} placeholder={kind?.name ?? ''} aria-invalid={!!err.name} />
            </label>
            <Msg k="name" />
          </section>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5 max-w-xl">
          <section className={SECTION}>
            <h3 className={H3}>How it starts</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {([['shotgun', 'Shotgun start', 'Every group starts at once, each on its own hole.'],
                 ['tee_times', 'Tee times', 'Groups go off one after another from a first time.']] as const).map(([k, l, h]) => (
                <button key={k} onClick={() => set('format', k)} aria-pressed={f.format === k} className={CHOICE(f.format === k)}>
                  <div className="text-[14px] font-medium text-ink">{l}</div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">{h}</div>
                </button>
              ))}
            </div>
          </section>

          <section className={SECTION}>
            <h3 className={H3}>Day and time</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div><label className="block"><span className={LABEL}>Date</span>
                <input type="date" className={IN('date') + ' w-full'} value={f.date} onChange={e => set('date', e.target.value)} aria-invalid={!!err.date} /></label><Msg k="date" /></div>
              <div><label className="block"><span className={LABEL}>{f.format === 'shotgun' ? 'Shotgun at' : 'First tee time'}</span>
                <input type="time" step={60} className={IN('startTime') + ' w-full'} value={f.startTime} onChange={e => set('startTime', e.target.value)} aria-invalid={!!err.startTime} /></label><Msg k="startTime" /></div>
              {f.format === 'shotgun' ? (
                <label className="block"><span className={LABEL}>Holes</span>
                  <select className={INPUT + ' w-full'} value={f.holes} onChange={e => set('holes', Number(e.target.value))}>
                    {shotgunHoles.map(h => <option key={h} value={h}>{h} holes</option>)}
                  </select></label>
              ) : (
                <div><label className="block"><span className={LABEL}>Groups going off</span>
                  <input type="number" min={1} max={200} inputMode="numeric" className={IN('groups') + ' w-full'} value={f.groups} onChange={e => set('groups', e.target.value)} aria-invalid={!!err.groups} /></label><Msg k="groups" /></div>
              )}
            </div>
            {f.format === 'tee_times' && products.length > 1 && (
              <label className="block"><span className={LABEL}>Which round&apos;s tee times</span>
                <select className={INPUT + ' w-full'} value={f.productId} onChange={e => set('productId', e.target.value)}>
                  <option value="">Every round at those times</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select></label>
            )}
            <p className="text-[13px] text-ink-soft">
              {win ? <>Holds the tee sheet <span className="text-ink tabular-nums">{formatTeeTime(win.from)}–{formatTeeTime(win.to)}</span>.</>
                : f.format === 'tee_times' ? <>Holds {Number(f.groups) > 0 ? <span className="text-ink tabular-nums">{f.groups} tee time{f.groups === '1' ? '' : 's'}</span> : 'that many tee times'} in a row from the first one.</> : null}
            </p>
          </section>

          <section className={SECTION}>
            <h3 className={H3}>How much of the course</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {([[false, f.format === 'tee_times' && f.productId ? 'All of that round' : 'The whole course', f.format === 'tee_times' && f.productId ? 'None of that round’s times in the event’s hours can be booked.' : 'Nothing in the event’s hours can be booked. Most events.'],
                 [true, 'Part of it', 'Choose the holes it uses and which times golfers can still book.']] as const).map(([v, l, h]) => (
                <button key={l} onClick={() => { set('shareCourse', v); if (!v) { set('holdNineIds', []); set('keepOpen', []); } }} aria-pressed={f.shareCourse === v} className={CHOICE(f.shareCourse === v)}>
                  <div className="text-[14px] font-medium text-ink">{l}</div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">{h}</div>
                </button>
              ))}
            </div>
            {f.shareCourse && f.format === 'shotgun' && nines.length > 1 && (
              <fieldset>
                <legend className={LABEL}>Holes it uses</legend>
                <div className="flex flex-wrap gap-2">
                  {nines.map(n => {
                    const on = f.holdNineIds.length === 0 || f.holdNineIds.includes(n.id);
                    const next = on ? (f.holdNineIds.length === 0 ? nines.map(x => x.id) : f.holdNineIds).filter(id => id !== n.id) : [...f.holdNineIds, n.id];
                    return (
                      <label key={n.id} className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-[13.5px] text-ink">
                        <input type="checkbox" className="accent-pine" checked={on} disabled={on && next.length === 0}
                          onChange={() => set('holdNineIds', next.length === nines.length ? [] : next)} />
                        {n.name}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[12.5px] text-ink-soft mt-1.5">Rounds on the other nines stay on sale.</p>
              </fieldset>
            )}
            {f.shareCourse && <p className="text-[13px] text-ink-soft">Pick times to keep open on Review.</p>}
          </section>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5 max-w-xl">
          <section className={SECTION}>
            <h3 className={H3}>Players</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className={LABEL}>Players expected</span>
                <input type="number" min={0} max={1000} inputMode="numeric" className={INPUT + ' w-full'} value={f.players} onChange={e => set('players', e.target.value)} /></label>
              {f.format === 'shotgun' && (
                <label className="block"><span className={LABEL}>Groups</span>
                  <input type="number" min={0} max={200} inputMode="numeric" className={INPUT + ' w-full'} value={f.groups} onChange={e => set('groups', e.target.value)} placeholder={f.players ? String(Math.ceil(Number(f.players) / 4)) : ''} /></label>
              )}
            </div>
          </section>

          <section className={SECTION}>
            <h3 className={H3}>Who pays the course</h3>
            <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Who pays the course" aria-invalid={!!err.payer}>
              {PAYERS.map(p => (
                <button key={p.key} type="button" role="radio" aria-checked={f.payer === p.key} onClick={() => set('payer', p.key)} className={CHOICE(f.payer === p.key, !!err.payer)}>
                  <div className="text-[14px] font-medium text-ink">{p.label}</div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">{p.hint}</div>
                </button>
              ))}
            </div>
            <Msg k="payer" />
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className={LABEL}>Price per player</span>
                <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                  <input type="number" min={0} step="0.01" inputMode="decimal" className={INPUT + ' w-full pl-7'} value={f.pricePerPlayer} onChange={e => set('pricePerPlayer', e.target.value)} /></div>
              </label>
              {orgPays && (
                <div>
                  <label className="block"><span className={LABEL}>Headcount due (days before)</span>
                    <input type="number" min={1} max={60} inputMode="numeric" className={IN('guaranteeDaysBefore') + ' w-full'} value={f.guaranteeDaysBefore} onChange={e => set('guaranteeDaysBefore', e.target.value)} aria-invalid={!!err.guaranteeDaysBefore} /></label>
                  <Msg k="guaranteeDaysBefore" />
                  {!err.guaranteeDaysBefore && <p className="text-[12.5px] text-ink-muted mt-1">Blank = not asked for.</p>}
                </div>
              )}
            </div>
            {price > 0 && Number(f.players) > 0 && <p className="text-[13px] text-ink-soft tabular-nums">{f.players} players × {usd(price)} = <span className="text-ink font-medium">{usd(price * Number(f.players))}</span></p>}
          </section>

          <section className={SECTION}>
            <h3 className={H3}>{orgPays ? 'The organizer' : 'Who to contact'}{!orgPays && <span className="font-normal text-ink-muted text-[13px]"> · optional</span>}</h3>
            <div>
              <label className="block"><span className={LABEL}>Name</span>
                <input className={IN('organizerName') + ' w-full'} value={f.organizerName} onChange={e => set('organizerName', e.target.value)} aria-invalid={!!err.organizerName} /></label>
              <Msg k="organizerName" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className={LABEL}>Email</span>
                <input type="email" className={IN('organizerContact') + ' w-full'} value={f.organizerEmail} onChange={e => set('organizerEmail', e.target.value)} /></label>
              <label className="block"><span className={LABEL}>Phone</span>
                <input type="tel" className={IN('organizerContact') + ' w-full'} value={f.organizerPhone} onChange={e => set('organizerPhone', e.target.value)} /></label>
            </div>
            <Msg k="organizerContact" />
          </section>

          <section className={SECTION}>
            <h3 className={H3}>What&apos;s included</h3>
            <div className="flex flex-wrap gap-2">
              {[...INCLUDES, ...f.includes.filter(i => !INCLUDES.includes(i))].map(x => (
                <button key={x} onClick={() => toggleInclude(x)} aria-pressed={f.includes.includes(x)}
                  className={'px-3 py-1.5 rounded-md border text-[13px] transition-colors ' + (f.includes.includes(x) ? 'border-pine bg-pine/[0.06] text-ink font-medium' : 'border-line bg-white text-ink-soft hover:bg-paper')}>
                  {x}
                </button>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const v = custom.trim(); if (v && !f.includes.includes(v)) set('includes', [...f.includes, v]); setCustom(''); }}>
              <input className={INPUT + ' flex-1'} value={custom} maxLength={60} onChange={e => setCustom(e.target.value)} placeholder="Something else" aria-label="Something else included" />
              <button type="submit" className={SECONDARY}>Add</button>
            </form>
          </section>

          <section className={SECTION}>
            <h3 className={H3}>Terms and notes</h3>
            <label className="block"><span className={LABEL}>{orgPays ? 'Deposit and refund terms' : 'Refund terms'}</span>
              <textarea rows={3} className={INPUT + ' w-full'} value={f.terms} onChange={e => set('terms', e.target.value)} placeholder={orgPays ? 'What the deposit is, and when it can be refunded.' : 'When a player can get their entry back.'} /></label>
            <label className="block"><span className={LABEL}>Notes for staff</span>
              <textarea rows={2} className={INPUT + ' w-full'} value={f.notes} onChange={e => set('notes', e.target.value)} /></label>
          </section>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5 max-w-xl">
          <section className={SECTION}>
            <h3 className={H3}>What saving does to the tee sheet</h3>
            <div className="bg-paper/70 rounded-md px-4 py-3">
              {busy && !preview ? <p className="text-[13.5px] text-ink-muted">Working out which tee times it holds…</p>
                : !preview ? <p className="text-[13.5px] text-ink-muted">Fix the details to see which tee times it holds.</p> : (
                <div className="space-y-2 text-[13.5px] text-ink">
                  <p>Holds <span className="tabular-nums">{formatTeeTime(preview.holdFrom)}–{formatTeeTime(preview.holdTo)}</span>{preview.teeTimes ? <> — <span className="font-medium">{preview.teeTimes} tee time{preview.teeTimes === 1 ? '' : 's'}</span></> : ''}. Golfers can&apos;t book them.</p>
                  {preview.teeTimesFound !== null && Number(f.groups) > preview.teeTimesFound && (
                    <p className="border-l-[3px] border-warn pl-3">Your schedule only has {preview.teeTimesFound} tee time{preview.teeTimesFound === 1 ? '' : 's'} from {formatTeeTime(f.startTime)} that day, not {f.groups}. Start earlier or add times on the Schedule.</p>
                  )}
                  {preview.booked.length > 0 && (
                    <div className="border-l-[3px] border-warn pl-3">
                      <p>{preview.booked.length} time{preview.booked.length === 1 ? ' is' : 's are'} already booked and won&apos;t be held. Move these groups from the tee sheet, then press &ldquo;Hold the open times&rdquo; on the event:</p>
                      <ul className="mt-1 text-ink-soft">{preview.booked.map(b => <li key={b.time}>{formatTeeTime(b.time)} — {b.golfers}</li>)}</ul>
                    </div>
                  )}
                  {preview.otherEvent && <p className="border-l-[3px] border-warn pl-3">Another event already holds some of these times. They stay with that event.</p>}
                  <label className="flex items-center gap-2 pt-1">
                    <span className="text-ink-soft">End the hold at</span>
                    <input type="time" step={60} className={INPUT + ' w-36'} value={f.holdTo || preview.holdTo} onChange={e => set('holdTo', e.target.value)} />
                    {f.holdTo && <button onClick={() => set('holdTo', '')} className="text-[13px] text-ink-soft underline">Reset</button>}
                  </label>
                  {f.shareCourse && preview.windowTimes.length > 0 && (
                    <fieldset className="pt-1">
                      <legend className="text-ink-soft mb-1.5">Tap a time to keep it open for golfers</legend>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.windowTimes.map(t => {
                          const open = f.keepOpen.includes(t);
                          return (
                            <button key={t} type="button" aria-pressed={open} onClick={() => set('keepOpen', open ? f.keepOpen.filter(x => x !== t) : [...f.keepOpen, t].sort())}
                              className={'px-2.5 py-1.5 rounded-md border text-[12.5px] tabular-nums ' + (open ? 'border-pine bg-pine/[0.06] text-ink font-medium' : 'border-line bg-white text-ink-soft')}>
                              {formatTeeTime(t)}{open ? ' · open' : ''}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}
                  {stale && <button onClick={loadPreview} disabled={busy} className="text-[13px] text-ink underline">Check the new hold</button>}
                </div>
              )}
            </div>
          </section>

          <section className={SECTION}>
            <h3 className={H3}>The details</h3>
            <div className="divide-y divide-line-soft text-[14px]">
              {([
                ['Event', `${f.name || '—'} · ${kind?.label ?? ''}`, 0],
                ['When', f.date ? `${formatTeeDay(f.date)}, ${f.format === 'shotgun' ? `${f.holes}-hole shotgun at` : `${f.groups || '—'} groups from`} ${f.startTime ? formatTeeTime(f.startTime) : '—'}${f.shareCourse ? ' · shares the course' : ''}` : '—', 1],
                ['Players', [f.players && `${f.players} players`, f.groups && f.format === 'shotgun' && `${f.groups} groups`].filter(Boolean).join(', ') || 'Not set yet', 2],
                ['Who pays', `${PAYERS.find(p => p.key === f.payer)?.label ?? 'Not chosen yet'}${f.pricePerPlayer ? ` · ${usd(price)} per player` : ''}`, 2],
                ...(orgPays ? [['Headcount due', f.guaranteeDaysBefore && f.date ? `${formatTeeDay(addDaysStr(f.date, -Number(f.guaranteeDaysBefore)))} (${f.guaranteeDaysBefore} day${f.guaranteeDaysBefore === '1' ? '' : 's'} before)` : 'Not asked for', 2] as [string, string, number]] : []),
                [orgPays ? 'Organizer' : 'Contact', [f.organizerName, f.organizerEmail, f.organizerPhone].filter(Boolean).join(' · ') || 'Not set yet', 2],
                ['Included', f.includes.join(', ') || 'Nothing listed', 2],
              ] as [string, string, number][]).map(([k, v, s]) => (
                <div key={k} className="grid grid-cols-[110px_1fr_auto] gap-3 py-2 items-baseline"><span className="text-ink-muted">{k}</span><span className="text-ink">{v}</span><ChangeLink to={s} /></div>
              ))}
            </div>
          </section>

          {missing.length > 0 && (
            <section className={SECTION}>
              <h3 className={H3}>Still to add <span className="font-normal text-ink-muted text-[13px]">· fine to add later on the event</span></h3>
              <ul className="divide-y divide-line-soft text-[13.5px]">
                {missing.map(([label, s]) => (
                  <li key={label} className="flex items-center justify-between gap-3 py-2"><span className="text-ink">{label}</span>
                    <button type="button" onClick={() => setStep(s)} className="text-[13px] font-medium text-pine hover:underline underline-offset-4">Add</button></li>
                ))}
              </ul>
            </section>
          )}

          {!eventId && (
            <section className={SECTION}>
              <h3 className={H3}>The checklist it starts with</h3>
              <ul className="divide-y divide-line-soft text-[13.5px]">
                {tasks.map(t => (
                  <li key={t.label} className="flex items-baseline justify-between gap-3 py-2"><span className="text-ink">{t.label}</span><span className="text-[12.5px] text-ink-muted tabular-nums">{t.due ? formatTeeDay(t.due) : ''}</span></li>
                ))}
              </ul>
              <p className="text-[12.5px] text-ink-muted">Change it after saving.</p>
            </section>
          )}
          {eventId && <p className="text-[13px] text-ink-soft">The checklist&apos;s due dates move with the date.</p>}
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-[13.5px] text-bad">{error}</p>}

      <div className="flex flex-wrap gap-2 mt-6 pt-5 border-t border-line-soft">
        {step > 0 && <button onClick={() => go(step - 1)} className={SECONDARY} disabled={busy}>Back</button>}
        {step < 3 && <button onClick={() => go(step + 1)} className={PRIMARY} disabled={busy}>Next: {STEPS[step + 1]}</button>}
        {step === 3 && (
          <button onClick={save} className={PRIMARY} disabled={busy || !preview || stale}>
            {saving ? 'Saving…' : eventId ? 'Save changes' : 'Save and hold the tee times'}
          </button>
        )}
      </div>
    </Card>
  );
}
