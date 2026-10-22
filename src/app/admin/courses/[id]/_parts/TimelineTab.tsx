'use client';

// BRAIN-1b (Cam 2026-10-22): the course's whole story, newest first — bookings
// and money, what was sent and said, what admins and staff changed, problems
// and onboarding. Filter by any of the four; "Show older" pages back.
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { adminFetch } from '@/lib/admin-fetch';
import { FEED_GROUPS, type FeedGroup, type FeedItem } from '@/lib/course-timeline-groups';
import { useCourse } from './context';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export function TimelineTab() {
  const { c } = useCourse();
  const [groups, setGroups] = useState<FeedGroup[]>([]);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (before?: string) => {
    setLoading(true); setError('');
    const q = new URLSearchParams({ courseId: c.id });
    if (groups.length) q.set('groups', groups.join(','));
    if (before) q.set('before', before);
    const res = await adminFetch<{ items: FeedItem[]; next: string | null }>(`/api/admin/course-feed?${q}`, { subject: 'the timeline' });
    setLoading(false);
    if (!res.ok) { setError(res.message); return; }
    setItems(prev => before && prev ? [...prev, ...res.data.items] : res.data.items);
    setNext(res.data.next);
  }, [c.id, groups]);
  useEffect(() => { load(); }, [load]);

  const toggle = (g: FeedGroup) => setGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  // Group the items under their day.
  const days: { day: string; items: FeedItem[] }[] = [];
  for (const it of items ?? []) {
    const d = day(it.at);
    if (days[days.length - 1]?.day !== d) days.push({ day: d, items: [] });
    days[days.length - 1].items.push(it);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
        <button type="button" onClick={() => setGroups([])} aria-pressed={groups.length === 0}
          className={`px-3 py-1.5 rounded-md text-[13px] border ${groups.length === 0 ? 'bg-pine border-pine text-white' : 'bg-white border-line text-ink-soft hover:text-ink'}`}>Everything</button>
        {FEED_GROUPS.map(g => (
          <button key={g.key} type="button" onClick={() => toggle(g.key)} aria-pressed={groups.includes(g.key)}
            className={`px-3 py-1.5 rounded-md text-[13px] border ${groups.includes(g.key) ? 'bg-pine border-pine text-white' : 'bg-white border-line text-ink-soft hover:text-ink'}`}>{g.label}</button>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-bad/20 bg-bad/5 px-4 py-2.5 flex items-start justify-between gap-3">
          <p className="text-xs text-bad">{error}</p>
          <button type="button" onClick={() => load()} className="text-xs font-medium text-ink-soft hover:text-ink shrink-0">Try again</button>
        </div>
      )}
      {!items && loading && <p className="text-ink-muted text-sm py-10 text-center">Loading…</p>}

      {items && (
        <Card className="p-5">
          {items.length === 0 ? (
            <p className="text-[13.5px] text-ink-soft">Nothing has happened here yet{groups.length ? ' of that kind' : ''}.</p>
          ) : days.map(d => (
            <div key={d.day} className="mb-4 last:mb-0">
              <h3 className="text-[13px] font-semibold text-ink mb-1">{d.day}</h3>
              {d.items.map(it => (
                <div key={it.id} className="py-2 border-b border-line-soft last:border-0 flex gap-3">
                  <span className="w-16 shrink-0 text-[12.5px] text-ink-muted tabular-nums pt-px">{clock(it.at)}</span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-ink flex items-center gap-2">
                      {it.tone && <StatusDot status={it.tone} />}
                      <span>{it.title}</span>
                    </p>
                    {it.detail && <p className="text-[12.5px] text-ink-soft mt-0.5 break-words whitespace-pre-line">{it.detail}</p>}
                    {it.who && <p className="text-[12px] text-ink-muted mt-0.5">{it.who}</p>}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {next && (
            <button type="button" onClick={() => load(next)} disabled={loading} className="mt-3 text-[13px] text-ink-soft hover:text-ink disabled:opacity-50">
              {loading ? 'Loading…' : 'Show older'}
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
