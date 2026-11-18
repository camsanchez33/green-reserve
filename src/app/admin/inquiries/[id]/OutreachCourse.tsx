'use client';
// Inquiries → one course in outreach (Cam approved the mockup 2026-11-17). One Next button plus a ⋯ menu (Snooze, Copy
// the Cal.com link, Log a call or visit, Said yes → Onboarding, Not now). Contacts first (decision maker marked),
// editable course facts with why-it-fits tags, the outreach history (emails 1–3, calls, touches) and notes.
// Sending the emails waits for the Outreach lane (Gmail), so the Next button for an email LOGS it as sent; nothing on
// this page sends anything. Writes are manager and up (the routes enforce it). Data: /api/admin/outreach/[id] (+
// /contacts) and the existing PATCH /api/admin/inquiries actions snooze, add_note, add_touch and calcom_link.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { profileStyles as s, Msg, useConfirm } from '@/components/admin/ProfileCard';
import { OWNER_TYPES, BOOKING_METHODS, FIT_TAGS, CONTACT_ROLES, TOUCH_LABEL } from './labels';
import { Dialog } from '../../security/Dialog';
import g from '../../admin-glass.module.css';
import iq from '../inquiries.module.css';
import { api, useCanWrite, useToast, dueLabel, dateLabel, stamp, whenLabel, dateInputToIso, todayInput } from '../shared';

type Contact = { id: string | null; fromInquiry?: boolean; name: string; role: string; email: string; phone: string; decisionMaker: boolean; preferredChannel: string; bestTime: string };
type Touch = { id: string; at: string; channel: string; direction: string; note: string | null; adminName: string | null };
type CallItem = { id: string; scheduledAt: string; outcome: string; result: string | null; resultLabel: string | null; nextStep: string | null; durationMin: number };
export type Course = {
  id: string; status: string; inOutreach: boolean; statusLabel: string; stage: string | null; kind: string; town: string;
  next: { key: string; label: string; dueAt: string; due: boolean } | null; last: string; snoozeUntil: string | null;
  courseName: string; city: string; state: string; address: string; website: string; coursePhone: string | null; holes: number | null;
  ownerType: string | null; currentBookingMethod: string; currentSoftware: string | null; softwareContractEnds: string | null;
  greenFeeRange: string; roundsPerYear: number | null; hasResidentPricing: boolean; hasProShop: boolean | null; hasRange: boolean | null;
  season: string | null; fitTags: string[];
  emails: { n: 1 | 2 | 3; sentAt: string | null; dueAt: string | null }[];
  contacts: Contact[]; touches: Touch[]; calls: CallItem[]; notes: string | null;
};
const STAGE_DOT: Record<string, string> = { target: '', contacted: iq.dOk, replied: iq.dBrand, call: iq.dBrand };
const yn = (v: boolean | null | undefined) => (v === true ? 'yes' : v === false ? 'no' : 'not known');
const ownerLabel = (k: string | null) => OWNER_TYPES.find(o => o.key === k)?.label ?? '';

type Pop = null | 'snooze' | 'touch' | 'notnow' | 'saidyes' | 'note' | 'facts' | 'calcom' | { contact: Contact | 'new' };

