'use client';
// MSG-1 (PLATFORM_ROADMAP_SPEC §5): message the golfers booked on a day, from
// the tee sheet. Pick the whole day or a window, write the note, see exactly
// who it reaches, Send — then the result says how many went by email and text
// and who couldn't be reached. Nothing is sent before Send.
import { useCallback, useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { dfetch } from '@/lib/dashboard-fetch';
import { formatTeeDay, formatTeeTime } from '@/lib/format';
import { INPUT } from '@/components/ui/field';

type Reach = { golfers: number; email: number; sms: number; unreachable: number };
type Recent = { id: string; date: string; fromTime: string | null; toTime: string | null; body: string; sentEmail: number; sentSms: number; failed: number; createdAt: string };
type Result = { ok: boolean; sentEmail: number; sentSms: number; failed: { name: string; how: string; error: string }[]; unreachable: number };
const MAX = 600;

export default function GolferMessageModal({ date, onClose }: { date: string; onClose: () => void }) {
  const [whole, setWhole] = useState(true);
  const [from, setFrom] = useState('07:00');
  const [to, setTo] = useState('10:00');
  const [body, setBody] = useState('');
  const [sms, setSms] = useState(false);
  const [info, setInfo] = useState<{ reach: Reach; smsAvailable: boolean; recent: Recent[] } | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  const qs = new URLSearchParams({ date, ...(whole ? {} : { from, to }) }).toString();
  const load = useCallback(async () => {
    setLoadErr('');
    const r = await dfetch<{ reach: Reach; smsAvailable: boolean; recent: Recent[] }>(`/api/operator/golfer-messages?${qs}`);
    if (r.ok && r.data) setInfo(r.data); else setLoadErr(r.error);
  }, [qs]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    setSending(true); setSendErr('');
    const r = await dfetch<Result>('/api/operator/golfer-messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, ...(whole ? {} : { from, to }), body, sms }),
    });
    setSending(false);
    if (r.ok && r.data) setResult(r.data); else setSendErr(r.error);
  };

  const reachLine = info ? (info.reach.golfers === 0
    ? `Nobody is booked ${whole ? 'that day' : 'in that window'}.`
    : `${info.reach.golfers} golfer${info.reach.golfers === 1 ? '' : 's'} booked — ${info.reach.email} by email${info.smsAvailable && sms ? `, ${info.reach.sms} by text` : ''}.${info.reach.unreachable ? ` ${info.reach.unreachable} ha${info.reach.unreachable === 1 ? 's' : 've'} no email${info.smsAvailable ? ' or mobile' : ''} on file.` : ''}`) : '';

  return (
    <div className="fixed inset-0 bg-ink/20 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-lg sm:rounded-lg shadow-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-serif font-semibold text-ink text-[17px]">Message golfers — {formatTeeDay(date)}</h3>
          <button onClick={onClose} disabled={sending} className="text-ink-muted hover:text-ink disabled:opacity-40" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {result ? (
          <div className="mt-3 text-[13.5px] text-ink space-y-2">
            <p>Sent to {result.sentEmail} by email{result.sentSms ? ` and ${result.sentSms} by text` : ''}.</p>
            {result.unreachable > 0 && <p className="text-ink-soft">{result.unreachable === 1 ? '1 golfer has' : `${result.unreachable} golfers have`} no email{result.sentSms ? ' or mobile' : ''} on file — let them know at the counter.</p>}
            {result.failed.length > 0 && (
              <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad">
                <p className="font-medium">{result.failed.length} didn’t go through:</p>
                <ul className="mt-1 space-y-0.5">{result.failed.slice(0, 8).map((f, i) => <li key={i}>{f.name} ({f.how}) — {f.error}</li>)}</ul>
              </div>
            )}
            <button onClick={onClose} className="mt-2 w-full py-2.5 rounded-md bg-pine hover:bg-pine-hover text-white text-[13.5px] font-semibold">Done</button>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-ink-soft mb-4">Goes to everyone booked {whole ? 'that day' : 'in the window'}. Replies come to your email.</p>
            <div className="grid grid-cols-2 gap-1 p-1 bg-paper rounded-md mb-3" role="tablist">
              {([[true, 'Whole day'], [false, 'A window']] as const).map(([v, l]) => (
                <button key={l} role="tab" aria-selected={whole === v} onClick={() => setWhole(v)}
                  className={'py-1.5 rounded-md text-[13px] font-semibold transition-colors ' + (whole === v ? 'bg-white text-ink shadow-card' : 'text-ink-muted hover:text-ink')}>{l}</button>
              ))}
            </div>
            {!whole && (
              <div className="flex items-center gap-2 mb-3 text-[13px]">
                <label className="sr-only" htmlFor="msg-from">From</label>
                <input id="msg-from" type="time" value={from} onChange={e => setFrom(e.target.value)} className={INPUT + ' flex-1'} />
                <span className="text-ink-muted">to</span>
                <label className="sr-only" htmlFor="msg-to">To</label>
                <input id="msg-to" type="time" value={to} onChange={e => setTo(e.target.value)} className={INPUT + ' flex-1'} />
              </div>
            )}
            <label className="block text-[13px] font-medium text-ink mb-1" htmlFor="msg-body">Message</label>
            <textarea id="msg-body" rows={4} maxLength={MAX} value={body} onChange={e => setBody(e.target.value)}
              placeholder="Frost delay this morning — first tee is now 9:00. Your time moves back by the same amount."
              className={INPUT + ' w-full resize-y'} />
            <div className="text-right text-[11.5px] text-ink-muted mb-2">{body.length}/{MAX}</div>
            {info?.smsAvailable && (
              <label className="flex items-center gap-2 text-[13px] text-ink mb-3 cursor-pointer">
                <input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)} className="accent-pine" /> Also text golfers with a mobile number
              </label>
            )}
            {loadErr && <p className="text-[13px] text-bad mb-3">{loadErr} <button onClick={load} className="underline font-medium">Retry</button></p>}
            {!info && !loadErr && <div className="py-2 text-center text-ink-muted"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
            {info && <p className="text-[13px] text-ink mb-3">{reachLine}</p>}
            {sendErr && <p className="text-[13px] text-bad mb-3">{sendErr}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} disabled={sending} className="flex-1 py-2.5 rounded-md border border-line text-[13.5px] font-medium text-ink hover:bg-paper disabled:opacity-50">Cancel</button>
              <button onClick={send} disabled={sending || !info || info.reach.golfers === 0 || body.trim().length < 3}
                className="flex-1 py-2.5 rounded-md bg-pine hover:bg-pine-hover text-white text-[13.5px] font-semibold disabled:opacity-50">
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
            {info && info.recent.length > 0 && (
              <div className="mt-5 pt-4 border-t border-line">
                <h4 className="text-[13px] font-semibold text-ink mb-2">Recently sent</h4>
                <ul className="space-y-2">
                  {info.recent.map(m => (
                    <li key={m.id} className="text-[12.5px]">
                      <span className="text-ink-muted">{formatTeeDay(m.date)}{m.fromTime ? ` ${formatTeeTime(m.fromTime)}–${formatTeeTime(m.toTime ?? m.fromTime)}` : ''} · {m.sentEmail} email{m.sentSms ? ` · ${m.sentSms} text` : ''}{m.failed ? ` · ${m.failed} failed` : ''}</span>
                      <p className="text-ink truncate">{m.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
