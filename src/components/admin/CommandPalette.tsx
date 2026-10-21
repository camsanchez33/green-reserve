'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { ADMIN_LINK, safeAdminPath } from '@/lib/admin-ask-links';

interface SearchResult {
  type: 'course' | 'inquiry' | 'golfer' | 'guest' | 'employee' | 'group' | 'thread' | 'booking' | 'nav' | 'ask';
  id: string;
  label: string;
  sub: string;
  href: string;
}

const RECENTS_KEY = 'admin-cmd-recents';
const MAX_RECENTS = 5;

function loadRecents(): SearchResult[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]'); } catch { return []; }
}

function saveRecent(item: SearchResult) {
  const prev = loadRecents().filter(r => r.id !== item.id);
  localStorage.setItem(RECENTS_KEY, JSON.stringify([item, ...prev].slice(0, MAX_RECENTS)));
}


const TYPE_LABEL: Record<SearchResult['type'], string> = {
  course:   'Course',
  inquiry:  'Inquiry',
  golfer:   'Golfer',
  guest:    'Guest golfer',
  employee: 'Employee',
  group:    'Course group',
  thread:   'Conversation',
  booking:  'Booking',
  nav:      'Go to',
  ask:      'Ask',
};

// AW-3b: a question goes to Ask (read-only AI answers) first; anything else
// searches first and offers Ask as the last row.
const QUESTION = /\?\s*$|^(which|what|who|how|when|why|where|show|list|did|does|do|are|is|any|has|have|tell)\b/i;

