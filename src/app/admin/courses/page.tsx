'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Star, RefreshCw, Search } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { EmptyState } from '@/components/EmptyState';
import { HEALTH_STATUS_LABEL, HEALTH_STATUS_SEVERITY, type CourseHealthStatus } from '@/lib/course-metrics';

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

const STATUS_FILTER_OPTIONS: CourseHealthStatus[] = ['healthy', 'setup_incomplete', 'payments_broken', 'going_quiet', 'offline'];

function CoursesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [adminReady, setAdminReady] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [filterHealth, setFilterHealth] = useState<'all' | CourseHealthStatus>('all');
  const [filterFeatured, setFilterFeatured] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [sortBy, setSortBy] = useState<'severity' | 'newest' | 'name'>('severity');
  const [page, setPage] = useState(0);

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  const loadCourses = useCallback(async (af: 'active' | 'archived' | 'all' = 'active') => {
    setLoading(true);
    try {
      if (af === 'all') {
        const [r1, r2] = await Promise.all([
          fetch('/api/admin/courses', { headers: H() }),
          fetch('/api/admin/courses?showArchived=1', { headers: H() }),
        ]);
        if (r1.ok && r2.ok) {
          const [active, archived] = await Promise.all([r1.json(), r2.json()]);
          setCourses([...active, ...archived]);
        } else {
          setCourses([]);
        }
      } else {
        const url = '/api/admin/courses' + (af === 'archived' ? '?showArchived=1' : '');
        const r = await fetch(url, { headers: H() });
        if (r.ok) setCourses(await r.json());
        else setCourses([]);
      }
    } catch { setCourses([]); }
    setLoading(false);
  }, [H]);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (!adminReady) return;
    loadCourses(archiveFilter);
    const courseId = params.get('courseId');
    if (courseId) router.replace('/admin/courses/' + courseId);
  }, [adminReady, archiveFilter, loadCourses, params, router]);

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
  if (archiveFilter !== 'archived') {
    // A-04 item 4: Live/Offline + Stripe filters fold into the status chips
    // — a worded status IS what those used to mean.
    if (filterHealth !== 'all') filteredCourses = filteredCourses.filter(c => c.health.status === filterHealth);
    if (filterFeatured) filteredCourses = filteredCourses.filter(c => c.featured);
    if (filterType) filteredCourses = filteredCourses.filter(c => (c.type || 'public') === filterType);
  }
  if (sortBy === 'name') filteredCourses = [...filteredCourses].sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'newest') filteredCourses = [...filteredCourses].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  else filteredCourses = [...filteredCourses].sort((a, b) => HEALTH_STATUS_SEVERITY[a.health.status] - HEALTH_STATUS_SEVERITY[b.health.status]);

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / PAGE_SIZE));
  const pagedCourses = filteredCourses.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [archiveFilter, filterHealth, filterFeatured, filterType, q]);

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="courses" />
      <div className="admin-content flex-1 flex flex-col min-h-screen">
        <div className="px-8 py-7">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">All Courses</h1>
              {/* A-04 item 5: count line always reflects the active filter set */}
              <p className="text-sm text-ink-soft mt-0.5">
                {filteredCourses.length} course{filteredCourses.length === 1 ? '' : 's'}
                {(filterHealth !== 'all' || filterType || filterFeatured || q) ? ' matching filters' : ''}
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
                onClick={() => loadCourses(archiveFilter)}
                className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-line transition-colors"
              >
                <RefreshCw className="w-4 h-4" />Refresh
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {/* All / Active / Archived segmented filter */}
            <div className="flex items-center gap-1 bg-white border border-line rounded-lg p-1">
              {([['active', 'Active'], ['archived', 'Archived'], ['all', 'All']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setArchiveFilter(key); setFilterHealth('all'); }}
                  className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (archiveFilter === key ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>

            {archiveFilter !== 'archived' && (
              <>
                <select
                  value={filterHealth}
                  onChange={e => setFilterHealth(e.target.value as 'all' | CourseHealthStatus)}
                  className="bg-white border border-line text-ink-soft text-[11px] rounded-md px-3 py-1.5 outline-none focus:border-pine/40 cursor-pointer"
                >
                  <option value="all">All statuses</option>
                  {STATUS_FILTER_OPTIONS.map(s => (
                    <option key={s} value={s}>{HEALTH_STATUS_LABEL[s]}</option>
                  ))}
                </select>
                <button
                  onClick={() => setFilterFeatured(v => !v)}
                  className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors ' + (filterFeatured ? 'bg-warn/10 text-warn border-warn/30' : 'text-ink-muted border-line hover:border-line-strong hover:text-ink')}
                >
                  <Star className="w-3 h-3" />Featured
                </button>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="bg-white border border-line text-ink-soft text-[11px] rounded-md px-3 py-1.5 outline-none focus:border-pine/40 cursor-pointer"
                >
                  <option value="">All types</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="semi-private">Semi-private</option>
                  <option value="resort">Resort</option>
                </select>
              </>
            )}

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
                    {course.featured && <Star className="w-3.5 h-3.5 text-warn fill-warn shrink-0" />}
                    {course.approvalStatus === 'approved' && course.health.status === 'setup_incomplete' && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-ok/5 text-ok border border-ok/20 shrink-0">Approved</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {course.city}, {course.state} · <span className="capitalize">{course.type || 'public'}</span>
                  </div>
                </div>
                <div className="w-44 min-w-0 hidden md:block">
                  <div className="text-xs text-ink-soft truncate">{course.operator?.name || 'No operator'}</div>
                </div>
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
            {!loading && filteredCourses.length === 0 && (
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
