'use client';
// ASSIST-1 (Cam 2026-11-24; lanes/build.md "AI assistant overhaul" item 5; mockup lanes/build/ai-assistant-mockup.html,
// "Golfer bot"): "Questions about <Course>" on the course's booking page. Course look only: no GreenReserve or
// assistant branding. Shown only when the server says the course turned golfer questions on (page.tsx passes the
// meta). Answers stream in as plain text; nothing here books, cancels or pays — the box can only ask
// /api/courses/<slug>/questions, which has no tools.
import { useCallback, useEffect, useRef, useState } from 'react';
import g from './golfer.module.css';

export type QuestionsMeta = { courseName: string; greeting: string; chips: string[]; footer: string };
type Turn = { role: 'user' | 'assistant'; content: string; pending?: boolean; error?: boolean };

const MAX_CHARS = 500; // lib/assistant/golfer GOLFER_MAX_CHARS

export default function CourseQuestions({ slug, meta }: { slug: string; meta: QuestionsMeta }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const close = useCallback(() => { setOpen(false); abortRef.current?.abort(); setTimeout(() => launchRef.current?.focus(), 0); }, []);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [turns, open]);

  const ask = useCallback(async (text: string) => {
    const q = text.trim().slice(0, MAX_CHARS);
    if (!q || busy) return;
    setInput('');
    const history = [...turns.filter(t => !t.error && !t.pending), { role: 'user' as const, content: q }];
    setTurns([...history, { role: 'assistant', content: '', pending: true }]);
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const r = await fetch(`/api/courses/${encodeURIComponent(slug)}/questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(t => ({ role: t.role, content: t.content })) }), signal: ac.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        setTurns([...history, { role: 'assistant', content: String(d.error || 'I can’t answer right now. Please call the pro shop.'), error: true }]);
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let acc = ''; let buf = '';
      const apply = (line: string) => {
        if (!line.trim()) return;
        try { const ev = JSON.parse(line) as { t?: string; d?: unknown }; if (ev.t === 'text' && typeof ev.d === 'string') acc += ev.d; } catch { /* a bad line is skipped, never shown */ }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        lines.forEach(apply);
        setTurns([...history, { role: 'assistant', content: acc, pending: true }]);
      }
      apply(buf + dec.decode());
      setTurns([...history, { role: 'assistant', content: acc || 'I can’t answer right now. Please call the pro shop.', error: !acc }]);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') { setTurns(history.slice(0, -1)); return; }
      setTurns([...history, { role: 'assistant', content: 'No connection. Check your signal and try again.', error: true }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, turns, slug]);

  const title = `Questions about ${meta.courseName}`;
  return (
    <>
      {!open && <button ref={launchRef} type="button" className={g.qlaunch} onClick={() => setOpen(true)} aria-haspopup="dialog">{title}</button>}
      {open && (
        <>
          <div className={g.sheetScrim} onClick={close} aria-hidden="true" />
          <div className={`${g.sheet} ${g.qpanel}`} role="dialog" aria-modal="true" aria-labelledby="q-h">
            <div className={g.shead2}>
              <h2 id="q-h">{title}</h2>
              <button type="button" className={g.close} onClick={close} aria-label="Close">×</button>
            </div>
            <div ref={logRef} className={g.qlog} aria-live="polite">
              <div className={g.qit}>{meta.greeting}</div>
              {turns.map((t, i) => (
                <div key={i} className={t.role === 'user' ? g.qme : g.qit}>
                  {t.role === 'assistant' && t.pending && !t.content ? <span className={g.qwait}>Checking…</span> : t.content}
                </div>
              ))}
            </div>
            {turns.length === 0 && meta.chips.length > 0 && (
              <div className={g.qchips}>{meta.chips.map(c => <button key={c} type="button" onClick={() => ask(c)}>{c}</button>)}</div>
            )}
            <form className={g.qform} onSubmit={e => { e.preventDefault(); ask(input); }}>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} maxLength={MAX_CHARS} disabled={busy} aria-label={`Ask about ${meta.courseName}`} />
              <button type="submit" disabled={busy || !input.trim()}>Ask</button>
            </form>
            <p className={g.small}>{meta.footer}</p>
          </div>
        </>
      )}
    </>
  );
}