export function OutreachCourse({ course: c, reload }: { course: Course; reload: () => void }) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [pop, setPop] = useState<Pop>(null);
  const [touchPreset, setTouchPreset] = useState<{ channel: string; direction: string }>({ channel: 'call', direction: 'out' });
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const [toast, say] = useToast();
  const [dialog, ask] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const done = (m: string) => { setPop(null); say(m); reload(); };
  const upcomingCall = c.calls.filter(k => k.outcome === 'scheduled').sort((a, z) => a.scheduledAt.localeCompare(z.scheduledAt))[0] ?? null;
  const logTouch = (channel: string, direction: string) => { setTouchPreset({ channel, direction }); setPop('touch'); };

  // The one Next button: only an action that exists. Emails are logged as sent (sending waits for the Outreach lane).
  const n = c.next;
  const nextAction: { label: string; run: () => void } | null = !n ? null
    : n.key === 'email1' || n.key === 'email2' || n.key === 'email3' ? { label: `Log ${n.label} as sent`, run: async () => {
      const yes = await ask(`Log ${n.label} as sent?`, 'This records that you sent it today. GreenReserve does not send outreach email yet.', 'Log it');
      if (!yes) return;
      setBusy(true); setErr('');
      const r = await api('/api/admin/inquiries', { method: 'PATCH', body: { id: c.id, action: 'add_touch', channel: 'email', direction: 'out' } });
      setBusy(false);
      if (r.ok) { say(`${n.label} logged.`); reload(); } else setErr(r.error);
    } }
    : n.key === 'call_them' ? { label: 'Log the call', run: () => logTouch('call', 'out') }
    : n.key === 'answer_reply' ? { label: 'Log your reply', run: () => logTouch('email', 'out') }
    : (n.key === 'discovery_call' || n.key === 'log_call') && upcomingCall ? { label: n.key === 'log_call' ? 'Log the call' : 'Open the call', run: () => router.push(`/admin/inquiries/calls/${upcomingCall.id}`) }
    : n.key === 'close_no_reply' ? { label: 'Not now', run: () => setPop('notnow') }
    : { label: 'Log a call or visit', run: () => logTouch('call', 'out') };

  const firstThree = new Set(c.touches.filter(t => t.channel === 'email' && t.direction === 'out').sort((a, z) => a.at.localeCompare(z.at)).slice(0, 3).map(t => t.id));
  const history = [
    ...c.calls.map(k => ({ at: k.scheduledAt, el: (
      <Link key={'c' + k.id} href={`/admin/inquiries/calls/${k.id}`} className={iq.h}><b>Call</b>
        <span>{whenLabel(k.scheduledAt)} · {k.outcome === 'scheduled' ? 'upcoming' : k.resultLabel ?? k.outcome.replace(/_/g, ' ')}{k.nextStep ? ` · ${k.nextStep}` : ''}</span><em>Open</em></Link>
    ) })),
    // Emails 1–3 have their own rows; any other email we sent, or one logged with a note, shows here too.
    ...c.touches.filter(t => t.channel !== 'email' || t.direction === 'in' || t.note || !firstThree.has(t.id)).map(t => ({ at: t.at, el: (
      <div key={'t' + t.id} className={iq.h}><b>{TOUCH_LABEL[t.channel] ?? t.channel}</b>
        <span>{dateLabel(t.at)} · {t.direction === 'in' ? 'they reached us' : 'we reached out'}{t.note ? ` · ${t.note}` : ''}</span><em>{t.adminName ?? ''}</em></div>
    ) })),
  ].sort((a, z) => z.at.localeCompare(a.at));

  return (
    <>
      <Link href="/admin/inquiries" className={`${s.lnk} ${iq.back}`}>‹ Inquiries</Link>
      <div className={iq.title}><h2>{c.courseName}</h2><span><i className={`${iq.dot} ${STAGE_DOT[c.stage ?? ''] ?? ''}`} aria-hidden="true" />{c.statusLabel}</span></div>
      <p className={iq.sub}>{[c.town, c.kind].filter(Boolean).join(' · ') || 'Town not known'}</p>

      {n && (
        <section className={`${g.glass} ${iq.sec} ${iq.nextbox}`} aria-label="Next">
          <div><small>Next</small><b>{n.label} <span className={n.due ? iq.due : ''}>· {c.snoozeUntil && new Date(c.snoozeUntil).getTime() > Date.now() ? `snoozed until ${dateLabel(c.snoozeUntil)}` : dueLabel(n.dueAt)}</span></b></div>
          {canWrite && (
            <div className={iq.btns}>
              {nextAction && <button type="button" className={`${s.btn} ${s.pri}`} onClick={nextAction.run} disabled={busy}>{nextAction.label}</button>}
              <span className={iq.mw} ref={menuRef}>
                <button type="button" className={iq.ibtn} aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(v => !v)}>⋯</button>
                {menu && (
                  <span className={`${g.glass} ${iq.menu}`} role="menu">
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); setPop('snooze'); }}>Snooze</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); setPop('calcom'); }}>Copy the Cal.com link</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); logTouch('call', 'out'); }}>Log a call or visit</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); setPop('saidyes'); }}>Said yes → Onboarding</button>
                    <button type="button" role="menuitem" className={iq.bad} onClick={() => { setMenu(false); setPop('notnow'); }}>Not now</button>
                  </span>
                )}
              </span>
            </div>
          )}
        </section>
      )}
      {err && <Msg ok={false}>{err}</Msg>}

      <div className={iq.grid}>
        <div className={iq.side}>
          <section className={`${g.glass} ${iq.sec}`} aria-label="Outreach">
            <div className={iq.st}><b>Outreach</b></div>
            {c.emails.map(e => (
              <div key={e.n} className={iq.h}><b>Email {e.n}</b>
                <span>{e.sentAt ? `Sent ${dateLabel(e.sentAt)}` : e.dueAt ? `Due ${dueLabel(e.dueAt)}` : 'Not sent'}</span><em /></div>
            ))}
            {history.map(h => h.el)}
          </section>
          <section className={`${g.glass} ${iq.sec}`} aria-label="Notes">
            <div className={iq.st}><b>Notes</b>{canWrite && c.notes !== null && <button type="button" className={`${s.lnk} ${iq.right}`} onClick={() => setPop('note')}>Add</button>}</div>
            {c.notes === null ? <p className={iq.notes} style={{ color: 'var(--g-muted)' }}>Notes show for support and up.</p>
              : <p className={iq.notes}>{c.notes.trim() || 'No notes yet.'}</p>}
          </section>
        </div>
        <div className={iq.side}>
          <section className={`${g.glass} ${iq.sec}`} aria-label="Contacts">
            <div className={iq.st}><b>Contacts</b>{canWrite && <button type="button" className={`${s.lnk} ${iq.right}`} onClick={() => setPop({ contact: 'new' })}>Add</button>}</div>
            {c.contacts.length === 0 && <p className={iq.empty}>No contact yet.</p>}
            {c.contacts.map((p, i) => (
              <div key={p.id ?? `inq-${i}`} className={iq.pc}>
                <div className={iq.pch}><b>{p.name || 'No name'}</b>{p.decisionMaker && <span className={iq.dm}>Decides</span>}
                  {canWrite && p.id && <span className={iq.right}><button type="button" className={s.lnk} onClick={() => setPop({ contact: p })}>Edit</button></span>}</div>
                {p.role && <small>{p.role}</small>}
                {(p.email || p.phone) && <div className={iq.pcl}>{p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}{p.phone && <span>{p.phone}</span>}</div>}
                {(p.preferredChannel || p.bestTime) && <small>{['Best by ' + (p.preferredChannel || 'any way'), p.bestTime].filter(Boolean).join(', ')}</small>}
              </div>
            ))}
          </section>
          <section className={`${g.glass} ${iq.sec}`} aria-label="About the course">
            <div className={iq.st}><b>About the course</b>{canWrite && <button type="button" className={`${s.lnk} ${iq.right}`} onClick={() => setPop('facts')}>Edit</button>}</div>
            {([
              ['Owner', ownerLabel(c.ownerType)],
              ['Address', c.address],
              ['Website', c.website ? <a href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer">{c.website}</a> : ''],
              ['Phone', c.coursePhone ?? ''],
              ['Books today', c.currentBookingMethod],
              ['Software', [c.currentSoftware, c.softwareContractEnds ? `contract ends ${c.softwareContractEnds}` : ''].filter(Boolean).join(' · ')],
              ['Green fees', c.greenFeeRange],
              ['Rounds a year', c.roundsPerYear ? c.roundsPerYear.toLocaleString('en-US') : ''],
              ['Has', `Resident rate ${yn(c.hasResidentPricing)} · pro shop ${yn(c.hasProShop)} · range ${yn(c.hasRange)}`],
              ['Season', c.season ?? ''],
            ] as [string, React.ReactNode][]).map(([k, v]) => <div key={k} className={iq.kv}><span>{k}</span><b>{v || 'Not known'}</b></div>)}
            {c.fitTags.length > 0 && <div className={iq.tags}>{c.fitTags.map(t => <span key={t}>{t}</span>)}</div>}
          </section>
        </div>
      </div>

      {pop === 'snooze' && <Snooze id={c.id} onClose={() => setPop(null)} onDone={done} />}
      {pop === 'touch' && <LogTouch id={c.id} preset={touchPreset} title={touchPreset.channel === 'email' ? 'Log your reply' : 'Log a call or visit'} onClose={() => setPop(null)} onDone={done} />}
      {pop === 'notnow' && <NotNow id={c.id} onClose={() => setPop(null)} onDone={() => { setPop(null); router.push('/admin/inquiries'); }} />}
      {pop === 'saidyes' && <SaidYes id={c.id} name={c.courseName} onClose={() => setPop(null)} onDone={href => { setPop(null); router.push(href); }} />}
      {pop === 'note' && <AddNote id={c.id} onClose={() => setPop(null)} onDone={done} />}
      {pop === 'calcom' && <CalcomLink id={c.id} onClose={() => setPop(null)} />}
      {pop === 'facts' && <EditFacts c={c} onClose={() => setPop(null)} onDone={done} />}
      {pop && typeof pop === 'object' && <EditContact id={c.id} contact={pop.contact} onClose={() => setPop(null)} onDone={done} />}
      {dialog}
      {toast}
    </>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

function Foot({ busy, err, onClose, ok, label, bad }: { busy: boolean; err: string; onClose: () => void; ok: () => void; label: string; bad?: boolean }) {
  return (
    <>
      {err && <Msg ok={false}>{err}</Msg>}
      <div className={s.line} style={{ justifyContent: 'flex-end' }}>
        <button type="button" className={s.lnk} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={`${s.btn} ${bad ? s.solid : s.pri}`} onClick={ok} disabled={busy}>{busy ? 'Saving…' : label}</button>
      </div>
    </>
  );
}

function usePost() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async <T,>(url: string, method: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; body: Record<string, unknown> }> => {
    setBusy(true); setErr('');
    const r = await api<T>(url, { method, body });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return { ok: false, status: r.status, body: r.body }; }
    return r;
  };
  return { busy, err, setErr, run };
}

