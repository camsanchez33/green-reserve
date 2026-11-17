'use client';
// Settings → Company docs (Cam approved the mockup 2026-11-17): the boxes the page opens — Add, Upload or Replace,
// a document's details (Open, Change label, Replace, Delete, History), a label's name, and Filter. Each shows
// pending, then the outcome or an error that says what to do next (no silent failures). Parts that need Build's
// new data appear only when it arrives (./logic).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { adminFetch } from '@/lib/admin-fetch';
import { Msg, profileStyles as s } from '@/components/admin/ProfileCard';
import g from '../admin-glass.module.css';
import c from './company.module.css';
import {
  type Doc, type Label, type HistoryItem, labelOf, folderFor, safeFileName, fileProblem, fmtSize, kindOf, openHref, day, when,
} from './logic';

/** The overlay every box here uses: into the admin shell (it carries the --g-* tokens), Escape and a click outside
 *  close it unless something is saving, focus starts inside and goes back where it was. */
function Box({ label, onClose, busy, children, wide }: { label: string; onClose: () => void; busy?: boolean; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[data-first], input, button, a, select')?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) closeRef.current(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, []);
  const host = typeof document !== 'undefined' ? (document.querySelector('[data-admin-shell]') ?? document.body) : null;
  if (!host) return null;
  return createPortal(
    <div className={c.ov} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={ref} className={`${g.glass} ${s.modal} ${c.box} ${wide ? c.wide : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>, host,
  );
}

const LOCK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);

/** Label tiles, one pressed (a radio group). */
function LabelTiles({ labels, value, onPick, disabled, labelledBy }: { labels: Label[]; value: string; onPick: (k: string) => void; disabled?: boolean; labelledBy: string }) {
  return (
    <div className={c.tiles} role="radiogroup" aria-labelledby={labelledBy}>
      {labels.map(l => (
        <button key={l.key} type="button" role="radio" aria-checked={value === l.key} className={c.tile} onClick={() => onPick(l.key)} disabled={disabled}>
          <i aria-hidden="true" /><span><b>{l.name}</b></span>
        </button>
      ))}
    </div>
  );
}

/** Add: upload a document, or (once labels exist) make a new label. */
export function AddBox({ onClose, onUpload, onLabel }: { onClose: () => void; onUpload: () => void; onLabel: () => void }) {
  return (
    <Box label="Add" onClose={onClose}>
      <h4>Add</h4>
      <div className={`${c.tiles} ${c.one}`}>
        <button type="button" className={c.tile} onClick={onUpload} data-first><span><b>Upload a document</b><small>A PDF, PNG or JPEG into one of your labels</small></span></button>
        <button type="button" className={c.tile} onClick={onLabel}><span><b>New label</b><small>Your own group, like Trademark or Payroll</small></span></button>
      </div>
      <div className={s.line}><span className={c.spring} /><button type="button" className={s.lnk} onClick={onClose}>Close</button></div>
    </Box>
  );
}

/**
 * Upload a new document, or Replace one (it keeps the old file as a version — only offered once documents have an id).
 * Same path as before: the browser sends the file straight to private storage with a one-time permit, then the
 * route records it. A replace or a label rides along in that record call.
 */
export function UploadBox({ labels, replacing, sendLabel, onClose, onDone, onStored }: {
  labels: Label[]; replacing: Doc | null; sendLabel: boolean; onClose: () => void; onDone: (msg: string) => void | Promise<void>;
  onStored: () => void | Promise<void>;
}) {
  const [label, setLabel] = useState(replacing ? labelOf(replacing) : labels[0]?.key ?? 'formation');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    setError('');
    if (!f) return;
    const p = fileProblem(f);
    if (p) { setFile(null); setError(p); if (input.current) input.current.value = ''; return; }
    setFile(f);
  }

  async function go() {
    if (!file) { setError('Choose a file first.'); return; }
    setBusy(true); setError('');
    let url: string;
    try {
      const { upload: put } = await import('@vercel/blob/client');
      const blob = await put(`company/${folderFor(label)}/${safeFileName(file.name)}`, file, {
        access: 'private', handleUploadUrl: '/api/admin/company-documents/upload', contentType: file.type,
      });
      url = blob.url;
    } catch (e) {
      setError(`Upload failed: ${e instanceof Error ? e.message : 'storage did not accept the file'}. Nothing was saved.`);
      setBusy(false); return;
    }
    const body: Record<string, string> = { url };
    if (sendLabel) body.label = label;
    if (replacing?.id) body.replaces = replacing.id;
    const rec = await adminFetch('/api/admin/company-documents', { method: 'POST', body: JSON.stringify(body), subject: 'the document', action: 'save' });
    setBusy(false);
    if (!rec.ok) { setError(`${rec.message} The file may be stored; the list has been reloaded, so check it before uploading again.`); await onStored(); return; }
    await onDone(replacing
      ? (replacing.version ? `Replaced. The old file is kept as version ${replacing.version}.` : 'Replaced.')
      : `Saved “${file.name}”.`);
  }

  const title = replacing ? `Replace “${replacing.name}”` : 'Upload a document';
  return (
    <Box label={title} onClose={onClose} busy={busy} wide>
      <h4>{title}</h4>
      {replacing
        ? replacing.version ? <p>The current file stays as version {replacing.version} in its history.</p> : null
        : <><div className={c.lab} id="cd-up-l">Label</div><LabelTiles labels={labels} value={label} onPick={setLabel} disabled={busy} labelledBy="cd-up-l" /></>}
      <label className={c.drop}>
        <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" className={c.hide} disabled={busy}
          onChange={e => pick(e.target.files?.[0])} />
        <b>{file ? file.name : 'Choose a file'}</b>
        <small>{file ? fmtSize(file.size) : 'PDF, PNG or JPEG, up to 25 MB'}</small>
      </label>
      {error && <Msg ok={false}>{error}</Msg>}
      <div className={s.line}>
        <button type="button" className={s.lnk} onClick={onClose} disabled={busy}>Cancel</button>
        <span className={c.spring} />
        <button type="button" className={`${s.btn} ${s.pri}`} onClick={go} disabled={busy || !file}>
          {busy ? (replacing ? 'Replacing…' : 'Uploading…') : replacing ? 'Replace' : 'Upload'}
        </button>
      </div>
    </Box>
  );
}

type DetailView = 'info' | 'move' | 'delete';

/** One document: what it is, its history (once Build's route exists), and what can be done to it. */
export function DocBox({ doc, labels, canRelabel, onClose, onReplace, onChanged }: {
  doc: Doc; labels: Label[]; canRelabel: boolean; onClose: () => void; onReplace: () => void; onChanged: (msg: string) => void | Promise<void>;
}) {
  const [view, setView] = useState<DetailView>('info');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hist, setHist] = useState<HistoryItem[] | null>(null);
  const [histError, setHistError] = useState('');
  const [moveTo, setMoveTo] = useState(labelOf(doc));
  const labelName = labels.find(l => l.key === labelOf(doc))?.name ?? 'Other';

  const loadHistory = useCallback(async () => {
    if (!doc.id) return;
    setHistError('');
    const r = await adminFetch<{ history: HistoryItem[] }>(`/api/admin/company-documents/history?id=${encodeURIComponent(doc.id)}`, { subject: 'the history' });
    if (!r.ok) { setHistError(r.message); return; }
    setHist(r.data.history ?? []);
  }, [doc.id]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function remove() {
    setBusy(true); setError('');
    // A reason (and, once Build adds it, a fresh second-factor check) is asked by the admin layout's dialogs.
    const r = await adminFetch(`/api/admin/company-documents?url=${encodeURIComponent(doc.url)}`, { method: 'DELETE', subject: 'the document', action: 'save' });
    setBusy(false);
    if (!r.ok) { setError(`${r.message} “${doc.name}” was not deleted.`); return; }
    await onChanged('Deleted. It’s recorded in Audit.');
  }

  async function move() {
    if (!doc.id || moveTo === labelOf(doc)) { setView('info'); return; }
    setBusy(true); setError('');
    const r = await adminFetch('/api/admin/company-documents', { method: 'PATCH', body: JSON.stringify({ id: doc.id, label: moveTo }), subject: 'the label', action: 'save' });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    await onChanged(`Moved to ${labels.find(l => l.key === moveTo)?.name ?? 'its new label'}.`);
  }

  if (view === 'delete') {
    return (
      <Box key={view} label={`Delete ${doc.name}`} onClose={() => setView('info')} busy={busy}>
        <h4>Delete “{doc.name}” for good?</h4>
        <p>It can’t be recovered{doc.version && doc.version > 1 ? ', and its earlier versions go with it' : ''}.</p>
        {error && <Msg ok={false}>{error}</Msg>}
        <div className={s.line}>
          <button type="button" className={s.lnk} onClick={() => { setError(''); setView('info'); }} disabled={busy} data-first>Keep it</button>
          <span className={c.spring} />
          <button type="button" className={`${s.btn} ${c.dngb}`} onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
        </div>
      </Box>
    );
  }

  if (view === 'move') {
    return (
      <Box key={view} label="Change label" onClose={() => setView('info')} busy={busy} wide>
        <h4 id="cd-mv-t">Change label</h4>
        <LabelTiles labels={labels} value={moveTo} onPick={setMoveTo} disabled={busy} labelledBy="cd-mv-t" />
        {error && <Msg ok={false}>{error}</Msg>}
        <div className={s.line}>
          <button type="button" className={s.lnk} onClick={() => { setError(''); setView('info'); }} disabled={busy}>Cancel</button>
          <span className={c.spring} />
          <button type="button" className={`${s.btn} ${s.pri}`} onClick={move} disabled={busy}>{busy ? 'Moving…' : 'Move'}</button>
        </div>
      </Box>
    );
  }

  return (
    <Box key={view} label={doc.name} onClose={onClose}>
      <h4>{doc.name}</h4>
      <dl className={c.dl}>
        <div><dt>Label</dt><dd>{labelName}</dd></div>
        {doc.version !== undefined && <div><dt>Version</dt><dd>{doc.version}</dd></div>}
        <div><dt>File</dt><dd>{fmtSize(doc.size)} · {kindOf(doc)}</dd></div>
        <div><dt>Added</dt><dd>{day(doc.uploadedAt)}</dd></div>
      </dl>
      {doc.id && (
        <>
          <div className={c.lab}>History</div>
          {histError ? (
            <div className={c.histErr}><Msg ok={false}>{histError}</Msg><button type="button" className={s.lnk} onClick={loadHistory}>Try again</button></div>
          ) : hist === null ? (
            <p className={c.muted}>Loading…</p>
          ) : hist.length === 0 ? (
            <p className={c.muted}>Nothing recorded yet.</p>
          ) : (
            <div className={c.hist}>
              {hist.map((h, i) => <div key={i}><span>{h.what}</span><span>{h.who}</span><span>{when(h.at)}</span></div>)}
            </div>
          )}
        </>
      )}
      {error && <Msg ok={false}>{error}</Msg>}
      <div className={s.line}>
        <button type="button" className={`${s.lnk} ${s.lnkBad}`} onClick={() => setView('delete')}>Delete</button>
        <span className={c.spring} />
        {canRelabel && doc.id && <button type="button" className={s.btn} onClick={() => setView('move')}>Change label</button>}
        {doc.id && <button type="button" className={s.btn} onClick={onReplace}>Replace</button>}
        <a className={`${s.btn} ${s.pri} ${c.alink}`} href={openHref(doc.url)} target="_blank" rel="noopener" data-first>Open</a>
      </div>
    </Box>
  );
}

/** New label, or rename / remove one of yours. Removing one that holds documents asks where they go first. */
export function LabelBox({ label, labels, count, onClose, onDone }: {
  label: Label | null; labels: Label[]; count: number; onClose: () => void; onDone: (msg: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(label?.name ?? '');
  const others = labels.filter(l => l.key !== label?.key);
  const [moveTo, setMoveTo] = useState(others.find(l => l.key === 'other')?.key ?? others[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = name.trim();
    if (!v) { setError('Give the label a name.'); return; }
    setBusy(true); setError('');
    const r = await adminFetch('/api/admin/company-documents/labels', {
      method: label ? 'PATCH' : 'POST', body: JSON.stringify(label ? { key: label.key, name: v } : { name: v }), subject: 'the label', action: 'save',
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    await onDone(label ? 'Renamed.' : 'Label added.');
  }

  async function remove() {
    if (!label) return;
    setBusy(true); setError('');
    const q = `key=${encodeURIComponent(label.key)}${count ? `&moveTo=${encodeURIComponent(moveTo)}` : ''}`;
    const r = await adminFetch(`/api/admin/company-documents/labels?${q}`, { method: 'DELETE', subject: 'the label', action: 'save' });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    await onDone(count ? 'Label removed; its documents moved.' : 'Label removed.');
  }

  return (
    <Box label={label ? 'Edit label' : 'New label'} onClose={onClose} busy={busy}>
      <form onSubmit={save} noValidate className={c.form}>
        <h4>{label ? 'Edit label' : 'New label'}</h4>
        <label className={c.flab}>Name<input className={`${s.fld} ${c.fld}`} value={name} onChange={e => setName(e.target.value)} maxLength={40} disabled={busy} /></label>
        {label && count > 0 && (
          <label className={c.flab}>To remove it, move its {count} document{count > 1 ? 's' : ''} to
            <select className={`${s.fld} ${c.fld}`} value={moveTo} onChange={e => setMoveTo(e.target.value)} disabled={busy}>
              {others.map(l => <option key={l.key} value={l.key}>{l.name}</option>)}
            </select>
          </label>
        )}
        {error && <Msg ok={false}>{error}</Msg>}
        <div className={s.line}>
          {label && <button type="button" className={`${s.lnk} ${s.lnkBad}`} onClick={remove} disabled={busy}>Remove label</button>}
          <span className={c.spring} />
          <button type="button" className={s.lnk} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`${s.btn} ${s.pri}`} disabled={busy}>{busy ? 'Saving…' : label ? 'Save' : 'Add label'}</button>
        </div>
      </form>
    </Box>
  );
}

/** One Filter button: show a single label. */
export function FilterBox({ labels, value, onClose, onPick }: { labels: Label[]; value: string; onClose: () => void; onPick: (k: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <Box label="Filter" onClose={onClose}>
      <h4>Filter</h4>
      <label className={c.flab}>Label
        <select className={`${s.fld} ${c.fld}`} value={v} onChange={e => setV(e.target.value)}>
          <option value="">Every label</option>
          {labels.map(l => <option key={l.key} value={l.key}>{l.name}</option>)}
        </select>
      </label>
      <div className={s.line}>
        <button type="button" className={s.lnk} onClick={() => onPick('')}>Clear</button>
        <span className={c.spring} />
        <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => onPick(v)}>Show</button>
      </div>
    </Box>
  );
}

export { LOCK };
