'use client';
// ASSIST-6 (Cam 2026-11-24; mockup lanes/build/ai-assistant-mockup.html "Golfer bot"): "Questions about <Course>" on a
// course's booking page, in the course's own look (--g-* tokens), with no GreenReserve branding. Renders nothing until
// GET /api/assistant/golfer says the course turned golfer questions on. Answers are plain text — never HTML, never
// links — so nothing a reply says can run or send a golfer anywhere.
import { useEffect, useRef, useState } from 'react';

type Turn = { role: 'user' | 'assistant'; content: string; pending?: boolean; error?: boolean };
type Meta = { enabled: boolean; courseName: string; unknownLine: string };

export function GolferAsk({ slug }: { slug: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/assistant/golfer?course=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Meta | null) => { if (!cancelled && d?.enabled) setMeta(d); })
      .catch(() => { /* no bot is a valid state */ });
    return () => { cancelled = true; };
  }, [slug]);
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
    if (!question || busy || !meta) return;
    const history = [...turns.filter(t => !t.pending && !t.error), { role: 'user' as const, content: question }];
    setTurns([...history, { role: 'assistant', content: '', pending: true }]);
    setInput(''); setBusy(true);
    try {
      const r = await fetch('/api/assistant/golfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ course: slug, messages: history }) });
      const d = await r.json().catch(() => ({}));
      const reply = typeof d?.reply === 'string' ? d.reply : '';
      setTurns([...history, reply ? { role: 'assistant', content: reply } : { role: 'assistant', content: typeof d?.error === 'string' ? d.error : meta.unknownLine, error: true }]);
    } catch {
      setTurns([...history, { role: 'assistant', content: meta.unknownLine, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  if (!meta) return null;
  const title = `Questions about ${meta.courseName}`;

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 min-h-[44px] max-w-[calc(100vw-2rem)] truncate rounded-full px-4 text-[14px] font-semibold shadow-sm"
          style={{ background: 'var(--g-acc)', color: 'var(--g-on-acc)' }}>
          {title}
        </button>
      )}
      {open && (
        <div role="dialog" aria-label={title}
          className="fixed z-50 inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[380px] max-h-[min(560px,85vh)] flex flex-col rounded-t-[12px] sm:rounded-[12px] border shadow-lg"
          style={{ background: 'var(--g-card)', borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--g-line)' }}>
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 -mr-2 flex items-center justify-center text-[20px] leading-none" style={{ color: 'var(--g-muted)' }}>×</button>
          </div>
          <div ref={listRef} aria-live="polite" className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-[160px]">
            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[88%] whitespace-pre-wrap rounded-[10px] px-3 py-2 text-[14px] leading-relaxed"
                  style={t.role === 'user' ? { background: 'var(--g-acc)', color: 'var(--g-on-acc)' } : { background: 'var(--g-paper)', color: t.error ? 'var(--g-bad)' : 'var(--g-ink)' }}>
                  {t.pending ? <span style={{ color: 'var(--g-muted)' }}>…</span> : t.content}
                </div>
              </div>
            ))}
          </div>
          <form className="flex items-center gap-2 px-3 py-3 border-t" style={{ borderColor: 'var(--g-line)' }} onSubmit={e => { e.preventDefault(); ask(input); }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} maxLength={500} disabled={busy} aria-label="Your question"
              className="flex-1 min-w-0 min-h-[40px] rounded-[10px] border px-3 text-[14px] focus:outline-none"
              style={{ background: 'var(--g-paper)', borderColor: 'var(--g-line)', color: 'var(--g-ink)' }} />
            <button type="submit" disabled={busy || !input.trim()} className="min-h-[40px] rounded-[10px] px-4 text-[14px] font-semibold disabled:opacity-50"
              style={{ background: 'var(--g-acc)', color: 'var(--g-on-acc)' }}>Ask</button>
          </form>
          <p className="px-4 pb-3 text-[12px]" style={{ color: 'var(--g-muted)' }}>Answers come from {meta.courseName}&apos;s own information.</p>
        </div>
      )}
    </>
  );
}
