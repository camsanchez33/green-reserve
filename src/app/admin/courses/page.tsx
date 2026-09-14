'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { ErrorBanner } from '@/components/ui/ErrorState';
import Link from 'next/link';
import { RefreshCw, Search, Download, Phone } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { EmptyState } from '@/components/EmptyState';
import { HEALTH_STATUS_SEVERITY, periodDelta, lastBookingLabel, type CourseHealthStatus } from '@/lib/course-metrics';
import { checkInSignal, type CheckinCallLike } from '@/lib/course-checkin';
import { nextCall, overdueCall, fmtCallClock } from '@/lib/inquiry-call';
import type { SetupProgress } from '@/lib/course-setup';

// COURSES_SHEET_SPEC CS-2 — /admin/courses as a sheet. One table, two
// sections ("Getting live" above "Live"), eight fixed columns, the same
// table chrome as the inquiries sheet (IC-3). The Live / Not live / Archived
// segmented control and the sort control are gone: the sections ARE the
// state, and ordering is fixed (decision B4) — furthest-along first while
// getting live, worst health first once live. Archived is a footer link.

const PAGE_SIZE = 50;
// A section longer than this is a signal in itself — show the top slice and
// say how many are behind it (same rule as the inquiries sheet).
const SECTION_CAP = 50;

interface CourseCall extends CheckinCallLike {
  id: string; kind: string; scheduledAt: string; outcome: string; durationMin: number; direction: string; completedAt?: string | null;
}
interface Course {
  id: string; name: string; city: string; state: string; active: boolean; featured: boolean;
  stripeAccountActive: boolean; slug: string; type?: string;
  operator: { email: string; name: string; onboardingStep: number; emailVerified: boolean } | null;
  createdAt: string; archivedAt?: string | null; archivedBy?: string | null;
  welcomeEmailSentAt?: string | null;
  bookings30d: number; revenue30d: number | null; activeMemberCount: number;
  lastBookingAt?: string | null; bookingsPrior30d?: number;
  approvalStatus?: 'none' | 'approved' | 'changes_requested';
  health: { status: CourseHealthStatus; label: string; dot: 'ok' | 'bad' | 'warn' | 'neutral'; reason: string };
  // CS-1
  nextCheckInAt?: string | null;
  calls?: CourseCall[];
  setup?: SetupProgress;
  linkedInquiryId?: string | null;
  inquiryCalls?: CourseCall[];
}

// Health is the only filter left besides type — its options are named after
// the sections. "Needs attention" is a synthetic umbrella (anything not
// healthy), not a real CourseHealthStatus value.
type HealthFilter = 'all' | 'needs_attention' | 'setup_incomplete' | 'payments_broken' | 'going_quiet';
const HEALTH_FILTER_OPTIONS: { value: HealthFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'setup_incomplete', label: 'Setup incomplete' },
  { value: 'payments_broken', label: 'Payments broken' },
  { value: 'going_quiet', label: 'Going quiet' },
];
const HEALTH_FILTER_VALUES = HEALTH_FILTER_OPTIONS.map(o => o.value) as string[];
const NEEDS_ATTENTION_STATUSES: CourseHealthStatus[] = ['setup_incomplete', 'payments_broken', 'going_quiet', 'offline', 'orphaned'];
// Assumption B1: "Getting live" = never been on the public site. Offline sits
// in Live because it WAS live; its Status cell says so.
const GETTING_LIVE_STATUSES: CourseHealthStatus[] = ['setup_incomplete', 'orphaned'];

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtShort = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const fmtDay = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const fmtWeekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
const daysSinceIso = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));

