'use client';
// BRAIN-1a (Cam 2026-10-22): every admin action — who, what, when, the fields
// before and after, and why. Owner only (the route enforces it). Filters by
// person (Employees links here per employee), action and course.
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { Card } from '@/components/ui/Card';
import { INPUT_COMPACT } from '@/components/ui/field';
import { adminFetch } from '@/lib/admin-fetch';

interface Entry {
  id: string; at: string; who: string; adminId: string; action: string; label: string;
  targetType: string; targetId: string; courseId: string | null; courseName: string | null;
  reason: string; detail: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null;
}
interface Data { entries: Entry[]; next: string | null; admins: { id: string; name: string; role: string; active: boolean }[] }

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/** greenFeeCents → green fee; amountCents → amount. */
const fieldName = (k: string) => k.replace(/Cents$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const show = (k: string, v: unknown) => {
  if (v === null || v === undefined || v === '') return '—';
  if (/Cents$/.test(k) && typeof v === 'number') return `$${(v / 100).toFixed(2)}`;
  if (typeof v === 'string' && ISO.test(v)) return when(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
};

function Changes({ before, after }: { before: Entry['before']; after: Entry['after'] }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return null;
  return (
    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
      {keys.slice(0, 12).map(k => (
        <div key={k} className="contents">
          <dt className="text-ink-muted">{fieldName(k)}</dt>
          <dd className="text-ink-soft break-words">
            {before && k in before && after && k in after
              ? <>{show(k, before[k])} <span className="text-ink-muted">→</span> {show(k, after[k])}</>
              : before && k in before ? <>was {show(k, before[k])}</> : show(k, after?.[k])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AuditInner() {
  const sp = useSearchParams();
  const [admin, setAdmin] = useState(sp.get('admin') ?? '');
  const [course] = useState(sp.get('course') ?? '');
  const [data, setData] = useState<Data | null>(null);
  const [more, setMore] = useState<Entry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (before?: string) => {
    setLoading(true); setError('');
    const q = new URLSearchParams();
    if (admin) q.set('admin', admin);
    if (course) q.set('course', course);
    if (before) q.set('before', before);
    const res = await adminFetch<Data>(`/api/admin/audit?${q}`, { subject: 'the audit record' });
    setLoading(false);
    if (!res.ok) { setError(res.message); return; }
    if (before) setMore(m => [...m, ...res.data.entries]); else { setData(res.data); setMore([]); }
    setNext(res.data.next);
  }, [admin, course]);
  useEffect(() => { load(); }, [load]);

  const entries = [...(data?.entries ?? []), ...more];
  const courseLabel = course && entries.find(e => e.courseId === course)?.courseName;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="audit" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-10 py-8">
          <h1 className="text-[30px] leading-none font-serif font-semibold text-ink">Audit</h1>
          <p className="text-[13.5px] text-ink-soft mt-2">Every change made in the admin: who, what, when and why.{courseLabel ? ` Showing ${courseLabel}.` : ''}</p>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[13px] text-ink-soft">Person
              <select value={admin} onChange={e => setAdmin(e.target.value)} className={INPUT_COMPACT}>
                <option value="">Everyone</option>
                {data?.admins.map(a => <option key={a.id} value={a.id}>{a.name}{a.active ? '' : ' (off)'}</option>)}
              </select>
            </label>
            {course && <Link href="/admin/audit" className="text-[13px] text-pine font-medium hover:underline pb-2">Show all courses</Link>}
          </div>

          {error && (
            <div role="alert" className="mt-5 rounded-md border border-bad/20 bg-bad/5 px-4 py-2.5 flex items-start justify-between gap-3">
              <p className="text-xs text-bad">{error}</p>
              <button type="button" onClick={() => load()} className="text-xs font-medium text-ink-soft hover:text-ink shrink-0">Try again</button>
            </div>
          )}
          {!data && loading && <p className="text-ink-muted text-center py-16 text-sm">Loading…</p>}

          {data && (
            <Card className="p-5 mt-5">
              {entries.length === 0 ? (
                <p className="text-[13.5px] text-ink-soft">Nothing recorded yet{admin ? ' for this person' : ''}.</p>
              ) : entries.map(e => (
                <div key={e.id} className="py-3 border-b border-line-soft last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-[14px] text-ink"><span className="font-semibold">{e.who}</span> · {e.label}
                      {e.courseId && e.courseName && <> · <Link href={`/admin/courses/${e.courseId}`} className="text-pine hover:underline">{e.courseName}</Link></>}
                    </p>
                    <span className="text-[12.5px] text-ink-muted tabular-nums">{when(e.at)}</span>
                  </div>
                  {e.reason && <p className="mt-1 text-[13.5px] text-ink">“{e.reason}”</p>}
                  {e.detail && <p className="mt-0.5 text-[12.5px] text-ink-soft">{e.detail}</p>}
                  <Changes before={e.before} after={e.after} />
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
      </div>
    </div>
  );
}

export default function AdminAuditPage() {
  return <Suspense><AuditInner /></Suspense>;
}
