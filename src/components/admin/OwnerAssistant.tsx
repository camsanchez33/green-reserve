'use client';
// ASSIST-4 (Cam 2026-11-24; mockup lanes/build/ai-assistant-mockup.html "Admin assistant"): the owner's "Ask" on the
// admin Overview. Owner only (the route refuses everyone else, and this renders nothing until its GET says so) and
// read-only: it knows the docs Cam marked and reads course-level live numbers. Replies are plain text; the only
// links it renders are /admin/courses/<id> paths a tool gave.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Turn = { role: 'user' | 'assistant'; content: string; pending?: boolean; error?: boolean };
type Knows = { sections: { key: string; label: string; count: string }[] };

const LINK_RE = /\[([^\]]+)\]\((\/admin\/courses\/[A-Za-z0-9_-]+)\)/g;
function render(text: string) {
  const out: React.ReactNode[] = []; let last = 0; let m: RegExpExecArray | null; let i = 0;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text))) {
    if (m.index > last) out.push(<span key={i++}>{text.slice(last, m.index)}</span>);
    out.push(<Link key={i++} href={m[2]} className="underline underline-offset-2">{m[1]}</Link>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<span key={i++}>{text.slice(last)}</span>);
  return out;
}

export default function OwnerAssistant() {
  const [knows, setKnows] = useState<Knows | null>(null);
  const [open, setOpen] = useState(false);
  const [showKnows, setShowKnows] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/assistant', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (!cancelled && d?.enabled && d.knows) setKnows(d.knows); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [turns]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history = [...turns.filter(t => !t.pending && !t.error), { role: 'user' as const, content: question }];
    setTurns([...history, { role: 'assistant', content: '', pending: true }]);
    setInput(''); setBusy(true);
    try {
      const r = await fetch('/api/admin/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      const d = await r.json().catch(() => ({}));
      setTurns([...history, typeof d?.reply === 'string' ? { role: 'assistant', content: d.reply } : { role: 'assistant', content: typeof d?.error === 'string' ? d.error : 'Couldn’t answer just now.', error: true }]);
    } catch {
      setTurns([...history, { role: 'assistant', content: 'Couldn’t answer just now.', error: true }]);
    } finally { setBusy(false); }
  }

  if (!knows) return null;
  const n = (k: string) => knows.sections.find(s => s.key === k)?.count ?? '0';
  const panel = { background: 'var(--g-panel-solid)', borderColor: 'var(--g-line)', color: 'var(--g-ink)' };
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-40 min-h-[44px] rounded-full border px-5 text-[14px] font-semibold" style={panel}>Ask</button>
      )}
      {open && (
        <div role="dialog" aria-label="Ask" className="fixed z-50 inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[400px] max-h-[min(600px,85vh)] flex flex-col rounded-t-[14px] sm:rounded-[14px] border shadow-lg" style={panel}>
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--g-line)' }}>
            <h2 className="text-[15px] font-semibold">Ask</h2>
            <span className="text-[12px]" style={{ color: 'var(--g-muted)' }}>Owner only</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="ml-auto w-9 h-9 -mr-2 flex items-center justify-center text-[20px] leading-none" style={{ color: 'var(--g-muted)' }}>×</button>
          </div>
          <div className="px-4 py-2 border-b text-[12px]" style={{ borderColor: 'var(--g-line)', color: 'var(--g-muted)' }}>
            <div className="flex items-start gap-2">
              <span className="flex-1">Knows {n('runbooks')} runbook{n('runbooks') === '1' ? '' : 's'} and {n('company')} company doc{n('company') === '1' ? '' : 's'} you marked, and reads live platform numbers. Never changes anything.</span>
              <button type="button" onClick={() => setShowKnows(v => !v)} aria-expanded={showKnows} className="shrink-0 font-medium underline underline-offset-2" style={{ color: 'var(--g-ink)' }}>What it knows</button>
            </div>
            {showKnows && (
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                {knows.sections.map(s => <div key={s.key} className="contents"><dt style={{ color: 'var(--g-ink)' }}>{s.label}</dt><dd className="text-right">{s.count}</dd></div>)}
              </dl>
            )}
          </div>
          <div ref={listRef} aria-live="polite" className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-[140px]">
            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[88%] whitespace-pre-wrap rounded-[10px] px-3 py-2 text-[14px] leading-relaxed" style={{ background: 'var(--g-hover)', color: t.error ? 'var(--g-down)' : 'var(--g-ink)' }}>
                  {t.pending ? '…' : t.role === 'assistant' ? render(t.content) : t.content}
                </div>
              </div>
            ))}
          </div>
          <form className="flex items-center gap-2 px-3 py-3 border-t" style={{ borderColor: 'var(--g-line)' }} onSubmit={e => { e.preventDefault(); ask(input); }}>
            <input value={input} onChange={e => setInput(e.target.value)} maxLength={1500} disabled={busy} aria-label="Ask"
              className="flex-1 min-w-0 min-h-[40px] rounded-[10px] border bg-transparent px-3 text-[14px] focus:outline-none" style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }} />
            <button type="submit" disabled={busy || !input.trim()} className="min-h-[40px] rounded-[10px] border px-4 text-[14px] font-semibold disabled:opacity-50" style={{ borderColor: 'var(--g-line)', background: 'var(--g-active)', color: 'var(--g-ink)' }}>Ask</button>
          </form>
        </div>
      )}
    </>
  );
}
