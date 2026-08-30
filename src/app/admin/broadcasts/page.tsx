'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch, LOGIN_SESSION_ENDED, type AdminFetchFailure } from '@/lib/admin-fetch';
import { ErrorBanner } from '@/components/ui/ErrorState';
import { Radio, Mail, Users, RefreshCw, Send } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface Broadcast {
  id: string; title: string; body: string; emailSent: boolean;
  sentByName: string; createdAt: string; dismissalCount: number;
}

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function BroadcastsPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sendResult, setSendResult] = useState<{ emailCount?: number; error?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // MP-2d: bRes was fetched here, never read, and adminFetch re-requested
      // the same gated URL below — two GETs per load and per Refresh.
      const sRes = await fetch('/api/admin/session');
      if (!sRes.ok) { router.push(LOGIN_SESSION_ENDED); return; }
      // MP-2c: MP-2b's SUPPORT_PLUS gate on this endpoint made 403 reachable and
      // this line parsed the error body as data — empty announcement history
      // with no explanation, and a live composer underneath.
      const res = await adminFetch<Broadcast[]>('/api/admin/broadcasts', { subject: 'broadcasts' });
      if (!res.ok) { setBroadcasts([]); setLoadError({ msg: res.message, kind: res.kind }); }
      else { setBroadcasts(res.data); setLoadError(null); }
      setAdminReady(true);
    } catch { router.push(LOGIN_SESSION_ENDED); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // MP-2d B1: this collapsed ANY non-2xx into [], so recipientCount became 0
    // rather than null — the confirm button read "Send to 0 operators" while the
    // server mails every operator with an active course. The label contradicted
    // the action on an irreversible mass email, and MP-2c's SUPPORT_PLUS gate on
    // /api/admin/courses is what made that branch reachable. null already has a
    // correct rendering ("all active operators"); failure must fall back to it.
    adminFetch<{ active: boolean }[]>('/api/admin/courses', { subject: 'the recipient list' })
      .then(res => {
        if (!res.ok || !Array.isArray(res.data)) { setRecipientCount(null); return; }
        setRecipientCount(res.data.filter(c => c.active).length);
      });
  }, []);

  async function sendBroadcast() {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const r = await fetch('/api/admin/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), sendEmail }),
      });
      const d = await r.json();
      if (!r.ok) { setSendResult({ error: d.error || 'Failed' }); return; }
      setSendResult({ emailCount: d.emailCount });
      setTitle(''); setBody(''); setSendEmail(false); setReviewing(false);
      load();
    } catch { setSendResult({ error: 'Network error' }); }
    finally { setSending(false); }
  }

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="broadcasts" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-4xl">
          {/* MP-2d: was a sibling of this container, so it rendered full-bleed
              against the sidebar and above the page title. */}
          {loadError && (
            <ErrorBanner message={loadError.msg} kind={loadError.kind} onRetry={() => load()} />
          )}
          <div className="flex items-center justify-between mb-7">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Broadcasts</h1>
              <p className="text-sm text-ink-soft mt-0.5">Send a message to every course operator</p>
            </div>
            <button onClick={load} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors">
              <RefreshCw className="w-4 h-4"/>Refresh
            </button>
          </div>

          {/* Compose / Review */}
          <div className="bg-white border border-line rounded-lg p-6 mb-7">
            <div className="flex items-center gap-2 mb-4">
              <Radio className="w-4 h-4 text-pine"/>
              <span className="text-sm font-medium text-ink">{reviewing ? 'Review before sending' : 'New broadcast'}</span>
              {reviewing && (
                <button onClick={() => setReviewing(false)} className="ml-auto text-xs text-ink-muted hover:text-ink transition-colors">Edit</button>
              )}
            </div>
            {sendResult && (
              <div className={`rounded-md px-3 py-2.5 text-sm mb-4 border ${sendResult.error ? 'bg-bad/5 border-bad/20 text-bad' : 'bg-ok/5 border-ok/20 text-ok'}`}>
                {sendResult.error
                  ? `Error: ${sendResult.error}`
                  : `Broadcast sent${sendResult.emailCount ? ` · ${sendResult.emailCount} email${sendResult.emailCount !== 1 ? 's' : ''} delivered` : ''}`}
              </div>
            )}

            {!reviewing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Title</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} className={iCls} placeholder="Maintenance window this weekend"/>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Message</label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} className={iCls + ' resize-none'} placeholder="Write your message here. Separate paragraphs with blank lines."/>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      className={'relative w-9 h-5 rounded-full transition-colors cursor-pointer ' + (sendEmail ? 'bg-pine' : 'bg-line-strong')}
                      onClick={() => setSendEmail(v => !v)}
                    >
                      <div className={'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ' + (sendEmail ? 'translate-x-4' : 'translate-x-0.5')}/>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-ink-muted"/>Also send as email
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5">Sends to every operator with an active course</div>
                    </div>
                  </label>
                  <button
                    onClick={() => setReviewing(true)}
                    disabled={!title.trim() || !body.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors"
                  >
                    Preview &amp; confirm
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-paper border border-line rounded-lg p-4">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Preview</div>
                  <div className="text-sm font-medium text-ink mb-2">{title}</div>
                  <div className="text-sm text-ink-soft whitespace-pre-line leading-relaxed">{body}</div>
                </div>
                {sendEmail && (
                  <div className="flex items-center gap-2 text-xs text-ink-soft bg-pine/5 border border-pine/20 rounded-md px-3 py-2">
                    <Mail className="w-3.5 h-3.5 text-pine shrink-0"/>
                    <span>Email will be sent to {recipientCount !== null ? `${recipientCount} active operator${recipientCount !== 1 ? 's' : ''}` : 'all active operators'}.</span>
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setReviewing(false)}
                    className="px-4 py-2.5 border border-line text-ink-soft hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors"
                  >
                    Back to edit
                  </button>
                  <button
                    onClick={sendBroadcast}
                    disabled={sending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors"
                  >
                    <Send className="w-4 h-4"/>
                    {sending ? 'Sending...' : sendEmail && recipientCount !== null ? `Send to ${recipientCount} operator${recipientCount !== 1 ? 's' : ''}` : 'Confirm & send'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* History */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">History</div>
            {loading && <div className="text-ink-muted text-sm py-8 text-center">Loading...</div>}
            {!loading && !loadError && broadcasts.length === 0 && (
              <div className="text-ink-muted text-sm py-12 text-center bg-white border border-line rounded-lg">
                No broadcasts yet
              </div>
            )}
            <div className="space-y-3">
              {broadcasts.map(b => (
                <div key={b.id} className="bg-white border border-line rounded-lg p-5">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="font-medium text-ink text-sm">{b.title}</div>
                    <div className="flex items-center gap-2 shrink-0">
                      {b.emailSent && (
                        <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-pine/5 text-pine border border-pine/15">
                          <Mail className="w-3 h-3"/>Email sent
                        </span>
                      )}
                      {b.dismissalCount > 0 && (
                        <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-paper text-ink-muted border border-line">
                          <Users className="w-3 h-3"/>{b.dismissalCount} dismissed
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-ink-soft whitespace-pre-line line-clamp-3 mb-3">{b.body}</div>
                  <div className="text-xs text-ink-muted">{fmtDate(b.createdAt)} · by {b.sentByName}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
