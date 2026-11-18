'use client';
// Inquiries → Add a course (Cam approved the mockup 2026-11-17). Search fills public facts and warns on duplicates;
// only name and town are required; a CSV import is beside it. Search runs on the button, never per keystroke (the
// site makes at most one public lookup a second). Data: GET /api/admin/outreach/search, POST /api/admin/outreach/courses
// (409 with the duplicates unless confirmDuplicate), POST /api/admin/outreach/import (preview, then commit).
import Link from 'next/link';
import { useState } from 'react';
import { profileStyles as s, Msg } from '@/components/admin/ProfileCard';
import { OWNER_TYPES, BOOKING_METHODS, FIT_TAGS, CONTACT_ROLES } from '@/lib/outreach';
import { Dialog } from '../security/Dialog';
import iq from './inquiries.module.css';
import { api } from './shared';

type Dup = { id: string; kind: 'inquiry' | 'course'; courseName: string; town: string; status?: string; why: string };
type Found = { courseName: string; city: string; state: string; display: string; osmRef: string; address?: string; website?: string; coursePhone?: string | null; holes?: number | null; onList: Dup | null; onGreenReserve: Dup | null };
type Form = { courseName: string; city: string; state: string; address: string; website: string; coursePhone: string; holes: string; ownerType: string; currentBookingMethod: string; currentSoftware: string; season: string; osmRef: string };
const EMPTY: Form = { courseName: '', city: '', state: '', address: '', website: '', coursePhone: '', holes: '18', ownerType: '', currentBookingMethod: '', currentSoftware: '', season: '', osmRef: '' };
const dupHref = (d: Dup) => (d.kind === 'course' ? `/admin/courses/${d.id}` : `/admin/inquiries/${d.id}`);

