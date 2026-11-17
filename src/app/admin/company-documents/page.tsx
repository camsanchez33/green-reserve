'use client';
// CO-DOCS (Cam 2026-10-01): the company's own paperwork — LLC filing, EIN letter, bank and insurance documents — in
// the PRIVATE Blob store. Owner with 2FA only (the routes enforce it; the sidebar only offers the link to owners).
// The repo is public, so these documents live here and never in git.
//
// Settings → Company docs (Cam approved the mockup 2026-11-17, lanes/admin/company-docs-mockup.html; lanes/admin.md
// "Company docs"): one "GreenReserve LLC’s paperwork" card in My profile's card build. Every label shows, filed or
// not, so a missing insurance policy is as visible as a filed one (ADMIN-C). One line per document; clicking it opens
// its details. A bare plus adds, a bare icon filters. Course agreements are not here; a quiet line points to them.
// Labels, versions and history appear only once Build's data arrives (./logic). Nothing is faked meanwhile.
//
// No-silent-failures rule: every action shows pending, then success or an error that says what to do next; a failed
// load shows a retry, never "empty".
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { ProfileCard, profileStyles as s } from '@/components/admin/ProfileCard';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import g from '../admin-glass.module.css';
import c from './company.module.css';
import { type Doc, type Label, type Listing, labelsOf, hasLabels, groupDocs, day, emptyLine } from './logic';
import { AddBox, UploadBox, DocBox, LabelBox, FilterBox, LOCK } from './Dialogs';

const ICON = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

type Open =
  | { kind: 'add' } | { kind: 'upload'; replacing: Doc | null } | { kind: 'doc'; doc: Doc }
  | { kind: 'label'; label: Label | null } | { kind: 'filter' } | null;

export default function CompanyDocumentsPage() {
  const [data, setData] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [only, setOnly] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<Listing>('/api/admin/company-documents', { subject: 'company documents' });
    if (!res.ok) setLoadError({ msg: res.message, kind: res.kind });
    else { setData(res.data); setLoadError(null); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  /** After a change: close the box, say what happened, show the new state. */
  const done = useCallback(async (msg: string) => { setOpen(null); say(msg); await load(); }, [load, say]);

  const labels = labelsOf(data);
  const ownLabels = hasLabels(data);
  const groups = groupDocs(data?.documents ?? [], labels);
  // A filter on a label that has since gone shows everything again.
  const filtered = labels.some(l => l.key === only) ? only : '';
  const shown = labels.filter(l => !filtered || l.key === filtered);
  const onlyName = labels.find(l => l.key === filtered)?.name;

  const top = (
    <span className={c.icons}>
      <button type="button" className={`${s.plus} ${c.fico} ${filtered ? c.fon : ''}`} onClick={() => setOpen({ kind: 'filter' })} aria-label="Filter" title="Filter" disabled={!data}>
        <svg {...ICON}><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></svg>{filtered && <i className={c.fdot} aria-hidden="true" />}
      </button>
      <button type="button" className={s.plus} onClick={() => setOpen(ownLabels ? { kind: 'add' } : { kind: 'upload', replacing: null })} aria-label="Add" title="Add" disabled={!data}>
        <svg {...ICON} strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </span>
  );

  return (
    <>
      <AdminSidebar active="company" />
      <main className={g.main}>
        <div className={g.head}><h1>Company docs</h1></div>
        {loadError && (
          <div className={`${g.glass} ${c.problem}`} role="alert">
            <span>{loadError.msg}</span>
            {loadError.kind === 'unauthorized' ? <Link href="/admin/login" className={s.btn}>Sign in</Link>
              : loadError.kind === 'forbidden' ? null : <button type="button" className={s.btn} onClick={() => load()} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}
        {!loadError && (
          <div className={s.col}>
            <ProfileCard title="GreenReserve LLC’s paperwork" labelId="cd-card" top={top}
              lead={<span className={c.secl}>{LOCK}<span>Only you can see this page. Files are stored privately and open only through your owner session.</span></span>}>
              {onlyName && (
                <div className={c.aon}>Showing {onlyName}<button type="button" className={s.lnk} onClick={() => setOnly('')}>Clear</button></div>
              )}
              {!data && loading && <p className={c.muted}>Loading documents…</p>}
              {data && shown.map(l => {
                const docs = groups.get(l.key) ?? [];
                return (
                  <section key={l.key} aria-label={l.name}>
                    <div className={c.gh}>
                      <span>{l.name}{docs.length > 0 && <span className={c.cn}>{docs.length}</span>}</span>
                      {ownLabels && !l.builtIn && (
                        <button type="button" className={`${s.plus} ${c.pen}`} onClick={() => setOpen({ kind: 'label', label: l })} aria-label={`Rename or remove ${l.name}`} title="Rename or remove">
                          <svg {...ICON} width={14} height={14}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
                        </button>
                      )}
                    </div>
                    {docs.length === 0 ? (
                      <div className={c.empty}><span className={c.dot0} aria-hidden="true" />{emptyLine(l)}</div>
                    ) : docs.map(d => (
                      <button key={d.url} type="button" className={c.row} onClick={() => setOpen({ kind: 'doc', doc: d })}>
                        <span className={c.name}>{d.name}</span>
                        <span className={c.ver}>{d.version && d.version > 1 ? `Version ${d.version}` : ''}</span>
                        <span className={c.date}>{day(d.uploadedAt)}</span>
                        <svg className={c.chev} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                      </button>
                    ))}
                  </section>
                );
              })}
              {data && <p className={c.agl}>Course agreements courses sign are under <Link href="/admin/system" className={c.qlink}>Platform activity → Agreement versions</Link>.</p>}
            </ProfileCard>
          </div>
        )}
      </main>

      {open?.kind === 'add' && (
        <AddBox onClose={() => setOpen(null)} onUpload={() => setOpen({ kind: 'upload', replacing: null })} onLabel={() => setOpen({ kind: 'label', label: null })} />
      )}
      {open?.kind === 'upload' && (
        <UploadBox labels={labels} replacing={open.replacing} sendLabel={ownLabels} onClose={() => setOpen(null)} onDone={done} onStored={load} />
      )}
      {open?.kind === 'doc' && (
        <DocBox doc={open.doc} labels={labels} canRelabel={ownLabels} onClose={() => setOpen(null)}
          onReplace={() => setOpen({ kind: 'upload', replacing: open.doc })} onChanged={done} />
      )}
      {open?.kind === 'label' && (
        <LabelBox label={open.label} labels={labels} count={open.label ? (groups.get(open.label.key)?.length ?? 0) : 0}
          onClose={() => setOpen(null)} onDone={done} />
      )}
      {open?.kind === 'filter' && (
        <FilterBox labels={labels} value={filtered} onClose={() => setOpen(null)} onPick={k => { setOnly(k); setOpen(null); }} />
      )}
      {/* Always mounted, so screen readers hear the text change. */}
      <div className={`${c.toast} ${toast ? '' : c.hide}`} role="status">{toast}</div>
    </>
  );
}
