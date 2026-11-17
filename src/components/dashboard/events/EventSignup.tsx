'use client';
// W2-9d (Cam 2026-10-22): the event's public sign-up page, from the course's side — open or close it, pay when
// signing up or later, how many one person can sign up together, the course's own questions — and the people who
// signed up but aren't on the list: still paying (a 30-minute hold), on the waiting list, or whose hold ran out.
// EVENTS-3 (Cam 2026-11-17; mockup lanes/dashboard/events-mockup.html, Sign-up tab): the page and its link, then what
// a golfer goes through (worded from this event's own settings, never more than the page does), the event's terms,
// and the waiting list. The pencil opens the settings, with the "Add question" builder: a question and whether it's
// required. Name and email are always asked. Answer types (choice, yes / no, number) wait for Build's field.
import { useState } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { Popup, PopupFoot, PenButton, Block, Switch, Tiles, LINK, PRIMARY, FIELD, LABEL, PlusIcon } from '@/components/dashboard/schedule/ui';
import type { EventPlayer } from './EventDetail';
import { Section, KV, CopyIcon, OpenIcon, ICON_BTN_SM, usd, plural, RED_LINK } from './ui';

export type SignupQuestion = { id: string; label: string; required: boolean };
type Settings = { signupOpen: boolean; signupPay: string; signupMaxGroup: number; signupQuestions: SignupQuestion[] };

