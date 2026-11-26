'use client';
// ASSIST-5 (Cam 2026-11-24; mockup lanes/build/ai-assistant-mockup.html "Homepage bot"): "Questions?" at the bottom
// right of greenreserve.app — a panel on desktop, a sheet on a phone. Answers about GreenReserve only, in plain text
// (never HTML, never links), and always offers Book a call (the #demo section below). Renders nothing until
// GET /api/assistant/homepage says it is on.
import { useEffect, useRef, useState } from 'react';

type Turn = { role: 'user' | 'assistant'; content: string; pending?: boolean; error?: boolean };

export default function HomeAsk() {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/assistant/homepage', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (!cancelled && d?.enabled) setOn(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [turns]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history = [...turns.filter(t => !t.pending && !t.error), { role: 'user' as const, content: question }];
    setTurns([...history, { role: 'assistant', content: '', pending: true }]);
    setInput(''); setBusy(true);
    try {
      const r = await fetch('/api/assistant/homepage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      const d = await r.json().catch(() => ({}));
      setTurns([...history, typeof d?.reply === 'string' ? { role: 'assistant', content: d.reply } : { role: 'assistant', content: typeof d?.error === 'string' ? d.error : 'Something went wrong. Book a call and we’ll answer it.', error: true }]);
    } catch {
      setTurns([...history, { role: 'assistant', content: 'Something went wrong. Book a call and we’ll answer it.', error: true }]);
    } finally { setBusy(false); }
  }

  if (!on) return null;
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 min-h-[44px] rounded-full bg-pine px-5 text-[15px] font-semibold text-white shadow-sm hover:bg-pine-hover">
          Questions?
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Ask about GreenReserve"
          className="fixed z-50 inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[380px] max-h-[min(560px,85vh)] flex flex-col rounded-t-[14px] sm:rounded-[14px] border border-line bg-white text-ink shadow-lg">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
            <h2 className="min-w-0 flex-1 text-[15px] font-semibold">Ask about GreenReserve</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 -mr-2 flex items-center justify-center text-[20px] leading-none text-ink-muted hover:text-ink">×</button>
          </div>
          <div ref={listRef} aria-live="polite" className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-[140px]">
            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={'max-w-[88%] whitespace-pre-wrap rounded-[10px] px-3 py-2 text-[14px] leading-relaxed ' + (t.role === 'user' ? 'bg-pine text-white' : t.error ? 'bg-paper text-bad' : 'bg-paper text-ink')}>
                  {t.pending ? <span className="text-ink-muted">…</span> : t.content}
                </div>
              </div>
            ))}
          </div>
          <form className="flex items-center gap-2 px-3 py-3 border-t border-line" onSubmit={e => { e.preventDefault(); ask(input); }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} maxLength={500} disabled={busy} aria-label="Ask about GreenReserve"
              className="flex-1 min-w-0 min-h-[40px] rounded-[10px] border border-line bg-paper px-3 text-[14px] focus:outline-none focus:border-pine/40" />
            <button type="submit" disabled={busy || !input.trim()} className="min-h-[40px] rounded-[10px] bg-pine px-4 text-[14px] font-semibold text-white disabled:opacity-50">Ask</button>
          </form>
          <div className="flex items-center gap-3 px-4 pb-3 text-[12px] text-ink-muted">
            <span className="flex-1">Answers about GreenReserve only. For a tee time, contact your course.</span>
            <a href="#demo" onClick={() => setOpen(false)} className="shrink-0 font-semibold !text-pine underline underline-offset-2">Book a call</a>
          </div>
        </div>
      )}
    </>
  );
}
