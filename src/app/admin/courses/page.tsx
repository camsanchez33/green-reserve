'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Star, Power, Globe, Eye, ArrowLeft, Trash2, RefreshCw, Calendar,
  Ban, Plus, X, Mail, Phone, Wrench, CheckCircle,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface Course {
  id: string; name: string; city: string; state: string; active: boolean; featured: boolean;
  stripeAccountActive: boolean; slug: string; type?: string;
  operator: { email: string; name: string; onboardingStep: number; emailVerified: boolean } | null;
  createdAt: string;
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
const iCls = 'w-full bg-gray-800/80 border border-gray-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 placeholder-gray-600 transition-colors';
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function CoursesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [adminReady, setAdminReady] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
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

  const filteredCourses = courses.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.city.toLowerCase().includes(search.toLowerCase()) || c.state.toLowerCase().includes(search.toLowerCase())
  );

  const c = detail?.course;

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar active="courses" />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-6xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-black text-white">All Courses</h1>
              <div className="text-sm text-gray-500 mt-0.5">{courses.filter(c => c.active).length} live · {courses.filter(c => !c.active).length} offline</div>
            </div>
            <div className="flex gap-3">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, city, state..." className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 w-52 placeholder-gray-600"/>
              <button onClick={loadCourses} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 border border-gray-700 transition-colors"><RefreshCw className="w-4 h-4"/>Refresh</button>
            </div>
          </div>

          {loading && <div className="text-gray-600 py-20 text-center text-sm">Loading...</div>}

          <div className="space-y-2">
            {filteredCourses.map(course => (
              <div key={course.id} className="bg-gray-900 border border-gray-800 rounded-lg px-5 py-3.5 flex items-center gap-5 hover:border-gray-700 transition-colors">
                <div className={'w-2 h-2 rounded-full shrink-0 ' + (course.active ? 'bg-emerald-500' : 'bg-gray-600')}/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-0.5">
                    <span className="font-semibold text-white truncate">{course.name}</span>
                    {course.featured && <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 shrink-0"/>}
                    {course.stripeAccountActive && <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 shrink-0">Stripe</span>}
                  </div>
                  <div className="text-xs text-gray-500">{course.city}, {course.state} · <span className="capitalize">{course.type || 'public'}</span></div>
                </div>
                <div className="w-56 min-w-0 hidden md:block">
                  {course.operator ? <>
                    <div className="text-xs text-gray-300 truncate">{course.operator.name}</div>
                    <div className="text-xs text-gray-600 truncate">{course.operator.email}</div>
                  </> : <div className="text-xs text-gray-700">No operator</div>}
                </div>
                <div className="w-28 shrink-0 hidden lg:block">
                  <div className={'text-xs font-semibold mb-1 ' + (course.active ? 'text-emerald-400' : 'text-gray-600')}>{course.active ? 'Live' : 'Offline'}</div>
                  {course.operator && (
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: (course.operator.onboardingStep / 3 * 100) + '%' }}/>
                      </div>
                      <span className="text-xs text-gray-600">{course.operator.onboardingStep}/3</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleFeatured(course.id, !course.featured)} className={'w-8 h-8 flex items-center justify-center rounded-lg transition-colors ' + (course.featured ? 'text-yellow-400 bg-yellow-500/10' : 'text-gray-600 hover:text-yellow-400 hover:bg-gray-800')} title={course.featured ? 'Unfeature' : 'Feature'}><Star className="w-4 h-4"/></button>
                  <button onClick={() => toggleCourseActive(course.id, !course.active)} className={'w-8 h-8 flex items-center justify-center rounded-lg transition-colors ' + (course.active ? 'text-emerald-400 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-600 hover:text-emerald-400 hover:bg-emerald-500/10')} title={course.active ? 'Take offline' : 'Set live'}><Power className="w-4 h-4"/></button>
                  <a href={'/courses/' + course.slug} target="_blank" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="View page"><Globe className="w-4 h-4"/></a>
                  <button onClick={() => openDetail(course)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors" title="Details"><Eye className="w-4 h-4"/></button>
                  <button onClick={() => deleteCourse(course.id, course.name)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
            ))}
            {!loading && filteredCourses.length === 0 && (
              <div className="text-gray-600 text-center py-20 text-sm">No courses found</div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-gray-950 border-l border-gray-800 w-full max-w-2xl h-full flex flex-col shadow-2xl">
            <div className="border-b border-gray-800 px-6 py-4 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <button onClick={() => setDetail(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4"/>
                  </button>
                  <div>
                    <div className="font-bold text-white text-sm">{c?.name || 'Loading...'}</div>
                    {c && <div className="text-xs text-gray-500">{String((c as Record<string,unknown>).city||'')} · {String((c as Record<string,unknown>).type||'')}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c && <>
                    {c.active
                      ? <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">Live</span>
                      : <span className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-400 border border-gray-700 font-semibold">Offline</span>
                    }
                    <a href={`/courses/${c.slug}`} target="_blank" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-500 hover:text-blue-400 transition-colors" title="View public page"><Globe className="w-4 h-4"/></a>
                    <button onClick={() => toggleFeatured(c.id, !c.featured)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${c.featured ? 'text-yellow-400 bg-yellow-500/10' : 'text-gray-600 hover:text-yellow-400 hover:bg-gray-800'}`} title={c.featured ? 'Unfeature' : 'Feature'}><Star className="w-4 h-4"/></button>
                    <button onClick={() => toggleCourseActive(c.id, !c.active)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${c.active ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'}`}><Power className="w-3.5 h-3.5"/></button>
                    <button onClick={() => deleteCourse(c.id, c.name)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete"><Trash2 className="w-4 h-4"/></button>
                  </>}
                </div>
              </div>
              <div className="flex gap-0.5 mt-3 bg-gray-900 rounded-lg p-1">
                {(['overview','contact','setup','teesheet'] as const).map(t => (
                  <button key={t} onClick={() => { setDrawerTab(t); if (t === 'teesheet' && c) loadTeeSheet(c.id, tsDate); if (t === 'setup' && c) { setSetupForm(c as Record<string,unknown>); loadSchedules(c.id); } }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${drawerTab === t ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                    {t === 'teesheet' ? 'Tee Sheet' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {detailLoading && <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading course data...</div>}

            {detail && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {drawerTab === 'overview' && <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label:'Gross (30d)', value: fmtMoney(detail.revenue30d.gross), color:'text-white' },
                      { label:'GR Fees (30d)', value: fmtMoney(detail.revenue30d.platform), color:'text-emerald-400' },
                      { label:'All-time Bookings', value: detail.totalBookings, color:'text-white' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">{label}</div>
                        <div className={`text-xl font-black ${color}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {c?.operator && (
                    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-black text-base shrink-0">{String(c.operator.name)[0]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-sm truncate">{String(c.operator.name)}</div>
                        <div className="text-xs text-gray-500 truncate">{String(c.operator.email)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.operator.emailVerified
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Verified</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">Not verified</span>}
                        {c.stripeAccountActive && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">Stripe</span>}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">Step {c.operator.onboardingStep}/3</span>
                      </div>
                    </div>
                  )}
                  {detail.staff.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Staff — {detail.staff.length} member{detail.staff.length !== 1 ? 's' : ''}</div>
                      <div className="space-y-1.5">
                        {detail.staff.map(s => (
                          <div key={s.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">{s.name[0]}</div>
                            <div className="flex-1 text-sm"><span className="font-medium text-white">{s.name}</span><span className="text-gray-500 text-xs"> · {s.email} · {s.role}</span></div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${s.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>{s.active ? 'Active' : 'Off'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.recentBookings.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Bookings</div>
                      <div className="space-y-1.5">
                        {detail.recentBookings.map(b => (
                          <div key={b.id} className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-white text-sm truncate">{b.golferName}</div>
                              <div className="text-xs text-gray-500">{fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)} · {b.players} player{b.players !== 1 ? 's' : ''}</div>
                            </div>
                            <div className="text-sm font-black text-emerald-400">{fmtMoney(b.totalAmount / 100)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.recentBookings.length === 0 && detail.totalBookings === 0 && (
                    <div className="text-center py-10 text-gray-600 text-sm">No bookings yet for this course</div>
                  )}
                </div>}

                {drawerTab === 'contact' && <div className="space-y-4">
                  {c?.operator && <>
                    <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/10 border border-blue-700/30 rounded-lg p-5">
                      <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-3">Operator / Owner</div>
                      <div className="text-lg font-black text-white mb-1">{String(c.operator.name)}</div>
                      <div className="space-y-2 mt-3">
                        <a href={`mailto:${String(c.operator.email)}`} className="flex items-center gap-3 text-sm text-gray-300 hover:text-blue-400 transition-colors">
                          <Mail className="w-4 h-4 text-gray-500"/>{String(c.operator.email)}
                        </a>
                        {String((c.operator as Record<string,unknown>).phone || '') && (
                          <a href={`tel:${String((c.operator as Record<string,unknown>).phone)}`} className="flex items-center gap-3 text-sm text-gray-300 hover:text-blue-400 transition-colors">
                            <Phone className="w-4 h-4 text-gray-500"/>{String((c.operator as Record<string,unknown>).phone)}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4 flex-wrap">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${c.operator.emailVerified ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                          {c.operator.emailVerified ? 'Email verified' : 'Not verified'}
                        </span>
                        <span className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-400 border border-gray-700 font-medium">Onboarding {c.operator.onboardingStep}/3</span>
                        {c.stripeAccountActive && <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 font-medium">Stripe connected</span>}
                      </div>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Course Info</div>
                      <div className="space-y-2.5">
                        {[
                          ['Address', String((c as Record<string,unknown>).address || '—')],
                          ['Phone',   String((c as Record<string,unknown>).phone || '—')],
                          ['Website', String((c as Record<string,unknown>).website || '—')],
                          ['Type',    String((c as Record<string,unknown>).type || '—')],
                          ['Slug',    c.slug],
                        ].map(([label, val]) => (
                          <div key={label} className="flex gap-3 text-sm">
                            <span className="text-gray-500 w-16 shrink-0">{label}</span>
                            <span className="text-gray-200 font-medium break-all">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>}
                  {detail.staff.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Staff Contacts</div>
                      <div className="space-y-3">
                        {detail.staff.map(s => (
                          <div key={s.id} className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">{s.name[0]}</div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-white">{s.name} <span className="text-xs text-gray-500 font-normal">· {s.role}</span></div>
                              <a href={`mailto:${s.email}`} className="text-xs text-blue-400 hover:underline">{s.email}</a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>}

                {drawerTab === 'setup' && <div className="space-y-5">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-xs text-amber-300">
                    You&apos;re editing live settings directly. The operator can still adjust their own dashboard.
                  </div>
                  {setupMsg && (
                    <div className={`text-sm font-semibold px-4 py-2.5 rounded-lg border ${setupMsg === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                      {setupMsg === 'error' ? 'Error saving' : setupMsg === 'schedule_saved' ? 'Schedule saved — tee times generated for next 8 days' : 'Settings saved'}
                    </div>
                  )}
                  <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Course Policy</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1.5">Walking policy</label>
                        <select value={String(setupForm.walkingAllowed ?? 'always')} onChange={e => setSetupForm(f => ({ ...f, walkingAllowed: e.target.value }))} className={iCls}>
                          <option value="always">Always allowed</option>
                          <option value="weekdays">Weekdays only</option>
                          <option value="after12">After 12pm only</option>
                          <option value="never">Cart required</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1.5">Cancellation window (hrs)</label>
                        <input type="number" value={Number(setupForm.cancellationHours ?? 24)} onChange={e => setSetupForm(f => ({ ...f, cancellationHours: Number(e.target.value) }))} className={iCls}/>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {[['hasMemberPricing','Member pricing'],['hasResidentPricing','Resident pricing'],['hasCaddies','Caddies'],['cartRequired','Cart required']].map(([k,label]) => (
                        <label key={k} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                          <input type="checkbox" checked={!!setupForm[k]} onChange={e => setSetupForm(f => ({ ...f, [k]: e.target.checked }))} className="w-4 h-4 accent-emerald-500 rounded"/>
                          {label}
                        </label>
                      ))}
                    </div>
                    {!!setupForm.hasResidentPricing && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Resident county</label>
                          <input value={String(setupForm.residentCounty ?? '')} onChange={e => setSetupForm(f => ({ ...f, residentCounty: e.target.value }))} className={iCls}/>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Resident state</label>
                          <input value={String(setupForm.residentState ?? '')} maxLength={2} onChange={e => setSetupForm(f => ({ ...f, residentState: e.target.value }))} className={iCls}/>
                        </div>
                      </div>
                    )}
                    <button onClick={saveSetup} disabled={setupSaving} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors">
                      {setupSaving ? 'Saving...' : 'Save Policy Settings'}
                    </button>
                  </div>

                  <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tee Time Schedules</div>
                    {schedules.length > 0 ? (
                      <div className="space-y-2">
                        {schedules.map(s => (
                          <div key={s.id} className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
                            <div>
                              <div className="font-semibold text-white text-sm">
                                {s.daysOfWeek.length === 0 ? 'Every day' : s.daysOfWeek.map(d => DAYS[d]).join(', ')} · {s.startTime}–{s.endTime} every {s.intervalMinutes}min
                              </div>
                              <div className="text-gray-500 text-xs mt-0.5">
                                WD ${s.greenFeeWeekday} / WE ${s.greenFeeWeekend} · Cart ${s.cartFee}
                                {s.memberRateWeekday != null && ` · Member $${s.memberRateWeekday}`}
                                {s.walkingAllowed ? ' · Walking' : ''}
                              </div>
                            </div>
                            <button onClick={() => deleteSchedule(s.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 bg-gray-800/50 rounded-lg p-4">No schedule yet — add one below to make this course bookable.</p>
                    )}

                    <div className="border-t border-gray-800 pt-4 space-y-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Schedule</div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5">Days <span className="text-gray-600">(none = every day)</span></label>
                        <div className="flex gap-1.5">
                          {DAYS.map((day, i) => (
                            <button key={day} onClick={() => toggleNewScheduleDay(i)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${newSchedule.daysOfWeek.includes(i) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-emerald-500 hover:text-white'}`}>{day}</button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div><label className="text-xs text-gray-500 block mb-1">First tee</label><input type="time" value={newSchedule.startTime} onChange={e => setNewSchedule(s => ({ ...s, startTime: e.target.value }))} className={iCls}/></div>
                        <div><label className="text-xs text-gray-500 block mb-1">Last tee</label><input type="time" value={newSchedule.endTime} onChange={e => setNewSchedule(s => ({ ...s, endTime: e.target.value }))} className={iCls}/></div>
                        <div><label className="text-xs text-gray-500 block mb-1">Interval</label>
                          <select value={newSchedule.intervalMinutes} onChange={e => setNewSchedule(s => ({ ...s, intervalMinutes: Number(e.target.value) }))} className={iCls}>
                            {[7,8,9,10,12,15].map(v => <option key={v} value={v}>{v} min</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div><label className="text-xs text-gray-500 block mb-1">WD Green fee $</label><input type="number" value={newSchedule.greenFeeWeekday} onChange={e => setNewSchedule(s => ({ ...s, greenFeeWeekday: Number(e.target.value) }))} className={iCls}/></div>
                        <div><label className="text-xs text-gray-500 block mb-1">WE Green fee $</label><input type="number" value={newSchedule.greenFeeWeekend} onChange={e => setNewSchedule(s => ({ ...s, greenFeeWeekend: Number(e.target.value) }))} className={iCls}/></div>
                        <div><label className="text-xs text-gray-500 block mb-1">Cart fee $</label><input type="number" value={newSchedule.cartFee} onChange={e => setNewSchedule(s => ({ ...s, cartFee: Number(e.target.value) }))} className={iCls}/></div>
                      </div>
                      {!!setupForm.hasMemberPricing && (
                        <div className="grid grid-cols-2 gap-3 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                          <div><label className="text-xs font-semibold text-blue-400 block mb-1">Member rate WD $</label><input type="number" value={newSchedule.memberRateWeekday} onChange={e => setNewSchedule(s => ({ ...s, memberRateWeekday: e.target.value }))} className={iCls}/></div>
                          <div><label className="text-xs font-semibold text-blue-400 block mb-1">Member rate WE $</label><input type="number" value={newSchedule.memberRateWeekend} onChange={e => setNewSchedule(s => ({ ...s, memberRateWeekend: e.target.value }))} className={iCls}/></div>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                        <input type="checkbox" checked={newSchedule.walkingAllowed} onChange={e => setNewSchedule(s => ({ ...s, walkingAllowed: e.target.checked }))} className="w-4 h-4 accent-emerald-500 rounded"/>
                        Walking allowed
                      </label>
                      <button onClick={addSchedule} disabled={setupSaving} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-bold transition-colors">
                        {setupSaving ? 'Saving...' : 'Save Schedule & Generate Tee Times'}
                      </button>
                    </div>
                  </div>
                </div>}

                {drawerTab === 'teesheet' && <div>
                  <div className="flex items-center gap-3 mb-5">
                    <Calendar className="w-4 h-4 text-gray-500"/>
                    <input type="date" value={tsDate} onChange={e => { setTsDate(e.target.value); if (c) loadTeeSheet(c.id, e.target.value); }}
                      className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50"/>
                    {!tsLoading && <span className="text-xs text-gray-500">{tsSlots.length} slots · {tsSlots.filter(s => s.bookings.length > 0).length} booked</span>}
                  </div>
                  {tsLoading && <div className="text-center text-gray-500 py-12 text-sm">Loading tee sheet...</div>}
                  {!tsLoading && tsSlots.length === 0 && <div className="text-center text-gray-600 py-12 text-sm">No tee times for this date</div>}
                  <div className="space-y-2">
                    {tsSlots.map(slot => (
                      <div key={slot.id} className={`rounded-lg border overflow-hidden ${slot.status === 'blocked' ? 'border-red-500/30 bg-red-500/5' : slot.bookings.length > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-gray-800 bg-gray-900'}`}>
                        <div className="px-4 py-3 flex items-center gap-3">
                          <span className="font-mono font-bold text-white text-sm w-14 shrink-0">{slot.time}</span>
                          <span className="text-xs text-gray-500">{slot.holes}h · ${slot.greenFee}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${slot.status === 'blocked' ? 'bg-red-500/20 text-red-400' : slot.bookings.length > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>
                            {slot.status === 'blocked' ? 'Blocked' : slot.bookings.length > 0 ? `${slot.bookings.length} booked` : `${slot.playersAvailable} open`}
                          </span>
                          <div className="ml-auto flex items-center gap-1.5">
                            <button onClick={() => setManualSlot(slot.id)} className="text-xs px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-1 transition-colors"><Plus className="w-3 h-3"/>Add</button>
                            <button onClick={() => blockSlot(slot.id, slot.status !== 'blocked')} className={`text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 border transition-colors ${slot.status === 'blocked' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' : 'border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20'}`}>
                              <Ban className="w-3 h-3"/>{slot.status === 'blocked' ? 'Unblock' : 'Block'}
                            </button>
                          </div>
                        </div>
                        {slot.bookings.length > 0 && (
                          <div className="border-t border-gray-800/50 px-4 py-2 space-y-2">
                            {slot.bookings.map(b => (
                              <div key={b.id} className="flex items-center justify-between text-sm py-0.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">{b.golferName[0]}</div>
                                  <div>
                                    <div className="font-semibold text-white text-xs">{b.golferName} <span className="text-gray-500 font-normal">· {b.players}p</span></div>
                                    <div className="flex items-center gap-2">
                                      <a href={`mailto:${b.golferEmail}`} className="text-xs text-blue-400 hover:underline">{b.golferEmail}</a>
                                      {b.golferPhone && <span className="text-xs text-gray-500">{b.golferPhone}</span>}
                                      {b.paymentStatus === 'manual' && <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">Manual</span>}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold text-emerald-400">{fmtMoney(b.totalAmount / 100)}</span>
                                  <button onClick={() => cancelBooking(b.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors">Cancel</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {manualSlot && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-60 flex items-center justify-center p-4">
                      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 w-full max-w-sm shadow-2xl">
                        <div className="flex items-center justify-between mb-5">
                          <h3 className="font-bold text-white">Add Manual Booking</h3>
                          <button onClick={() => setManualSlot(null)} className="text-gray-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors"><X className="w-4 h-4"/></button>
                        </div>
                        <div className="space-y-3">
                          {[['Golfer Name *','name','text'],['Email *','email','email'],['Phone','phone','tel']].map(([label,field,type]) => (
                            <div key={field}>
                              <label className="text-xs font-semibold text-gray-500 block mb-1.5">{label}</label>
                              <input type={type} value={(manualForm as Record<string,unknown>)[field] as string} onChange={e => setManualForm(f => ({ ...f, [field]: e.target.value }))} className={iCls}/>
                            </div>
                          ))}
                          <div>
                            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Players *</label>
                            <select value={manualForm.players} onChange={e => setManualForm(f => ({ ...f, players: Number(e.target.value) }))} className={iCls}>
                              {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-3 mt-5">
                          <button onClick={() => setManualSlot(null)} className="flex-1 px-4 py-2.5 border border-gray-700 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:border-gray-600 transition-colors">Cancel</button>
                          <button onClick={addManualBooking} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors">Add Booking</button>
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

// Suppress unused import warnings
const _unused = { CheckCircle, Wrench };
void _unused;

export default function CoursesPage() {
  return (
    <Suspense fallback={null}>
      <CoursesContent />
    </Suspense>
  );
}
