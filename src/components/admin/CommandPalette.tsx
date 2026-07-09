'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Building2, AlertCircle, User, Users, LayoutDashboard, ArrowRight } from 'lucide-react';

interface SearchResult {
  type: 'course' | 'inquiry' | 'golfer' | 'employee' | 'nav';
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

const TYPE_ICON: Record<SearchResult['type'], React.ReactNode> = {
  course:   <Building2 className="w-3.5 h-3.5 text-ink-muted"/>,
  inquiry:  <AlertCircle className="w-3.5 h-3.5 text-warn"/>,
  golfer:   <User className="w-3.5 h-3.5 text-pine"/>,
  employee: <Users className="w-3.5 h-3.5 text-ink-muted"/>,
  nav:      <LayoutDashboard className="w-3.5 h-3.5 text-ink-faint"/>,
};

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  course:   'Course',
  inquiry:  'Inquiry',
  golfer:   'Golfer',
  employee: 'Employee',
  nav:      'Go to',
};

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayed = query.length >= 1 ? results : recents;

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 1) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
      if (r.ok) { const d = await r.json(); setResults(d.results ?? []); }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 200);
  }, [query, doSearch]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, results]);

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
      setQuery('');
      setResults([]);
      setRecents(loadRecents());
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  function navigate(item: SearchResult) {
    saveRecent(item);
    setOpen(false);
    router.push(item.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
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
      <div className="relative w-full max-w-xl mx-4 bg-card border border-line rounded-lg shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line">
          <Search className="w-4 h-4 text-ink-faint shrink-0"/>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search courses, inquiries, golfers, pages…"
            className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint outline-none"
          />
          {loading && <span className="text-[11px] text-ink-muted shrink-0">Searching…</span>}
          <kbd className="shrink-0 text-[10px] text-ink-faint border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {displayed.length === 0 && (
            <div className="py-10 text-center text-sm text-ink-muted">
              {query.length >= 1 && !loading ? `No results for "${query}"` : 'Start typing to search…'}
            </div>
          )}
          {displayed.length > 0 && (
            <>
              {query.length < 1 && recents.length > 0 && (
                <div className="px-4 pt-2.5 pb-1">
                  <span className="text-[10px] uppercase tracking-[0.06em] text-ink-faint">Recent</span>
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
                  <div className="w-6 h-6 rounded-md bg-paper border border-line flex items-center justify-center shrink-0">
                    {TYPE_ICON[item.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{item.label}</div>
                    <div className="text-[11px] text-ink-muted truncate">{TYPE_LABEL[item.type]} · {item.sub}</div>
                  </div>
                  {idx === selectedIdx && (
                    <ArrowRight className="w-3.5 h-3.5 text-ink-faint shrink-0"/>
                  )}
                </button>
              ))}
            </>
          )}
        </div>

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
