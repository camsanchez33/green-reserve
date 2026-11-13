'use client';
// DASH-C: "Find a golfer, booking or member" at the top of the course menu
// (the mockups' search bar). /api/operator/search answers; a booking opens the
// tee sheet on its day filtered to the golfer, a member opens Members filtered
// to them. Leaving the page asks first when there are unsaved changes.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { dfetch } from '@/lib/dashboard-fetch';
import { Card } from '@/components/ui/Card';
import { confirmLeave } from '@/lib/unsaved-guard';
import type { SearchResult } from '@/lib/operator-search';

const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const fmtDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// dropUp: results open above the box (the phone's More sheet sits at the bottom of the screen);
// onPicked: the More sheet closes when a result is opened.
export default function OperatorSearch({ dropUp = false, onPicked }: { dropUp?: boolean; onPicked?: () => void } = {}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [resultsFor, setResultsFor] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  // DASH-D (Cam 2026-11-01, the command bar): "/" or Ctrl/⌘ K jumps to the search from any
  // dashboard page. The rail's copy only (the phone's lives in the More sheet), and never
  // while someone is typing in a field.
  useEffect(() => {
    if (dropUp) return;
    let lastKeyAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      const k = e.key.toLowerCase();
      // A barcode scanner types fast: a "/" inside a scanned code belongs to the register's scan, not here.
      const now = performance.now(), burst = now - lastKeyAt < 100;
      if (e.key.length === 1) lastKeyAt = now;
      // Never out of an open dialog (focus would land behind the overlay).
      if (t?.closest('[role="dialog"]') || document.querySelector('[aria-modal="true"]')) return;
      if ((k === 'k' && e.metaKey) || (k === 'k' && e.ctrlKey && !typing) || (e.key === '/' && !typing && !burst && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        if (!input.current || input.current.offsetParent === null) return; // hidden (phone width)
        e.preventDefault();
        input.current.focus(); input.current.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dropUp]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setError(''); setBusy(false); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      const r = await dfetch<{ results: SearchResult[] }>(`/api/operator/search?q=${encodeURIComponent(term)}`);
      if (id !== seq.current) return; // a newer search is on its way (it clears busy)
      setBusy(false);
      if (!r.ok || !r.data) { setError(r.ok ? 'Search came back empty — try again.' : r.error); setResults(null); return; }
      setError(''); setResults(r.data.results); setResultsFor(term);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function go(href: string) {
    if (!confirmLeave()) return;
    setOpen(false); setQ('');
    onPicked?.();
    router.push(href);
  }

  const showPanel = open && q.trim().length >= 2;
  return (
    <div ref={box} className="relative">
      <label className="flex items-center gap-2 bg-paper rounded-md px-2.5 py-2 focus-within:ring-2 focus-within:ring-pine/10">
        <Search className="w-3.5 h-3.5 text-ink-faint shrink-0" aria-hidden="true" />
        <input ref={input} value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && results?.[0] && resultsFor === q.trim()) go(results[0].href); }}
          aria-label="Find a golfer, booking or member" aria-keyshortcuts={dropUp ? undefined : '/ Control+K Meta+K'} className="flex-1 min-w-0 bg-transparent text-[13px] text-ink placeholder-ink-faint outline-none" />
        {!dropUp && !q && <kbd aria-hidden="true" className="shrink-0 rounded-[4px] border border-line px-1.5 text-[11px] leading-[18px] text-ink-faint font-sans">/</kbd>}
      </label>
      {showPanel && (
        <Card role="listbox" aria-label="Search results" className={(dropUp ? "absolute inset-x-0 bottom-full mb-1 max-h-[45vh]" : "absolute inset-x-0 top-full mt-1 max-h-[60vh]") + " z-50 py-1 text-[13px] overflow-y-auto"}>
          {error ? <p role="alert" className="px-3 py-2.5 text-bad">{error}</p>
            : results === null ? <p className="px-3 py-2.5 text-ink-muted">{busy ? 'Searching…' : 'Keep typing…'}</p>
            : results.length === 0 ? <p className="px-3 py-2.5 text-ink-muted">No match for “{q.trim()}” in 60 days.</p>
            : results.map(r => (
              <button key={r.kind + r.id} type="button" role="option" aria-selected="false" onClick={() => go(r.href)}
                className="w-full text-left px-3 py-2 hover:bg-paper flex flex-col">
                <span className="truncate text-ink">{r.name}</span>
                <span className="text-[12px] text-ink-muted truncate">
                  {r.kind === 'booking' ? `${r.ref} · ${fmtDate(r.date)} ${fmtTime(r.time)} · ${r.players} player${r.players === 1 ? '' : 's'}${r.status === 'cancelled' ? ' · cancelled' : r.noShow ? ' · no-show' : ''}` : r.kind === 'member' ? `Member · ${r.tier}` : 'Resident'}
                </span>
              </button>
            ))}
        </Card>
      )}
    </div>
  );
}
