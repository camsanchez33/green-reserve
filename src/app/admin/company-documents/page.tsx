'use client';
// CO-DOCS (Cam 2026-10-01): the company's own paperwork — LLC filing, EIN
// letter, bank and insurance documents — in the PRIVATE Blob store. Owner with
// 2FA only (the routes enforce it; the sidebar only offers the link to owners).
// The repo is public, so these documents live here and never in git.
//
// No-silent-failures rule: every action shows pending, then success or an
// error that says what to do next; a failed load shows a retry, never "empty".
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Download, Trash2, Upload } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { LoadFailure, ErrorBanner } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Btn } from '@/components/ui/Btn';
import { INPUT_COMPACT } from '@/components/ui/field';
import { formatDateTime } from '@/lib/format';
import { COMPANY_DOC_CATEGORIES, COMPANY_DOC_MAX_BYTES, COMPANY_DOC_TYPES, type CompanyDocCategory } from '@/lib/company-documents';

type Doc = { url: string; pathname: string; size: number; uploadedAt: string; category: CompanyDocCategory | 'other'; name: string };

const fmtSize = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const downloadHref = (url: string) => `/api/admin/company-documents/download?url=${encodeURIComponent(url)}`;

export default function CompanyDocumentsPage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [category, setCategory] = useState<CompanyDocCategory>('formation');
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await adminFetch<{ documents: Doc[] }>('/api/admin/company-documents', { subject: 'company documents' });
    if (!res.ok) { setLoadError({ msg: res.message, kind: res.kind }); setDocs(null); return; }
    setDocs(res.data.documents);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setUploading(true); setActionError(''); setNotice('');
    try {
      if (!(COMPANY_DOC_TYPES as readonly string[]).includes(file.type)) { setActionError('Only PDF, PNG or JPEG files can be stored here.'); return; }
      if (file.size > COMPANY_DOC_MAX_BYTES) { setActionError('That file is over 25 MB. Compress it and try again.'); return; }
      const { upload: put } = await import('@vercel/blob/client');
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '').slice(0, 120) || 'document';
      let blob: { url: string };
      try {
        blob = await put(`company/${category}/${safe}`, file, {
          access: 'private',
          handleUploadUrl: '/api/admin/company-documents/upload',
          contentType: file.type,
        });
      } catch (e) {
        setActionError(`Upload failed: ${e instanceof Error ? e.message : 'storage did not accept the file'}. Nothing was saved.`);
        return;
      }
      const rec = await adminFetch('/api/admin/company-documents', { method: 'POST', body: JSON.stringify({ url: blob.url }), subject: 'the document', action: 'save' });
      if (!rec.ok) { setActionError(`${rec.message} The file may be stored; reload to check before uploading again.`); }
      else setNotice(`Saved “${file.name}”.`);
      await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(doc: Doc) {
    setDeleting(doc.url); setActionError(''); setNotice('');
    const res = await adminFetch(`/api/admin/company-documents?url=${encodeURIComponent(doc.url)}`, { method: 'DELETE', subject: 'the document', action: 'save' });
    setDeleting(null); setConfirmDelete(null);
    if (!res.ok) { setActionError(`${res.message} “${doc.name}” was not deleted.`); return; }
    setNotice(`Deleted “${doc.name}”.`);
    await load();
  }

  const groups = COMPANY_DOC_CATEGORIES
    .map(c => ({ ...c, docs: (docs ?? []).filter(d => d.category === c.key) }))
    .filter(g => g.docs.length);

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="company" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-3xl">
          <div className="mb-7">
            <h1 className="text-[30px] leading-none font-serif font-medium text-ink">Company documents</h1>
            <p className="text-[13.5px] text-ink-soft mt-2">GreenReserve LLC&apos;s own paperwork: formation, tax, banking, insurance and contracts. Stored privately and visible only to the owner. Never put these in the code repository; it is public.</p>
          </div>

          <Card className="p-5 mb-5">
            <Eyebrow>Add a document</Eyebrow>
            <div className="flex flex-wrap items-end gap-3 mt-3">
              <label className="text-[13px] text-ink-soft">
                <span className="block mb-1">Category</span>
                <select value={category} onChange={e => setCategory(e.target.value as CompanyDocCategory)} disabled={uploading}
                  className={INPUT_COMPACT}>
                  {COMPANY_DOC_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <Btn onClick={() => fileRef.current?.click()} disabled={uploading}>
                <span className="inline-flex items-center gap-2"><Upload className="w-4 h-4" />{uploading ? 'Uploading…' : 'Choose file'}</span>
              </Btn>
              <span className="text-xs text-ink-muted">PDF, PNG or JPEG, up to 25 MB.</span>
            </div>
          </Card>

          {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError('')} />}
          {notice && <p className="mb-4 text-[13px] text-ok">{notice}</p>}

          {loadError ? (
            <LoadFailure message={loadError.msg} kind={loadError.kind} onRetry={load} compact />
          ) : docs === null ? (
            <p className="text-sm text-ink-muted">Loading documents…</p>
          ) : docs.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-ink-soft">No company documents yet. Add the LLC filing first: choose Formation, then the PDF.</p>
            </Card>
          ) : (
            <div className="space-y-5">
              {groups.map(g => (
                <Card key={g.key} className="p-0">
                  <div className="px-5 pt-4 pb-2"><Eyebrow>{g.label}</Eyebrow></div>
                  <ul>
                    {g.docs.map(d => (
                      <li key={d.url} className="flex items-center gap-3 px-5 py-3 border-t border-line">
                        <FileText className="w-4 h-4 text-ink-muted shrink-0" />
                        <div className="min-w-0 flex-1">
                          <a href={downloadHref(d.url)} target="_blank" rel="noopener" className="text-sm font-medium text-ink hover:underline break-all">{d.name}</a>
                          <div className="text-xs text-ink-muted">{fmtSize(d.size)} · added {formatDateTime(d.uploadedAt)}</div>
                        </div>
                        {confirmDelete === d.url ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-bad">Delete for good?</span>
                            <Btn variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting === d.url}>Keep</Btn>
                            <Btn onClick={() => remove(d)} disabled={deleting === d.url}>{deleting === d.url ? 'Deleting…' : 'Delete'}</Btn>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            <a href={downloadHref(d.url)} target="_blank" rel="noopener" aria-label={`Open ${d.name}`} className="p-2 text-ink-muted hover:text-ink"><Download className="w-4 h-4" /></a>
                            <button type="button" onClick={() => setConfirmDelete(d.url)} aria-label={`Delete ${d.name}`} className="p-2 text-ink-muted hover:text-bad"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
