'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Star, Power, Globe, Eye, Trash2, RefreshCw, Search } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface Course {
  id: string; name: string; city: string; state: string; active: boolean; featured: boolean;
  stripeAccountActive: boolean; slug: string; type?: string;
  operator: { email: string; name: string; onboardingStep: number; emailVerified: boolean } | null;
  createdAt: string;
  bookings30d: number; revenue30d: number; activeMemberCount: number;
}

const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function CoursesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [adminReady, setAdminReady] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'offline'>('all');
  const [filterStripe, setFilterStripe] = useState<'all' | 'yes' | 'no'>('all');
  const [filterFeatured, setFilterFeatured] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'bookings' | 'revenue'>('newest');

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/courses', { headers: H() });
    if (r.ok) setCourses(await r.json());
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
    loadCourses();
    const courseId = params.get('courseId');
    if (courseId) router.replace('/admin/courses/' + courseId);
  }, [adminReady, loadCourses, params, router]);

  async function deleteCourse(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}" and ALL its data? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/courses?id=${id}`, { method: 'DELETE', headers: H() });
    if (r.ok) setCourses(prev => prev.filter(c => c.id !== id));
    else { const d = await r.json(); alert(`Delete failed: ${d.error}`); }
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
  if (filterStatus === 'live') filteredCourses = filteredCourses.filter(c => c.active);
  else if (filterStatus === 'offline') filteredCourses = filteredCourses.filter(c => !c.active);
  if (filterStripe === 'yes') filteredCourses = filteredCourses.filter(c => c.stripeAccountActive);
  else if (filterStripe === 'no') filteredCourses = filteredCourses.filter(c => !c.stripeAccountActive);
  if (filterFeatured) filteredCourses = filteredCourses.filter(c => c.featured);
  if (filterType) filteredCourses = filteredCourses.filter(c => (c.type || 'public') === filterType);
  if (sortBy === 'name') filteredCourses = [...filteredCourses].sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'bookings') filteredCourses = [...filteredCourses].sort((a, b) => b.bookings30d - a.bookings30d);
  else if (sortBy === 'revenue') filteredCourses = [...filteredCourses].sort((a, b) => b.revenue30d - a.revenue30d);

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="courses" />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-6xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">All Courses</h1>
              <p className="text-sm text-ink-soft mt-0.5">
                {courses.filter(c => c.active).length} live · {courses.filter(c => !c.active).length} offline
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
                onClick={loadCourses}
                className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-line transition-colors"
              >
                <RefreshCw className="w-4 h-4" />Refresh
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-5 flex-wrap">
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
            <div className="flex items-center gap-1 bg-white border border-line rounded-lg p-1 ml-auto">
              {(['newest', 'name', 'bookings', 'revenue'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (sortBy === s ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}
                >
                  {s === 'newest' ? 'Newest' : s === 'name' ? 'Name A–Z' : s === 'bookings' ? 'Bookings' : 'Revenue'}
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
                className="bg-white border border-line rounded-lg px-5 py-3.5 flex items-center gap-5 hover:border-line-strong transition-colors cursor-pointer"
              >
                <StatusDot status={course.active ? 'ok' : 'neutral'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-0.5">
                    <span className="font-medium text-ink truncate">{course.name}</span>
                    {course.featured && <Star className="w-3.5 h-3.5 text-warn fill-warn shrink-0" />}
                    {course.stripeAccountActive && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-pine/5 text-pine border border-pine/20 shrink-0">Stripe</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {course.city}, {course.state} · <span className="capitalize">{course.type || 'public'}</span>
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
                <div className="w-32 shrink-0 hidden lg:block text-right">
                  <div className="text-base font-serif font-medium text-ink leading-none">{course.bookings30d}</div>
                  <div className="text-[10px] text-ink-muted mb-1.5">30d bk</div>
                  <div className="text-xs font-medium text-ok">{fmtMoney(course.revenue30d)}</div>
                  <div className="text-[10px] text-ink-muted">30d rev</div>
                  {course.activeMemberCount > 0 && (
                    <div className="text-[10px] text-pine mt-1">{course.activeMemberCount} mbr</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
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
                    onClick={() => deleteCourse(course.id, course.name)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-bad hover:bg-bad/5 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {!loading && filteredCourses.length === 0 && (
              <div className="text-ink-muted text-center py-20 text-sm">No courses found</div>
            )}
          </div>
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