function Snooze({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (m: string) => void }) {
  const [d, setD] = useState(todayInput(7));
  const p = usePost();
  return (
    <Dialog labelId="iq-sn-t" onClose={onClose} busy={p.busy}>
      <h4 id="iq-sn-t">Snooze until</h4>
      <label className={iq.f}>Date<input type="date" min={todayInput(1)} value={d} onChange={e => setD(e.target.value)} /></label>
      <Foot {...p} onClose={onClose} label="Snooze" ok={async () => {
        if (!d) { p.setErr('Pick a date.'); return; }
        const r = await p.run('/api/admin/inquiries', 'PATCH', { id, action: 'snooze', until: dateInputToIso(d) });
        if (r.ok) onDone(`Snoozed until ${dateLabel(dateInputToIso(d))}.`);
      }} />
    </Dialog>
  );
}

function LogTouch({ id, preset, title, onClose, onDone }: { id: string; preset: { channel: string; direction: string }; title: string; onClose: () => void; onDone: (m: string) => void }) {
  const [channel, setChannel] = useState(preset.channel);
  const [direction, setDirection] = useState(preset.direction);
  const [d, setD] = useState(todayInput());
  const [note, setNote] = useState('');
  const p = usePost();
  return (
    <Dialog labelId="iq-t-t" onClose={onClose} busy={p.busy}>
      <h4 id="iq-t-t">{title}</h4>
      <div className={iq.g2} style={{ padding: 0 }}>
        <label className={iq.f}>How<select value={channel} onChange={e => setChannel(e.target.value)}>{Object.entries(TOUCH_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className={iq.f}>Who reached out<select value={direction} onChange={e => setDirection(e.target.value)}><option value="out">We did</option><option value="in">They did</option></select></label>
        <label className={iq.f}>When<input type="date" max={todayInput()} value={d} onChange={e => setD(e.target.value)} /></label>
      </div>
      <label className={iq.f}>Note<textarea rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
      <Foot {...p} onClose={onClose} label="Log it" ok={async () => {
        const at = d === todayInput() ? undefined : dateInputToIso(d);
        const r = await p.run('/api/admin/inquiries', 'PATCH', { id, action: 'add_touch', channel, direction, ...(at ? { at } : {}), note: note.trim() });
        if (r.ok) onDone('Logged.');
      }} />
    </Dialog>
  );
}

function NotNow({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState(todayInput(120));
  const [note, setNote] = useState('');
  const p = usePost();
  return (
    <Dialog labelId="iq-nn-t" onClose={onClose} busy={p.busy}>
      <h4 id="iq-nn-t">Not now</h4>
      <p>The course leaves outreach and goes on the Not now list, to recheck later.</p>
      <label className={iq.f}>Recheck on<input type="date" min={todayInput(1)} value={d} onChange={e => setD(e.target.value)} /></label>
      <label className={iq.f}>Why (optional)<textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></label>
      <Foot {...p} onClose={onClose} label="Not now" bad ok={async () => {
        const r = await p.run(`/api/admin/outreach/${encodeURIComponent(id)}`, 'POST', { action: 'not_now', ...(d ? { recheckAt: dateInputToIso(d) } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
        if (r.ok) onDone();
      }} />
    </Dialog>
  );
}

function SaidYes({ id, name, onClose, onDone }: { id: string; name: string; onClose: () => void; onDone: (href: string) => void }) {
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState('');
  const p = usePost();
  return (
    <Dialog labelId="iq-sy-t" onClose={onClose} busy={p.busy}>
      <h4 id="iq-sy-t">{name} said yes</h4>
      <p>It moves to Onboarding, which takes it from here. Inquiries stops tracking it.</p>
      {needEmail && <label className={iq.f}>Their email (Onboarding needs one)<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>}
      <Foot {...p} onClose={onClose} label="Move to Onboarding" ok={async () => {
        if (needEmail && !email.trim()) { p.setErr('Add their email first.'); return; }
        const r = await p.run<{ onboarding: string }>(`/api/admin/outreach/${encodeURIComponent(id)}`, 'POST', { action: 'said_yes', ...(needEmail ? { email: email.trim() } : {}) });
        if (r.ok) onDone(r.data.onboarding || '/admin/onboarding');
        else if (r.body.code === 'email_needed') setNeedEmail(true);
      }} />
    </Dialog>
  );
}

function AddNote({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (m: string) => void }) {
  const [note, setNote] = useState('');
  const p = usePost();
  return (
    <Dialog labelId="iq-no-t" onClose={onClose} busy={p.busy}>
      <h4 id="iq-no-t">Add a note</h4>
      <label className={iq.f}>Note<textarea rows={4} value={note} onChange={e => setNote(e.target.value)} /></label>
      <Foot {...p} onClose={onClose} label="Add" ok={async () => {
        if (!note.trim()) { p.setErr('Write the note first.'); return; }
        const r = await p.run('/api/admin/inquiries', 'PATCH', { id, action: 'add_note', note: note.trim() });
        if (r.ok) onDone('Note added.');
      }} />
    </Dialog>
  );
}

function CalcomLink({ id, onClose }: { id: string; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    (async () => {
      const r = await api<{ url: string }>('/api/admin/inquiries', { method: 'PATCH', body: { id, action: 'calcom_link' } });
      if (r.ok) setUrl(r.data.url); else setErr(r.error);
    })();
  }, [id]);
  return (
    <Dialog labelId="iq-cal-t" onClose={onClose}>
      <h4 id="iq-cal-t">Cal.com link for this course</h4>
      <p>Send it to them yourself. A call they book with it shows up under Calls, matched to this course.</p>
      {!url && !err && <p>Getting the link…</p>}
      {url && <p className={s.mono}>{url}</p>}
      {err && <Msg ok={false}>{err}</Msg>}
      {copied && <Msg ok>Copied.</Msg>}
      <div className={s.line} style={{ justifyContent: 'flex-end' }}>
        <button type="button" className={s.lnk} onClick={onClose}>Close</button>
        {url && <button type="button" className={`${s.btn} ${s.pri}`} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setErr("Couldn't copy. Select the link and copy it."); } }}>Copy</button>}
      </div>
    </Dialog>
  );
}

function EditFacts({ c, onClose, onDone }: { c: Course; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({
    courseName: c.courseName, city: c.city, state: c.state, address: c.address, website: c.website, coursePhone: c.coursePhone ?? '',
    holes: c.holes ? String(c.holes) : '', ownerType: c.ownerType ?? '', currentBookingMethod: c.currentBookingMethod, currentSoftware: c.currentSoftware ?? '',
    softwareContractEnds: c.softwareContractEnds ?? '', greenFeeRange: c.greenFeeRange, roundsPerYear: c.roundsPerYear ? String(c.roundsPerYear) : '',
    hasResidentPricing: c.hasResidentPricing ? 'yes' : 'no', hasProShop: c.hasProShop === null ? '' : c.hasProShop ? 'yes' : 'no', hasRange: c.hasRange === null ? '' : c.hasRange ? 'yes' : 'no',
    season: c.season ?? '',
  });
  const [tags, setTags] = useState<string[]>(c.fitTags);
  const p = usePost();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(v => ({ ...v, [k]: e.target.value }));
  const tri = (v: string) => (v === 'yes' ? true : v === 'no' ? false : null);
  const allTags = [...FIT_TAGS, ...c.fitTags.filter(t => !(FIT_TAGS as readonly string[]).includes(t))];
  const methods = (BOOKING_METHODS as readonly string[]).includes(f.currentBookingMethod) || !f.currentBookingMethod ? [...BOOKING_METHODS] : [f.currentBookingMethod, ...BOOKING_METHODS];
  return (
    <Dialog labelId="iq-ef-t" onClose={onClose} busy={p.busy}>
      <h4 id="iq-ef-t">About the course</h4>
      <div className={iq.g2} style={{ padding: 0 }}>
        <label className={iq.f}>Course name *<input value={f.courseName} onChange={set('courseName')} /></label>
        <label className={iq.f}>Town *<input value={f.city} onChange={set('city')} /></label>
        <label className={iq.f}>State<input value={f.state} onChange={set('state')} /></label>
        <label className={iq.f}>Address<input value={f.address} onChange={set('address')} /></label>
        <label className={iq.f}>Website<input value={f.website} onChange={set('website')} /></label>
        <label className={iq.f}>Phone<input value={f.coursePhone} onChange={set('coursePhone')} /></label>
        <label className={iq.f}>Holes<input inputMode="numeric" value={f.holes} onChange={set('holes')} /></label>
        <label className={iq.f}>Owned by<select value={f.ownerType} onChange={set('ownerType')}><option value="">Not known</option>{OWNER_TYPES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
        <label className={iq.f}>Books today by<select value={f.currentBookingMethod} onChange={set('currentBookingMethod')}><option value="">Not known</option>{methods.map(m => <option key={m}>{m}</option>)}</select></label>
        <label className={iq.f}>Current software<input value={f.currentSoftware} onChange={set('currentSoftware')} /></label>
        <label className={iq.f}>Contract ends<input value={f.softwareContractEnds} onChange={set('softwareContractEnds')} /></label>
        <label className={iq.f}>Green fees<input value={f.greenFeeRange} onChange={set('greenFeeRange')} /></label>
        <label className={iq.f}>Rounds a year<input inputMode="numeric" value={f.roundsPerYear} onChange={set('roundsPerYear')} /></label>
        <label className={iq.f}>Season<input value={f.season} onChange={set('season')} /></label>
        <label className={iq.f}>Resident rate<select value={f.hasResidentPricing} onChange={set('hasResidentPricing')}><option value="no">No</option><option value="yes">Yes</option></select></label>
        <label className={iq.f}>Pro shop<select value={f.hasProShop} onChange={set('hasProShop')}><option value="">Not known</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        <label className={iq.f}>Range<select value={f.hasRange} onChange={set('hasRange')}><option value="">Not known</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      </div>
      <div className={iq.fh}>Why it fits</div>
      <div className={`${iq.tags} ${iq.pick}`}>
        {allTags.map(t => <button key={t} type="button" aria-pressed={tags.includes(t)} onClick={() => setTags(v => v.includes(t) ? v.filter(x => x !== t) : [...v, t])}>{t}</button>)}
      </div>
      <Foot {...p} onClose={onClose} label="Save" ok={async () => {
        if (!f.courseName.trim() || !f.city.trim()) { p.setErr('Course name and town are needed.'); return; }
        // Numbers go as typed, so the server's own message shows for "eighteen"; only what changed is sent, so the
        // course's history records just those fields.
        const next: Record<string, unknown> = {
          courseName: f.courseName.trim(), city: f.city.trim(), state: f.state.trim(), address: f.address.trim(), website: f.website.trim(), coursePhone: f.coursePhone.trim(),
          holes: f.holes.trim() || null, ownerType: f.ownerType || null, currentBookingMethod: f.currentBookingMethod,
          currentSoftware: f.currentSoftware.trim(), softwareContractEnds: f.softwareContractEnds.trim(), greenFeeRange: f.greenFeeRange.trim(),
          roundsPerYear: f.roundsPerYear.trim() || null,
          hasResidentPricing: f.hasResidentPricing === 'yes', hasProShop: tri(f.hasProShop), hasRange: tri(f.hasRange), season: f.season.trim(), fitTags: tags,
        };
        const was: Record<string, unknown> = {
          courseName: c.courseName, city: c.city, state: c.state, address: c.address, website: c.website, coursePhone: c.coursePhone ?? '',
          holes: c.holes ? String(c.holes) : null, ownerType: c.ownerType, currentBookingMethod: c.currentBookingMethod, currentSoftware: c.currentSoftware ?? '',
          softwareContractEnds: c.softwareContractEnds ?? '', greenFeeRange: c.greenFeeRange, roundsPerYear: c.roundsPerYear ? String(c.roundsPerYear) : null,
          hasResidentPricing: c.hasResidentPricing, hasProShop: c.hasProShop, hasRange: c.hasRange, season: c.season ?? '', fitTags: c.fitTags,
        };
        const facts = Object.fromEntries(Object.entries(next).filter(([key, v]) => JSON.stringify(v) !== JSON.stringify(was[key])));
        if (!Object.keys(facts).length) { onClose(); return; }
        const r = await p.run(`/api/admin/outreach/${encodeURIComponent(c.id)}`, 'PATCH', { facts });
        if (r.ok) onDone('Saved.');
      }} />
    </Dialog>
  );
}

function EditContact({ id, contact, onClose, onDone }: { id: string; contact: Contact | 'new'; onClose: () => void; onDone: (m: string) => void }) {
  const isNew = contact === 'new' || !contact.id; // a contact kept on an older lead is saved as a new one
  const c0 = contact === 'new' ? null : contact;
  const [f, setF] = useState({ name: c0?.name ?? '', role: c0?.role ?? '', email: c0?.email ?? '', phone: c0?.phone ?? '', decisionMaker: c0?.decisionMaker ?? false, preferredChannel: c0?.preferredChannel ?? '', bestTime: c0?.bestTime ?? '' });
  const p = usePost();
  const [dialog, ask] = useConfirm();
  const url = `/api/admin/outreach/${encodeURIComponent(id)}/contacts`;
  const roles = (CONTACT_ROLES as readonly string[]).includes(f.role) || !f.role ? [...CONTACT_ROLES] : [f.role, ...CONTACT_ROLES];
  return (
    <Dialog labelId="iq-ct-t" onClose={onClose} busy={p.busy}>
      <h4 id="iq-ct-t">{contact === 'new' ? 'Add a contact' : 'Edit contact'}</h4>
      <div className={iq.g2} style={{ padding: 0 }}>
        <label className={iq.f}>Name<input value={f.name} onChange={e => setF(v => ({ ...v, name: e.target.value }))} /></label>
        <label className={iq.f}>Role<select value={f.role} onChange={e => setF(v => ({ ...v, role: e.target.value }))}><option value="">Not known</option>{roles.map(r => <option key={r}>{r}</option>)}</select></label>
        <label className={iq.f}>Email<input type="email" value={f.email} onChange={e => setF(v => ({ ...v, email: e.target.value }))} /></label>
        <label className={iq.f}>Phone<input value={f.phone} onChange={e => setF(v => ({ ...v, phone: e.target.value }))} /></label>
        <label className={iq.f}>Best by<select value={f.preferredChannel} onChange={e => setF(v => ({ ...v, preferredChannel: e.target.value }))}><option value="">Any way</option><option value="email">Email</option><option value="phone">Phone</option><option value="text">Text</option></select></label>
        <label className={iq.f}>Best time<input value={f.bestTime} onChange={e => setF(v => ({ ...v, bestTime: e.target.value }))} /></label>
      </div>
      <label className={iq.ck}><input type="checkbox" checked={f.decisionMaker} onChange={e => setF(v => ({ ...v, decisionMaker: e.target.checked }))} />Decides (signs for the course)</label>
      {!isNew && <button type="button" className={`${s.lnk} ${s.lnkBad}`} style={{ alignSelf: 'flex-start' }} disabled={p.busy} onClick={async () => {
        if (!(await ask('Remove this contact?', `${f.name || 'This contact'} comes off the course.`, 'Remove'))) return;
        const r = await p.run(`${url}?contactId=${encodeURIComponent(c0!.id!)}`, 'DELETE', undefined);
        if (r.ok) onDone('Contact removed.');
      }}>Remove</button>}
      <Foot {...p} onClose={onClose} label="Save" ok={async () => {
        if (!f.name.trim() && !f.email.trim() && !f.phone.trim()) { p.setErr('Add a name, an email or a phone.'); return; }
        const body = { ...f, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), bestTime: f.bestTime.trim() };
        const r = isNew ? await p.run(url, 'POST', body) : await p.run(url, 'PATCH', { contactId: c0!.id, ...body });
        if (r.ok) onDone(isNew ? 'Contact added.' : 'Contact saved.');
      }} />
      {dialog}
    </Dialog>
  );
}
