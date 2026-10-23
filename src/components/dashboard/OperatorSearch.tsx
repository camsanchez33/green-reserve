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

export default function OperatorSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setError(''); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      const r = await dfetch<{ results: SearchResult[] }>(`/api/operator/search?q=${encodeURIComponent(term)}`);
      if (id !== seq.current) return; // a newer search is on its way
      setBusy(false);
      if (!r.ok || !r.data) { setError(r.ok ? 'Search came back empty — try again.' : r.error); setResults(null); return; }
      setError(''); setResults(r.data.results);
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
    router.push(href);
  }

  const showPanel = open && q.trim().length >= 2;
  return (
    <div ref={box} className="relative">
      <label className="flex items-center gap-2 bg-paper rounded-md px-2.5 py-2 focus-within:ring-2 focus-within:ring-pine/10">
        <Search className="w-3.5 h-3.5 text-ink-faint shrink-0" aria-hidden="true" />
        <span className="sr-only">Find a golfer, booking or member</span>
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && results?.[0]) go(results[0].href); }}
          placeholder="Find a golfer or member" className="flex-1 min-w-0 bg-transparent text-[13px] text-ink placeholder-ink-faint outline-none" />
      </label>
      {showPanel && (
        <Card role="listbox" aria-label="Search results" className="absolute inset-x-0 top-full mt-1 z-50 py-1 text-[13px] max-h-[60vh] overflow-y-auto">
          {error ? <p role="alert" className="px-3 py-2.5 text-bad">{error}</p>
            : results === null ? <p className="px-3 py-2.5 text-ink-muted">{busy ? 'Searching…' : 'Keep typing…'}</p>
            : results.length === 0 ? <p className="px-3 py-2.5 text-ink-muted">Nobody matches “{q.trim()}” in the last 60 days or your members.</p>
            : results.map(r => (
              <button key={r.kind + r.id} type="button" role="option" aria-selected="false" onClick={() => go(r.href)}
                className="w-full text-left px-3 py-2 hover:bg-paper flex flex-col">
                <span className="truncate text-ink">{r.name}</span>
                <span className="text-[12px] text-ink-muted truncate">
                  {r.kind === 'booking' ? `${fmtDate(r.date)} ${fmtTime(r.time)} · ${r.players}${r.status === 'cancelled' ? ' · cancelled' : ''}` : `Member · ${r.tier}`}
                </span>
              </button>
            ))}
        </Card>
      )}
    </div>
  );
}
