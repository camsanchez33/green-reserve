'use client';

// MP-12 (ADMIN_V4 V4-9): split out of admin/courses/[id]/page.tsx, which had
// grown to 2,700 lines and 52 useState in one component. Moved verbatim; state
// and handlers come from useCourseDetail() via useCourse().

import { describeCheckIn } from '@/components/admin/CourseCheckInCard';
import { Phone, FileText, Upload, StickyNote, AlertTriangle } from 'lucide-react';
import { formatDate as fmtDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { iCls } from './shared';
import { useCourse } from './context';

export function RecordsTab() {
  const { courseId, detail, docsData, docsLoading, noteDraft, setNoteDraft, noteSaving, docUploading, docsError, addClientNote, uploadDocument, c } = useCourse();
  return (
            <div className="max-w-3xl space-y-5">
              {docsError && (
                <div className="text-sm font-medium px-4 py-2.5 rounded-md border bg-bad/5 text-bad border-bad/20">{docsError}</div>
              )}
              {docsLoading && <div className="text-center text-ink-muted py-12 text-sm">Loading...</div>}
              {!docsLoading && docsData && (
                <>
                  <Card className="p-6">
                    <Eyebrow className="mb-4">Auto records</Eyebrow>
                    <div className="space-y-3">
                      {/* AG-2 §3: one row per acceptance, and a red "Not signed"
                          per signable document still missing. */}
                      <div className="text-sm">
                        <div className="text-ink-soft mb-1.5">Signed agreements{docsData.agreements ? ` · ${docsData.agreements.signed} of ${docsData.agreements.total}` : ''}</div>
                        {(docsData.agreements?.documents ?? []).filter(d2 => !d2.signed).map(d2 => (
                          <div key={d2.document} className="flex items-center justify-between text-xs py-1">
                            <span className="text-ink-soft">{d2.title} v{d2.version}</span>
                            <span className="text-bad font-medium">Not signed</span>
                          </div>
                        ))}
                        {(docsData.acceptances ?? []).length > 0 && (
                          <div className="border border-line rounded-md divide-y divide-line-soft mt-1">
                            {(docsData.acceptances ?? []).map(a => (
                              <div key={a.id} className="grid grid-cols-[1.3fr_1.2fr_auto] gap-3 px-3 py-2 items-center">
                                <div className="min-w-0">
                                  <div className="text-xs text-ink truncate">{a.title} <span className="text-ink-faint">v{a.version}</span>{a.legacy && <span className="ml-1.5 text-[11px] font-medium bg-line-soft text-ink-muted px-1.5 py-0.5">Legacy</span>}</div>
                                  <div className="text-[11px] text-ink-faint truncate">{a.signerName ? `${a.signerName}${a.signerTitle ? ', ' + a.signerTitle : ''}` : a.signerEmail || 'no signer recorded'}</div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs text-ink">{fmtDate(a.acceptedAt)}</div>
                                  <div className="text-[11px] text-ink-faint truncate">{a.ip ? 'IP ' + a.ip : ''}</div>
                                </div>
                                <div className="text-right">
                                  {a.pdfUrl
                                    ? <a href={`/api/admin/course-documents/download?courseId=${c.id}&url=${encodeURIComponent(a.pdfUrl)}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-pine hover:underline">PDF</a>
                                    : <span className="text-[11px] text-ink-faint">{a.legacy ? '—' : 'PDF pending'}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {(docsData.acceptances ?? []).length === 0 && (docsData.agreements?.total ?? 0) === 0 && (
                          <span className="text-ink-faint text-xs">No signable documents on disk.</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-soft">Stripe connected-account agreement</span>
                        <span className="text-ink font-medium">{docsData.stripeAgreementDate ? fmtDate(docsData.stripeAgreementDate) : 'Not connected'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-soft">Go-live page approval</span>
                        <span className="text-ink font-medium">{docsData.approval.approvedAt ? `Approved ${fmtDate(docsData.approval.approvedAt)}` : 'Not yet approved'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-soft">Booking terms in force</span>
                        <span className="text-ink font-medium">v{docsData.bookingTermsVersion}</span>
                      </div>
                    </div>
                  </Card>

                  {/* CS-3 §3: calls as human entries. */}
                  {(detail.calls ?? []).length > 0 && (
                    <Card className="p-6">
                      <Eyebrow className="mb-4">Calls</Eyebrow>
                      <div className="border border-line rounded-md divide-y divide-line">
                        {(detail.calls ?? []).map(cl => (
                          <div key={cl.id} className="px-3 py-2.5 flex items-start gap-3">
                            <Phone className={'w-3.5 h-3.5 mt-0.5 shrink-0 ' + (cl.outcome === 'talked' ? 'text-ok' : cl.outcome === 'scheduled' ? 'text-pine' : 'text-ink-faint')} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-ink">{describeCheckIn(cl)}</div>
                              {cl.notes && <div className="text-xs text-ink-soft mt-1 whitespace-pre-wrap">{cl.notes}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <Eyebrow>Uploaded documents</Eyebrow>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5" />{docUploading ? 'Uploading…' : 'Upload PDF'}
                        <input
                          type="file" accept="application/pdf" className="hidden" disabled={docUploading}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f); e.target.value = ''; }}
                        />
                      </label>
                    </div>
                    {docsData.documents.length === 0 ? (
                      <p className="text-sm text-ink-soft">No documents uploaded yet.</p>
                    ) : (
                      <div className="divide-y divide-line-soft">
                        {docsData.documents.map((doc, i) => (
                          // MP-5a: contracts are private blobs now — served
                          // through the authenticated route, never by raw URL.
                          <a key={i} href={`/api/admin/course-documents/download?courseId=${courseId}&url=${encodeURIComponent(doc.url)}`}
                            target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 text-sm hover:text-pine transition-colors">
                            <FileText className="w-4 h-4 text-ink-muted shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-ink">{doc.name}</span>
                            <span className="text-xs text-ink-faint shrink-0">{fmtDate(doc.at)} · {doc.by}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card className="p-6">
                    <Eyebrow className="mb-4">Client notes</Eyebrow>
                    <div className="flex gap-2 mb-4">
                      <input
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addClientNote(); }}
                        placeholder="Add a note for the team..."
                        className={iCls}
                      />
                      <button
                        onClick={addClientNote}
                        disabled={noteSaving || !noteDraft.trim()}
                        className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors"
                      >
                        <StickyNote className="w-3.5 h-3.5" />Add
                      </button>
                    </div>
                    {docsData.notes.length === 0 ? (
                      <p className="text-sm text-ink-soft">No notes yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {docsData.notes.map((n, i) => (
                          <div key={i} className="text-sm">
                            <p className="text-ink">{n.text}</p>
                            <p className="text-xs text-ink-faint mt-0.5">{n.by} · {fmtDate(n.at)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <div className="flex items-center gap-2 text-xs text-ink-faint px-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    E-signature workflow — planned, not yet built.
                  </div>
                </>
              )}
            </div>
          );
}
