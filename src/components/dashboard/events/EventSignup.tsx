'use client';
// W2-9d (Cam 2026-10-22): the event's public sign-up page, from the course's
// side — open or close it, pay when signing up or later, how many one person
// can sign up together, the course's own questions — and the people who
// signed up but aren't on the list: still paying (a 30-minute hold), on the
// waiting list, or whose hold ran out.
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import type { EventPlayer } from './EventDetail';

export type SignupQuestion = { id: string; label: string; required: boolean };
type Settings = { signupOpen: boolean; signupPay: string; signupMaxGroup: number; signupQuestions: SignupQuestion[] };

const BTN = 'px-3 py-2 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50';
const PRIMARY = BTN + ' bg-pine hover:bg-pine-hover text-white';
const SECONDARY = BTN + ' bg-white border border-line text-ink hover:bg-paper';
const LINK = 'text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2 disabled:opacity-50';

export default function EventSignup({ live, url, settings, priceSet, spotsLeft, waiting, busy, act }: {
  live: boolean; url: string; settings: Settings; priceSet: boolean; spotsLeft: number | null;
  /** Signed up but not on the list. */
  waiting: EventPlayer[];
  busy: string;
  act: (key: string, body: Record<string, unknown>, done?: (r: Record<string, unknown>) => string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Settings>(settings);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  // One row per sign-up (everyone who signed up together), in the order they came.
  const bySignup = new Map<string, EventPlayer[]>();
  for (const p of waiting) bySignup.set(p.groupKey || p.id, [...(bySignup.get(p.groupKey || p.id) ?? []), p]);
  const groups = [...bySignup.values()];
  const section = (status: string) => groups.filter(g => g[0].status === status);
  const held = section('held'), waitlist = section('waitlist'), lapsed = section('lapsed');

  function startEdit() { setForm(settings); setEditing(true); }
  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const ok = await act('signup', { action: 'signup_settings', ...form, signupQuestions: form.signupQuestions.filter(q => q.label.trim()) },
      () => form.signupOpen ? 'Sign-up page saved — it’s open.' : 'Sign-up page saved — it’s closed.');
    if (ok) setEditing(false);
  }
  const setQ = (i: number, q: Partial<SignupQuestion>) => setForm(f => ({ ...f, signupQuestions: f.signupQuestions.map((x, j) => j === i ? { ...x, ...q } : x) }));

  const row = (g: EventPlayer[], extra: React.ReactNode) => (
    <li key={g[0].groupKey || g[0].id} className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="text-[13.5px] text-ink">{g.map(p => p.name).join(', ')}</div>
        <div className="text-[12px] text-ink-muted">{g[0].email || g[0].phone || 'No contact'}{g.length > 1 ? ` · ${g.length} players` : ''}</div>
      </div>
      {extra}
    </li>
  );
  const moveBtn = (g: EventPlayer[]) => live && (
    <button disabled={!!busy} onClick={() => act('move' + g[0].groupKey, { action: 'signup_move', groupKey: g[0].groupKey },
      r => `${g.map(p => p.name).join(', ')} ${g.length === 1 ? 'is' : 'are'} on the list${r.emailed === 'sent' ? '; we emailed them' : r.emailed === 'failed' ? ' — the email to them didn’t send, so let them know' : ' — there’s no email for them, so let them know'}. Collect their entry as for anyone else.`)}
      className={SECONDARY}>{busy === 'move' + g[0].groupKey ? 'Moving…' : 'Move onto the list'}</button>
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="text-[15px] font-semibold text-ink">Sign-up page</h2>
        {settings.signupOpen ? <StatusDot status="ok" label="Open" /> : <StatusDot status="neutral" label="Closed" />}
      </div>

      {!editing && (
        <>
          <p className="text-[13.5px] text-ink">
            {settings.signupOpen
              ? <>Golfers sign up at <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">{url}</a>. </>
              : 'A page where golfers sign themselves up, in groups of up to four. '}
            {settings.signupPay === 'now' ? 'They pay when they sign up; their spots are held 30 minutes while they do.' : 'They sign up now and pay later — send pay links or take it at the course.'}
            {spotsLeft != null && settings.signupOpen && (spotsLeft === 0 ? ' It’s full — new sign-ups go on the waiting list.' : ` ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left; after that, sign-ups go on a waiting list.`)}
          </p>
          {settings.signupQuestions.length > 0 && <p className="text-[13px] text-ink-soft mt-1">Also asks: {settings.signupQuestions.map(q => q.label + (q.required ? '' : ' (optional)')).join(', ')}.</p>}
          {live && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={startEdit} className={SECONDARY}>{settings.signupOpen ? 'Change sign-up' : 'Set it up'}</button>
              {settings.signupOpen && <button onClick={async () => { setCopyError(''); try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopyError('Couldn’t copy — select the link above instead.'); } }} className={SECONDARY}>{copied ? 'Copied' : 'Copy link'}</button>}
            </div>
          )}
          {copyError && <p role="alert" className="text-[13px] text-bad mt-2">{copyError}</p>}
        </>
      )}

      {editing && (
        <form onSubmit={save} className="space-y-3 mt-1">
          <label className="flex items-center gap-2 text-[13.5px] text-ink"><input type="checkbox" className="accent-pine" checked={form.signupOpen} onChange={ev => setForm(f => ({ ...f, signupOpen: ev.target.checked }))} /> Open — golfers can sign up</label>
          <fieldset>
            <legend className="text-[13px] font-medium text-ink mb-1">When do they pay?</legend>
            <label className="flex items-start gap-2 text-[13.5px] text-ink py-0.5"><input type="radio" name="signupPay" className="mt-1 accent-pine" checked={form.signupPay === 'later'} onChange={() => setForm(f => ({ ...f, signupPay: 'later' }))} /> Later — send pay links or take it at the course</label>
            <label className="flex items-start gap-2 text-[13.5px] text-ink py-0.5"><input type="radio" name="signupPay" className="mt-1 accent-pine" checked={form.signupPay === 'now'} disabled={!priceSet} onChange={() => setForm(f => ({ ...f, signupPay: 'now' }))} /> When they sign up — by card, Apple Pay or Google Pay{!priceSet && ' (set the price per player first)'}</label>
          </fieldset>
          <label className="flex items-center gap-2 text-[13.5px] text-ink">One person can sign up
            <select className={INPUT} value={form.signupMaxGroup} onChange={ev => setForm(f => ({ ...f, signupMaxGroup: Number(ev.target.value) }))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n === 1 ? 'just themselves' : `up to ${n} players`}</option>)}</select>
          </label>
          <div>
            <p className="text-[13px] font-medium text-ink">Questions for each player</p>
            <p className="text-[12.5px] text-ink-muted mb-1.5">Name and email are always asked, and a mobile number is optional. Add your own — handicap, shirt size, dietary needs.</p>
            {form.signupQuestions.map((q, i) => (
              <div key={q.id || i} className="flex flex-wrap items-center gap-2 py-1">
                <input className={INPUT + ' flex-1 min-w-[180px]'} aria-label={`Question ${i + 1}`} maxLength={120} value={q.label} onChange={ev => setQ(i, { label: ev.target.value })} placeholder="e.g. Handicap" />
                <label className="flex items-center gap-1.5 text-[13px] text-ink"><input type="checkbox" className="accent-pine" checked={q.required} onChange={ev => setQ(i, { required: ev.target.checked })} /> Required</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, signupQuestions: f.signupQuestions.filter((_, j) => j !== i) }))} className="text-[12.5px] text-ink-soft hover:text-bad">Remove</button>
              </div>
            ))}
            {form.signupQuestions.length < 10 && <button type="button" onClick={() => setForm(f => ({ ...f, signupQuestions: [...f.signupQuestions, { id: '', label: '', required: false }] }))} className={LINK}>Add a question</button>}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={!!busy} className={PRIMARY}>{busy === 'signup' ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setEditing(false)} className={SECONDARY}>Cancel</button>
          </div>
        </form>
      )}

      {held.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13.5px] font-semibold text-ink">Paying now</h3>
          <ul className="divide-y divide-line-soft">{held.map(g => row(g, <span className="text-[12.5px] text-ink-muted">Held until {g[0].holdUntil ? new Date(g[0].holdUntil).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}</span>))}</ul>
        </div>
      )}
      {waitlist.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13.5px] font-semibold text-ink">Waiting list</h3>
          <ul className="divide-y divide-line-soft">{waitlist.map(g => row(g, moveBtn(g)))}</ul>
        </div>
      )}
      {lapsed.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13.5px] font-semibold text-ink">Didn’t pay in time</h3>
          <p className="text-[12.5px] text-ink-muted">Their hold ran out and the spots went back. Move them on if you still want them, or remove them.</p>
          <ul className="divide-y divide-line-soft">{lapsed.map(g => row(g, <span className="flex gap-2">{moveBtn(g)}{live && <button disabled={!!busy} onClick={() => act('drop' + g[0].groupKey, { action: 'signup_remove', groupKey: g[0].groupKey }, () => 'Removed.')} className={SECONDARY}>{busy === 'drop' + g[0].groupKey ? 'Removing…' : 'Remove'}</button>}</span>))}</ul>
        </div>
      )}
    </Card>
  );
}