function CoursesContent() {
  const router = useRouter();
  const params = useSearchParams();
  // MP-11a: the layout resolved the session; a page never re-checks it.
  const adminReady = true;
  const [courses, setCourses] = useState<Course[]>([]);
  const [archivedCount, setArchivedCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'sheet' | 'archived'>(params.get('view') === 'archived' ? 'archived' : 'sheet');
  const initialHealth = params.get('health') || '';
  const [filterHealth, setFilterHealth] = useState<HealthFilter>(HEALTH_FILTER_VALUES.includes(initialHealth) ? initialHealth as HealthFilter : 'all');
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(0);

  const loadCourses = useCallback(async (v: 'sheet' | 'archived') => {
    setLoading(true);
    try {
      const url = '/api/admin/courses' + (v === 'archived' ? '?showArchived=1' : '');
      // MP-2c: MP-2b gated this endpoint at SUPPORT_PLUS and this branch turned
      // the 403 into an empty course list with no explanation.
      const res = await adminFetch<Course[]>(url, { subject: 'courses' });
      if (!res.ok) { setCourses([]); setLoadError({ msg: res.message, kind: res.kind }); }
      else { setCourses(res.data); setLoadError(null); }
      // The header line counts archived courses even while the sheet is up —
      // the lightweight id/name/archivedAt list is enough for a count.
      const simple = await adminFetch<{ id: string; archivedAt: string | null }[]>('/api/admin/courses?simple=1', { subject: 'courses' });
      setArchivedCount(simple.ok ? simple.data.filter(c => !!c.archivedAt).length : null);
    } catch { setCourses([]); setLoadError({ msg: 'Network error loading courses. Check your connection and try again.', kind: 'network' }); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!adminReady) return;
    loadCourses(view);
    const courseId = params.get('courseId');
    if (courseId) router.replace('/admin/courses/' + courseId);
  }, [adminReady, view, loadCourses, params, router]);

  const goTo = (v: 'sheet' | 'archived') => {
    setView(v); setPage(0);
    window.history.replaceState(null, '', '/admin/courses' + (v === 'archived' ? '?view=archived' : ''));
  };

  const q = search.toLowerCase().trim();
  let filtered = q
    ? courses.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        (c.operator?.email || '').toLowerCase().includes(q) ||
        (c.operator?.name || '').toLowerCase().includes(q)
      )
    : [...courses];
  if (view === 'sheet') {
    if (filterHealth === 'needs_attention') filtered = filtered.filter(c => NEEDS_ATTENTION_STATUSES.includes(c.health.status));
    else if (filterHealth !== 'all') filtered = filtered.filter(c => c.health.status === filterHealth);
    if (filterType) filtered = filtered.filter(c => (c.type || 'public') === filterType);
  }

  const now = new Date();
  const isGettingLive = (c: Course) => GETTING_LIVE_STATUSES.includes(c.health.status);
  const signalOf = (c: Course) => checkInSignal(c, c.calls ?? [], now);

  // Ordering (B4): furthest along first while getting live; worst health, then
  // overdue check-ins, then name once live.
  const gettingLive = filtered.filter(isGettingLive).sort((a, b) =>
    (b.setup?.done ?? 0) - (a.setup?.done ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const live = filtered.filter(c => !isGettingLive(c)).sort((a, b) => {
    const sev = HEALTH_STATUS_SEVERITY[a.health.status] - HEALTH_STATUS_SEVERITY[b.health.status];
    if (sev !== 0) return sev;
    const ao = signalOf(a).state === 'overdue' ? 0 : 1;
    const bo = signalOf(b).state === 'overdue' ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });

  // Archived paginates; the sheet caps per section instead.
  const archivedSorted = [...filtered].sort((a, b) => new Date(b.archivedAt || b.createdAt).getTime() - new Date(a.archivedAt || a.createdAt).getTime());
  const totalPages = Math.max(1, Math.ceil(archivedSorted.length / PAGE_SIZE));
  const pagedArchived = archivedSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => { setPage(0); }, [filterHealth, filterType, q]);

  // Header line — counts over everything loaded on the sheet, not the filter.
  const liveCount = courses.filter(c => !isGettingLive(c)).length;
  const gettingLiveCount = courses.filter(isGettingLive).length;
  const needsAttentionCount = courses.filter(c => NEEDS_ATTENTION_STATUSES.includes(c.health.status)).length;
  const checkInsDueCount = courses.filter(c => !isGettingLive(c) && ['due', 'overdue'].includes(signalOf(c).state)).length;

  if (!adminReady) return null;

  // ── the sheet ────────────────────────────────────────────────────────
  const thCls = 'text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium text-left px-3 py-2 whitespace-nowrap';
  const tdCls = 'px-3 py-2.5 align-top';
  type RowMode = 'getting_live' | 'live' | 'archived';

  const healthChip = (c: Course) => (
    <span className={
      'text-xs font-medium px-2 py-0.5 rounded-md inline-block ' + (
        c.health.dot === 'ok' ? 'bg-ok/5 text-ok' :
        c.health.dot === 'bad' ? 'bg-bad/5 text-bad' :
        c.health.dot === 'warn' ? 'bg-warn/5 text-warn' :
        'bg-line-soft text-ink-muted'
      )
    }>
      {c.health.label}
    </span>
  );

  const renderStatus = (c: Course, mode: RowMode) => {
    if (mode === 'archived') {
      return (
        <>
          <div className="text-sm text-ink-soft truncate">Archived{c.archivedAt ? ' ' + fmtShort(c.archivedAt) : ''}</div>
          <div className="text-[12px] text-ink-faint truncate">{c.archivedBy ? 'by ' + c.archivedBy : ''}</div>
        </>
      );
    }
    if (mode === 'getting_live') {
      const s = c.setup;
      return (
        <>
          <div className="flex items-center gap-2 text-sm text-ink">
            <StatusDot status={c.health.status === 'orphaned' ? 'bad' : 'warn'} />
            <span>{s ? `${s.done} of ${s.total}` : '—'}</span>
            {c.approvalStatus === 'approved' && <span className="text-[11px] text-ok">approved</span>}
          </div>
          <div className="text-[12px] text-ink-muted truncate">
            {c.health.status === 'orphaned' ? 'no linked inquiry' : s?.next ? `next: ${s.next.short}` : 'ready to go live'}
          </div>
        </>
      );
    }
    return (
      <>
        <div>{healthChip(c)}</div>
        <div className="text-[12px] text-ink-muted truncate" title={c.health.reason}>{c.health.reason}</div>
      </>
    );
  };

  const renderActivity = (c: Course, mode: RowMode) => {
    if (mode === 'getting_live') {
      const d = daysSinceIso(c.createdAt);
      return (
        <>
          <div className="text-sm text-ink">{d}d in setup</div>
          <div className="text-[12px] text-ink-muted">since {fmtShort(c.createdAt)}</div>
        </>
      );
    }
    // MP-5c: the API has always computed these — show the evidence.
    const trend = periodDelta(c.bookings30d, c.bookingsPrior30d ?? 0);
    const trendText = trend.pct === null ? null : `${trend.pct > 0 ? '+' : ''}${Math.round(trend.pct)}%`;
    const trendClass = trend.direction === 'up' ? 'text-ok' : trend.direction === 'down' ? 'text-bad' : 'text-ink-faint';
    return (
      <>
        <div className="text-sm text-ink">
          {c.bookings30d}<span className="text-ink-muted"> in 30d</span>
          {trendText && <span className={'ml-1.5 ' + trendClass}>{trendText}</span>}
        </div>
        <div className="text-[12px] text-ink-muted">last booking {lastBookingLabel(c.lastBookingAt).toLowerCase()}</div>
      </>
    );
  };

  const renderNextTouch = (c: Course, mode: RowMode) => {
    const sub = 'text-[12px] text-ink-muted truncate';
    if (mode === 'archived') return <span className="text-sm text-ink-faint">—</span>;
    if (mode === 'getting_live') {
      const calls = c.inquiryCalls ?? [];
      const upcoming = nextCall(calls, now);
      const missed = overdueCall(calls, now);
      if (upcoming) {
        return (
          <>
            <div className="text-sm text-ink font-medium truncate">{fmtDay(upcoming.scheduledAt)} · {fmtCallClock(upcoming.scheduledAt)}</div>
            <div className={sub}>discovery call · {upcoming.durationMin} min</div>
          </>
        );
      }
      if (missed && c.linkedInquiryId) {
        return (
          <>
            <Link href={`/admin/inquiries/${c.linkedInquiryId}`} onClick={e => e.stopPropagation()} className="text-sm text-pine font-medium hover:underline">Log the call</Link>
            <div className={sub}>was {fmtDay(missed.scheduledAt)}</div>
          </>
        );
      }
      if (c.linkedInquiryId) {
        return (
          <Link
            href={`/admin/inquiries/${c.linkedInquiryId}?call=1`}
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-pine border border-pine/30 hover:bg-pine/5 rounded-md px-2.5 py-1 transition-colors"
          >
            <Phone className="w-3 h-3" />Set up call
          </Link>
        );
      }
      return <span className="text-sm text-ink-faint">—</span>;
    }
    const sig = signalOf(c);
    if (sig.state === 'overdue') {
      return (
        <>
          <div className="text-sm text-bad font-semibold">Overdue · {sig.days}d</div>
          <div className={sub}>check-in{sig.at ? ' was ' + fmtShort(sig.at) : ''}</div>
        </>
      );
    }
    if (sig.state === 'due') {
      return (
        <>
          <div className="text-sm text-warn font-medium">Due {sig.days === 0 ? 'today' : sig.at ? fmtWeekday(sig.at) : 'soon'}</div>
          <div className={sub}>check-in{sig.at && sig.hasCall ? ' · ' + fmtCallClock(sig.at) : ''}</div>
        </>
      );
    }
    if (sig.state === 'scheduled' && sig.at) {
      return (
        <>
          <div className="text-sm text-ink">{fmtShort(sig.at)}</div>
          <div className={sub}>{sig.hasCall ? 'check-in call · ' + fmtCallClock(sig.at) : 'check-in'}</div>
        </>
      );
    }
    return (
      <Link
        href={`/admin/courses/${c.id}?checkin=1`}
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-pine border border-pine/30 hover:bg-pine/5 rounded-md px-2.5 py-1 transition-colors"
      >
        <Phone className="w-3 h-3" />Schedule
      </Link>
    );
  };

  const renderRow = (c: Course, mode: RowMode) => {
    const href = '/admin/courses/' + c.id;
    return (
      <tr key={c.id} onClick={() => router.push(href)} className="border-t border-line cursor-pointer hover:bg-pine/[0.02] transition-colors">
        {/* 1 · Course */}
        <td className={tdCls}>
          <div className="text-sm font-medium text-ink truncate">{c.name}</div>
          <div className="text-[12px] text-ink-muted truncate">{c.city}, {c.state} · <span className="capitalize">{c.type || 'public'}</span></div>
        </td>
        {/* 2 · Operator */}
        <td className={tdCls}>
          <div className="text-sm text-ink truncate">{c.operator?.name || <span className="text-ink-faint">No operator</span>}</div>
          <div className="text-[12px] text-ink-muted truncate">{c.operator?.email || ''}</div>
          {c.operator && !c.operator.emailVerified && (
            <span className="inline-block mt-0.5 text-[9px] font-medium uppercase tracking-[0.1em] bg-warn/10 text-warn px-1.5 py-0.5">Unverified</span>
          )}
        </td>
        {/* 3 · Status */}
        <td className={tdCls}>{renderStatus(c, mode)}</td>
        {/* 4 · Activity */}
        <td className={tdCls + ' hidden xl:table-cell'}>{renderActivity(c, mode)}</td>
        {/* 5 · Fees 30d */}
        <td className={tdCls + ' hidden lg:table-cell text-right text-sm text-ink whitespace-nowrap'}>
          {mode === 'getting_live' || c.revenue30d === null ? <span className="text-ink-faint">—</span> : `$${Math.round(c.revenue30d)}`}
        </td>
        {/* 6 · Next touch */}
        <td className={tdCls}>{renderNextTouch(c, mode)}</td>
        {/* 7 · Live since */}
        <td className={tdCls + ' hidden lg:table-cell text-right text-sm text-ink-soft whitespace-nowrap'}>
          {mode !== 'getting_live' && c.welcomeEmailSentAt ? fmtDate(c.welcomeEmailSentAt) : <span className="text-ink-faint">—</span>}
        </td>
        {/* 8 · Action */}
        <td className={tdCls + ' text-right whitespace-nowrap'}>
          <Link href={href} onClick={e => e.stopPropagation()} className="text-xs font-medium text-pine hover:underline px-1">Open</Link>
        </td>
      </tr>
    );
  };

  type Group = { key: string; title: string; hint: string; rows: Course[]; mode: RowMode };
  const renderTable = (groups: Group[]) => {
    const nonEmpty = groups.filter(g => g.rows.length > 0);
    if (nonEmpty.length === 0) return null;
    return (
      <div className="bg-white border border-line rounded-lg overflow-x-auto">
        <table className="w-full table-fixed min-w-[760px]">
          <thead>
            <tr className="bg-paper">
              <th className={thCls + ' w-[210px]'}>Course</th>
              <th className={thCls + ' w-[180px]'}>Operator</th>
              <th className={thCls + ' w-[150px]'}>Status</th>
              <th className={thCls + ' w-[140px] hidden xl:table-cell'}>Activity</th>
              <th className={thCls + ' w-[80px] hidden lg:table-cell text-right'}>Fees 30d</th>
              <th className={thCls + ' w-[150px]'}>Next touch</th>
              <th className={thCls + ' w-[96px] hidden lg:table-cell text-right'}>Live since</th>
              <th className={thCls + ' w-[72px] text-right'}><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          {nonEmpty.map(g => {
            const shown = g.rows.slice(0, SECTION_CAP);
            return (
              <tbody key={g.key}>
                {g.title && (
                  <tr className="border-t border-line">
                    <td colSpan={8} className="bg-paper px-3 py-1.5">
                      <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">{g.title}</span>
                      <span className="text-[11px] text-ink-faint ml-2">{g.rows.length}{g.hint ? ' · ' + g.hint : ''}</span>
                    </td>
                  </tr>
                )}
                {shown.map(c => renderRow(c, g.mode))}
                {g.rows.length > SECTION_CAP && (
                  <tr className="border-t border-line">
                    <td colSpan={8} className="px-3 py-2 text-[11px] text-ink-faint">
                      Showing the top {SECTION_CAP} of {g.rows.length} — narrow it with search or a filter.
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
    );
  };

  const selCls = 'bg-white border border-line text-ink-soft text-[11px] rounded-md px-3 py-1.5 outline-none focus:border-pine/40 cursor-pointer';

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="courses" />
      <div className="admin-content flex-1 flex flex-col min-h-screen">
        <div className="px-8 py-7">
          {/* MP-2d: was a sibling of this container — full-bleed, above the title. */}
          {loadError && (
            <ErrorBanner message={loadError.msg} kind={loadError.kind} onRetry={() => loadCourses(view)} />
          )}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[30px] leading-none font-serif font-medium text-ink">Courses</h1>
              <p className="text-[13.5px] text-ink-soft mt-2">
                {loadError ? '—' : view === 'archived'
                  ? `${filtered.length} archived`
                  : `${liveCount} live · ${gettingLiveCount} getting live · ${needsAttentionCount} need attention · ${checkInsDueCount} check-in${checkInsDueCount === 1 ? '' : 's'} due · ${archivedCount ?? '—'} archived`}
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
                onClick={() => loadCourses(view)}
                className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-line transition-colors"
              >
                <RefreshCw className="w-4 h-4" />Refresh
              </button>
              {/* CS-2 §1: every course as a CSV, same auth as the list. */}
              <a
                href="/api/admin/courses?format=csv"
                download
                className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-line transition-colors"
              >
                <Download className="w-4 h-4" />Export CSV
              </a>
            </div>
          </div>

          {view === 'sheet' && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <select value={filterHealth} onChange={e => setFilterHealth(e.target.value as HealthFilter)} className={selCls}>
                {HEALTH_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selCls}>
                <option value="">All types</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              {(filterHealth !== 'all' || filterType) && (
                <button onClick={() => { setFilterHealth('all'); setFilterType(''); }} className="text-xs text-ink-faint hover:text-ink transition-colors">Clear filters</button>
              )}
            </div>
          )}

          {loading && <div className="text-ink-muted py-20 text-center text-sm">Loading...</div>}

          {!loading && !loadError && view === 'sheet' && (
            <div>
              {renderTable([
                { key: 'getting_live', title: 'Getting live', hint: 'not on the public site yet — furthest along first', rows: gettingLive, mode: 'getting_live' },
                { key: 'live', title: 'Live', hint: 'worst health first', rows: live, mode: 'live' },
              ])}
              {filtered.length === 0 && <EmptyState message={q || filterHealth !== 'all' || filterType ? 'No courses match — clear your search or filters' : 'No courses yet'} />}
            </div>
          )}

          {!loading && !loadError && view === 'archived' && (
            <div>
              {renderTable([{ key: 'archived', title: 'Archived', hint: 'off the public site, data retained', rows: pagedArchived, mode: 'archived' }])}
              {archivedSorted.length === 0 && <EmptyState message={q ? 'No archived courses match' : 'Nothing archived'} />}
              {archivedSorted.length > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4 text-xs text-ink-muted">
                  <span>Page {page + 1} of {totalPages} · {archivedSorted.length} total</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="px-3 py-1.5 rounded-md border border-line bg-white hover:bg-paper disabled:opacity-40 transition-colors">Previous</button>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                      className="px-3 py-1.5 rounded-md border border-line bg-white hover:bg-paper disabled:opacity-40 transition-colors">Next</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Records, demoted out of the work — like the inquiries sheet. */}
          {!loading && (
            <div className="mt-8 pt-4 border-t border-line-soft flex items-center gap-4 text-xs">
              <button onClick={() => goTo('sheet')} className={'transition-colors ' + (view === 'sheet' ? 'text-ink font-medium' : 'text-pine hover:text-pine-hover font-medium')}>
                {view === 'sheet' ? `All (${courses.length})` : 'Back to the sheet'}
              </button>
              <button onClick={() => goTo('archived')} className={'transition-colors ' + (view === 'archived' ? 'text-ink font-medium' : 'text-ink-muted hover:text-ink')}>
                Archived ({view === 'archived' ? courses.length : (archivedCount ?? '—')})
              </button>
            </div>
          )}
        </div>
      </div>
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
