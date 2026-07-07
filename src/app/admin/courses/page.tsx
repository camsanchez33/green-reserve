'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Star, Power, Globe, Eye, ArrowLeft, Trash2, RefreshCw, Calendar,
  Ban, Plus, X, Mail, Phone, Search,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface Course {
  id: string; name: string; city: string; state: string; active: boolean; featured: boolean;
  stripeAccountActive: boolean; slug: string; type?: string;
  operator: { email: string; name: string; onboardingStep: number; emailVerified: boolean } | null;
  createdAt: string;
  bookings30d: number; revenue30d: number; activeMemberCount: number;
}
interface CourseDetail {
  course: Course & { operator: Record<string,unknown>|null; schedules: unknown[] };
  staff: { id:string;name:string;email:string;role:string;active:boolean }[];
  recentBookings: { id:string;golferName:string;golferEmail:string;players:number;totalAmount:number;createdAt:string;teeTime:{date:string;time:string} }[];
  totalBookings: number;
  revenue30d: { gross:number; platform:number; greenFees:number };
}
interface TeeSlot {
  id: string; time: string; holes: number; playersAvailable: number; playersBooked: number;
  greenFee: number; cartFee: number; status: string; tierName: string;
  bookings: { id:string; golferName:string; golferEmail:string; golferPhone:string; players:number; totalAmount:number; paymentStatus:string }[];
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const fmtTime = (t: string) => { const [h,m]=t.split(':'); const hr=Number(h); return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?'PM':'AM'}`; };
const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function CoursesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [adminReady, setAdminReady] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all'|'live'|'offline'>('all');
  const [filterStripe, setFilterStripe] = useState<'all'|'yes'|'no'>('all');
  const [filterFeatured, setFilterFeatured] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [sortBy, setSortBy] = useState<'newest'|'name'|'bookings'|'revenue'>('newest');
  const [detail, setDetail] = useState<CourseDetail|null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'overview'|'contact'|'setup'|'teesheet'>('overview');
  const [setupForm, setSetupForm] = useState<Record<string, unknown>>({});
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupMsg, setSetupMsg] = useState('');
  const [schedules, setSchedules] = useState<{id:string;daysOfWeek:number[];startTime:string;endTime:string;intervalMinutes:number;greenFeeWeekday:number;greenFeeWeekend:number;memberRateWeekday:number|null;memberRateWeekend:number|null;cartFee:number;walkingAllowed:boolean}[]>([]);
  const [newSchedule, setNewSchedule] = useState({ daysOfWeek:[] as number[], startTime:'06:00', endTime:'18:00', intervalMinutes:8, greenFeeWeekday:65, greenFeeWeekend:85, memberRateWeekday:'', memberRateWeekend:'', cartFee:18, walkingAllowed:true });
  const [tsDate, setTsDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [tsSlots, setTsSlots] = useState<TeeSlot[]>([]);
  const [tsLoading, setTsLoading] = useState(false);
  const [manualSlot, setManualSlot] = useState<string|null>(null);
  const [manualForm, setManualForm] = useState({ name:'', email:'', phone:'', players:1 });

  const H = useCallback(() => ({ 'Content-Type':'application/json' }), []);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/courses', { headers: H() });
    if (r.ok) setCourses(await r.json());
    setLoading(false);
  }, [H]);

  const loadSchedules = useCallback(async (courseId: string) => {
    const r = await fetch(`/api/admin/schedule?courseId=${courseId}`, { headers: H() });
    if (r.ok) setSchedules(await r.json());
  }, [H]);

  const loadTeeSheet = useCallback(async (courseId: string, date: string) => {
    setTsLoading(true); setTsSlots([]);
    const r = await fetch(`/api/admin/tee-sheet?courseId=${courseId}&date=${date}`, { headers: H() });
    if (r.ok) setTsSlots(await r.json());
    setTsLoading(false);
  }, [H]);

  const openDetailById = useCallback(async (courseId: string, tab?: string, courseType?: string) => {
    setDetailLoading(true); setDetail(null);
    const r = await fetch(`/api/admin/course-detail?courseId=${courseId}`, { headers: H() });
    if (r.ok) {
      const d = await r.json();
      setDetail(d);
      const resolvedTab = (tab as 'overview'|'contact'|'setup'|'teesheet') || 'overview';
      setDrawerTab(resolvedTab);
      if (resolvedTab === 'setup') {
        let sf = d.course;
        if (courseType === 'private' && !d.course.hasMemberPricing) sf = { ...sf, hasMemberPricing: true };
        setSetupForm(sf);
        loadSchedules(courseId);
      }
    }
    setDetailLoading(false);
  }, [H, loadSchedules]);

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
    if (courseId) {
      const tab = params.get('tab') || 'overview';
      const courseType = params.get('courseType') || '';
      openDetailById(courseId, tab, courseType);
    }
  }, [adminReady, loadCourses, params, openDetailById]);

  async function openDetail(course: Course) {
    setDetailLoading(true); setDetail(null); setDrawerTab('overview');
    const r = await fetch(`/api/admin/course-detail?courseId=${course.id}`, { headers: H() });
    if (r.ok) setDetail(await r.json());
    setDetailLoading(false);
  }

  async function deleteCourse(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}" and ALL its data? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/courses?id=${id}`, { method:'DELETE', headers: H() });
    if (r.ok) { setCourses(prev => prev.filter(c => c.id !== id)); setDetail(null); }
    else { const d = await r.json(); alert(`Delete failed: ${d.error}`); }
  }

  async function toggleCourseActive(courseId: string, active: boolean) {
    await fetch('/api/admin/course-detail', { method:'PATCH', headers:H(), body:JSON.stringify({ courseId, active }) });
    setCourses(c => c.map(x => x.id === courseId ? { ...x, active } : x));
    if (detail?.course?.id === courseId) setDetail(d => d ? { ...d, course: { ...d.course, active } } : d);
  }

  async function toggleFeatured(courseId: string, featured: boolean) {
    await fetch('/api/admin/course-detail', { method:'PATCH', headers:H(), body:JSON.stringify({ courseId, featured }) });
    setCourses(c => c.map(x => x.id === courseId ? { ...x, featured } : x));
  }

  async function saveSetup() {
    if (!detail?.course?.id) return;
    setSetupSaving(true); setSetupMsg('');
    const r = await fetch('/api/admin/course-settings', { method:'PATCH', headers:H(), body:JSON.stringify({ courseId: detail.course.id, ...setupForm }) });
    setSetupSaving(false);
    setSetupMsg(r.ok ? 'saved' : 'error');
    if (r.ok) loadCourses();
  }

  function toggleNewScheduleDay(d: number) {
    setNewSchedule(s => ({ ...s, daysOfWeek: s.daysOfWeek.includes(d) ? s.daysOfWeek.filter(x => x !== d) : [...s.daysOfWeek, d] }));
  }

  async function addSchedule() {
    if (!detail?.course?.id) return;
    setSetupSaving(true); setSetupMsg('');
    const r = await fetch('/api/admin/schedule', { method:'POST', headers:H(), body:JSON.stringify({ courseId: detail.course.id, ...newSchedule }) });
    setSetupSaving(false);
    if (r.ok) { setSetupMsg('schedule_saved'); loadSchedules(detail.course.id); }
    else { setSetupMsg('error'); }
  }

  async function deleteSchedule(id: string) {
    if (!detail?.course?.id) return;
    await fetch('/api/admin/schedule', { method:'DELETE', headers:H(), body:JSON.stringify({ id }) });
    loadSchedules(detail.course.id);
  }

  async function blockSlot(teeTimeId: string, block: boolean) {
    await fetch('/api/admin/tee-sheet', { method:'PATCH', headers:H(), body:JSON.stringify({ action: block ? 'block' : 'unblock', teeTimeId }) });
    if (detail?.course) loadTeeSheet(detail.course.id, tsDate);
  }

  async function cancelBooking(bookingId: string) {
    if (!confirm('Cancel this booking?')) return;
    await fetch('/api/admin/tee-sheet', { method:'PATCH', headers:H(), body:JSON.stringify({ action:'cancel_booking', bookingId }) });
    if (detail?.course) loadTeeSheet(detail.course.id, tsDate);
  }

  async function addManualBooking() {
    if (!manualSlot) return;
    const r = await fetch('/api/admin/tee-sheet', { method:'POST', headers:H(), body:JSON.stringify({ teeTimeId: manualSlot, ...manualForm }) });
    if (r.ok) { setManualSlot(null); setManualForm({ name:'', email:'', phone:'', players:1 }); if (detail?.course) loadTeeSheet(detail.course.id, tsDate); }
    else { const d = await r.json(); alert(d.error); }
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

  const c = detail?.course;

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="courses" />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-6xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">All Courses</h1>
              <p className="text-sm text-ink-soft mt-0.5">{courses.filter(c => c.active).length} live · {courses.filter(c => !c.active).length} offline</p>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none"/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, slug, email..." className="bg-white border border-line text-ink text-sm rounded-md pl-8 pr-3 py-2 outline-none focus:border-pine/40 w-56 placeholder-ink-faint"/>
              </div>
              <button onClick={loadCourses} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-line transition-colors"><RefreshCw className="w-4 h-4"/>Refresh</button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <div className="flex items-center gap-1 bg-white border border-line rounded-lg p-1">
              {(['all','live','offline'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={'px-3 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ' + (filterStatus === s ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}>
                  {s === 'all' ? 'All status' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-white border border-line rounded-lg p-1">
              {(['all','yes','no'] as const).map(s => (
                <button key={s} onClick={() => setFilterStripe(s)}
                  className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (filterStripe === s ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}>
                  {s === 'all' ? 'All Stripe' : s === 'yes' ? 'Connected' : 'No Stripe'}
                </button>
              ))}
            </div>
            <button onClick={() => setFilterFeatured(v => !v)}
              className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors ' + (filterFeatured ? 'bg-warn/10 text-warn border-warn/30' : 'text-ink-muted border-line hover:border-line-strong hover:text-ink')}>
              <Star className="w-3 h-3"/>Featured
            </button>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="bg-white border border-line text-ink-soft text-[11px] rounded-md px-3 py-1.5 outline-none focus:border-pine/40 cursor-pointer">
              <option value="">All types</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="semi-private">Semi-private</option>
              <option value="resort">Resort</option>
            </select>
            <div className="flex items-center gap-1 bg-white border border-line rounded-lg p-1 ml-auto">
              {(['newest','name','bookings','revenue'] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={'px-3 py-1 rounded-md text-[11px] font-medium transition-colors ' + (sortBy === s ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}>
                  {s === 'newest' ? 'Newest' : s === 'name' ? 'Name A–Z' : s === 'bookings' ? 'Bookings' : 'Revenue'}
                </button>
              ))}
            </div>
          </div>

          {loading && <div className="text-ink-muted py-20 text-center text-sm">Loading...</div>}

          <div className="space-y-2">
            {filteredCourses.map(course => (
              <div key={course.id} className="bg-white border border-line rounded-lg px-5 py-3.5 flex items-center gap-5 hover:border-line-strong transition-colors">
                <StatusDot status={course.active ? 'ok' : 'neutral'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-0.5">
                    <span className="font-medium text-ink truncate">{course.name}</span>
                    {course.featured && <Star className="w-3.5 h-3.5 text-warn fill-warn shrink-0"/>}
                    {course.stripeAccountActive && <span className="text-[11px] px-1.5 py-0.5 rounded bg-pine/5 text-pine border border-pine/20 shrink-0">Stripe</span>}
                  </div>
                  <div className="text-xs text-ink-muted">{course.city}, {course.state} · <span className="capitalize">{course.type || 'public'}</span></div>
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
                  {course.activeMemberCount > 0 && <div className="text-[10px] text-pine mt-1">{course.activeMemberCount} mbr</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleFeatured(course.id, !course.featured)} className={'w-8 h-8 flex items-center justify-center rounded-md transition-colors ' + (course.featured ? 'text-warn bg-warn/10' : 'text-ink-muted hover:text-warn hover:bg-warn/5')} title={course.featured ? 'Unfeature' : 'Feature'}><Star className="w-4 h-4"/></button>
                  <button onClick={() => toggleCourseActive(course.id, !course.active)} className={'w-8 h-8 flex items-center justify-center rounded-md transition-colors ' + (course.active ? 'text-ok hover:text-bad hover:bg-bad/5' : 'text-ink-muted hover:text-ok hover:bg-ok/5')} title={course.active ? 'Take offline' : 'Set live'}><Power className="w-4 h-4"/></button>
                  <a href={'/courses/' + course.slug} target="_blank" className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-pine hover:bg-pine/5 transition-colors" title="View page"><Globe className="w-4 h-4"/></a>
                  <button onClick={() => openDetail(course)} className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper transition-colors" title="Details"><Eye className="w-4 h-4"/></button>
                  <button onClick={() => deleteCourse(course.id, course.name)} className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-bad hover:bg-bad/5 transition-colors" title="Delete"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
            ))}
            {!loading && filteredCourses.length === 0 && (
              <div className="text-ink-muted text-center py-20 text-sm">No courses found</div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white border-l border-line w-full max-w-2xl h-full flex flex-col shadow-2xl">
            <div className="border-b border-line px-6 py-4 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <button onClick={() => setDetail(null)} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-paper text-ink-muted hover:text-ink transition-colors">
                    <ArrowLeft className="w-4 h-4"/>
                  </button>
                  <div>
                    <div className="font-medium text-ink text-sm">{c?.name || 'Loading...'}</div>
                    {c && <div className="text-xs text-ink-muted">{String((c as Record<string,unknown>).city||'')} · {String((c as Record<string,unknown>).type||'')}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c && <>
                    <StatusDot status={c.active ? 'ok' : 'neutral'} label={c.active ? 'Live' : 'Offline'} />
                    <a href={`/courses/${c.slug}`} target="_blank" className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-paper text-ink-muted hover:text-pine transition-colors" title="View public page"><Globe className="w-4 h-4"/></a>
                    <button onClick={() => toggleFeatured(c.id, !c.featured)} className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${c.featured ? 'text-warn bg-warn/10' : 'text-ink-muted hover:text-warn hover:bg-warn/5'}`} title={c.featured ? 'Unfeature' : 'Feature'}><Star className="w-4 h-4"/></button>
                    <button onClick={() => toggleCourseActive(c.id, !c.active)} className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${c.active ? 'bg-bad/5 text-bad border-bad/20 hover:bg-bad/10' : 'bg-ok/5 text-ok border-ok/20 hover:bg-ok/10'}`}><Power className="w-3.5 h-3.5"/></button>
                    <button onClick={() => deleteCourse(c.id, c.name)} className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-bad hover:bg-bad/5 transition-colors" title="Delete"><Trash2 className="w-4 h-4"/></button>
                  </>}
                </div>
              </div>
              <div className="flex gap-0.5 mt-3 bg-paper border border-line rounded-lg p-1">
                {(['overview','contact','setup','teesheet'] as const).map(t => (
                  <button key={t} onClick={() => { setDrawerTab(t); if (t === 'teesheet' && c) loadTeeSheet(c.id, tsDate); if (t === 'setup' && c) { setSetupForm(c as Record<string,unknown>); loadSchedules(c.id); } }}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors ${drawerTab === t ? 'bg-white text-ink border border-line shadow-sm' : 'text-ink-muted hover:text-ink'}`}>
                    {t === 'teesheet' ? 'Tee Sheet' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {detailLoading && <div className="flex-1 flex items-center justify-center text-ink-muted text-sm">Loading course data...</div>}

            {detail && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-paper">
                {drawerTab === 'overview' && <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label:'Gross (30d)', value: fmtMoney(detail.revenue30d.gross), color:'text-ink' },
                      { label:'GR Fees (30d)', value: fmtMoney(detail.revenue30d.platform), color:'text-ok' },
                      { label:'All-time Bookings', value: detail.totalBookings, color:'text-ink' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-white border border-line rounded-lg p-4">
                        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">{label}</div>
                        <div className={`text-xl font-serif font-medium ${color}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {c?.operator && (
                    <div className="bg-white border border-line rounded-lg p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-md bg-pine/10 flex items-center justify-center text-pine font-medium text-base shrink-0">{String(c.operator.name)[0]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink text-sm truncate">{String(c.operator.name)}</div>
                        <div className="text-xs text-ink-muted truncate">{String(c.operator.email)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.operator.emailVerified
                          ? <StatusDot status="ok" label="Verified" />
                          : <StatusDot status="bad" label="Unverified" />}
                        {c.stripeAccountActive && <span className="text-[11px] px-2 py-0.5 rounded bg-pine/5 text-pine border border-pine/20">Stripe</span>}
                        <span className="text-[11px] px-2 py-0.5 rounded bg-paper text-ink-muted border border-line">Step {c.operator.onboardingStep}/3</span>
                      </div>
                    </div>
                  )}
                  {detail.staff.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Staff — {detail.staff.length} member{detail.staff.length !== 1 ? 's' : ''}</div>
                      <div className="space-y-1.5">
                        {detail.staff.map(s => (
                          <div key={s.id} className="flex items-center gap-3 bg-white border border-line rounded-md px-4 py-2.5">
                            <div className="w-7 h-7 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-xs shrink-0">{s.name[0]}</div>
                            <div className="flex-1 text-sm"><span className="font-medium text-ink">{s.name}</span><span className="text-ink-muted text-xs"> · {s.email} · {s.role}</span></div>
                            <StatusDot status={s.active ? 'ok' : 'neutral'} label={s.active ? 'Active' : 'Off'} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.recentBookings.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Recent Bookings</div>
                      <div className="space-y-1.5">
                        {detail.recentBookings.map(b => (
                          <div key={b.id} className="flex items-center gap-4 bg-white border border-line rounded-md px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-ink text-sm truncate">{b.golferName}</div>
                              <div className="text-xs text-ink-muted">{fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)} · {b.players} player{b.players !== 1 ? 's' : ''}</div>
                            </div>
                            <div className="text-sm font-medium text-ok">{fmtMoney(b.totalAmount / 100)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.recentBookings.length === 0 && detail.totalBookings === 0 && (
                    <div className="text-center py-10 text-ink-muted text-sm">No bookings yet for this course</div>
                  )}
                </div>}

                {drawerTab === 'contact' && <div className="space-y-4">
                  {c?.operator && <>
                    <div className="bg-white border border-line rounded-lg p-5">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Operator / Owner</div>
                      <div className="text-lg font-serif font-medium text-ink mb-1">{String(c.operator.name)}</div>
                      <div className="space-y-2 mt-3">
                        <a href={`mailto:${String(c.operator.email)}`} className="flex items-center gap-3 text-sm text-ink-soft hover:text-pine transition-colors">
                          <Mail className="w-4 h-4 text-ink-muted"/>{String(c.operator.email)}
                        </a>
                        {String((c.operator as Record<string,unknown>).phone || '') && (
                          <a href={`tel:${String((c.operator as Record<string,unknown>).phone)}`} className="flex items-center gap-3 text-sm text-ink-soft hover:text-pine transition-colors">
                            <Phone className="w-4 h-4 text-ink-muted"/>{String((c.operator as Record<string,unknown>).phone)}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4 flex-wrap">
                        {c.operator.emailVerified
                          ? <StatusDot status="ok" label="Email verified" />
                          : <StatusDot status="bad" label="Not verified" />}
                        <span className="text-[11px] px-2 py-0.5 rounded bg-paper text-ink-muted border border-line">Onboarding {c.operator.onboardingStep}/3</span>
                        {c.stripeAccountActive && <span className="text-[11px] px-2 py-0.5 rounded bg-pine/5 text-pine border border-pine/20">Stripe connected</span>}
                      </div>
                    </div>
                    <div className="bg-white border border-line rounded-lg p-5">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Course Info</div>
                      <div className="space-y-2.5">
                        {[
                          ['Address', String((c as Record<string,unknown>).address || '—')],
                          ['Phone',   String((c as Record<string,unknown>).phone || '—')],
                          ['Website', String((c as Record<string,unknown>).website || '—')],
                          ['Type',    String((c as Record<string,unknown>).type || '—')],
                          ['Slug',    c.slug],
                        ].map(([label, val]) => (
                          <div key={label} className="flex gap-3 text-sm">
                            <span className="text-ink-muted w-16 shrink-0">{label}</span>
                            <span className="text-ink font-medium break-all">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>}
                  {detail.staff.length > 0 && (
                    <div className="bg-white border border-line rounded-lg p-5">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Staff Contacts</div>
                      <div className="space-y-3">
                        {detail.staff.map(s => (
                          <div key={s.id} className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-sm shrink-0">{s.name[0]}</div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-ink">{s.name} <span className="text-xs text-ink-muted font-normal">· {s.role}</span></div>
                              <a href={`mailto:${s.email}`} className="text-xs text-pine hover:underline">{s.email}</a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>}

                {drawerTab === 'setup' && <div className="space-y-5">
                  <div className="bg-warn/5 border border-warn/20 rounded-md px-4 py-3 text-xs text-warn">
                    You&apos;re editing live settings directly. The operator can still adjust their own dashboard.
                  </div>
                  {setupMsg && (
                    <div className={`text-sm font-medium px-4 py-2.5 rounded-md border ${setupMsg === 'error' ? 'bg-bad/5 text-bad border-bad/20' : 'bg-ok/5 text-ok border-ok/20'}`}>
                      {setupMsg === 'error' ? 'Error saving' : setupMsg === 'schedule_saved' ? 'Schedule saved — tee times generated for next 8 days' : 'Settings saved'}
                    </div>
                  )}
                  <div className="bg-white border border-line rounded-lg p-5 space-y-4">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Course Policy</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Walking policy</label>
                        <select value={String(setupForm.walkingAllowed ?? 'always')} onChange={e => setSetupForm(f => ({ ...f, walkingAllowed: e.target.value }))} className={iCls}>
                          <option value="always">Always allowed</option>
                          <option value="weekdays">Weekdays only</option>
                          <option value="after12">After 12pm only</option>
                          <option value="never">Cart required</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Cancellation window (hrs)</label>
                        <input type="number" value={Number(setupForm.cancellationHours ?? 24)} onChange={e => setSetupForm(f => ({ ...f, cancellationHours: Number(e.target.value) }))} className={iCls}/>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {[['hasMemberPricing','Member pricing'],['hasResidentPricing','Resident pricing'],['hasCaddies','Caddies'],['cartRequired','Cart required']].map(([k,label]) => (
                        <label key={k} className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                          <input type="checkbox" checked={!!setupForm[k]} onChange={e => setSetupForm(f => ({ ...f, [k]: e.target.checked }))} className="w-4 h-4 accent-pine rounded"/>
                          {label}
                        </label>
                      ))}
                    </div>
                    {!!setupForm.hasResidentPricing && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Resident county</label>
                          <input value={String(setupForm.residentCounty ?? '')} onChange={e => setSetupForm(f => ({ ...f, residentCounty: e.target.value }))} className={iCls}/>
                        </div>
                        <div>
                          <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Resident state</label>
                          <input value={String(setupForm.residentState ?? '')} maxLength={2} onChange={e => setSetupForm(f => ({ ...f, residentState: e.target.value }))} className={iCls}/>
                        </div>
                      </div>
                    )}
                    <button onClick={saveSetup} disabled={setupSaving} className="bg-pine hover:bg-pine-hover disabled:opacity-50 text-white px-5 py-2.5 rounded-md text-[12.5px] font-medium transition-colors">
                      {setupSaving ? 'Saving...' : 'Save Policy Settings'}
                    </button>
                  </div>

                  <div className="bg-white border border-line rounded-lg p-5 space-y-4">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Tee Time Schedules</div>
                    {schedules.length > 0 ? (
                      <div className="space-y-2">
                        {schedules.map(s => (
                          <div key={s.id} className="flex items-center justify-between bg-paper border border-line rounded-md px-4 py-3">
                            <div>
                              <div className="font-medium text-ink text-sm">
                                {s.daysOfWeek.length === 0 ? 'Every day' : s.daysOfWeek.map(d => DAYS[d]).join(', ')} · {s.startTime}–{s.endTime} every {s.intervalMinutes}min
                              </div>
                              <div className="text-ink-muted text-xs mt-0.5">
                                WD ${s.greenFeeWeekday} / WE ${s.greenFeeWeekend} · Cart ${s.cartFee}
                                {s.memberRateWeekday != null && ` · Member $${s.memberRateWeekday}`}
                                {s.walkingAllowed ? ' · Walking' : ''}
                              </div>
                            </div>
                            <button onClick={() => deleteSchedule(s.id)} className="text-ink-muted hover:text-bad transition-colors p-1.5 rounded-md hover:bg-bad/5"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-ink-muted bg-paper rounded-md p-4 border border-line">No schedule yet — add one below to make this course bookable.</p>
                    )}

                    <div className="border-t border-line pt-4 space-y-3">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Add Schedule</div>
                      <div>
                        <label className="text-xs text-ink-muted block mb-1.5">Days <span className="text-ink-faint">(none = every day)</span></label>
                        <div className="flex gap-1.5">
                          {DAYS.map((day, i) => (
                            <button key={day} onClick={() => toggleNewScheduleDay(i)} className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${newSchedule.daysOfWeek.includes(i) ? 'bg-pine text-white border-pine' : 'bg-paper text-ink-muted border-line hover:border-pine/40 hover:text-ink'}`}>{day}</button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div><label className="text-xs text-ink-muted block mb-1">First tee</label><input type="time" value={newSchedule.startTime} onChange={e => setNewSchedule(s => ({ ...s, startTime: e.target.value }))} className={iCls}/></div>
                        <div><label className="text-xs text-ink-muted block mb-1">Last tee</label><input type="time" value={newSchedule.endTime} onChange={e => setNewSchedule(s => ({ ...s, endTime: e.target.value }))} className={iCls}/></div>
                        <div><label className="text-xs text-ink-muted block mb-1">Interval</label>
                          <select value={newSchedule.intervalMinutes} onChange={e => setNewSchedule(s => ({ ...s, intervalMinutes: Number(e.target.value) }))} className={iCls}>
                            {[7,8,9,10,12,15].map(v => <option key={v} value={v}>{v} min</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div><label className="text-xs text-ink-muted block mb-1">WD Green fee $</label><input type="number" value={newSchedule.greenFeeWeekday} onChange={e => setNewSchedule(s => ({ ...s, greenFeeWeekday: Number(e.target.value) }))} className={iCls}/></div>
                        <div><label className="text-xs text-ink-muted block mb-1">WE Green fee $</label><input type="number" value={newSchedule.greenFeeWeekend} onChange={e => setNewSchedule(s => ({ ...s, greenFeeWeekend: Number(e.target.value) }))} className={iCls}/></div>
                        <div><label className="text-xs text-ink-muted block mb-1">Cart fee $</label><input type="number" value={newSchedule.cartFee} onChange={e => setNewSchedule(s => ({ ...s, cartFee: Number(e.target.value) }))} className={iCls}/></div>
                      </div>
                      {!!setupForm.hasMemberPricing && (
                        <div className="grid grid-cols-2 gap-3 bg-pine/5 border border-pine/20 rounded-md p-3">
                          <div><label className="text-xs font-medium text-pine block mb-1">Member rate WD $</label><input type="number" value={newSchedule.memberRateWeekday} onChange={e => setNewSchedule(s => ({ ...s, memberRateWeekday: e.target.value }))} className={iCls}/></div>
                          <div><label className="text-xs font-medium text-pine block mb-1">Member rate WE $</label><input type="number" value={newSchedule.memberRateWeekend} onChange={e => setNewSchedule(s => ({ ...s, memberRateWeekend: e.target.value }))} className={iCls}/></div>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                        <input type="checkbox" checked={newSchedule.walkingAllowed} onChange={e => setNewSchedule(s => ({ ...s, walkingAllowed: e.target.checked }))} className="w-4 h-4 accent-pine rounded"/>
                        Walking allowed
                      </label>
                      <button onClick={addSchedule} disabled={setupSaving} className="w-full bg-pine hover:bg-pine-hover disabled:opacity-50 text-white py-2.5 rounded-md text-[12.5px] font-medium transition-colors">
                        {setupSaving ? 'Saving...' : 'Save Schedule & Generate Tee Times'}
                      </button>
                    </div>
                  </div>
                </div>}

                {drawerTab === 'teesheet' && <div>
                  <div className="flex items-center gap-3 mb-5">
                    <Calendar className="w-4 h-4 text-ink-muted"/>
                    <input type="date" value={tsDate} onChange={e => { setTsDate(e.target.value); if (c) loadTeeSheet(c.id, e.target.value); }}
                      className="bg-white border border-line text-ink rounded-md px-3 py-1.5 text-sm outline-none focus:border-pine/40"/>
                    {!tsLoading && <span className="text-xs text-ink-muted">{tsSlots.length} slots · {tsSlots.filter(s => s.bookings.length > 0).length} booked</span>}
                  </div>
                  {tsLoading && <div className="text-center text-ink-muted py-12 text-sm">Loading tee sheet...</div>}
                  {!tsLoading && tsSlots.length === 0 && <div className="text-center text-ink-muted py-12 text-sm">No tee times for this date</div>}
                  <div className="space-y-2">
                    {tsSlots.map(slot => (
                      <div key={slot.id} className={`rounded-md border overflow-hidden ${slot.status === 'blocked' ? 'border-bad/20 bg-bad/5' : slot.bookings.length > 0 ? 'border-ok/20 bg-ok/5' : 'border-line bg-white'}`}>
                        <div className="px-4 py-3 flex items-center gap-3">
                          <span className="font-mono font-medium text-ink text-sm w-14 shrink-0">{slot.time}</span>
                          <span className="text-xs text-ink-muted">{slot.holes}h · ${slot.greenFee}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${slot.status === 'blocked' ? 'bg-bad/10 text-bad' : slot.bookings.length > 0 ? 'bg-ok/10 text-ok' : 'bg-paper text-ink-muted border border-line'}`}>
                            {slot.status === 'blocked' ? 'Blocked' : slot.bookings.length > 0 ? `${slot.bookings.length} booked` : `${slot.playersAvailable} open`}
                          </span>
                          <div className="ml-auto flex items-center gap-1.5">
                            <button onClick={() => setManualSlot(slot.id)} className="text-xs px-2.5 py-1 bg-pine hover:bg-pine-hover text-white rounded-md flex items-center gap-1 transition-colors"><Plus className="w-3 h-3"/>Add</button>
                            <button onClick={() => blockSlot(slot.id, slot.status !== 'blocked')} className={`text-xs px-2.5 py-1 rounded-md flex items-center gap-1 border transition-colors ${slot.status === 'blocked' ? 'border-ok/20 text-ok bg-ok/5 hover:bg-ok/10' : 'border-bad/20 text-bad bg-bad/5 hover:bg-bad/10'}`}>
                              <Ban className="w-3 h-3"/>{slot.status === 'blocked' ? 'Unblock' : 'Block'}
                            </button>
                          </div>
                        </div>
                        {slot.bookings.length > 0 && (
                          <div className="border-t border-line/50 px-4 py-2 space-y-2">
                            {slot.bookings.map(b => (
                              <div key={b.id} className="flex items-center justify-between text-sm py-0.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-xs shrink-0">{b.golferName[0]}</div>
                                  <div>
                                    <div className="font-medium text-ink text-xs">{b.golferName} <span className="text-ink-muted font-normal">· {b.players}p</span></div>
                                    <div className="flex items-center gap-2">
                                      <a href={`mailto:${b.golferEmail}`} className="text-xs text-pine hover:underline">{b.golferEmail}</a>
                                      {b.golferPhone && <span className="text-xs text-ink-muted">{b.golferPhone}</span>}
                                      {b.paymentStatus === 'manual' && <span className="text-xs px-1.5 py-0.5 bg-warn/10 text-warn rounded border border-warn/20">Manual</span>}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-medium text-ok">{fmtMoney(b.totalAmount / 100)}</span>
                                  <button onClick={() => cancelBooking(b.id)} className="text-xs text-bad hover:text-bad/80 px-2 py-0.5 border border-bad/20 rounded-md hover:bg-bad/5 transition-colors">Cancel</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {manualSlot && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-60 flex items-center justify-center p-4">
                      <div className="bg-white border border-line rounded-lg p-6 w-full max-w-sm shadow-2xl">
                        <div className="flex items-center justify-between mb-5">
                          <h3 className="font-serif font-medium text-ink">Add Manual Booking</h3>
                          <button onClick={() => setManualSlot(null)} className="text-ink-muted hover:text-ink w-8 h-8 flex items-center justify-center rounded-md hover:bg-paper transition-colors"><X className="w-4 h-4"/></button>
                        </div>
                        <div className="space-y-3">
                          {[['Golfer Name *','name','text'],['Email *','email','email'],['Phone','phone','tel']].map(([label,field,type]) => (
                            <div key={field}>
                              <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">{label}</label>
                              <input type={type} value={(manualForm as Record<string,unknown>)[field] as string} onChange={e => setManualForm(f => ({ ...f, [field]: e.target.value }))} className={iCls}/>
                            </div>
                          ))}
                          <div>
                            <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Players *</label>
                            <select value={manualForm.players} onChange={e => setManualForm(f => ({ ...f, players: Number(e.target.value) }))} className={iCls}>
                              {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-3 mt-5">
                          <button onClick={() => setManualSlot(null)} className="flex-1 px-4 py-2.5 border border-line rounded-md text-[12.5px] font-medium text-ink-muted hover:text-ink hover:border-line-strong transition-colors">Cancel</button>
                          <button onClick={addManualBooking} className="flex-1 px-4 py-2.5 bg-pine hover:bg-pine-hover text-white rounded-md text-[12.5px] font-medium transition-colors">Add Booking</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>}
              </div>
            )}
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
