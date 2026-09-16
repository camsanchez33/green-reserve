'use client';
// BIRDIE_AI_SPEC B1 — the floating Birdie button and chat panel for the
// operator dashboard. Renders nothing until GET /api/birdie/chat says the
// assistant is on. Replies stream in; links the model writes as
// [Open Schedule](/dashboard/schedules) become deep-link buttons.
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X, Send, ArrowRight } from 'lucide-react';

type Turn = { role: 'user' | 'assistant'; content: string; pending?: boolean; error?: boolean };
type Meta = { enabled: boolean; greeting: string; chips: string[]; helpsWith: string };

const CLOSED_KEY = 'birdie:closed';
const iCls = 'flex-1 min-w-0 bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10 focus:outline-none transition-colors';

// Only same-origin dashboard paths become links; anything else stays text.
const LINK_RE = /\[([^\]]+)\]\((\/dashboard[^)\s]*)\)/g;
function renderReply(text: string) {
  const parts: React.ReactNode[] = [];
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text))) {
    if (m.index > last) parts.push(<span key={`t${i++}`}>{text.slice(last, m.index)}</span>);
    parts.push(
      <Link key={`l${i++}`} href={m[2]} className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-pine border border-pine/30 hover:bg-pine/5 rounded-md px-2.5 py-1 transition-colors">
        {m[1]} <ArrowRight className="w-3 h-3" />
      </Link>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={`t${i++}`}>{text.slice(last)}</span>);
  return parts;
}

export default function BirdieWidget() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/birdie/chat', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Meta | null) => { if (!cancelled && d && d.enabled) setMeta(d); })
      .catch(() => { /* no Birdie is a valid state; nothing to show */ });
    try { if (localStorage.getItem(CLOSED_KEY) !== '1') setOpen(false); } catch { /* storage unavailable */ }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [turns, open]);

  const close = () => { setOpen(false); try { localStorage.setItem(CLOSED_KEY, '1'); } catch { /* ignore */ } };
  const show = () => { setOpen(true); try { localStorage.removeItem(CLOSED_KEY); } catch { /* ignore */ } };

  const ask = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    const history = [...turns.filter(t => !t.error && !t.pending), { role: 'user' as const, content: q }];
    setTurns([...history, { role: 'assistant', content: '', pending: true }]);
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const r = await fetch('/api/birdie/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(t => ({ role: t.role, content: t.content })) }),
        signal: ac.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        setTurns([...history, { role: 'assistant', content: String(d.error || `Birdie could not answer (${r.status}).`), error: true }]);
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const snapshot = acc;
        setTurns([...history, { role: 'assistant', content: snapshot, pending: true }]);
      }
      setTurns([...history, { role: 'assistant', content: acc || "…I didn't get a reply. Ask again?" , error: !acc }]);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      setTurns([...history, { role: 'assistant', content: 'Network error — Birdie could not answer. Check your connection and try again.', error: true }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, turns]);

  if (!meta) return null;

  return (
    <>
      {!open && (
        <button type="button" onClick={show} aria-label="Ask Birdie"
          className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-white border border-line hover:border-pine/40 transition-colors flex items-center justify-center"
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
          <Image src="/brand/birdie-head.png" alt="" width={36} height={36} className="w-9 h-9" />
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Birdie" className="fixed bottom-5 right-5 z-40 w-[min(380px,calc(100vw-2rem))] max-h-[min(600px,calc(100vh-2.5rem))] bg-white border border-line rounded-lg flex flex-col" style={{ boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
            <Image src="/brand/birdie-head.png" alt="" width={28} height={28} className="w-7 h-7" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink leading-tight">Birdie</div>
              <div className="text-[11px] text-ink-muted truncate">Can help with {meta.helpsWith}</div>
            </div>
            <button type="button" onClick={close} aria-label="Close" className="ml-auto text-ink-muted hover:text-ink transition-colors"><X className="w-4 h-4" /></button>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]">
            <div className="text-sm text-ink-soft">{meta.greeting}</div>
            {turns.length === 0 && (
              <div className="flex flex-wrap gap-1.5">
                {meta.chips.map(c => (
                  <button key={c} type="button" onClick={() => ask(c)} className="text-xs text-ink border border-line hover:border-pine/40 hover:bg-paper rounded-md px-2.5 py-1.5 transition-colors text-left">{c}</button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={'max-w-[88%] text-sm whitespace-pre-wrap leading-relaxed rounded-md px-3 py-2 ' + (t.role === 'user' ? 'bg-pine text-white' : t.error ? 'bg-bad/5 border border-bad/20 text-bad' : 'bg-paper text-ink')}>
                  {t.role === 'assistant' && !t.content && t.pending ? <span className="text-ink-faint">Birdie is thinking…</span> : t.role === 'assistant' ? renderReply(t.content) : t.content}
                </div>
              </div>
            ))}
          </div>
          <form className="flex items-center gap-2 px-3 py-3 border-t border-line" onSubmit={e => { e.preventDefault(); ask(input); }}>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask how to do something…" className={iCls} maxLength={1500} disabled={busy} aria-label="Message Birdie" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="w-9 h-9 flex items-center justify-center rounded-md bg-pine hover:bg-pine-hover disabled:opacity-50 text-white transition-colors"><Send className="w-4 h-4" /></button>
          </form>
        </div>
      )}
    </>
  );
}
