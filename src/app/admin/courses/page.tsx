'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Star, Power, Globe, Eye, ArchiveRestore, RefreshCw, Search, ArchiveX } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { EmptyState } from '@/components/EmptyState';

interface Course {
  id: string; name: string; city: string; state: string; active: boolean; featured: boolean;
  stripeAccountActive: boolean; slug: string; type?: string;
  operator: { email: string; name: string; onboardingStep: number; emailVerified: boolean } | null;
  createdAt: string; archivedAt?: string | null; archivedBy?: string | null;
  bookings30d: number; revenue30d: number; activeMemberCount: number;
  lastBookingAt?: string | null; bookingsPrior30d?: number;
}

function relTime(d: string | null): string {
  if (!d) return 'never';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function healthSortScore(c: Course): number {
  if (c.archivedAt || !c.active) return -1;
  const courseAgeDays = (Date.now() - new Date(c.createdAt).getTime()) / 86400000;
  if (courseAgeDays < 14 && !c.lastBookingAt) return 0;
  if (!c.lastBookingAt) return 9999;
  return (Date.now() - new Date(c.lastBookingAt).getTime()) / 86400000;
}

const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function CoursesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [adminReady, setAdminReady] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'offline'>('all');
  const [filterStripe, setFilterStripe] = useState<'all' | 'yes' | 'no'>('all');
  const [filterFeatured, setFilterFeatured] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'bookings' | 'revenue' | 'health'>('newest');
  const [hardDeleteId, setHardDeleteId] = useState<string | null>(null);
  const [hardDeleteInput, setHardDeleteInput] = useState('');

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

  async function archiveCourse(id: string, name: string, bookings30d: number) {
    const activityWarn = bookings30d > 0
      ? `\n\nThis course has ${bookings30d} booking${bookings30d !== 1 ? 's' : ''} in the last 30 days. Existing bookings and their data are preserved.`
      : '';
    if (!confirm(`Archive "${name}"? The course disappears from the public site but data is retained. You can restore it later.${activityWarn}`)) return;
    const r = await fetch('/api/admin/archive-course', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId: id, action: 'archive' }),
    });
    if (r.ok) setCourses(prev => prev.filter(c => c.id !== id));
    else { const d = await r.json(); alert(`Archive failed: ${d.error}`); }
  }

  async function restoreCourse(id: string) {
    const r = await fetch('/api/admin/archive-course', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId: id, action: 'restore' }),
    });
    if (r.ok) loadCourses(archiveFilter);
    else { const d = await r.json(); alert(`Restore failed: ${d.error}`); }
  }

  async function hardDeleteCourse(id: string, name: string) {
    const r = await fetch('/api/admin/archive-course', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ courseId: id, action: 'hard_delete', confirmName: hardDeleteInput }),
    });
    if (r.ok) {
      setCourses(prev => prev.filter(c => c.id !== id));
      setHardDeleteId(null);
      setHardDeleteInput('');
    } else {
      const d = await r.json();
      alert(`Delete failed: ${d.error}`);
    }
  }

  async function toggleCourseActive(courseId: string, active: boolean) {
    await fetch('/api/admin/course-detail', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, active }),
    });
    setCourses(c => c.map(x => x.id === courseId ? { ...x, active } : x));
  }

  async function toggleFeatured(courseId: string, featured: boolean) {
    await fetch('/api/admin/course-detail', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, featured }),
    });
    setCourses(c => c.map(x => x.id === courseId ? { ...x, featured } : x));
  }

  const q = search.toLowerCase().trim();
  let filteredCourses = q
    ? courses.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        (c.operator?.email || '').toLowerCase().includes(q)
      )
    : [...courses];
  if (archiveFilter !== 'archived') {
    if (filterStatus === 'live') filteredCourses = filteredCourses.filter(c => c.active && !c.archivedAt);
    else if (filterStatus === 'offline') filteredCourses = filteredCourses.filter(c => !c.active && !c.archivedAt);
    if (filterStripe === 'yes') filteredCourses = filteredCourses.filter(c => c.stripeAccountActive);
    else if (filterStripe === 'no') filteredCourses = filteredCourses.filter(c => !c.stripeAccountActive);
    if (filterFeatured) filteredCourses = filteredCourses.filter(c => c.featured);
    if (filterType) filteredCourses = filteredCourses.filter(c => (c.type || 'public') === filterType);
  }
  if (sortBy === 'name') filteredCourses = [...filteredCourses].sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'bookings') filteredCourses = [...filteredCourses].sort((a, b) => b.bookings30d - a.bookings30d);
  else if (sortBy === 'revenue') filteredCourses = [...filteredCourses].sort((a, b) => b.revenue30d - a.revenue30d);
  else if (sortBy === 'health') filteredCourses = [...filteredCourses].sort((a, b) => healthSortScore(b) - healthSortScore(a));

  const totalCourses = courses.length;
  const liveCourses = archiveFilter !== 'archived' ? courses.filter(c => c.active && !c.archivedAt).length : 0;

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="courses" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-6xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">All Courses</h1>
              <p className="text-sm text-ink-soft mt-0.5">
                {archiveFilter === 'archived'
                  ? `${totalCourses} archived`
                  : archiveFilter === 'all'
                    ? `${totalCourses} total · ${liveCourses} live`
                    : `${liveCourses} live · ${courses.filter(c => !c.active && !c.archivedAt).length} offline`}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, slug, email..."
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
                  onClick={() => { setArchiveFilter(key); setFilterStatus('all'); }}
                  className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (archiveFilter === key ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>

            {archiveFilter !== 'archived' && (
              <>
                <div className="flex items-center gap-1 bg-white border border-line rounded-lg p-1">
                  {(['all', 'live', 'offline'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={'px-3 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ' + (filterStatus === s ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}
                    >
                      {s === 'all' ? 'All status' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 bg-white border border-line rounded-lg p-1">
                  {(['all', 'yes', 'no'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterStripe(s)}
                      className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (filterStripe === s ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}
                    >
                      {s === 'all' ? 'All Stripe' : s === 'yes' ? 'Connected' : 'No Stripe'}
                    </button>
                  ))}
                </div>
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
              {(['newest', 'name', 'bookings', 'revenue', 'health'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (sortBy === s ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}
                >
                  {s === 'newest' ? 'Newest' : s === 'name' ? 'Name A–Z' : s === 'bookings' ? 'Bookings' : s === 'revenue' ? 'Revenue' : 'Health'}
                </button>
              ))}
            </div>
          </div>

          {loading && <div className="text-ink-muted py-20 text-center text-sm">Loading...</div>}

          <div className="space-y-2">
            {filteredCourses.map(course => (
              <div
                key={course.id}
                onClick={() => router.push('/admin/courses/' + course.id)}
                className={'bg-white border rounded-lg px-5 py-3.5 flex items-center gap-5 hover:border-line-strong transition-colors cursor-pointer ' + (course.archivedAt ? 'border-bad/20 opacity-75' : 'border-line')}
              >
                <StatusDot status={course.archivedAt ? 'bad' : course.active ? 'ok' : 'neutral'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-0.5">
                    <span className="font-medium text-ink truncate">{course.name}</span>
                    {course.featured && <Star className="w-3.5 h-3.5 text-warn fill-warn shrink-0" />}
                    {course.archivedAt && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-bad/5 text-bad border border-bad/20 shrink-0">Archived</span>
                    )}
                    {!course.archivedAt && course.stripeAccountActive && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-pine/5 text-pine border border-pine/20 shrink-0">Stripe</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {course.city}, {course.state} · <span className="capitalize">{course.type || 'public'}</span>
                    {course.archivedAt && course.archivedBy && (
                      <span className="ml-2 text-bad/70">Archived by {course.archivedBy}</span>
                    )}
                  </div>
                </div>
                <div className="w-48 min-w-0 hidden md:block">
                  {course.operator ? (
                    <div>
                      <div className="text-xs text-ink truncate">{course.operator.name}</div>
                      <div className="text-xs text-ink-muted truncate">{course.operator.email}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {course.operator.emailVerified
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-ok/5 text-ok border border-ok/20">Verified</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-paper text-ink-muted border border-line">Unverified</span>}
                        <span className="text-[10px] text-ink-muted">{course.operator.onboardingStep}/3</span>
                      </div>
                    </div>
                  ) : <div className="text-xs text-ink-faint">No operator</div>}
                </div>
                {!course.archivedAt && (
                  <div className="w-32 shrink-0 hidden lg:block text-right">
                    <div className="text-base font-serif font-medium text-ink leading-none">{course.bookings30d}</div>
                    <div className="text-[10px] text-ink-muted mb-1.5">30d bk</div>
                    <div className="text-xs font-medium text-ok">{fmtMoney(course.revenue30d)}</div>
                    <div className="text-[10px] text-ink-muted">30d rev</div>
                    {course.activeMemberCount > 0 && (
                      <div className="text-[10px] text-pine mt-1">{course.activeMemberCount} mbr</div>
                    )}
                  </div>
                )}
                {(() => {
                  if (course.archivedAt) return <div className="w-32 shrink-0 hidden xl:block text-right text-xs text-ink-faint">—</div>;
                  const courseAgeDays = (Date.now() - new Date(course.createdAt).getTime()) / 86400000;
                  const lastDays = course.lastBookingAt ? Math.floor((Date.now() - new Date(course.lastBookingAt).getTime()) / 86400000) : null;
                  const isNew = courseAgeDays < 14 && lastDays === null;
                  const lastColor = isNew ? 'text-ink-muted' : lastDays === null ? 'text-bad' : lastDays > 30 ? 'text-bad' : lastDays > 14 ? 'text-warn' : 'text-ok';
                  const lastLabel = isNew ? 'new' : course.lastBookingAt ? relTime(course.lastBookingAt) : 'never';
                  const prior = course.bookingsPrior30d ?? 0;
                  const curr = course.bookings30d;
                  const trendArrow = prior === 0 ? '' : curr > prior ? '↑' : curr < prior ? '↓' : '→';
                  const trendColor = prior === 0 ? '' : curr > prior ? 'text-ok' : curr < prior ? 'text-bad' : 'text-ink-muted';
                  return (
                    <div className="w-32 shrink-0 hidden xl:block text-right" title={course.lastBookingAt ? `Last booking: ${new Date(course.lastBookingAt).toLocaleDateString()}` : 'No bookings yet'}>
                      <div className={`text-xs font-medium ${lastColor}`}>{lastLabel}</div>
                      <div className="text-[10px] text-ink-muted mb-1">last bk</div>
                      {prior > 0 ? (
                        <div className={`text-xs font-medium ${trendColor}`}>{curr} {trendArrow} {prior}</div>
                      ) : (
                        <div className="text-xs text-ink-faint">{curr} / —</div>
                      )}
                      <div className="text-[10px] text-ink-muted">trend</div>
                      <div className="text-xs text-ink-faint mt-1">—</div>
                      <div className="text-[10px] text-ink-muted">op login</div>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  {course.archivedAt ? (
                    <>
                      <button
                        onClick={() => restoreCourse(course.id)}
                        className="flex items-center gap-1 text-xs font-medium text-ok hover:text-ok/80 bg-ok/5 hover:bg-ok/10 border border-ok/20 px-3 py-1.5 rounded-md transition-colors"
                        title="Restore course"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />Restore
                      </button>
                      <button
                        onClick={() => { setHardDeleteId(course.id); setHardDeleteInput(''); }}
                        className="flex items-center gap-1 text-xs font-medium text-bad hover:text-bad/80 bg-bad/5 hover:bg-bad/10 border border-bad/20 px-3 py-1.5 rounded-md transition-colors"
                        title="Permanently delete"
                      >
                        Delete permanently
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => toggleFeatured(course.id, !course.featured)}
                        className={'w-8 h-8 flex items-center justify-center rounded-md transition-colors ' + (course.featured ? 'text-warn bg-warn/10' : 'text-ink-muted hover:text-warn hover:bg-warn/5')}
                        title={course.featured ? 'Unfeature' : 'Feature'}
                      >
                        <Star className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleCourseActive(course.id, !course.active)}
                        className={'w-8 h-8 flex items-center justify-center rounded-md transition-colors ' + (course.active ? 'text-ok hover:text-bad hover:bg-bad/5' : 'text-ink-muted hover:text-ok hover:bg-ok/5')}
                        title={course.active ? 'Take offline' : 'Set live'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <a
                        href={'/courses/' + course.slug}
                        target="_blank"
                        className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-pine hover:bg-pine/5 transition-colors"
                        title="View public page"
                      >
                        <Globe className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => router.push('/admin/courses/' + course.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper transition-colors"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => archiveCourse(course.id, course.name, course.bookings30d)}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-bad hover:bg-bad/5 transition-colors"
                        title="Archive course"
                      >
                        <ArchiveX className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {!loading && filteredCourses.length === 0 && (
              <EmptyState message="No courses found" />
            )}
          </div>
        </div>
      </div>

      {/* Hard delete confirmation modal */}
      {hardDeleteId && (() => {
        const course = courses.find(c => c.id === hardDeleteId);
        if (!course) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
            <div className="bg-white rounded-lg border border-line shadow-xl w-full max-w-md mx-4 p-6">
              <h3 className="text-[15px] font-serif font-medium text-ink mb-1">Permanently delete this course?</h3>
              <p className="text-sm text-ink-soft mb-4">
                This deletes all bookings, tee times, members, and all other data for <strong>{course.name}</strong>. This cannot be undone.
              </p>
              <label className="text-xs text-ink-muted block mb-1.5">Type the course name to confirm</label>
              <input
                value={hardDeleteInput}
                onChange={e => setHardDeleteInput(e.target.value)}
                placeholder={course.name}
                className="w-full bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-bad/40 mb-4"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setHardDeleteId(null); setHardDeleteInput(''); }}
                  className="px-4 py-2 text-sm text-ink-soft hover:text-ink border border-line rounded-md transition-colors"
                >Cancel</button>
                <button
                  onClick={() => hardDeleteCourse(hardDeleteId, course.name)}
                  disabled={hardDeleteInput.trim() !== course.name.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-bad hover:bg-bad/90 disabled:opacity-40 rounded-md transition-colors"
                >Delete permanently</button>
              </div>
            </div>
          </div>
        );
      })()}
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
