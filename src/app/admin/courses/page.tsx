'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminFetch, type AdminFetchFailure, LOGIN_SESSION_ENDED } from '@/lib/admin-fetch';
import { ErrorBanner } from '@/components/ui/ErrorState';
import Link from 'next/link';
import { RefreshCw, Search } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { EmptyState } from '@/components/EmptyState';
import { HEALTH_STATUS_SEVERITY, periodDelta, lastBookingLabel, type CourseHealthStatus } from '@/lib/course-metrics';

const PAGE_SIZE = 50;

interface Course {
  id: string; name: string; city: string; state: string; active: boolean; featured: boolean;
  stripeAccountActive: boolean; slug: string; type?: string;
  operator: { email: string; name: string; onboardingStep: number; emailVerified: boolean } | null;
  createdAt: string; archivedAt?: string | null; archivedBy?: string | null;
  bookings30d: number; revenue30d: number; activeMemberCount: number;
  lastBookingAt?: string | null; bookingsPrior30d?: number;
  approvalStatus?: 'none' | 'approved' | 'changes_requested';
  health: { status: CourseHealthStatus; label: string; dot: 'ok' | 'bad' | 'warn' | 'neutral'; reason: string };
}

// A-04b: state (Live/Offline/Archived) and health (the "concerns" within a
// state) are two different questions — the segmented control owns state,
// the dropdown owns health only. "Needs attention" is a synthetic umbrella
// (anything not healthy), not a real CourseHealthStatus value.
type StateFilter = 'live' | 'offline' | 'archived';
type HealthFilter = 'all' | 'needs_attention' | 'setup_incomplete' | 'payments_broken' | 'going_quiet';
const HEALTH_FILTER_OPTIONS: { value: HealthFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'setup_incomplete', label: 'Setup incomplete' },
  { value: 'payments_broken', label: 'Payments broken' },
  { value: 'going_quiet', label: 'Going quiet' },
];
const NEEDS_ATTENTION_STATUSES: CourseHealthStatus[] = ['setup_incomplete', 'payments_broken', 'going_quiet', 'offline', 'orphaned'];

interface OrphanSweepItem { kind: 'course' | 'inquiry'; id: string; name: string; action: string; reason: string }
interface AcknowledgedOrphan { id: string; name: string; archivedAt: string }

function CoursesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [adminReady, setAdminReady] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('live');
  const [filterHealth, setFilterHealth] = useState<HealthFilter>('all');
  const [filterType, setFilterType] = useState('');
  const [sortBy, setSortBy] = useState<'severity' | 'newest' | 'name'>('severity');
  const [page, setPage] = useState(0);

  // ORPHAN SWEEP (RUN_QUEUE) — dry-run check on first load. Read-only
  // ("print the list"); actually cleaning up is an explicit owner click.
  const [orphanNote, setOrphanNote] = useState('');
  const [orphanItems, setOrphanItems] = useState<OrphanSweepItem[]>([]);
  const [orphanAcknowledged, setOrphanAcknowledged] = useState<AcknowledgedOrphan[]>([]);
  const [orphanChecked, setOrphanChecked] = useState(false);
  const [orphanRunning, setOrphanRunning] = useState(false);
  const [orphanResult, setOrphanResult] = useState('');
  const [orphanFailed, setOrphanFailed] = useState(false);
  const [orphanDismissed, setOrphanDismissed] = useState(false);
  const [forceDeleteTarget, setForceDeleteTarget] = useState<AcknowledgedOrphan | null>(null);
  const [forceDeleteConfirm, setForceDeleteConfirm] = useState('');
  const [forceDeleteBusy, setForceDeleteBusy] = useState(false);
  const [forceDeleteError, setForceDeleteError] = useState('');

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  const loadCourses = useCallback(async (sf: StateFilter) => {
    setLoading(true);
    try {
      const url = '/api/admin/courses' + (sf === 'archived' ? '?showArchived=1' : '');
      // MP-2c: MP-2b gated this endpoint at SUPPORT_PLUS and this branch turned
      // the 403 into an empty course list with no explanation.
      const res = await adminFetch<Course[]>(url, { subject: 'courses' });
      if (!res.ok) { setCourses([]); setLoadError({ msg: res.message, kind: res.kind }); }
      else { setCourses(res.data); setLoadError(null); }
    } catch { setCourses([]); setLoadError({ msg: 'Network error loading courses. Check your connection and try again.', kind: 'network' }); }
    setLoading(false);
  }, [H]);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push(LOGIN_SESSION_ENDED); return; }
      setAdminReady(true);
    }).catch(() => router.push(LOGIN_SESSION_ENDED));
  }, [router]);

  useEffect(() => {
    if (!adminReady) return;
    loadCourses(stateFilter);
    const courseId = params.get('courseId');
    if (courseId) router.replace('/admin/courses/' + courseId);
  }, [adminReady, stateFilter, loadCourses, params, router]);

  // MP-2e: MP-2d gated this GET at requireOwner (role owner AND mfa), so the
  // panel silently disappeared for managers and for any owner on a
  // password-only session — the route even carries ownerGateError copy telling
  // them to sign in at /admin/owner-login, and this threw it away. A 403 is
  // expected for managers, so it is a quiet note rather than an error banner.
  const checkOrphans = useCallback(async () => {
    const res = await adminFetch<{ items?: OrphanSweepItem[]; acknowledged?: AcknowledgedOrphan[] }>(
      '/api/admin/orphan-sweep', { subject: 'the orphan sweep' });
    if (!res.ok) {
      setOrphanItems([]); setOrphanAcknowledged([]);
      setOrphanNote(res.kind === 'forbidden' ? res.message : '');
      return;
    }
    setOrphanNote('');
    setOrphanItems(res.data.items ?? []);
    setOrphanAcknowledged(res.data.acknowledged ?? []);
  }, []);

  // MP-5c: this used to fire on every visit to the courses list — a
  // data-repair scan running as a side effect of looking at a page. It is a
  // tripwire for an invariant that should never break, not something to run
  // hundreds of times a week, so it is an explicit click now.

  // MP-2d B4: no try/catch, so a rejected fetch left orphanRunning true and the
  // button read "Cleaning up..." until a reload.
  async function runOrphanSweep() {
    setOrphanRunning(true); setOrphanResult(''); setOrphanFailed(false);
    try {
    const r = await fetch('/api/admin/orphan-sweep', { method: 'POST', headers: H() });
    if (r.ok) {
      const d = await r.json();
      setOrphanResult(`Cleaned up ${d.items.length} item${d.items.length === 1 ? '' : 's'}: ` + d.items.map((i: OrphanSweepItem) => `"${i.name}" ${i.action}`).join('; '));
      setOrphanItems([]);
      checkOrphans();
      loadCourses(stateFilter);
    } else {
      const d = await r.json().catch(() => ({}));
      setOrphanFailed(true); setOrphanResult('Sweep failed: ' + (d.error || 'unknown error'));
    }
    } catch {
      setOrphanFailed(true); setOrphanResult('Sweep failed: network error — nothing was changed.');
    } finally {
      setOrphanRunning(false);
    }
  }

  // Owner-authorized override — hard-deletes ONE specific acknowledged
  // orphan regardless of its (fake/test) history. The server independently
  // re-verifies it's still an orphan and the typed name matches before
  // touching anything.
  async function runForceDelete() {
    if (!forceDeleteTarget) return;
    setForceDeleteBusy(true); setForceDeleteError('');
    // MP-2d B4: same latch as the sweep, on the console's single most
    // destructive action.
    try {
    const r = await fetch('/api/admin/orphan-sweep', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ forceDeleteId: forceDeleteTarget.id, confirmName: forceDeleteConfirm }),
    });
    if (r.ok) {
      const d = await r.json();
      setOrphanResult(`Permanently deleted "${d.deleted.name}": ${d.deleted.bookings} booking(s), ${d.deleted.paidMemberships} paid membership(s), ${d.deleted.staff} staff row(s)${d.deleted.operatorDeleted ? ', operator login' : ''}.`);
      setForceDeleteTarget(null);
      setForceDeleteConfirm('');
      checkOrphans();
      loadCourses(stateFilter);
    } else {
      const d = await r.json().catch(() => ({}));
      setForceDeleteError(d.error || 'Delete failed — try again.');
    }
    } catch {
      setForceDeleteError('Network error — nothing was deleted. Check your connection and try again.');
    } finally {
      setForceDeleteBusy(false);
    }
  }

  const q = search.toLowerCase().trim();
  let filteredCourses = q
    ? courses.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        (c.operator?.email || '').toLowerCase().includes(q) ||
        (c.operator?.name || '').toLowerCase().includes(q)
      )
    : [...courses];
  if (stateFilter !== 'archived') {
    filteredCourses = filteredCourses.filter(c => (stateFilter === 'live') === c.active);
    if (filterHealth === 'needs_attention') filteredCourses = filteredCourses.filter(c => NEEDS_ATTENTION_STATUSES.includes(c.health.status));
    else if (filterHealth !== 'all') filteredCourses = filteredCourses.filter(c => c.health.status === filterHealth);
    if (filterType) filteredCourses = filteredCourses.filter(c => (c.type || 'public') === filterType);
  }
  if (sortBy === 'name') filteredCourses = [...filteredCourses].sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'newest') filteredCourses = [...filteredCourses].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  else filteredCourses = [...filteredCourses].sort((a, b) => HEALTH_STATUS_SEVERITY[a.health.status] - HEALTH_STATUS_SEVERITY[b.health.status]);

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / PAGE_SIZE));
  const pagedCourses = filteredCourses.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [stateFilter, filterHealth, filterType, q]);

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="courses" />
      <div className="admin-content flex-1 flex flex-col min-h-screen">
        <div className="px-8 py-7">
          {/* MP-2d: was a sibling of this container — full-bleed, above the title. */}
          {loadError && (
            <ErrorBanner message={loadError.msg} kind={loadError.kind} onRetry={() => loadCourses(stateFilter)} />
          )}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">All Courses</h1>
              {/* A-04 item 5: count line always reflects the active filter set */}
              <p className="text-sm text-ink-soft mt-0.5">
                {loadError ? '—' : `${filteredCourses.length} course${filteredCourses.length === 1 ? '' : 's'}`}
                {(filterHealth !== 'all' || filterType || q) ? ' matching filters' : ''}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, slug, operator..."
                  className="bg-white border border-line text-ink text-sm rounded-md pl-8 pr-3 py-2 outline-none focus:border-pine/40 w-56 placeholder-ink-faint"
                />
              </div>
              <button
                onClick={() => loadCourses(stateFilter)}
                className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-line transition-colors"
              >
                <RefreshCw className="w-4 h-4" />Refresh
              </button>
            </div>
          </div>

          {/* ORPHAN SWEEP (RUN_QUEUE) — dry-run result. Printed, not acted on
              automatically; the link is sacred, so cleanup is an explicit click. */}
          {!orphanDismissed && orphanItems.length > 0 && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-warn/5 border border-warn/20">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-sm font-medium text-warn">
                  {orphanItems.length} orphaned record{orphanItems.length === 1 ? '' : 's'} found — no linked inquiry, or an inquiry pointing at a deleted course.
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setOrphanDismissed(true)} className="text-xs text-ink-muted hover:text-ink transition-colors">Dismiss</button>
                  <button
                    onClick={runOrphanSweep}
                    disabled={orphanRunning}
                    className="text-xs font-medium px-3 py-1.5 rounded-md bg-warn text-white hover:bg-warn/90 transition-colors disabled:opacity-50"
                  >
                    {orphanRunning ? 'Cleaning up…' : 'Clean up now'}
                  </button>
                </div>
              </div>
              <ul className="space-y-0.5">
                {orphanItems.map(i => (
                  <li key={i.kind + i.id} className="text-xs text-ink-soft">
                    <span className="font-medium">{i.name}</span> — {i.reason} <span className="text-ink-faint">(will be {i.action.replace('would_', '')})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* MP-2e: success and failure both wrote into orphanResult and this
              banner was styled green unconditionally — "Sweep failed: network
              error" was rendered as a success. */}
          {orphanResult && (
            <div className={'mb-5 px-4 py-3 rounded-lg border flex items-center justify-between gap-3 ' + (orphanFailed ? 'bg-bad/5 border-bad/20' : 'bg-ok/5 border-ok/20')}>
              <span className={'text-sm ' + (orphanFailed ? 'text-bad' : 'text-ok')}>{orphanResult}</span>
              <button onClick={() => { setOrphanResult(''); setOrphanFailed(false); }} className="text-xs text-ink-muted hover:text-ink transition-colors">Dismiss</button>
            </div>
          )}
          {/* Expected for managers — the sweep is owner-only — so a quiet note,
              not an error. Previously the whole panel just vanished. */}
          {orphanNote && (
            <p className="mb-5 text-xs text-ink-muted">{orphanNote}</p>
          )}

          {/* Acknowledged orphans (already archived + flagged by a prior
              sweep) — informational only, never nags, but an owner can still
              force-delete one individually (Cam's DaisyLinks exception). */}
          {orphanAcknowledged.length > 0 && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-paper border border-line">
              <div className="text-xs font-medium text-ink-muted mb-2">
                {orphanAcknowledged.length} acknowledged orphan{orphanAcknowledged.length === 1 ? '' : 's'} — archived, flagged, no linked inquiry
              </div>
              <ul className="space-y-1">
                {orphanAcknowledged.map(a => (
                  <li key={a.id} className="text-xs text-ink-soft flex items-center justify-between gap-3">
                    <span>{a.name} <span className="text-ink-faint">— archived {new Date(a.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
                    <button
                      onClick={() => { setForceDeleteTarget(a); setForceDeleteConfirm(''); setForceDeleteError(''); }}
                      className="text-bad hover:underline shrink-0"
                    >
                      Force delete permanently
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {/* A-04b: segmented control owns STATE only — Live / Offline / Archived */}
            <div className="flex items-center gap-1 bg-white border border-line rounded-lg p-1">
              {/* MP-5c: "Offline" read as "a course we switched off", but this
                  bucket is mostly courses that have never been live at all —
                  drafts still in setup. "Not live" is the honest umbrella; the
                  health word on each row says which kind it is. Splitting the
                  two properly needs a real firstWentLiveAt (MP-5e). */}
              {([['live', 'Live'], ['offline', 'Not live'], ['archived', 'Archived']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setStateFilter(key); setFilterHealth('all'); }}
                  className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (stateFilter === key ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>

            {stateFilter !== 'archived' && (
              <>
                {/* Dropdown owns HEALTH only — concerns within the selected state */}
                <select
                  value={filterHealth}
                  onChange={e => setFilterHealth(e.target.value as HealthFilter)}
                  className="bg-white border border-line text-ink-soft text-[11px] rounded-md px-3 py-1.5 outline-none focus:border-pine/40 cursor-pointer"
                >
                  {HEALTH_FILTER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="bg-white border border-line text-ink-soft text-[11px] rounded-md px-3 py-1.5 outline-none focus:border-pine/40 cursor-pointer"
                >
                  <option value="">All types</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </>
            )}

            {/* MP-5c: the orphan sweep is a deliberate check now, not a
                side effect of opening the page. */}
            <button
              onClick={() => { setOrphanChecked(true); checkOrphans(); }}
              className={'px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors ' + (
                orphanChecked ? 'text-ink border-line-strong bg-paper' : 'text-ink-muted border-line hover:border-line-strong hover:text-ink'
              )}
              title="Check for courses and inquiries that lost their link to each other"
            >
              {orphanChecked && orphanItems.length === 0 && !orphanNote ? 'Data check — clean' : 'Data check'}
            </button>

            <div className="flex items-center gap-1 bg-white border border-line rounded-lg p-1 ml-auto">
              {(['severity', 'newest', 'name'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (sortBy === s ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}
                >
                  {s === 'severity' ? 'Status severity' : s === 'newest' ? 'Newest' : 'Name A–Z'}
                </button>
              ))}
            </div>
          </div>

          {loading && <div className="text-ink-muted py-20 text-center text-sm">Loading...</div>}

          {/* A-04 item 2: rows are clean directory entries — name, location·type,
              operator name, ONE worded status chip. No numbers, no icon
              actions — everything else lives on the course page. Rows are
              real links (keyboard nav, middle-click new tab). */}
          <div className="space-y-2">
            {!loading && pagedCourses.map(course => (
              <Link
                key={course.id}
                href={'/admin/courses/' + course.id}
                className="bg-white border border-line rounded-lg px-5 py-3.5 flex items-center gap-5 hover:border-line-strong transition-colors"
              >
                <span title={course.health.reason}><StatusDot status={course.health.dot} /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-0.5">
                    <span className="font-medium text-ink truncate">{course.name}</span>
                    {course.approvalStatus === 'approved' && course.health.status === 'setup_incomplete' && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-ok/5 text-ok border border-ok/20 shrink-0">Approved</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {course.city}, {course.state} · <span className="capitalize">{course.type || 'public'}</span>
                  </div>
                </div>
                <div className="w-36 min-w-0 hidden xl:block">
                  <div className="text-xs text-ink-soft truncate">{course.operator?.name || 'No operator'}</div>
                </div>

                {/* MP-5c: the API has ALWAYS computed these — 30d bookings,
                    the prior period to trend against, revenue and the last
                    booking — and the row rendered none of them, which is why
                    two courses could both show a green "Healthy" with nothing
                    behind it. The evidence is already paid for; show it. */}
                {(() => {
                  const trend = periodDelta(course.bookings30d, course.bookingsPrior30d ?? 0);
                  const trendText = trend.pct === null ? null : `${trend.pct > 0 ? '+' : ''}${Math.round(trend.pct)}%`;
                  const trendClass = trend.direction === 'up' ? 'text-ok' : trend.direction === 'down' ? 'text-bad' : 'text-ink-faint';
                  return (
                    <>
                      <div className="w-24 shrink-0 text-right hidden lg:block">
                        <div className="text-xs text-ink">
                          {course.bookings30d}
                          <span className="text-ink-muted"> in 30d</span>
                          {trendText && <span className={'ml-1.5 ' + trendClass}>{trendText}</span>}
                        </div>
                        <div className="text-[10px] text-ink-faint">{lastBookingLabel(course.lastBookingAt)}</div>
                      </div>
                      <div className="w-16 shrink-0 text-right hidden lg:block">
                        <div className="text-xs text-ink">${Math.round(course.revenue30d)}</div>
                        <div className="text-[10px] text-ink-faint">fees 30d</div>
                      </div>
                    </>
                  );
                })()}

                <div className="shrink-0 text-right" title={course.health.reason}>
                  <span className={
                    'text-xs font-medium px-2 py-1 rounded-md inline-block ' + (
                      course.health.dot === 'ok' ? 'bg-ok/5 text-ok' :
                      course.health.dot === 'bad' ? 'bg-bad/5 text-bad' :
                      course.health.dot === 'warn' ? 'bg-warn/5 text-warn' :
                      'bg-line-soft text-ink-muted'
                    )
                  }>
                    {course.health.label}
                  </span>
                </div>
              </Link>
            ))}
            {!loading && !loadError && filteredCourses.length === 0 && (
              <EmptyState message="No courses found" />
            )}
          </div>

          {!loading && filteredCourses.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 text-xs text-ink-muted">
              <span>Page {page + 1} of {totalPages} · {filteredCourses.length} total</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-md border border-line bg-white hover:bg-paper disabled:opacity-40 transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-md border border-line bg-white hover:bg-paper disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Force-delete confirm — owner-authorized override, typed name confirm,
          server re-verifies it's still an orphan before touching anything. */}
      {forceDeleteTarget && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg border border-line max-w-md w-full p-5">
            <div className="text-sm font-medium text-ink mb-1">Permanently delete &quot;{forceDeleteTarget.name}&quot;?</div>
            <p className="text-xs text-ink-muted mb-3">
              This cannot be undone — deletes the course, its bookings, tee times, and staff, and the operator&apos;s login if this was their only course. Owner-authorized override: this bypasses the usual archive-only rule because this course is an acknowledged orphan with no real history behind the doctrine&apos;s protection.
            </p>
            {forceDeleteError && (
              <div className="text-xs text-bad mb-2">{forceDeleteError}</div>
            )}
            <label className="block text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Type &quot;{forceDeleteTarget.name}&quot; to confirm</label>
            <input
              value={forceDeleteConfirm}
              onChange={e => setForceDeleteConfirm(e.target.value)}
              className="w-full bg-paper border border-bad/30 rounded-md px-3 py-2 text-sm outline-none focus:border-bad/50 mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setForceDeleteTarget(null); setForceDeleteConfirm(''); setForceDeleteError(''); }}
                className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={runForceDelete}
                disabled={forceDeleteBusy || forceDeleteConfirm.trim().toLowerCase() !== forceDeleteTarget.name.trim().toLowerCase()}
                className="text-xs font-medium px-3 py-1.5 rounded-md text-white bg-bad hover:bg-bad/90 transition-colors disabled:opacity-40"
              >
                {forceDeleteBusy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={null}>
      <CoursesContent />
    </Suspense>
  );
}
