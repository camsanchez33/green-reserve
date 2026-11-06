'use client';
// MSG-1 (PLATFORM_ROADMAP_SPEC §5): message the golfers booked on a day, from the tee sheet.
// MSG-2 (Cam 2026-11-06, "do they want to send emails or text messages or how … what is it for"):
// pick who (the day or a window), how (Email · Text · Both — texts only reach numbers that agreed,
// SMS-1), start from a ready-made message or write one, let the assistant tidy it, see exactly the
// email and the text the golfer gets, and who it won't reach (to call). Nothing is sent before Send;
// the result says how many went by email and text and who couldn't be reached.
import { useCallback, useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { dfetch } from '@/lib/dashboard-fetch';
import { formatTeeDay, formatTeeTime } from '@/lib/format';
import { INPUT } from '@/components/ui/field';
import { READY, BLANK } from '@/lib/notice-templates';

type Via = 'email' | 'text' | 'both';
type Reach = { golfers: number; email: number; sms: number; unreachable: number; noEmail?: number };
type Recent = { id: string; date: string; fromTime: string | null; toTime: string | null; body: string; sentEmail: number; sentSms: number; failed: number; createdAt: string };
type Info = { reach: Reach; smsAvailable: boolean; smsMaxChars: number; recent: Recent[]; toCall: { name: string; teeTime: string; phone?: string }[]; draftAvailable: boolean };
type Result = { ok: boolean; sentEmail: number; sentSms: number; failed: { name: string; how: string; error: string }[]; unreachable: number };
const MAX = 600;


export default function GolferMessageModal({ date, onClose }: { date: string; onClose: () => void }) {
  const [whole, setWhole] = useState(true);
  const [from, setFrom] = useState('07:00');
  const [to, setTo] = useState('10:00');
  const [via, setVia] = useState<Via>('email');
  const [body, setBody] = useState('');
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftErr, setDraftErr] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [previewErr, setPreviewErr] = useState('');
  const [show, setShow] = useState<'email' | 'text'>('email');

  const qs = new URLSearchParams({ date, via, ...(whole ? {} : { from, to }) }).toString();
  const load = useCallback(async () => {
    setLoadErr('');
    const r = await dfetch<Info>(`/api/operator/golfer-messages?${qs}`);
    if (r.ok && r.data) setInfo(r.data); else setLoadErr(r.error);
  }, [qs]);
  useEffect(() => { load(); }, [load]);

  // The email and the text exactly as they go out, refreshed as they type.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await dfetch<{ subject: string; html: string; text: string }>('/api/operator/golfer-messages', {
        method: 'POST', body: JSON.stringify({ date, ...(whole ? {} : { from, to }), body, preview: true }),
      });
      if (!live) return;
      if (r.ok && r.data) { setPreview(r.data); setPreviewErr(''); } else { setPreview(null); setPreviewErr(r.error || 'Couldn’t show what they get.'); }
    }, 500);
    return () => { live = false; clearTimeout(t); };
  }, [body, date, whole, from, to]);

  const texting = !!info?.smsAvailable && via !== 'email';
  useEffect(() => { if (via !== 'email') setShow('text'); else setShow('email'); }, [via]);

  const send = async () => {
    setSending(true); setSendErr('');
    const r = await dfetch<Result>('/api/operator/golfer-messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, ...(whole ? {} : { from, to }), body, via }),
    });
    setSending(false);
    if (r.ok && r.data) { setResult(r.data); return; }
    // A dropped or timed-out request may have sent some messages already — never coach a blind resend.
    if (r.status === 0 || r.status >= 500) { setSendErr('The send may have partly gone out. Check “Recently sent” below (refresh it with Retry) before sending again.'); load(); return; }
    setSendErr(r.error);
  };

  const helpWrite = async () => {
    setDrafting(true); setDraftErr('');
    const r = await dfetch<{ text: string }>('/api/operator/golfer-messages/draft', { method: 'POST', body: JSON.stringify({ body, forText: texting }) });
    setDrafting(false);
    if (r.ok && r.data) setBody(r.data.text); else setDraftErr(r.error);
  };

  const room = texting ? info!.smsMaxChars : MAX;
  const tooLong = body.length > room;
  const blanks = BLANK.test(body);
  const reachable = info ? info.reach.email + info.reach.sms : 0;
  const channelWord = via === 'email' ? 'by email' : via === 'text' ? 'by text' : 'by email and text';
  const sendLabel = sending ? 'Sending…' : !info ? 'Send' : `Send to ${reachable} golfer${reachable === 1 ? '' : 's'} ${channelWord}`;

  return (
    <div className="fixed inset-0 bg-ink/20 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-xl rounded-t-lg sm:rounded-lg shadow-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif font-semibold text-ink text-[17px]">Message golfers — {formatTeeDay(date)}</h3>
          <button onClick={onClose} disabled={sending} className="text-ink-muted hover:text-ink disabled:opacity-40" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {result ? (
          <div className="text-[13.5px] text-ink space-y-2">
            <p>Sent{[result.sentEmail || via !== 'text' ? ` ${result.sentEmail} by email` : '', result.sentSms || via !== 'email' ? ` ${result.sentSms} by text` : ''].filter(Boolean).join(' and')}.</p>
            {result.unreachable > 0 && <p className="text-ink-soft">{result.unreachable === 1 ? '1 golfer' : `${result.unreachable} golfers`} couldn’t be reached {channelWord} — let them know at the counter.</p>}
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
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div>
                <span className="block text-[12.5px] text-ink-muted mb-1.5">Who</span>
                <div className="grid grid-cols-2 gap-1 p-1 bg-paper rounded-md" role="radiogroup" aria-label="Who">
                  {([[true, 'Whole day'], [false, 'A window']] as const).map(([v, l]) => (
                    <button key={l} type="button" role="radio" aria-checked={whole === v} onClick={() => setWhole(v)}
                      className={'py-1.5 rounded-md text-[13px] font-semibold transition-colors ' + (whole === v ? 'bg-white text-ink shadow-card' : 'text-ink-muted hover:text-ink')}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-[12.5px] text-ink-muted mb-1.5">How</span>
                <div className="grid grid-cols-3 gap-1 p-1 bg-paper rounded-md" role="radiogroup" aria-label="How">
                  {([['email', 'Email'], ['text', 'Text'], ['both', 'Both']] as const).map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={via === v} disabled={v !== 'email' && !info?.smsAvailable} onClick={() => setVia(v)}
                      className={'py-1.5 rounded-md text-[13px] font-semibold transition-colors disabled:opacity-40 ' + (via === v ? 'bg-white text-ink shadow-card' : 'text-ink-muted hover:text-ink')}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
            {info && !info.smsAvailable && <p className="text-[12px] text-ink-muted -mt-2 mb-3 text-right">Texts turn on once approved</p>}
            {!whole && (
              <div className="flex items-center gap-2 mb-4 text-[13px]">
                <label className="sr-only" htmlFor="msg-from">From</label>
                <input id="msg-from" type="time" value={from} onChange={e => setFrom(e.target.value)} className={INPUT + ' flex-1'} />
                <span className="text-ink-muted">to</span>
                <label className="sr-only" htmlFor="msg-to">To</label>
                <input id="msg-to" type="time" value={to} onChange={e => setTo(e.target.value)} className={INPUT + ' flex-1'} />
              </div>
            )}

            <span className="block text-[12.5px] text-ink-muted mb-1.5">Start from</span>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {READY.map(m => (
                <button key={m.label} type="button" onClick={() => setBody(m.body)}
                  className="px-2.5 py-1 rounded-md border border-line text-[12.5px] text-ink-soft hover:border-line-strong hover:text-ink transition-colors">{m.label}</button>
              ))}
            </div>
            <div className="flex items-end justify-between mb-1">
              <label className="block text-[13px] font-medium text-ink" htmlFor="msg-body">Message</label>
              {info?.draftAvailable && (
                <button type="button" onClick={helpWrite} disabled={drafting || body.trim().length < 3}
                  className="text-[12.5px] font-medium text-pine hover:underline underline-offset-4 disabled:opacity-40 disabled:no-underline">{drafting ? 'Tidying…' : 'Help me write it'}</button>
              )}
            </div>
            <textarea id="msg-body" rows={4} maxLength={MAX} value={body} onChange={e => setBody(e.target.value)}
              placeholder="Your message" className={INPUT + ' w-full resize-y'} />
            <div className="flex justify-between gap-3 text-[11.5px] mb-3">
              <span className={draftErr || previewErr ? 'text-bad' : blanks ? 'text-warn' : 'text-ink-muted'}>{draftErr || (previewErr && body.trim() ? previewErr : '') || (blanks ? 'Fill in the [brackets] before sending' : '')}</span>
              <span className={'tabular-nums ' + (tooLong ? 'text-bad' : 'text-ink-muted')}>{body.length}/{room}{texting ? ' · a text' : ''}</span>
            </div>

            {preview && body.trim() && (
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-1.5 text-[12.5px]">
                  <span className="text-ink-muted">What they get</span>
                  {via !== 'text' && <button type="button" onClick={() => setShow('email')} aria-pressed={show === 'email'} className={'font-medium border-b-2 ' + (show === 'email' ? 'text-ink border-pine' : 'text-ink-muted border-transparent hover:text-ink')}>Email</button>}
                  {via !== 'email' && <button type="button" onClick={() => setShow('text')} aria-pressed={show === 'text'} className={'font-medium border-b-2 ' + (show === 'text' ? 'text-ink border-pine' : 'text-ink-muted border-transparent hover:text-ink')}>Text</button>}
                </div>
                {show === 'email' && via !== 'text' ? (
                  <div className="rounded-md bg-paper/70 overflow-hidden op-keep-light">
                    <p className="px-3 py-2 text-[12.5px] text-ink truncate"><span className="text-ink-muted">Subject</span> {preview.subject}</p>
                    {/* The real email, sandboxed: no scripts, no forms, no pop-ups. */}
                    <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="w-full h-72 bg-white border-0" />
                  </div>
                ) : (
                  <div className="rounded-md bg-paper/70 px-3 py-3">
                    <p className="max-w-[85%] rounded-lg bg-white shadow-card px-3 py-2 text-[13px] text-ink whitespace-pre-wrap">{preview.text}</p>
                  </div>
                )}
              </div>
            )}

            {loadErr && <p className="text-[13px] text-bad mb-3">{loadErr} <button onClick={load} className="underline font-medium">Retry</button></p>}
            {!info && !loadErr && <div className="py-2 text-center text-ink-muted"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
            {info && (
              <div className="mb-3 text-[13px]">
                <p className="text-ink">{info.reach.golfers === 0 ? `Nobody is booked ${whole ? 'that day' : 'in that window'}.`
                  : <><b>{info.reach.golfers} golfer{info.reach.golfers === 1 ? '' : 's'}</b>{via !== 'text' && ` · ${info.reach.email} by email`}{via !== 'email' && ` · ${info.reach.sms} by text`}</>}</p>
                {info.toCall.length > 0 && (
                  <div className="mt-2">
                    <p className="text-warn font-medium mb-1">{info.reach.unreachable} to call</p>
                    <ul className="divide-y divide-line-soft border-y border-line-soft max-h-32 overflow-y-auto">
                      {info.toCall.map((c, i) => <li key={i} className="flex justify-between gap-3 py-1"><span className="text-ink">{c.name}</span><span className="text-ink-soft tabular-nums">{formatTeeTime(c.teeTime)}{c.phone ? ` · ${c.phone}` : ''}</span></li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {sendErr && <p className="text-[13px] text-bad mb-3">{sendErr}</p>}
            <div className="flex gap-2">
              <button onClick={onClose} disabled={sending} className="flex-1 py-2.5 rounded-md border border-line text-[13.5px] font-medium text-ink hover:bg-paper disabled:opacity-50">Cancel</button>
              <button onClick={send} disabled={sending || !info || info.reach.golfers === 0 || reachable === 0 || body.trim().length < 3 || tooLong || blanks}
                className="flex-[2] py-2.5 rounded-md bg-pine hover:bg-pine-hover text-white text-[13.5px] font-semibold disabled:opacity-50">{sendLabel}</button>
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
