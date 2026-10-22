'use client';
// AW-8a (Cam 2026-10-21: "the announcements thing should probably be its own
// thing"): Announcements left Messages for a page of its own. An announcement
// is one row shown on every live course's dashboard (and, if chosen, emailed
// to their owners) — never a message in a thread. The composer is owner-only
// (the API requires the owner session and says so); what was sent is readable
// by support+. Moved from admin/messages unchanged apart from headings.
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { ErrorBanner } from '@/components/ui/ErrorState';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { INPUT } from '@/components/ui/field';
import { formatDateTime as fmtDate } from '@/lib/format';

interface Broadcast {
  id: string; title: string; body: string; emailSent: boolean;
  sentByName: string; createdAt: string; dismissalCount: number;
}
interface SendOutcome {
  courses: number;
  emailRequested: boolean; emailRecipients: number; emailsSent: number; emailFailures: string[];
}

const iCls = `${INPUT} w-full`;

export default function AnnouncementsPage() {
  const isOwner = useAdminSession().role === 'owner';
  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="announcements" />
      <div className="admin-content flex-1 flex flex-col">
        <AnnouncementsPane isOwner={isOwner} />
      </div>
    </div>
  );
}

function AnnouncementsPane({ isOwner }: { isOwner: boolean }) {
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  // From the SAME filter the send uses — never a client-side guess.
  const [reach, setReach] = useState<{ courses: number; operators: number } | null>(null);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [sendErr, setSendErr] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  // MP-7b: send-test-to-self — emails only the signed-in admin, records nothing.
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState('');

  async function sendTest() {
    if (!title.trim() || !body.trim() || testing) return;
    setTesting(true); setTestNote(''); setSendErr(null);
    try {
      const res = await adminFetch<{ sentTo: string }>('/api/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), body: body.trim(), test: true }),
        subject: 'the test email',
        action: 'send',
      });
      if (!res.ok) { setSendErr({ msg: res.message, kind: res.kind }); return; }
      setTestNote(`Test sent to ${res.data.sentTo} — nobody else got it.`);
    } finally {
      setTesting(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<Broadcast[]>('/api/admin/broadcasts', { subject: 'announcements' });
    if (!res.ok) { setBroadcasts([]); setLoadError({ msg: res.message, kind: res.kind }); }
    else { setBroadcasts(res.data); setLoadError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    adminFetch<{ courses: number; operators: number }>('/api/admin/broadcasts?recipients=1', { subject: 'the recipient list' })
      .then(res => setReach(res.ok ? res.data : null));
  }, []);

  async function sendBroadcast() {
    if (!title.trim() || !body.trim() || sending) return;
    setSending(true); setOutcome(null); setSendErr(null);
    try {
      const res = await adminFetch<SendOutcome>('/api/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), body: body.trim(), sendEmail }),
        subject: 'this announcement',
        action: 'send',
      });
      if (!res.ok) { setSendErr({ msg: res.message, kind: res.kind }); return; }
      setOutcome(res.data);
      setTitle(''); setBody(''); setSendEmail(false); setReviewing(false);
      load();
    } finally {
      setSending(false);
    }
  }

  const outcomeBad = outcome && (outcome.emailFailures.length > 0 || (outcome.emailRequested && outcome.emailsSent === 0));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-8 py-7 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[30px] leading-none font-serif text-ink">Announcements</h1>
            <p className="text-sm text-ink-soft mt-0.5">
              Shown on every live course&apos;s dashboard{reach ? ` — ${reach.courses} course${reach.courses === 1 ? '' : 's'}, ${reach.operators} operator${reach.operators === 1 ? '' : 's'} right now` : ''}.
            </p>
          </div>
          <button onClick={load} aria-label="Refresh" className="w-9 h-9 flex items-center justify-center rounded-md border border-line text-ink-muted hover:text-ink hover:bg-white transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loadError && <ErrorBanner message={loadError.msg} kind={loadError.kind} onRetry={() => load()} />}

        {/* What actually happened — counted from results, never from the
            recipient list. */}
        {outcome && (
          <div className={'rounded-md px-4 py-3 text-sm mb-5 border ' + (outcomeBad ? 'bg-warn/5 border-warn/20 text-ink' : 'bg-ok/5 border-ok/20 text-ok')}>
            <div className="font-medium">
              Posted to {outcome.courses} course dashboard{outcome.courses === 1 ? '' : 's'}
              {outcome.emailRequested ? ` · ${outcome.emailsSent} of ${outcome.emailRecipients} email${outcome.emailRecipients === 1 ? '' : 's'} delivered to Resend` : ' · no email'}
            </div>
            {outcome.emailFailures.length > 0 && (
              <div className="text-xs text-bad mt-1">Email failed for: {outcome.emailFailures.join(', ')} — they still see it on their dashboard.</div>
            )}
          </div>
        )}

        {isOwner ? (
          <Card className="p-6 mb-7">
            <div className="flex items-center gap-2 mb-4">
              
              <span className="text-sm font-medium text-ink">{reviewing ? 'Review before sending' : 'New announcement'}</span>
              {reviewing && (
                <button onClick={() => setReviewing(false)} className="ml-auto text-xs text-ink-muted hover:text-ink transition-colors">Edit</button>
              )}
            </div>
            {sendErr && <ErrorBanner message={sendErr.msg} kind={sendErr.kind} onDismiss={() => setSendErr(null)} />}

            {!reviewing ? (
              <div className="space-y-4">
                <div>
                  <label className="block"><span className="block text-[13px] font-semibold text-ink mb-1.5">Title</span>
                  <input value={title} onChange={e => setTitle(e.target.value)} className={iCls} placeholder="Maintenance window this weekend"/></label>
                </div>
                <div>
                  <label className="block"><span className="block text-[13px] font-semibold text-ink mb-1.5">Message</span>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} className={iCls + ' resize-none'} placeholder="Write your message here. Separate paragraphs with blank lines."/></label>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="w-4 h-4 accent-pine rounded" />
                    <div>
                      <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                        Also send as email
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5">
                        {reach ? `To ${reach.operators} operator${reach.operators === 1 ? '' : 's'} of live courses` : 'To every operator of a live course'}
                      </div>
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
                  <div className="text-[13px] font-semibold text-ink mb-2">Preview</div>
                  <div className="text-sm font-medium text-ink mb-2">{title}</div>
                  <div className="text-sm text-ink-soft whitespace-pre-line leading-relaxed">{body}</div>
                </div>
                <div className="text-xs text-ink-soft bg-pine/5 border border-pine/20 rounded-md px-3 py-2">
                  Shows on {reach ? `${reach.courses} course dashboard${reach.courses === 1 ? '' : 's'}` : 'every live course’s dashboard'}
                  {sendEmail ? ` and emails ${reach ? `${reach.operators} operator${reach.operators === 1 ? '' : 's'}` : 'their operators'}.` : '. No email.'}
                  {' '}This cannot be recalled.
                </div>
                {testNote && <div className="text-xs text-ok">{testNote}</div>}
                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    onClick={() => setReviewing(false)}
                    className="px-4 py-2.5 border border-line text-ink-soft hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors"
                  >
                    Back to edit
                  </button>
                  <button
                    onClick={sendTest}
                    disabled={testing || sending}
                    className="flex items-center gap-2 px-4 py-2.5 border border-line text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-40 rounded-md text-[12.5px] font-medium transition-colors"
                  >
                    {testing ? 'Sending test…' : 'Send test to me'}
                  </button>
                  <button
                    onClick={sendBroadcast}
                    disabled={sending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors"
                  >
                    
                    {sending ? 'Sending…' : 'Confirm & send'}
                  </button>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <div className="bg-paper border border-line rounded-lg px-5 py-4 mb-7 text-sm text-ink-soft">
            Only the owner can send an announcement. The history is below.
          </div>
        )}

        <div>
          <h2 className="text-[15px] font-semibold text-ink mb-3">Sent</h2>
          {loading && <div className="text-ink-muted text-sm py-8 text-center">Loading...</div>}
          {!loading && !loadError && broadcasts.length === 0 && (
            <Card className="text-ink-muted text-sm py-12 text-center">
              No announcements yet
            </Card>
          )}
          <div className="space-y-3">
            {broadcasts.map(b => (
              <Card key={b.id} className="p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="font-medium text-ink text-sm">{b.title}</div>
                  <div className="flex items-center gap-3 shrink-0">
                    {b.emailSent && <StatusDot status="ok" label="Emailed" />}
                    {b.dismissalCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-ink-muted">
                        {b.dismissalCount} dismissed
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-ink-soft whitespace-pre-line line-clamp-3 mb-3">{b.body}</div>
                <div className="text-xs text-ink-muted">{fmtDate(b.createdAt)} · by {b.sentByName}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