/** The answer's text with its admin links made real. Only /admin paths become links. */
function AnswerText({ text, go }: { text: string; go: (href: string) => void }) {
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        const parts: React.ReactNode[] = [];
        let last = 0;
        const clean = line.replace(/\*\*/g, '');
        for (const m of clean.matchAll(ADMIN_LINK)) {
          parts.push(clean.slice(last, m.index));
          const href = m[2];
          parts.push(<button key={m.index} type="button" onClick={() => go(href)} className="text-pine underline decoration-fairway underline-offset-2 hover:text-pine-hover">{m[1]}</button>);
          last = (m.index ?? 0) + m[0].length;
        }
        parts.push(clean.slice(last));
        return <p key={i} className={line.trim() ? '' : 'h-1'}>{parts}</p>;
      })}
    </div>
  );
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // hasQuery tracks whether the uncontrolled input has text (for recents vs results display)
  const [hasQuery, setHasQuery] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [recents, setRecents] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  // AW-3b: the answer view. null = showing search results.
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [answerStatus, setAnswerStatus] = useState('');
  const [answerError, setAnswerError] = useState('');
  const [answering, setAnswering] = useState(false);
  const askAbortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const q = query.trim();
  const askItem: SearchResult | null = q.length >= 3 ? { type: 'ask', id: 'ask', label: `“${q}”`, sub: 'an answer from live data — it can’t change anything', href: '' } : null;
  const displayed = !hasQuery ? recents
    : askItem && QUESTION.test(q) ? [askItem, ...results]
    : askItem ? [...results, askItem] : results;

  const ask = useCallback(async (question: string) => {
    askAbortRef.current?.abort();
    const controller = new AbortController();
    askAbortRef.current = controller;
    setAsked(question); setAnswer(''); setAnswerError(''); setAnswerStatus('Thinking…'); setAnswering(true);
    try {
      const r = await fetch('/api/admin/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }), signal: controller.signal });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({} as { error?: string }));
        setAnswerError(d.error || (r.status === 401 ? 'Your session ended — sign in again.' : 'Couldn’t answer just now — try again.'));
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as { t: string; d: string };
            if (ev.t === 'text') { setAnswer(a => a + ev.d); setAnswerStatus(''); }
            else if (ev.t === 'status') setAnswerStatus(ev.d);
          } catch { /* a partial line waits for the rest */ }
        }
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setAnswerError('Network error — check your connection and ask again.');
    } finally {
      if (!controller.signal.aborted) { setAnswering(false); setAnswerStatus(''); }
    }
  }, []);


  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 1) { setResults([]); setLoading(false); return; }
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      // MP-2b: search is SUPPORT_PLUS since MP-2, and the non-ok branch rendered
      // nothing — so a 403 and a network failure both read as `No results for
      // "x"`, the exact string a successful empty search produces. The palette
      // is on every admin page; it is the worst place to lie about emptiness.
      if (r.ok) {
        const d = await r.json();
        setResults(d.results ?? []);
        setSearchError('');
      } else if (r.status === 403) {
        setResults([]);
        setSearchError('Search requires support access.');
      } else if (r.status === 401) {
        setResults([]);
        setSearchError('Your session ended — sign in again.');
      } else {
        setResults([]);
        setSearchError('Search failed. Try again.');
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setResults([]);
      setSearchError('Search failed — check your connection.');
    }
    if (!controller.signal.aborted) setLoading(false);
  }, []);

  useEffect(() => {
    setSelectedIdx(0);
  }, [hasQuery, results]);

  // Ctrl+K global shortcut + custom open event
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('open-cmd-palette', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('open-cmd-palette', openHandler);
    };
  }, []);

  useEffect(() => {
    if (open) {
      // Clear the uncontrolled input imperatively
      if (inputRef.current) inputRef.current.value = '';
      setHasQuery(false);
      setResults([]);
      setSearchError('');   // MP-2d: a stale error greeted the next Ctrl+K
      setQuery(''); setAsked(null); setAnswer(''); setAnswerError('');
      setRecents(loadRecents());
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      // Cancel any pending search on close
      abortRef.current?.abort();
      askAbortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [open]);

  function navigate(item: SearchResult) {
    if (item.type === 'ask') { ask(q); return; }
    saveRecent(item);
    setOpen(false);
    router.push(item.href);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setHasQuery(v.length > 0);
    setQuery(v);
    if (asked !== null) { askAbortRef.current?.abort(); setAsked(null); setAnswering(false); }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.length === 0) {
      setSearchError('');
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(v), 200);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // The answer view is open: the list behind it is hidden, so keys never act on it.
    if (asked !== null && e.key !== 'Escape') { if (e.key === 'Enter') e.preventDefault(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, displayed.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (displayed[selectedIdx]) navigate(displayed[selectedIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/30"/>

      {/* Palette */}
      <div className="relative w-full max-w-xl mx-4 bg-card rounded-lg shadow-card overflow-hidden">
        {/* Search input — uncontrolled to prevent keystroke drops */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line">
          <Search className="w-4 h-4 text-ink-faint shrink-0"/>
          <input
            ref={inputRef}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Course, inquiry, golfer, email, phone, booking id, page…"
            className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint outline-none"
          />
          {loading && <span className="text-[11px] text-ink-muted shrink-0">Searching…</span>}
          <kbd className="shrink-0 text-[10px] text-ink-faint border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* AW-3b: the answer to an Ask */}
        {asked !== null && (
          <div className="max-h-[60vh] overflow-y-auto px-4 py-3 text-[13.5px] text-ink leading-relaxed" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="text-[12px] text-ink-muted truncate">Asked: {asked}</span>
              <button type="button" onClick={() => { askAbortRef.current?.abort(); setAsked(null); setAnswering(false); inputRef.current?.focus(); }} className="text-[12px] text-ink-soft hover:text-ink shrink-0">Back to results</button>
            </div>
            {answer && <AnswerText text={answer} go={href => { const path = safeAdminPath(href, window.location.origin); if (!path) return; setOpen(false); router.push(path); }} />}
            {answering && answerStatus && <p className="text-ink-muted mt-1">{answerStatus}</p>}
            {answerError && (
              <p role="alert" className="text-bad">{answerError} <button type="button" onClick={() => ask(asked)} className="underline">Ask again</button></p>
            )}
            {!answering && !answerError && !answer && <p className="text-ink-muted">No answer came back — ask again.</p>}
            {!answering && answer && <p className="mt-3 text-[11px] text-ink-faint">Read from live data. Ask can’t change anything.</p>}
          </div>
        )}

        {/* Results */}
        {asked === null && (
        <div className="max-h-80 overflow-y-auto">
          {displayed.length === 0 && (
            <div className={'py-10 text-center text-sm ' + (searchError ? 'text-bad' : 'text-ink-muted')}>
              {searchError
                ? searchError
                : hasQuery && !loading ? `No results for "${inputRef.current?.value ?? ''}"` : 'Start typing to search…'}
            </div>
          )}
          {displayed.length > 0 && (
            <>
              {!hasQuery && recents.length > 0 && (
                <div className="px-4 pt-2.5 pb-1">
                  <span className="text-[13px] font-semibold text-ink">Recent</span>
                </div>
              )}
              {displayed.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => navigate(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    idx === selectedIdx ? 'bg-paper' : 'hover:bg-paper/60'
                  }`}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{item.label}</div>
                    <div className="text-[11px] text-ink-muted truncate">{TYPE_LABEL[item.type]} · {item.sub}</div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
        )}

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-line flex items-center gap-3 text-[10px] text-ink-faint">
          <span><kbd className="border border-line rounded px-1 py-0.5">↑↓</kbd> navigate</span>
          <span><kbd className="border border-line rounded px-1 py-0.5">↵</kbd> open</span>
          <span><kbd className="border border-line rounded px-1 py-0.5">Esc</kbd> close</span>
          <span className="ml-auto">Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
