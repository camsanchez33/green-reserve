'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, Mail, Users, RefreshCw, Send } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface Broadcast {
  id: string; title: string; body: string; emailSent: boolean;
  sentByName: string; createdAt: string; dismissalCount: number;
}

const iCls = 'w-full bg-gray-800/80 border border-gray-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 placeholder-gray-600 transition-colors';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function BroadcastsPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ emailCount?: number; error?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, bRes] = await Promise.all([
        fetch('/api/admin/session'),
        fetch('/api/admin/broadcasts'),
      ]);
      if (!sRes.ok) { router.push('/admin/login'); return; }
      const list = await bRes.json();
      setBroadcasts(Array.isArray(list) ? list : []);
      setAdminReady(true);
    } catch { router.push('/admin/login'); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

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
      setTitle(''); setBody(''); setSendEmail(false);
      load();
    } catch { setSendResult({ error: 'Network error' }); }
    finally { setSending(false); }
  }

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar active="broadcasts" />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-4xl">
          <div className="flex items-center justify-between mb-7">
            <div>
              <h1 className="text-2xl font-black text-white">Broadcasts</h1>
              <div className="text-sm text-gray-500 mt-0.5">Send a message to every course operator</div>
            </div>
            <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors">
              <RefreshCw className="w-4 h-4"/>Refresh
            </button>
          </div>

          {/* Compose */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-7">
            <div className="flex items-center gap-2 mb-4">
              <Radio className="w-4 h-4 text-emerald-500"/>
              <span className="text-sm font-bold text-white">New broadcast</span>
            </div>
            {sendResult && (
              <div className={`rounded-lg px-4 py-3 text-sm mb-4 border ${sendResult.error ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                {sendResult.error
                  ? `Error: ${sendResult.error}`
                  : `Broadcast sent${sendResult.emailCount ? ` · ${sendResult.emailCount} email${sendResult.emailCount !== 1 ? 's' : ''} delivered` : ''}`}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className={iCls} placeholder="Maintenance window this weekend"/>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Message *</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} className={iCls + ' resize-none'} placeholder="Write your message here. Separate paragraphs with blank lines."/>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className={'relative w-9 h-5 rounded-full transition-colors cursor-pointer ' + (sendEmail ? 'bg-emerald-600' : 'bg-gray-700')} onClick={() => setSendEmail(v => !v)}>
                    <div className={'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ' + (sendEmail ? 'translate-x-4' : 'translate-x-0.5')}/>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-gray-500"/>Also send as email
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">Sends to every operator with an active course</div>
                  </div>
                </label>
                <button
                  onClick={sendBroadcast}
                  disabled={sending || !title.trim() || !body.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-lg text-sm transition-colors"
                >
                  <Send className="w-4 h-4"/>
                  {sending ? 'Sending...' : 'Send broadcast'}
                </button>
              </div>
            </div>
          </div>

          {/* History */}
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">History</div>
            {loading && <div className="text-gray-600 text-sm py-8 text-center">Loading...</div>}
            {!loading && broadcasts.length === 0 && (
              <div className="text-gray-700 text-sm py-12 text-center bg-gray-900 border border-gray-800 rounded-lg">
                No broadcasts yet
              </div>
            )}
            <div className="space-y-3">
              {broadcasts.map(b => (
                <div key={b.id} className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="font-bold text-white">{b.title}</div>
                    <div className="flex items-center gap-2 shrink-0">
                      {b.emailSent && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <Mail className="w-3 h-3"/>Email sent
                        </span>
                      )}
                      {b.dismissalCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">
                          <Users className="w-3 h-3"/>{b.dismissalCount} dismissed
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-400 whitespace-pre-line line-clamp-3 mb-3">{b.body}</div>
                  <div className="text-xs text-gray-600">{fmtDate(b.createdAt)} · by {b.sentByName}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
