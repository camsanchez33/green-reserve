'use client';
// W2-9 Events: the guided setup (Cam 2026-10-21: "help walk through a course
// working how to input an outing or tournament"). Four steps — what it is,
// when it goes off, who's coming and what they get, then a review that shows
// exactly which tee times saving will hold and which booked groups are in the
// way. The same form edits an event (every step reachable).
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { INPUT } from '@/components/ui/field';
import { dfetch } from '@/lib/dashboard-fetch';
import { formatTeeDay, formatTeeTime } from '@/lib/format';

export type EventForm = {
  name: string; kind: string; date: string; format: 'shotgun' | 'tee_times'; startTime: string; holes: number;
  groups: string; players: string; productId: string; holdTo: string;
  /** Cam 2026-10-22: false = the event closes the course in its window; true = it shares it. */
  shareCourse: boolean; holdNineIds: string[]; keepOpen: string[];
  organizerName: string; organizerEmail: string; organizerPhone: string;
  pricePerPlayer: string; includes: string[]; terms: string; notes: string;
};
type Preview = { holdFrom: string; holdTo: string; teeTimes: number; teeTimesFound: number | null; booked: { time: string; golfers: string }[]; otherEvent: boolean; windowTimes: string[] };
export type NineOpt = { id: string; name: string };
export type Product = { id: string; label: string; holes: number };

export const KINDS: { key: string; label: string; hint: string }[] = [
  { key: 'outing', label: 'Outing', hint: 'A company, charity or club day — one organizer, one bill.' },
  { key: 'tournament', label: 'Tournament', hint: 'Players enter and play for a result.' },
  { key: 'league', label: 'League night', hint: 'A regular group taking a block of times.' },
  { key: 'other', label: 'Other', hint: 'Anything else that needs the course held.' },
];
const INCLUDES = ['Cart', 'Range balls', 'Food', 'Drinks', 'Prizes', 'Gift bag'];
const STEPS = ['What it is', 'When', 'Who and what', 'Review'];

export const blankForm = (date: string): EventForm => ({
  name: '', kind: 'outing', date, format: 'shotgun', startTime: '08:00', holes: 18, groups: '', players: '', productId: '', holdTo: '', shareCourse: false, holdNineIds: [], keepOpen: [],
  organizerName: '', organizerEmail: '', organizerPhone: '', pricePerPlayer: '', includes: [], terms: '', notes: '',
});

const LABEL = 'block text-[13px] font-medium text-ink mb-1.5';
const BTN = 'px-4 py-2.5 rounded-md text-[13.5px] font-medium transition-colors disabled:opacity-50';
const PRIMARY = BTN + ' bg-pine hover:bg-pine-hover text-white';
const SECONDARY = BTN + ' bg-white border border-line text-ink hover:bg-paper';