export default function EventSignup({ live, payer, url, settings, priceSet, priceCents, capacity, spotsLeft, waiting, busy, includes, terms, error, onEditTerms, act }: {
  /** Cam 2026-10-24: organizer = players sign up with their details only; the organizer pays the course. */
  live: boolean; payer: string; url: string; settings: Settings; priceSet: boolean; priceCents: number; capacity: number; spotsLeft: number | null;
  /** Signed up but not on the list. */
  waiting: EventPlayer[];
  busy: string; includes: string[]; terms: string; onEditTerms?: () => void;
  /** The page's last error, shown in the pop-up too (the page's own line is under it). */
  error: string;
  act: (key: string, body: Record<string, unknown>, done?: (r: Record<string, unknown>) => string) => Promise<boolean>;
}) {
  const [form, setForm] = useState<Settings | null>(null);
  // The question being added or changed in the builder: its index, or 'new'.
  const [qEdit, setQEdit] = useState<{ at: number | 'new'; label: string; required: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  // One row per sign-up (everyone who signed up together), in the order they came.
  const bySignup = new Map<string, EventPlayer[]>();
  for (const p of waiting) bySignup.set(p.groupKey || p.id, [...(bySignup.get(p.groupKey || p.id) ?? []), p]);
  const groups = [...bySignup.values()];
  const section = (status: string) => groups.filter(g => g[0].status === status);
  const held = section('held'), waitlist = section('waitlist'), lapsed = section('lapsed');
  const orgPays = payer === 'organizer';
  const payNow = !orgPays && settings.signupPay === 'now';

  async function save() {
    if (!form) return;
    const ok = await act('signup', { action: 'signup_settings', ...form, signupPay: orgPays ? 'later' : form.signupPay, signupQuestions: form.signupQuestions.filter(q => q.label.trim()) },
      () => form.signupOpen ? 'Sign-up page saved. It’s open.' : 'Sign-up page saved. It’s closed.');
    if (ok) { setForm(null); setQEdit(null); }
  }
  function saveQ() {
    if (!form || !qEdit || !qEdit.label.trim()) return;
    const q = { label: qEdit.label.trim(), required: qEdit.required };
    setForm({ ...form, signupQuestions: qEdit.at === 'new' ? [...form.signupQuestions, { id: '', ...q }] : form.signupQuestions.map((x, i) => i === qEdit.at ? { ...x, ...q } : x) });
    setQEdit(null);
  }

  const who = (g: EventPlayer[]) => (
    <span className="min-w-0 flex-1">
      <b className="block text-[13.5px] font-semibold text-ink">{g.map(p => p.name).join(', ')}</b>
      <small className="block text-[12px] text-ink-muted">{[g[0].email, g[0].phone].filter(Boolean).join(' · ') || 'No contact'} · {plural(g.length, 'player')}</small>
    </span>
  );
  const moveBtn = (g: EventPlayer[]) => live && (
    <button type="button" disabled={!!busy} className={LINK} onClick={() => act('move' + g[0].groupKey, { action: 'signup_move', groupKey: g[0].groupKey },
      r => `${g.map(p => p.name).join(', ')} ${g.length === 1 ? 'is' : 'are'} on the list${r.emailed === 'sent' ? '; we emailed them' : r.emailed === 'failed' ? '. The email to them didn’t send, so let them know' : '. There’s no email for them, so let them know'}. Collect their entry as for anyone else.`)}>
      {busy === 'move' + g[0].groupKey ? 'Moving…' : 'Move onto the list'}
    </button>
  );
  const asks = settings.signupQuestions.map(q => q.label.toLowerCase());
  const golferSteps: [string, string][] = [
    ['Opens the link', `Sees the event, the day and start${includes.length ? ', what’s included' : ''}${priceSet ? ' and the price' : ''}.`],
    ['Enters their details', `Name and email (a mobile is optional)${asks.length ? `, then your questions: ${asks.join(', ')}` : ''}.`],
    ...(settings.signupMaxGroup > 1 ? [['Adds partners', `Up to ${plural(settings.signupMaxGroup - 1, 'other')} in the same sign-up, each with a name (email and mobile optional).`] as [string, string]] : []),
    ...(payNow ? [['Pays', `Card, Apple Pay or Google Pay, ${usd(priceCents)} each. Their spots are held 30 minutes while they pay.`] as [string, string]]
      : orgPays ? [] : [['Pays later', 'Nothing is charged at sign-up. Send pay links or take it at the course.'] as [string, string]]),
    ['Gets a confirmation', capacity > 0 ? 'An email with the details, or word that they’re on the waiting list when it’s full.' : 'An email with the details.'],
  ];

  return (
    <div className="flex flex-col">
      <Section title={<>Sign-up page <span className="font-normal text-[12.5px]">{settings.signupOpen ? <StatusDot status="ok" label="Open" /> : <StatusDot status="neutral" label="Closed" />}</span></>}
        right={live ? <PenButton label="Change sign-up" onClick={() => { setForm(settings); setQEdit(null); }} /> : undefined}>
        {settings.signupOpen ? (
          <KV k="Link">
            <span className="flex items-center gap-1 min-w-0">
              <span className="font-mono text-[12.5px] truncate">{url.replace(/^https?:\/\//, '')}</span>
              <button type="button" className={ICON_BTN_SM} aria-label="Copy link" title={copied ? 'Copied' : 'Copy link'} onClick={async () => { setCopyError(''); try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopyError('Couldn’t copy. Open the page and copy the address instead.'); } }}><CopyIcon /></button>
              <a className={ICON_BTN_SM} href={url} target="_blank" rel="noopener noreferrer" aria-label="Open the sign-up page in a new tab" title="Open in a new tab"><OpenIcon /></a>
              {copied && <span role="status" className="text-[12px] text-ink-muted font-normal">Copied</span>}
            </span>
          </KV>
        ) : <KV k="Link">{live ? 'Closed. Open it with the pencil to get its link.' : 'Closed'}</KV>}
        {copyError && <p role="alert" className="px-1 text-[13px] text-bad">{copyError}</p>}
        <KV k="Spots">{spotsLeft == null
          ? 'No player limit, so sign-ups never fill up. Set Players expected under Change details to cap it and use a waiting list.'
          : `${plural(capacity, 'player')} · ${spotsLeft === 0 ? 'full, new sign-ups go on the waiting list' : `${spotsLeft} left, then a waiting list`}`}</KV>
        <KV k="Who pays">{orgPays ? 'The organizer pays you for everyone. Players only give their details.' : payNow ? 'Each player, when they sign up' : 'Each player, later'}</KV>
      </Section>

      <Section title="What a golfer goes through">
        {golferSteps.map(([t, d], i) => (
          <div key={t} className="flex gap-3 items-start px-1 py-2">
            <i className="not-italic w-6 h-6 rounded-full border border-line grid place-items-center text-[12px] text-ink-soft shrink-0">{i + 1}</i>
            <span><b className="block text-[13.5px] font-semibold text-ink">{t}</b><small className="block text-[12.5px] text-ink-muted">{d}</small></span>
          </div>
        ))}
      </Section>

      <Section title="Event terms" right={onEditTerms ? <PenButton label="Change the terms" onClick={onEditTerms} /> : undefined}>
        {terms ? <p className="px-1 py-1 text-[13.5px] text-ink whitespace-pre-line">{terms}</p>
          : <p className="px-1 py-1 text-[13.5px] text-ink-muted">None written yet. Say what happens to the money if plans change; it’s shown with the pay link.</p>}
      </Section>

      {held.length > 0 && (
        <Section title={`Paying now · ${held.length}`}>
          {held.map(g => <div key={g[0].groupKey || g[0].id} className="flex flex-wrap items-center gap-3 px-1 py-2 border-t border-line first:border-t-0">{who(g)}<span className="text-[12.5px] text-ink-muted">Held until {g[0].holdUntil ? new Date(g[0].holdUntil).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}</span></div>)}
        </Section>
      )}
      <Section title={`Waitlist · ${waitlist.length}`}>
        {waitlist.length === 0 ? <p className="px-1 py-1 text-[13.5px] text-ink-muted">{capacity > 0 ? 'No one waiting.' : 'No player limit, so no one waits.'}</p>
          : waitlist.map(g => <div key={g[0].groupKey || g[0].id} className="flex flex-wrap items-center gap-3 px-1 py-2 border-t border-line first:border-t-0">{who(g)}{moveBtn(g)}</div>)}
      </Section>
      {lapsed.length > 0 && (
        <Section title={`Didn’t pay in time · ${lapsed.length}`}>
          <p className="px-1 pb-1 text-[12.5px] text-ink-muted">Their hold ran out and the spots went back. Move them on if you still want them, or remove them.</p>
          {lapsed.map(g => (
            <div key={g[0].groupKey || g[0].id} className="flex flex-wrap items-center gap-3 px-1 py-2 border-t border-line">
              {who(g)}{moveBtn(g)}
              {live && <button type="button" disabled={!!busy} className={RED_LINK} onClick={() => act('drop' + g[0].groupKey, { action: 'signup_remove', groupKey: g[0].groupKey }, () => 'Removed.')}>{busy === 'drop' + g[0].groupKey ? 'Removing…' : 'Remove'}</button>}
            </div>
          ))}
        </Section>
      )}

      {form && (
        <Popup title="Change sign-up" onClose={() => { setForm(null); setQEdit(null); }}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13.5px] text-ink">{form.signupOpen ? 'Open: golfers can sign up' : 'Closed: golfers can’t sign up'}</span>
            <Switch checked={form.signupOpen} onChange={v => setForm({ ...form, signupOpen: v })} label="Sign-up page open" />
          </div>
          {orgPays
            ? <p className="text-[13px] text-ink-soft">The organizer pays you for everyone, so players only give their details here.</p>
            : <Block label="When they pay">
                <Tiles label="When they pay" value={form.signupPay === 'now' ? 'now' : 'later'} onChange={k => setForm({ ...form, signupPay: k })}
                  options={[{ key: 'later', title: 'Later', line: 'Send pay links or take it at the course' }, { key: 'now', title: 'When they sign up', line: priceSet ? 'Card, Apple Pay or Google Pay' : 'Set the price per player first' }]} />
                {form.signupPay === 'now' && !priceSet && <p className="text-[12.5px] text-bad">Set the price per player under Change details first.</p>}
              </Block>}
          <Block label="One person can sign up">
            <select aria-label="One person can sign up" className={FIELD + ' max-w-[240px]'} value={form.signupMaxGroup} onChange={ev => setForm({ ...form, signupMaxGroup: Number(ev.target.value) })}>
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n === 1 ? 'Just themselves' : `Up to ${n} players`}</option>)}
            </select>
          </Block>
          <Block label="What they’re asked">
            <div className="flex flex-col border border-line rounded-[12px] px-3 py-0.5">
              {['Name', 'Email'].map(n => (
                <div key={n} className="flex items-center gap-2.5 py-2 border-t border-line first:border-t-0">
                  <span className="flex-1"><b className="block text-[13.5px] font-medium text-ink-soft">{n}</b><small className="block text-[12px] text-ink-muted">Always asked · required</small></span>
                  <span className="text-[12.5px] text-ink-muted">Always</span>
                </div>
              ))}
              <div className="flex items-center gap-2.5 py-2 border-t border-line">
                <span className="flex-1"><b className="block text-[13.5px] font-medium text-ink-soft">Mobile</b><small className="block text-[12px] text-ink-muted">Always asked · optional</small></span>
                <span className="text-[12.5px] text-ink-muted">Always</span>
              </div>
              {form.signupQuestions.map((q, i) => (
                <div key={q.id || 'n' + i} className="flex items-center gap-2.5 py-2 border-t border-line">
                  <span className="flex-1 min-w-0"><b className="block text-[13.5px] font-semibold text-ink truncate">{q.label}</b><small className="block text-[12px] text-ink-muted">{q.required ? 'Required' : 'Optional'}</small></span>
                  <PenButton label={`Edit ${q.label}`} onClick={() => setQEdit({ at: i, label: q.label, required: q.required })} />
                  <button type="button" className={RED_LINK} onClick={() => { setForm({ ...form, signupQuestions: form.signupQuestions.filter((_, j) => j !== i) }); setQEdit(null); }}>Remove</button>
                </div>
              ))}
              {qEdit ? (
                <div className="flex flex-col gap-2.5 py-3 border-t border-line">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[12.5px] text-ink-muted">Common:</span>
                    {['Handicap', 'Shirt size', 'Dietary needs', 'Team name', 'Partner’s name'].map(x => (
                      <button key={x} type="button" onClick={() => setQEdit({ ...qEdit, label: x })} className="text-[12.5px] text-ink-soft bg-paper border border-line rounded-full px-[11px] py-[5px] min-h-[32px] hover:text-ink hover:border-ink-soft">{x}</button>
                    ))}
                  </div>
                  <label className={LABEL}>Question<input className={FIELD} maxLength={120} value={qEdit.label} onChange={ev => setQEdit({ ...qEdit, label: ev.target.value })} /></label>
                  <label className="flex items-center gap-2 text-[13.5px] text-ink"><input type="checkbox" checked={qEdit.required} onChange={ev => setQEdit({ ...qEdit, required: ev.target.checked })} /> Required</label>
                  <div className="flex items-center gap-3">
                    <button type="button" className={LINK} onClick={() => setQEdit(null)}>Cancel</button>
                    <span className="flex-1" />
                    <button type="button" className={PRIMARY} disabled={!qEdit.label.trim()} onClick={saveQ}>{qEdit.at === 'new' ? 'Add question' : 'Save'}</button>
                  </div>
                </div>
              ) : form.signupQuestions.length < 10 && (
                <button type="button" onClick={() => setQEdit({ at: 'new', label: '', required: true })} className="flex items-center gap-2 py-[11px] min-h-[44px] border-t border-line text-[13.5px] font-semibold text-ink hover:text-ok [&_svg]:text-ink-soft">
                  <PlusIcon /><span>Add question</span>
                </button>
              )}
            </div>
          </Block>
          {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
          <PopupFoot onCancel={() => { setForm(null); setQEdit(null); }}>
            <button type="button" className={PRIMARY} disabled={!!busy || !!qEdit} onClick={save}>{busy === 'signup' ? 'Saving…' : 'Save'}</button>
          </PopupFoot>
        </Popup>
      )}
    </div>
  );
}