export function AddCourse({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [mode, setMode] = useState<'add' | 'import'>('add');
  return mode === 'add' ? <AddOne onClose={onClose} onAdded={onAdded} onImport={() => setMode('import')} /> : <Import onClose={onClose} onDone={onAdded} />;
}

function AddOne({ onClose, onAdded, onImport }: { onClose: () => void; onAdded: (id: string) => void; onImport: () => void }) {
  const [q, setQ] = useState('');
  const [near, setNear] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ attribution: string; results: Found[] } | null>(null);
  const [searchErr, setSearchErr] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [contact, setContact] = useState({ name: '', role: '', email: '', phone: '' });
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dups, setDups] = useState<Dup[] | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF(v => ({ ...v, [k]: e.target.value })); setDups(null); };

  async function search() {
    if (q.trim().length < 3) { setSearchErr('Type at least three letters of the course name.'); return; }
    setSearching(true); setSearchErr('');
    const r = await api<{ attribution: string; results: Found[] }>('/api/admin/outreach/search?' + new URLSearchParams({ q: q.trim(), near: near.trim() }));
    setSearching(false);
    if (!r.ok) { setSearchErr(r.error); return; }
    setFound(r.data);
    if (!r.data.results.length) setSearchErr('No public listing matched. Fill it in by hand below.');
  }
  function pick(x: Found) {
    setPicked(x.osmRef);
    setF(v => ({ ...v, courseName: x.courseName, city: x.city, state: x.state, address: x.address ?? v.address, website: x.website ?? v.website, coursePhone: x.coursePhone ?? v.coursePhone, holes: x.holes ? String(x.holes) : v.holes, osmRef: x.osmRef }));
    setDups(null);
  }

  async function save(confirmDuplicate = false) {
    if (!f.courseName.trim() || !f.city.trim()) { setErr('Course name and town are needed.'); return; }
    setBusy(true); setErr('');
    const facts: Record<string, unknown> = {
      courseName: f.courseName.trim(), city: f.city.trim(), state: f.state.trim(), address: f.address.trim(), website: f.website.trim(),
      coursePhone: f.coursePhone.trim(), holes: f.holes ? Number(f.holes) : null, ownerType: f.ownerType || null,
      currentBookingMethod: f.currentBookingMethod, currentSoftware: f.currentSoftware.trim(), season: f.season.trim(), fitTags: tags,
      ...(f.osmRef ? { osmRef: f.osmRef } : {}),
    };
    const hasContact = Object.values(contact).some(v => v.trim());
    const r = await api<{ success: boolean; id: string }>('/api/admin/outreach/courses', {
      method: 'POST', body: { facts, ...(hasContact ? { contact } : {}), confirmDuplicate },
    });
    setBusy(false);
    if (r.ok) { onAdded(r.data.id); return; }
    if (r.status === 409 && Array.isArray(r.body.duplicates)) { setDups(r.body.duplicates as Dup[]); return; }
    setErr(r.error);
  }

  return (
    <Dialog labelId="iq-add-t" onClose={onClose} busy={busy}>
      <div className={iq.ah}><h4 id="iq-add-t">Add a course</h4><button type="button" className={s.lnk} onClick={onImport}>Import a list</button></div>
      <form className={iq.srch} onSubmit={e => { e.preventDefault(); search(); }}>
        <label className={iq.f}>Find the course<input value={q} onChange={e => setQ(e.target.value)} autoComplete="off" /></label>
        <label className={iq.f}>Near (town or state)<input value={near} onChange={e => setNear(e.target.value)} autoComplete="off" /></label>
        <button type="submit" className={`${s.btn} ${s.sm}`} disabled={searching}>{searching ? 'Searching…' : 'Search public listings'}</button>
      </form>
      {searchErr && <Msg ok={false}>{searchErr}</Msg>}
      {found && found.results.length > 0 && (
        <>
          <div className={iq.found} role="group" aria-label="Public listings">
            {found.results.map(x => (
              <button key={x.osmRef} type="button" aria-pressed={picked === x.osmRef} onClick={() => pick(x)}>
                <b>{x.courseName}</b><small>{x.display}</small>
                {(x.onList || x.onGreenReserve) && <em>{[x.onList && `Already on your list (${x.onList.status ?? 'inquiry'})`, x.onGreenReserve && 'Already on GreenReserve'].filter(Boolean).join(' · ')}</em>}
              </button>
            ))}
          </div>
          <p className={iq.attr}>{found.attribution || '© OpenStreetMap contributors'}</p>
        </>
      )}

      <div className={iq.g2} style={{ padding: 0 }}>
        <label className={iq.f}>Course name *<input value={f.courseName} onChange={set('courseName')} /></label>
        <label className={iq.f}>Town *<input value={f.city} onChange={set('city')} /></label>
        <label className={iq.f}>State<input value={f.state} onChange={set('state')} /></label>
        <label className={iq.f}>Address<input value={f.address} onChange={set('address')} /></label>
        <label className={iq.f}>Website<input value={f.website} onChange={set('website')} /></label>
        <label className={iq.f}>Phone<input value={f.coursePhone} onChange={set('coursePhone')} /></label>
        <label className={iq.f}>Holes<select value={f.holes} onChange={set('holes')}><option value="18">18</option><option value="9">9</option><option value="27">27</option><option value="36">36</option><option value="">Not known</option></select></label>
        <label className={iq.f}>Owned by<select value={f.ownerType} onChange={set('ownerType')}><option value="">Not known</option>{OWNER_TYPES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
        <label className={iq.f}>Books today by<select value={f.currentBookingMethod} onChange={set('currentBookingMethod')}><option value="">Not known</option>{BOOKING_METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
        <label className={iq.f}>Current software<input value={f.currentSoftware} onChange={set('currentSoftware')} /></label>
        <label className={iq.f}>Season<input value={f.season} onChange={set('season')} /></label>
      </div>
      <div className={iq.fh}>First contact</div>
      <div className={iq.g2} style={{ padding: 0 }}>
        <label className={iq.f}>Name<input value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} /></label>
        <label className={iq.f}>Role<select value={contact.role} onChange={e => setContact(c => ({ ...c, role: e.target.value }))}><option value="">Not known</option>{CONTACT_ROLES.map(r => <option key={r}>{r}</option>)}</select></label>
        <label className={iq.f}>Email<input type="email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} /></label>
        <label className={iq.f}>Phone<input value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} /></label>
      </div>
      <div className={iq.fh}>Why it fits</div>
      <div className={`${iq.tags} ${iq.pick}`}>
        {FIT_TAGS.map(t => <button key={t} type="button" aria-pressed={tags.includes(t)} onClick={() => setTags(v => v.includes(t) ? v.filter(x => x !== t) : [...v, t])}>{t}</button>)}
      </div>
      <p className={iq.attr}>Only name and town are needed now; fill the rest later.</p>
      {dups && (
        <div className={iq.dups} role="alert">
          <b>This looks like a course you already have:</b>
          {dups.map(d => <span key={d.kind + d.id}><Link href={dupHref(d)}>{d.courseName}</Link>{d.town ? `, ${d.town}` : ''}{d.status ? ` · ${d.status}` : ''} · {d.why}</span>)}
        </div>
      )}
      {err && <Msg ok={false}>{err}</Msg>}
      <div className={s.line} style={{ justifyContent: 'flex-end' }}>
        <button type="button" className={s.lnk} onClick={onClose} disabled={busy}>Cancel</button>
        {dups ? <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => save(true)} disabled={busy}>{busy ? 'Adding…' : 'Add it anyway'}</button>
          : <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => save(false)} disabled={busy}>{busy ? 'Adding…' : 'Add to Targets'}</button>}
      </div>
    </Dialog>
  );
}