export default function EventSetup({ initial, eventId, products, nines, courseHoles, onSaved, onCancel }: {
  initial: EventForm; eventId?: string; products: Product[]; nines: NineOpt[]; courseHoles: number;
  onSaved: (id: string, held: number, booked: number) => void; onCancel: () => void;
}) {
  const [f, setF] = useState<EventForm>(initial);
  const [step, setStep] = useState(eventId ? 3 : 0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState('');
  // Changing the hold's end keeps the review on screen but has to be checked again before saving.
  const [stale, setStale] = useState(false);
  const set = <K extends keyof EventForm>(k: K, v: EventForm[K]) => { setF(p => ({ ...p, [k]: v })); if (k === 'holdTo' || k === 'keepOpen') setStale(true); else setPreview(null); };

  const body = () => ({
    ...f,
    groups: f.groups === '' ? 0 : Number(f.groups), players: f.players === '' ? 0 : Number(f.players),
    productId: f.format === 'tee_times' ? f.productId || null : null,
  });

  // Each step checks only what it asked for; the server checks everything again.
  function stepError(s: number): string {
    if (s === 0 && !f.name.trim()) return 'Give the event a name.';
    if (s === 1) {
      if (!f.date) return 'Pick the date.';
      if (!f.startTime) return f.format === 'shotgun' ? 'Pick the shotgun start time.' : 'Pick the first tee time.';
      if (f.format === 'tee_times' && !(Number(f.groups) > 0)) return 'How many groups go off? It sets how many tee times are held.';
    }
    return '';
  }

  async function loadPreview() {
    setBusy(true); setError('');
    const url = eventId ? `/api/operator/events/${eventId}` : '/api/operator/events';
    const r = await dfetch<{ preview: Preview }>(url, { method: eventId ? 'PATCH' : 'POST', body: JSON.stringify({ ...body(), action: 'update', preview: true }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setPreview(r.data.preview); setStale(false);
  }

  function go(to: number) {
    for (let s = 0; s < Math.min(to, 3); s++) { const e = stepError(s); if (e) { setError(e); setStep(s); return; } }
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

  const toggleInclude = (x: string) => set('includes', f.includes.includes(x) ? f.includes.filter(i => i !== x) : [...f.includes, x]);
  const shotgunHoles = [9, 18].filter(h => h <= Math.max(courseHoles, 9));

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h2 className="font-serif text-[22px] font-semibold leading-tight text-ink">{eventId ? 'Change the event' : 'Set up an event'}</h2>
        <button onClick={onCancel} className="text-[13px] text-ink-soft hover:text-ink">Close</button>
      </div>

      <ol className="flex flex-wrap gap-x-5 gap-y-1 mb-6 text-[13px]" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button onClick={() => go(i)} aria-current={step === i ? 'step' : undefined}
              className={step === i ? 'font-semibold text-ink underline decoration-fairway decoration-2 underline-offset-4' : 'text-ink-soft hover:text-ink'}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-5 max-w-xl">
          <div>
            <span className={LABEL}>What kind of event?</span>
            <div className="grid sm:grid-cols-2 gap-2">
              {KINDS.map(k => (
                <button key={k.key} onClick={() => set('kind', k.key)} aria-pressed={f.kind === k.key}
                  className={'text-left rounded-md border px-3.5 py-3 transition-colors ' + (f.kind === k.key ? 'border-pine bg-pine/[0.05]' : 'border-line bg-white hover:bg-paper')}>
                  <div className="text-[14px] font-medium text-ink">{k.label}</div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">{k.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className={LABEL}>Name</span>
            <input className={INPUT + ' w-full'} value={f.name} maxLength={120} onChange={e => set('name', e.target.value)} placeholder="Rotary Club Charity Scramble" />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5 max-w-xl">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block"><span className={LABEL}>Date</span>
              <input type="date" className={INPUT + ' w-full'} value={f.date} onChange={e => set('date', e.target.value)} /></label>
          </div>
          <div>
            <span className={LABEL}>How does it go off?</span>
            <div className="grid sm:grid-cols-2 gap-2">
              {([['shotgun', 'Shotgun start', 'Every group starts at once, each on its own hole. Holds the whole course.'],
                 ['tee_times', 'Tee times', 'Groups go off one after another from a first time. Holds just those times.']] as const).map(([k, l, h]) => (
                <button key={k} onClick={() => set('format', k)} aria-pressed={f.format === k}
                  className={'text-left rounded-md border px-3.5 py-3 transition-colors ' + (f.format === k ? 'border-pine bg-pine/[0.05]' : 'border-line bg-white hover:bg-paper')}>
                  <div className="text-[14px] font-medium text-ink">{l}</div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">{h}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block"><span className={LABEL}>{f.format === 'shotgun' ? 'Shotgun at' : 'First tee time'}</span>
              <input type="time" step={60} className={INPUT + ' w-full'} value={f.startTime} onChange={e => set('startTime', e.target.value)} /></label>
            {f.format === 'shotgun' ? (
              <label className="block"><span className={LABEL}>Holes</span>
                <select className={INPUT + ' w-full'} value={f.holes} onChange={e => set('holes', Number(e.target.value))}>
                  {shotgunHoles.map(h => <option key={h} value={h}>{h} holes</option>)}
                </select></label>
            ) : (
              <label className="block"><span className={LABEL}>Groups going off</span>
                <input type="number" min={1} max={200} inputMode="numeric" className={INPUT + ' w-full'} value={f.groups} onChange={e => set('groups', e.target.value)} /></label>
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
            {f.format === 'shotgun'
              ? `A shotgun holds every tee time from an hour before the start to the end of the round (${f.holes === 9 ? '2¼' : '4½'} hours after). You can end the hold at another time on the last step.`
              : 'The event holds that many tee times in a row from the first one.'}
          </p>
          <div>
            <span className={LABEL}>How much of the course does it use?</span>
            <div className="grid sm:grid-cols-2 gap-2">
              {([[false, 'The whole course', 'Nothing in the event\u2019s hours can be booked. Most events.'],
                 [true, 'Part of it', 'Choose the holes it uses and which times golfers can still book.']] as const).map(([v, l, h]) => (
                <button key={l} onClick={() => { set('shareCourse', v); if (!v) { set('holdNineIds', []); set('keepOpen', []); } }} aria-pressed={f.shareCourse === v}
                  className={'text-left rounded-md border px-3.5 py-3 transition-colors ' + (f.shareCourse === v ? 'border-pine bg-pine/[0.05]' : 'border-line bg-white hover:bg-paper')}>
                  <div className="text-[14px] font-medium text-ink">{l}</div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">{h}</div>
                </button>
              ))}
            </div>
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
          {f.shareCourse && <p className="text-[13px] text-ink-soft">On the last step you can pick times in the event&apos;s hours that golfers can still book.</p>}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5 max-w-xl">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block"><span className={LABEL}>Players expected</span>
              <input type="number" min={0} max={1000} inputMode="numeric" className={INPUT + ' w-full'} value={f.players} onChange={e => set('players', e.target.value)} /></label>
            {f.format === 'shotgun' && (
              <label className="block"><span className={LABEL}>Groups</span>
                <input type="number" min={0} max={200} inputMode="numeric" className={INPUT + ' w-full'} value={f.groups} onChange={e => set('groups', e.target.value)} placeholder={f.players ? String(Math.ceil(Number(f.players) / 4)) : ''} /></label>
            )}
          </div>
          <fieldset className="space-y-3">
            <legend className="text-[15px] font-semibold text-ink mb-1">Organizer</legend>
            <label className="block"><span className={LABEL}>Name</span>
              <input className={INPUT + ' w-full'} value={f.organizerName} onChange={e => set('organizerName', e.target.value)} /></label>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className={LABEL}>Email</span>
                <input type="email" className={INPUT + ' w-full'} value={f.organizerEmail} onChange={e => set('organizerEmail', e.target.value)} /></label>
              <label className="block"><span className={LABEL}>Phone</span>
                <input type="tel" className={INPUT + ' w-full'} value={f.organizerPhone} onChange={e => set('organizerPhone', e.target.value)} /></label>
            </div>
          </fieldset>
          <label className="block sm:w-1/2"><span className={LABEL}>Price per player</span>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
              <input type="number" min={0} step="0.01" inputMode="decimal" className={INPUT + ' w-full pl-7'} value={f.pricePerPlayer} onChange={e => set('pricePerPlayer', e.target.value)} /></div>
          </label>
          <div>
            <span className={LABEL}>What&apos;s included</span>
            <div className="flex flex-wrap gap-2">
              {[...INCLUDES, ...f.includes.filter(i => !INCLUDES.includes(i))].map(x => (
                <button key={x} onClick={() => toggleInclude(x)} aria-pressed={f.includes.includes(x)}
                  className={'px-3 py-1.5 rounded-md border text-[13px] transition-colors ' + (f.includes.includes(x) ? 'border-pine bg-pine/[0.06] text-ink font-medium' : 'border-line bg-white text-ink-soft hover:bg-paper')}>
                  {x}
                </button>
              ))}
            </div>
            <form className="flex gap-2 mt-2" onSubmit={e => { e.preventDefault(); const v = custom.trim(); if (v && !f.includes.includes(v)) set('includes', [...f.includes, v]); setCustom(''); }}>
              <input className={INPUT + ' flex-1'} value={custom} maxLength={60} onChange={e => setCustom(e.target.value)} placeholder="Something else" />
              <button type="submit" className={SECONDARY}>Add</button>
            </form>
          </div>
          <label className="block"><span className={LABEL}>Deposit and refund terms</span>
            <textarea rows={3} className={INPUT + ' w-full'} value={f.terms} onChange={e => set('terms', e.target.value)} placeholder="Your own terms for this event — what the deposit is, and when it can be refunded." /></label>
          <label className="block"><span className={LABEL}>Notes for staff</span>
            <textarea rows={2} className={INPUT + ' w-full'} value={f.notes} onChange={e => set('notes', e.target.value)} /></label>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 max-w-xl">
          <div className="divide-y divide-line-soft text-[14px]">
            {[
              ['Event', `${f.name || '—'} · ${KINDS.find(k => k.key === f.kind)?.label ?? ''}`],
              ['When', f.date ? `${formatTeeDay(f.date)}, ${f.format === 'shotgun' ? `${f.holes}-hole shotgun at` : 'tee times from'} ${f.startTime ? formatTeeTime(f.startTime) : '—'}` : '—'],
              ['Players', [f.players && `${f.players} players`, f.groups && `${f.groups} groups`].filter(Boolean).join(', ') || 'Not set yet'],
              ['Organizer', [f.organizerName, f.organizerEmail, f.organizerPhone].filter(Boolean).join(' · ') || 'Not set yet'],
              ['Price', f.pricePerPlayer ? `$${Number(f.pricePerPlayer).toFixed(2)} per player` : 'Not set yet'],
              ['Included', f.includes.join(', ') || 'Nothing listed'],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-3 py-2"><span className="text-ink-muted">{k}</span><span className="text-ink">{v}</span></div>
            ))}
          </div>

          <div className="bg-paper/70 rounded-md px-4 py-3">
            <h3 className="text-[15px] font-semibold text-ink mb-1">The tee sheet</h3>
            {busy && !preview ? <p className="text-[13.5px] text-ink-muted">Working out which tee times it holds…</p>
              : !preview ? <p className="text-[13.5px] text-ink-muted">Fix the details above to see which tee times it holds.</p> : (
              <div className="space-y-2 text-[13.5px] text-ink">
                <p>Holds {formatTeeTime(preview.holdFrom)} to {formatTeeTime(preview.holdTo)}{preview.teeTimes ? ` — ${preview.teeTimes} tee time${preview.teeTimes === 1 ? '' : 's'}` : ''}. Golfers can&apos;t book them.</p>
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
                            className={'px-2.5 py-1.5 rounded-md border text-[12.5px] tabular-nums ' + (open ? 'border-ok bg-ok/[0.08] text-ink' : 'border-line bg-white text-ink-soft')}>
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
          <p className="text-[13px] text-ink-soft">Saving {eventId ? 'updates' : 'builds'} a prep checklist with due dates counted back from the event day{eventId ? ' (due dates move with the date)' : ''}.</p>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-[13.5px] text-bad">{error}</p>}

      <div className="flex flex-wrap gap-2 mt-6">
        {step > 0 && <button onClick={() => go(step - 1)} className={SECONDARY} disabled={busy}>Back</button>}
        {step < 3 && <button onClick={() => go(step + 1)} className={PRIMARY} disabled={busy}>Next</button>}
        {step === 3 && (
          <button onClick={save} className={PRIMARY} disabled={busy || !preview || stale}>
            {saving ? 'Saving…' : eventId ? 'Save changes' : 'Save and hold the tee times'}
          </button>
        )}
      </div>
    </Card>
  );
}