type PreviewRow = { row: number; courseName: string; town: string; check: 'new' | 'duplicate' | 'invalid'; why: string };

function Import({ onClose, onDone }: { onClose: () => void; onDone: (firstId: string) => void }) {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; newCount: number } | null>(null);
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 512 * 1024) { setErr('That file is over 512 KB. Split it into smaller lists.'); return; }
    setCsv(await file.text()); setPreview(null); setErr('');
  }
  async function run(commit: boolean) {
    if (!csv.trim()) { setErr('Choose a CSV file or paste the rows first.'); return; }
    setBusy(true); setErr('');
    const r = await api<{ rows: PreviewRow[]; newCount?: number; added?: number; skipped?: number }>('/api/admin/outreach/import', { method: 'POST', body: { csv, commit } });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    if (commit) setDone({ added: r.data.added ?? 0, skipped: r.data.skipped ?? 0 });
    else setPreview({ rows: r.data.rows, newCount: r.data.newCount ?? r.data.rows.filter(x => x.check === 'new').length });
  }

  return (
    <Dialog labelId="iq-imp-t" onClose={onClose} busy={busy}>
      <h4 id="iq-imp-t">Import a list</h4>
      {done ? (
        <>
          <Msg ok>{done.added === 1 ? '1 course' : `${done.added} courses`} added to Targets{done.skipped ? `, ${done.skipped} skipped` : ''}.</Msg>
          <div className={s.line} style={{ justifyContent: 'flex-end' }}><button type="button" className={`${s.btn} ${s.pri}`} onClick={() => onDone('')}>Done</button></div>
        </>
      ) : (
        <>
          <p className={iq.attr} style={{ fontSize: 12.5 }}>A CSV with these columns: name, town, address, website, phone, holes, owned by, books today by, software, season, contact name, role, email, phone.</p>
          <label className={iq.f}>CSV file<input type="file" accept=".csv,text/csv" onChange={e => readFile(e.target.files?.[0])} /></label>
          <label className={iq.f}>Or paste the rows<textarea rows={4} value={csv} onChange={e => { setCsv(e.target.value); setPreview(null); }} /></label>
          {preview && (
            <div className={iq.prev}>
              <div className={`${iq.pr} ${iq.h2}`}><span>Course</span><span>Town</span><span>Check</span></div>
              {preview.rows.map(r => (
                <div key={r.row} className={iq.pr}><span>{r.courseName || `Row ${r.row}`}</span><span>{r.town}</span>
                  <span className={r.check === 'duplicate' ? iq.dup : r.check === 'invalid' ? iq.bad : ''}>{r.check === 'new' ? 'New' : r.why || (r.check === 'duplicate' ? 'Already on your list, skipped' : 'Skipped')}</span></div>
              ))}
            </div>
          )}
          {err && <Msg ok={false}>{err}</Msg>}
          <div className={s.line} style={{ justifyContent: 'flex-end' }}>
            <button type="button" className={s.lnk} onClick={onClose} disabled={busy}>Cancel</button>
            {preview && preview.newCount > 0
              ? <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => run(true)} disabled={busy}>{busy ? 'Adding…' : `Add ${preview.newCount} to Targets`}</button>
              : <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => run(false)} disabled={busy}>{busy ? 'Checking…' : 'Check the list'}</button>}
          </div>
        </>
      )}
    </Dialog>
  );
}
