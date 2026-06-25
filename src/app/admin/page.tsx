'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Copy,
  RefreshCw, BarChart2, Users, DollarSign, TrendingUp, AlertCircle,
  Building2, Star, Power, ArrowLeft, Eye, X, Globe, Phone, Mail,
  Ban, Plus, Calendar, Trash2, Wrench, Activity, ArrowUpRight,
  Shield, Layers, ChevronRight, Zap,
} from 'lucide-react';

/* ─── Types ─── */
interface Inquiry {
  id: string; contactName: string; contactTitle: string; email: string; phone: string;
  courseName: string; address: string; city: string; state: string; zipCode: string;
  website: string; courseType: string; currentBookingMethod: string; teeTimesPerDay: number | null;
  greenFeeRange: string; hasResidentPricing: boolean; hasMemberPricing: boolean;
  hasCaddies: boolean; pricingNotes: string; lookingFor: string[]; additionalNotes: string;
  status: string; adminNotes: string; builtCourseId: string | null; createdAt: string;
  detailsToken?: string | null; detailsJson?: string; needsJson?: string;
}
interface Course {
  id: string; name: string; city: string; state: string; active: boolean; featured: boolean;
  stripeAccountActive: boolean; slug: string; type?: string;
  operator: { email: string; name: string; onboardingStep: number; emailVerified: boolean } | null;
  createdAt: string;
}
interface Stats {
  totalCourses: number; activeCourses: number; pendingInquiries: number;
  totalBookings: number; recentBookings: number; totalGolfers: number;
  platformRevenue30d: number;
  revenueByDay: { date: string; platform: number; gross: number }[];
}
interface CourseDetail {
  course: Course & { operator: Record<string,unknown>|null; schedules: unknown[] };
  staff: { id:string;name:string;email:string;role:string;active:boolean }[];
  recentBookings: { id:string;golferName:string;golferEmail:string;players:number;totalAmount:number;createdAt:string;teeTime:{date:string;time:string} }[];
  totalBookings: number;
  revenue30d: { gross:number; platform:number; greenFees:number };
}
interface ApproveResult { tempPassword?: string; setupLink?: string; detailsLink?: string; emailSent?: boolean; emailError?: string; }
interface TeeSlot {
  id: string; time: string; holes: number; playersAvailable: number; playersBooked: number;
  greenFee: number; cartFee: number; status: string; tierName: string;
  bookings: { id:string; golferName:string; golferEmail:string; golferPhone:string; players:number; totalAmount:number; paymentStatus:string }[];
}

/* ─── Constants ─── */
const STATUS_PIPELINE = [
  { key: 'pending',           label: 'Pending',        color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  { key: 'in_review',         label: 'In Review',      color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30' },
  { key: 'details_requested', label: 'Sheet Sent',     color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30' },
  { key: 'details_submitted', label: 'Sheet In',       color: 'text-teal-400',   bg: 'bg-teal-500/10 border-teal-500/30' },
  { key: 'building',          label: 'Building',       color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  { key: 'live',              label: 'Live',            color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30' },
  { key: 'rejected',          label: 'Rejected',       color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30' },
];

const STATUS_BADGE: Record<string, string> = {
  pending:           'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
  in_review:         'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  details_requested: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40',
  details_submitted: 'bg-teal-500/20 text-teal-300 border border-teal-500/40',
  building:          'bg-orange-500/20 text-orange-300 border border-orange-500/40',
  live:              'bg-green-500/20 text-green-300 border border-green-500/40',
  rejected:          'bg-red-500/20 text-red-300 border border-red-500/40',
  approved:          'bg-green-500/20 text-green-300 border border-green-500/40',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', in_review: 'In Review',
  details_requested: 'Sheet Sent', details_submitted: 'Sheet In',
  building: 'Building', live: 'Live', rejected: 'Rejected', approved: 'Approved',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const fmtDateShort = (d: string) => new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const fmtTime = (t: string) => { const [h,m]=t.split(':'); const hr=Number(h); return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?'PM':'AM'}`; };

/* ─── Shared input class ─── */
const iCls = 'w-full bg-gray-800/80 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 placeholder-gray-600 transition-colors';

/* ─── Inquiry view toggle ─── */
function InquiryToggle({ view, onSwitch, activeCount, pastCount }: {
  view: 'active'|'past'; onSwitch: (v: 'active'|'past') => void; activeCount: number; pastCount: number;
}) {
  const btnCls = (v: 'active'|'past') => 'px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors ' + (view === v ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-white');
  return (
    <div className="flex gap-1 mb-5 bg-gray-800/50 border border-gray-800 rounded-xl p-1 w-fit">
      <button onClick={() => onSwitch('active')} className={btnCls('active')}>{'Active (' + activeCount + ')'}</button>
      <button onClick={() => onSwitch('past')} className={btnCls('past')}>{'Past (' + pastCount + ')'}</button>
    </div>
  );
}

/* ─── Pipeline status bar ─── */
function PipelineBar({ inquiries }: { inquiries: { status: string }[] }) {
  return (
    <div className="grid grid-cols-7 gap-2 mb-5">
      {STATUS_PIPELINE.map(s => {
        const count = inquiries.filter(i => i.status === s.key).length;
        const numCls = count > 0 ? s.color : 'text-gray-700';
        const labelCls = 'text-[10px] font-semibold uppercase tracking-wide mt-0.5 ' + (count > 0 ? s.color : 'text-gray-700');
        const wrapCls = 'rounded-xl border px-2 py-2.5 text-center ' + (count > 0 ? s.bg : 'bg-gray-900 border-gray-800');
        return (
          <div key={s.key} className={wrapCls}>
            <div className={'text-xl font-black ' + numCls}>{count}</div>
            <div className={labelCls}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ label, value, sub, icon, accent = false, trend }: {
  label: string; value: string|number; sub?: string; icon: React.ReactNode; accent?: boolean; trend?: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 relative overflow-hidden ${accent ? 'bg-gradient-to-br from-emerald-900/60 to-emerald-800/30 border-emerald-700/50' : 'bg-gray-900 border-gray-800'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-xl ${accent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>{icon}</div>
        {trend && <span className="text-xs text-emerald-400 font-semibold flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3"/>{trend}</span>}
      </div>
      <div className={`text-3xl font-black mb-0.5 ${accent ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ─── Revenue Chart ─── */
function RevenueChart({ data }: { data: {date:string;platform:number;gross:number}[] }) {
  if (!data.length) return <div className="text-center text-gray-600 py-12 text-sm">No bookings yet — chart appears once revenue comes in</div>;
  const max = Math.max(...data.map(d => d.gross), 0.01);
  const platformMax = Math.max(...data.map(d => d.platform), 0.01);
  const totalGross = data.reduce((s,d)=>s+d.gross,0);
  const totalPlatform = data.reduce((s,d)=>s+d.platform,0);

  return (
    <div>
      <div className="flex items-center gap-6 mb-4">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Total Gross</div>
          <div className="text-xl font-black text-white">{fmtMoney(totalGross)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">GR Fees Earned</div>
          <div className="text-xl font-black text-emerald-400">{fmtMoney(totalPlatform)}</div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-600 inline-block"/>Gross</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"/>GR Fees</span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-24">
        {data.map(d => (
          <div key={d.date} className="flex-1 flex items-end gap-px group relative" title={`${fmtDateShort(d.date)}\nGross: ${fmtMoney(d.gross)}\nFees: ${fmtMoney(d.platform)}`}>
            <div className="flex-1 bg-gray-700/50 rounded-t-sm transition-all group-hover:bg-gray-600/70" style={{height:`${Math.max(2,(d.gross/max)*100)}%`}}/>
            <div className="flex-1 bg-emerald-500/80 rounded-t-sm transition-all group-hover:bg-emerald-400" style={{height:`${Math.max(2,(d.platform/platformMax)*100)}%`}}/>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-gray-600">
        <span>{data.length > 0 ? fmtDateShort(data[0].date) : ''}</span>
        <span>{data.length > 0 ? fmtDateShort(data[Math.floor(data.length/2)].date) : ''}</span>
        <span>{data.length > 0 ? fmtDateShort(data[data.length-1].date) : ''}</span>
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function AdminPage() {
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<'overview'|'inquiries'|'courses'|'create'>('overview');
  const [createForm, setCreateForm] = useState({ courseName:'', courseType:'public', address:'', city:'', state:'NJ', zipCode:'', phone:'', website:'', contactName:'', contactEmail:'', contactPhone:'', holes:18, par:72, description:'', hasMemberPricing:false, hasResidentPricing:false });
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{tempPassword:string;setupLink:string;slug:string}|null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<Stats|null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [approveResults, setApproveResults] = useState<Record<string,ApproveResult>>({});
  const [processing, setProcessing] = useState<string|null>(null);
  const [noteTexts, setNoteTexts] = useState<Record<string,string>>({});
  const [inquiryView, setInquiryView] = useState<'active'|'past'>('active');
  const [detail, setDetail] = useState<CourseDetail|null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [drawerTab, setDrawerTab] = useState<'overview'|'contact'|'teesheet'|'setup'>('overview');
  const [setupForm, setSetupForm] = useState<Record<string, unknown>>({});
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupMsg, setSetupMsg] = useState('');
  const [schedules, setSchedules] = useState<{id:string;daysOfWeek:number[];startTime:string;endTime:string;intervalMinutes:number;greenFeeWeekday:number;greenFeeWeekend:number;memberRateWeekday:number|null;memberRateWeekend:number|null;cartFee:number;walkingAllowed:boolean}[]>([]);
  const [newSchedule, setNewSchedule] = useState({ daysOfWeek: [] as number[], startTime: '06:00', endTime: '18:00', intervalMinutes: 8, greenFeeWeekday: 65, greenFeeWeekend: 85, memberRateWeekday: '', memberRateWeekend: '', cartFee: 18, walkingAllowed: true });
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const [tsDate, setTsDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [tsSlots, setTsSlots] = useState<TeeSlot[]>([]);
  const [tsLoading, setTsLoading] = useState(false);
  const [manualSlot, setManualSlot] = useState<string|null>(null);
  const [manualForm, setManualForm] = useState({ name:'', email:'', phone:'', players: 1 });

  const H = useCallback(() => ({ 'Content-Type':'application/json','x-admin-key':key }), [key]);

  const loadStats    = useCallback(async()=>{ const r=await fetch('/api/admin/stats',{headers:H()}); if(r.ok) setStats(await r.json()); },[H]);
  const loadInquiries= useCallback(async()=>{ setLoading(true); const r=await fetch('/api/admin/inquiries',{headers:H()}); if(r.ok) setInquiries(await r.json()); setLoading(false); },[H]);
  const loadCourses  = useCallback(async()=>{ setLoading(true); const r=await fetch('/api/admin/courses',{headers:H()}); if(r.ok) setCourses(await r.json()); setLoading(false); },[H]);
  const loadTeeSheet = useCallback(async (courseId: string, date: string) => {
    setTsLoading(true); setTsSlots([]);
    const r = await fetch(`/api/admin/tee-sheet?courseId=${courseId}&date=${date}`, { headers: H() });
    if (r.ok) setTsSlots(await r.json());
    setTsLoading(false);
  }, [H]);

  useEffect(()=>{ if(!authed) return; loadStats(); if(tab==='inquiries') loadInquiries(); else if(tab==='courses') loadCourses(); },[authed,tab,loadStats,loadInquiries,loadCourses]);

  async function login() {
    const r = await fetch('/api/admin/inquiries',{headers:H()});
    if(r.ok) { setAuthed(true); } else alert('Wrong key');
  }

  async function inquiryAction(id: string, action: string, extraPayload: Record<string,unknown> = {}) {
    setProcessing(id);
    try {
      const r = await fetch('/api/admin/inquiries', { method:'PATCH', headers:H(), body: JSON.stringify({ id, action, ...extraPayload }) });
      const text = await r.text();
      let d: Record<string,unknown> = {};
      try { d = JSON.parse(text); } catch { /* not json */ }
      if (r.ok) {
        if (['build_course','resend_welcome','request_details','resend_details'].includes(action)) setApproveResults(p => ({ ...p, [id]: d as unknown as ApproveResult }));
        if (action === 'mark_live' && d.emailSent === false) alert(`Course is live, but the orientation email failed to send (${d.emailError || 'unknown error'}). You may want to follow up directly.`);
        if (action === 'add_note') {
          setInquiries(prev => prev.map(inq => inq.id === id ? { ...inq, adminNotes: d.adminNotes as string } : inq));
          setNoteTexts(p => ({ ...p, [id]: '' }));
        } else { loadInquiries(); }
      } else { alert(`Failed (${r.status}): ${(d.error as string) || text.slice(0, 200)}`); }
    } catch (e) { alert(`Error: ${e}`); }
    setProcessing(null);
  }

  async function deleteInquiry(id: string, name: string) {
    if (!confirm(`Permanently delete inquiry for "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/inquiries?id=${id}`, { method: 'DELETE', headers: H() });
    setInquiries(prev => prev.filter(i => i.id !== id));
  }

  async function deleteCourse(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}" and ALL its data? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/courses?id=${id}`, { method: 'DELETE', headers: H() });
    if (r.ok) { setCourses(prev => prev.filter(c => c.id !== id)); setDetail(null); }
    else { const d = await r.json(); alert(`Delete failed: ${d.error}`); }
  }

  async function openDetail(course: Course) {
    setDetailLoading(true); setDetail(null); setDrawerTab('overview');
    const r = await fetch(`/api/admin/course-detail?courseId=${course.id}`,{headers:H()});
    if(r.ok) setDetail(await r.json());
    setDetailLoading(false);
  }

  async function loadSchedules(courseId: string) {
    const r = await fetch(`/api/admin/schedule?courseId=${courseId}`, { headers: H() });
    if (r.ok) setSchedules(await r.json());
  }

  async function openCourseSetup(courseId: string, originatingCourseType?: string) {
    setTab('courses');
    setDetailLoading(true); setDetail(null);
    const r = await fetch(`/api/admin/course-detail?courseId=${courseId}`, { headers: H() });
    if (r.ok) {
      const d = await r.json();
      setDetail(d);
      setSetupForm(d.course);
      if (originatingCourseType === 'private' && !d.course.hasMemberPricing) {
        setSetupForm((f: Record<string, unknown>) => ({ ...f, hasMemberPricing: true }));
      }
    }
    setDetailLoading(false);
    setDrawerTab('setup');
    loadSchedules(courseId);
  }

  async function buildAndConfigure(inq: Inquiry) {
    setProcessing(inq.id);
    try {
      const r = await fetch('/api/admin/inquiries', { method: 'PATCH', headers: H(), body: JSON.stringify({ id: inq.id, action: 'build_course' }) });
      const d = await r.json();
      if (!r.ok) { alert(`Failed: ${d.error || 'unknown error'}`); setProcessing(null); return; }
      setApproveResults(p => ({ ...p, [inq.id]: d as unknown as ApproveResult }));
      await loadInquiries();
      if (d.emailSent === false) alert(`Course built, but the welcome email failed to send (${d.emailError || 'unknown error'}).`);
      const list = await fetch('/api/admin/inquiries', { headers: H() }).then(res => res.json());
      const updated = (list as Inquiry[]).find(i => i.id === inq.id);
      if (updated?.builtCourseId) await openCourseSetup(updated.builtCourseId, inq.courseType);
    } catch (e) { alert(`Error: ${e}`); }
    setProcessing(null);
  }

  async function saveSetup() {
    if (!detail?.course?.id) return;
    setSetupSaving(true); setSetupMsg('');
    const r = await fetch('/api/admin/course-settings', { method: 'PATCH', headers: H(), body: JSON.stringify({ courseId: detail.course.id, ...setupForm }) });
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
    const r = await fetch('/api/admin/schedule', { method: 'POST', headers: H(), body: JSON.stringify({ courseId: detail.course.id, ...newSchedule }) });
    setSetupSaving(false);
    if (r.ok) { setSetupMsg('schedule_saved'); loadSchedules(detail.course.id); }
    else { setSetupMsg('error'); }
  }

  async function deleteSchedule(id: string) {
    if (!detail?.course?.id) return;
    await fetch('/api/admin/schedule', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) });
    loadSchedules(detail.course.id);
  }

  async function toggleCourseActive(courseId: string, active: boolean) {
    await fetch('/api/admin/course-detail',{method:'PATCH',headers:H(),body:JSON.stringify({courseId,active})});
    setCourses(c=>c.map(x=>x.id===courseId?{...x,active}:x));
    if(detail?.course?.id===courseId) setDetail(d=>d?{...d,course:{...d.course,active}}:d);
  }
  async function toggleFeatured(courseId: string, featured: boolean) {
    await fetch('/api/admin/course-detail',{method:'PATCH',headers:H(),body:JSON.stringify({courseId,featured})});
    setCourses(c=>c.map(x=>x.id===courseId?{...x,featured}:x));
  }

  async function createCourse() {
    setCreating(true); setCreateResult(null);
    try {
      const r = await fetch('/api/admin/create-course', { method:'POST', headers:H(), body:JSON.stringify(createForm) });
      const d = await r.json();
      if (r.ok) { setCreateResult(d); }
      else alert(`Error: ${d.error}`);
    } catch(e) { alert(`Error: ${e}`); }
    setCreating(false);
  }

  async function blockSlot(teeTimeId: string, block: boolean) {
    await fetch('/api/admin/tee-sheet', { method:'PATCH', headers:H(), body:JSON.stringify({ action: block?'block':'unblock', teeTimeId }) });
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

  const filteredCourses = courses.filter(c=>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.city.toLowerCase().includes(search.toLowerCase()) || c.state.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Login screen ── */
  if (!authed) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 mb-4">
            <Shield className="w-7 h-7 text-emerald-400"/>
          </div>
          <div className="text-2xl font-black text-white">GreenReserve</div>
          <div className="text-sm text-gray-500 mt-1">Admin Console</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">
          <input type="password" placeholder="Enter admin key" value={key}
            onChange={e=>setKey(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm mb-3 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none placeholder-gray-600"/>
          <button onClick={login} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold transition-colors text-sm">
            Sign In →
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Detail Drawer ── */
  const DetailDrawer = () => {
    if (!detail && !detailLoading) return null;
    const c = detail?.course;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
        <div className="bg-gray-950 border-l border-gray-800 w-full max-w-2xl h-full flex flex-col shadow-2xl">

          {/* Drawer Header */}
          <div className="border-b border-gray-800 px-6 py-4 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <button onClick={()=>setDetail(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
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
                  <a href={`/courses/${c.slug}`} target="_blank" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-500 hover:text-blue-400 transition-colors" title="View public page">
                    <Globe className="w-4 h-4"/>
                  </a>
                  <button onClick={()=>toggleFeatured(c.id,!c.featured)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${c.featured?'text-yellow-400 bg-yellow-500/10':'text-gray-600 hover:text-yellow-400 hover:bg-gray-800'}`} title={c.featured?'Unfeature':'Feature'}>
                    <Star className="w-4 h-4"/>
                  </button>
                  <button onClick={()=>toggleCourseActive(c.id,!c.active)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${c.active?'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20':'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'}`}>
                    <Power className="w-3.5 h-3.5"/>
                  </button>
                  <button onClick={()=>deleteCourse(c.id,c.name)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </>}
              </div>
            </div>

            {/* Drawer Tabs */}
            <div className="flex gap-0.5 mt-3 bg-gray-900 rounded-xl p-1">
              {(['overview','contact','setup','teesheet'] as const).map(t => (
                <button key={t} onClick={()=>{ setDrawerTab(t); if(t==='teesheet'&&c) loadTeeSheet(c.id,tsDate); if(t==='setup'&&c){ setSetupForm(c as Record<string,unknown>); loadSchedules(c.id); } }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${drawerTab===t?'bg-gray-700 text-white shadow-sm':'text-gray-500 hover:text-gray-300'}`}>
                  {t==='teesheet'?'Tee Sheet':t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {detailLoading && <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading course data...</div>}

          {detail && (
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* ── Overview Tab ── */}
              {drawerTab==='overview' && <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Gross (30d)', value: fmtMoney(detail.revenue30d.gross), color: 'text-white' },
                    { label: 'GR Fees (30d)', value: fmtMoney(detail.revenue30d.platform), color: 'text-emerald-400' },
                    { label: 'All-time Bookings', value: detail.totalBookings, color: 'text-white' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">{label}</div>
                      <div className={`text-xl font-black ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Operator status strip */}
                {c?.operator && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-black text-base shrink-0">
                      {String(c.operator.name)[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-sm truncate">{String(c.operator.name)}</div>
                      <div className="text-xs text-gray-500 truncate">{String(c.operator.email)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.operator.emailVerified
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Verified</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">Not verified</span>
                      }
                      {c.stripeAccountActive && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">Stripe ✓</span>}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">Step {c.operator.onboardingStep}/3</span>
                    </div>
                  </div>
                )}

                {detail.staff.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Staff — {detail.staff.length} member{detail.staff.length!==1?'s':''}</div>
                    <div className="space-y-1.5">
                      {detail.staff.map(s => (
                        <div key={s.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">{s.name[0]}</div>
                          <div className="flex-1 text-sm"><span className="font-medium text-white">{s.name}</span><span className="text-gray-500 text-xs"> · {s.email} · {s.role}</span></div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${s.active?'bg-emerald-500/10 text-emerald-400':'bg-gray-800 text-gray-500'}`}>{s.active?'Active':'Off'}</span>
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
                        <div key={b.id} className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-white text-sm truncate">{b.golferName}</div>
                            <div className="text-xs text-gray-500">{fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)} · {b.players} player{b.players!==1?'s':''}</div>
                          </div>
                          <div className="text-sm font-black text-emerald-400">{fmtMoney(b.totalAmount/100)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.recentBookings.length === 0 && detail.totalBookings === 0 && (
                  <div className="text-center py-10 text-gray-600 text-sm">No bookings yet for this course</div>
                )}
              </div>}

              {/* ── Contact Tab ── */}
              {drawerTab==='contact' && <div className="space-y-4">
                {c?.operator && <>
                  <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/10 border border-blue-700/30 rounded-2xl p-5">
                    <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-3">Operator / Owner</div>
                    <div className="text-lg font-black text-white mb-1">{String(c.operator.name)}</div>
                    <div className="space-y-2 mt-3">
                      <a href={`mailto:${String(c.operator.email)}`} className="flex items-center gap-3 text-sm text-gray-300 hover:text-blue-400 transition-colors">
                        <Mail className="w-4 h-4 text-gray-500"/>{String(c.operator.email)}
                      </a>
                      {String((c.operator as Record<string,unknown>).phone||'') && (
                        <a href={`tel:${String((c.operator as Record<string,unknown>).phone)}`} className="flex items-center gap-3 text-sm text-gray-300 hover:text-blue-400 transition-colors">
                          <Phone className="w-4 h-4 text-gray-500"/>{String((c.operator as Record<string,unknown>).phone)}
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4 flex-wrap">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${c.operator.emailVerified?'bg-emerald-500/10 text-emerald-400 border-emerald-500/30':'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                        {c.operator.emailVerified?'✓ Email verified':'✗ Not verified'}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-400 border border-gray-700 font-medium">Onboarding {c.operator.onboardingStep}/3</span>
                      {c.stripeAccountActive && <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 font-medium">Stripe connected ✓</span>}
                    </div>
                  </div>

                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Course Info</div>
                    <div className="space-y-2.5">
                      {[
                        ['Address', String((c as Record<string,unknown>).address||'—')],
                        ['Phone',   String((c as Record<string,unknown>).phone||'—')],
                        ['Website', String((c as Record<string,unknown>).website||'—')],
                        ['Type',    String((c as Record<string,unknown>).type||'—')],
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
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Staff Contacts</div>
                    <div className="space-y-3">
                      {detail.staff.map(s => (
                        <div key={s.id} className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">{s.name[0]}</div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-white">{s.name} <span className="text-xs text-gray-500 font-normal">· {s.role}</span></div>
                            <a href={`mailto:${s.email}`} className="text-xs text-blue-400 hover:underline">{s.email}</a>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${s.active?'bg-emerald-500/10 text-emerald-400':'bg-gray-800 text-gray-500'}`}>{s.active?'Active':'Off'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>}

              {/* ── Setup Tab ── */}
              {drawerTab==='setup' && <div className="space-y-5">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-xs text-amber-300">
                  You&apos;re editing live settings directly. The operator can still adjust their own dashboard — this doesn&apos;t lock them out.
                </div>

                {setupMsg && (
                  <div className={`text-sm font-semibold px-4 py-2.5 rounded-xl border ${setupMsg==='error'?'bg-red-500/10 text-red-400 border-red-500/30':setupMsg==='schedule_saved'?'bg-emerald-500/10 text-emerald-400 border-emerald-500/30':'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                    {setupMsg==='error'?'❌ Error saving':setupMsg==='schedule_saved'?'✅ Schedule saved — tee times generated for next 8 days':'✅ Settings saved'}
                  </div>
                )}

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Course Policy</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1.5">Walking policy</label>
                      <select value={String(setupForm.walkingAllowed??'always')} onChange={e=>setSetupForm(f=>({...f,walkingAllowed:e.target.value}))} className={iCls}>
                        <option value="always">Always allowed</option>
                        <option value="weekdays">Weekdays only</option>
                        <option value="after12">After 12pm only</option>
                        <option value="never">Cart required</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1.5">Cancellation window (hrs)</label>
                      <input type="number" value={Number(setupForm.cancellationHours??24)} onChange={e=>setSetupForm(f=>({...f,cancellationHours:Number(e.target.value)}))} className={iCls}/>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {[['hasMemberPricing','Member pricing'],['hasResidentPricing','Resident pricing'],['hasCaddies','Caddies'],['cartRequired','Cart required']].map(([k,label])=>(
                      <label key={k} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                        <input type="checkbox" checked={!!setupForm[k]} onChange={e=>setSetupForm(f=>({...f,[k]:e.target.checked}))} className="w-4 h-4 accent-emerald-500 rounded"/>
                        {label}
                      </label>
                    ))}
                  </div>
                  {!!setupForm.hasResidentPricing && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1.5">Resident county</label>
                        <input value={String(setupForm.residentCounty??'')} onChange={e=>setSetupForm(f=>({...f,residentCounty:e.target.value}))} className={iCls}/>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1.5">Resident state</label>
                        <input value={String(setupForm.residentState??'')} maxLength={2} onChange={e=>setSetupForm(f=>({...f,residentState:e.target.value}))} className={iCls}/>
                      </div>
                    </div>
                  )}
                  <button onClick={saveSetup} disabled={setupSaving} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors">
                    {setupSaving?'Saving...':'Save Policy Settings'}
                  </button>
                </div>

                {/* Schedule */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tee Time Schedules</div>
                  {schedules.length > 0 ? (
                    <div className="space-y-2">
                      {schedules.map(s => (
                        <div key={s.id} className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
                          <div>
                            <div className="font-semibold text-white text-sm">
                              {s.daysOfWeek.length===0?'Every day':s.daysOfWeek.map(d=>DAYS[d]).join(', ')} · {s.startTime}–{s.endTime} every {s.intervalMinutes}min
                            </div>
                            <div className="text-gray-500 text-xs mt-0.5">
                              WD ${s.greenFeeWeekday} / WE ${s.greenFeeWeekend} · Cart ${s.cartFee}
                              {s.memberRateWeekday!=null&&` · Member $${s.memberRateWeekday}`}
                              {s.walkingAllowed?' · Walking ✓':''}
                            </div>
                          </div>
                          <button onClick={()=>deleteSchedule(s.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10">
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 bg-gray-800/50 rounded-xl p-4">No schedule yet — add one below to make this course bookable.</p>
                  )}

                  <div className="border-t border-gray-800 pt-4 space-y-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Schedule</div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Days <span className="text-gray-600">(none = every day)</span></label>
                      <div className="flex gap-1.5">
                        {DAYS.map((day,i)=>(
                          <button key={day} onClick={()=>toggleNewScheduleDay(i)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${newSchedule.daysOfWeek.includes(i)?'bg-emerald-600 text-white border-emerald-600':'bg-gray-800 text-gray-400 border-gray-700 hover:border-emerald-500 hover:text-white'}`}>{day}</button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="text-xs text-gray-500 block mb-1">First tee</label><input type="time" value={newSchedule.startTime} onChange={e=>setNewSchedule(s=>({...s,startTime:e.target.value}))} className={iCls}/></div>
                      <div><label className="text-xs text-gray-500 block mb-1">Last tee</label><input type="time" value={newSchedule.endTime} onChange={e=>setNewSchedule(s=>({...s,endTime:e.target.value}))} className={iCls}/></div>
                      <div><label className="text-xs text-gray-500 block mb-1">Interval</label>
                        <select value={newSchedule.intervalMinutes} onChange={e=>setNewSchedule(s=>({...s,intervalMinutes:Number(e.target.value)}))} className={iCls}>
                          {[7,8,9,10,12,15].map(v=><option key={v} value={v}>{v} min</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="text-xs text-gray-500 block mb-1">WD Green fee $</label><input type="number" value={newSchedule.greenFeeWeekday} onChange={e=>setNewSchedule(s=>({...s,greenFeeWeekday:Number(e.target.value)}))} className={iCls}/></div>
                      <div><label className="text-xs text-gray-500 block mb-1">WE Green fee $</label><input type="number" value={newSchedule.greenFeeWeekend} onChange={e=>setNewSchedule(s=>({...s,greenFeeWeekend:Number(e.target.value)}))} className={iCls}/></div>
                      <div><label className="text-xs text-gray-500 block mb-1">Cart fee $</label><input type="number" value={newSchedule.cartFee} onChange={e=>setNewSchedule(s=>({...s,cartFee:Number(e.target.value)}))} className={iCls}/></div>
                    </div>
                    {!!setupForm.hasMemberPricing && (
                      <div className="grid grid-cols-2 gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                        <div><label className="text-xs font-semibold text-blue-400 block mb-1">Member rate WD $</label><input type="number" value={newSchedule.memberRateWeekday} onChange={e=>setNewSchedule(s=>({...s,memberRateWeekday:e.target.value}))} className={iCls}/></div>
                        <div><label className="text-xs font-semibold text-blue-400 block mb-1">Member rate WE $</label><input type="number" value={newSchedule.memberRateWeekend} onChange={e=>setNewSchedule(s=>({...s,memberRateWeekend:e.target.value}))} className={iCls}/></div>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                      <input type="checkbox" checked={newSchedule.walkingAllowed} onChange={e=>setNewSchedule(s=>({...s,walkingAllowed:e.target.checked}))} className="w-4 h-4 accent-emerald-500 rounded"/>
                      Walking allowed
                    </label>
                    <button onClick={addSchedule} disabled={setupSaving} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
                      {setupSaving?'Saving...':'Save Schedule & Generate Tee Times'}
                    </button>
                  </div>
                </div>
              </div>}

              {/* ── Tee Sheet Tab ── */}
              {drawerTab==='teesheet' && <div>
                <div className="flex items-center gap-3 mb-5">
                  <Calendar className="w-4 h-4 text-gray-500"/>
                  <input type="date" value={tsDate} onChange={e=>{ setTsDate(e.target.value); if(c) loadTeeSheet(c.id,e.target.value); }}
                    className="bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50"/>
                  {!tsLoading && <span className="text-xs text-gray-500">{tsSlots.length} slots · {tsSlots.filter(s=>s.bookings.length>0).length} booked</span>}
                </div>

                {tsLoading && <div className="text-center text-gray-500 py-12 text-sm">Loading tee sheet...</div>}
                {!tsLoading && tsSlots.length===0 && <div className="text-center text-gray-600 py-12 text-sm">No tee times for this date</div>}

                <div className="space-y-2">
                  {tsSlots.map(slot => (
                    <div key={slot.id} className={`rounded-xl border overflow-hidden ${slot.status==='blocked'?'border-red-500/30 bg-red-500/5':slot.bookings.length>0?'border-emerald-500/30 bg-emerald-500/5':'border-gray-800 bg-gray-900'}`}>
                      <div className="px-4 py-3 flex items-center gap-3">
                        <span className="font-mono font-bold text-white text-sm w-14 shrink-0">{slot.time}</span>
                        <span className="text-xs text-gray-500">{slot.holes}h · ${slot.greenFee}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${slot.status==='blocked'?'bg-red-500/20 text-red-400':slot.bookings.length>0?'bg-emerald-500/20 text-emerald-400':'bg-gray-800 text-gray-400'}`}>
                          {slot.status==='blocked'?'Blocked':slot.bookings.length>0?`${slot.bookings.length} booked`:`${slot.playersAvailable} open`}
                        </span>
                        <div className="ml-auto flex items-center gap-1.5">
                          <button onClick={()=>setManualSlot(slot.id)} className="text-xs px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-1 transition-colors">
                            <Plus className="w-3 h-3"/>Add
                          </button>
                          <button onClick={()=>blockSlot(slot.id,slot.status!=='blocked')} className={`text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 border transition-colors ${slot.status==='blocked'?'border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20':'border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20'}`}>
                            <Ban className="w-3 h-3"/>{slot.status==='blocked'?'Unblock':'Block'}
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
                                    {b.paymentStatus==='manual' && <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">Manual</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-emerald-400">{fmtMoney(b.totalAmount/100)}</span>
                                <button onClick={()=>cancelBooking(b.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors">Cancel</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Manual booking modal */}
                {manualSlot && (
                  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-60 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="font-bold text-white">Add Manual Booking</h3>
                        <button onClick={()=>setManualSlot(null)} className="text-gray-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors"><X className="w-4 h-4"/></button>
                      </div>
                      <div className="space-y-3">
                        {[['Golfer Name *','name','text'],['Email *','email','email'],['Phone','phone','tel']].map(([label,field,type])=>(
                          <div key={field}>
                            <label className="text-xs font-semibold text-gray-500 block mb-1.5">{label}</label>
                            <input type={type} value={(manualForm as Record<string,unknown>)[field] as string} onChange={e=>setManualForm(f=>({...f,[field]:e.target.value}))} className={iCls}/>
                          </div>
                        ))}
                        <div>
                          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Players *</label>
                          <select value={manualForm.players} onChange={e=>setManualForm(f=>({...f,players:Number(e.target.value)}))} className={iCls}>
                            {[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-3 mt-5">
                        <button onClick={()=>setManualSlot(null)} className="flex-1 px-4 py-2.5 border border-gray-700 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:border-gray-600 transition-colors">Cancel</button>
                        <button onClick={addManualBooking} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-colors">Add Booking</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ── Main layout ── */
  return (
    <div className="min-h-screen bg-gray-950 text-white flex">

      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-56 bg-gray-900 border-r border-gray-800 flex flex-col z-10">
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Layers className="w-4 h-4 text-emerald-400"/>
            </div>
            <div>
              <div className="font-black text-sm text-white leading-tight">GreenReserve</div>
              <div className="text-[10px] text-gray-600 font-medium uppercase tracking-wider">Admin</div>
            </div>
          </div>
        </div>

        {stats && (
          <div className="px-4 py-3 border-b border-gray-800/50 grid grid-cols-2 gap-2">
            <div className="bg-gray-800/50 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-white leading-none">{stats.activeCourses}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Live</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-emerald-400 leading-none">{fmtMoney(stats.platformRevenue30d).replace('$','$')}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">30d fees</div>
            </div>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-0.5">
          {([
            ['overview',   'Overview',    <BarChart2 key="b" className="w-4 h-4"/>],
            ['inquiries',  'Inquiries',   <AlertCircle key="a" className="w-4 h-4"/>],
            ['courses',    'Courses',     <Building2 key="c" className="w-4 h-4"/>],
            ['create',     'Add Course',  <Plus key="p" className="w-4 h-4"/>],
          ] as const).map(([id,label,icon])=>(
            <button key={id} onClick={()=>setTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab===id?'bg-emerald-600/20 text-emerald-400 border border-emerald-500/20':'text-gray-500 hover:text-white hover:bg-gray-800 border border-transparent'}`}>
              {icon}{label}
              {id==='inquiries' && stats?.pendingInquiries > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">{stats.pendingInquiries}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <div className="text-[10px] text-gray-700 uppercase tracking-wider px-3 mb-1">Signed in</div>
          <button onClick={()=>setAuthed(false)} className="w-full text-left text-xs text-gray-500 hover:text-gray-300 px-3 py-2 rounded-xl hover:bg-gray-800 transition-colors">Sign out</button>
        </div>
      </div>

      {/* Content */}
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-6xl">

          {/* ══ OVERVIEW ══ */}
          {tab==='overview' && <>
            <div className="flex items-center justify-between mb-7">
              <div>
                <h1 className="text-2xl font-black text-white">Platform Overview</h1>
                <div className="text-sm text-gray-500 mt-0.5">Everything happening across GreenReserve</div>
              </div>
              <button onClick={loadStats} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white px-3 py-2 rounded-xl hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors">
                <RefreshCw className="w-4 h-4"/>Refresh
              </button>
            </div>

            {stats ? <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard label="Live Courses" value={stats.activeCourses} sub={`${stats.totalCourses} total`} icon={<Building2 className="w-4 h-4"/>}/>
                <StatCard label="Golfer Accounts" value={stats.totalGolfers} sub="registered" icon={<Users className="w-4 h-4"/>}/>
                <StatCard label="Bookings (30d)" value={stats.recentBookings} sub={`${stats.totalBookings} all time`} icon={<TrendingUp className="w-4 h-4"/>}/>
                <StatCard label="GR Revenue (30d)" value={fmtMoney(stats.platformRevenue30d)} sub="$1.50/player access fee" icon={<DollarSign className="w-4 h-4"/>} accent/>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-5">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Revenue — Last 30 Days</div>
                <RevenueChart data={stats.revenueByDay}/>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 col-span-1">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><Activity className="w-3.5 h-3.5"/>Pipeline</div>
                  <div className="space-y-2">
                    {STATUS_PIPELINE.slice(0,5).map(s=>{
                      const count = inquiries.filter(i=>i.status===s.key).length;
                      return count > 0 ? (
                        <div key={s.key} className="flex items-center justify-between">
                          <span className={`text-xs font-medium ${s.color}`}>{s.label}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${s.bg} ${s.color}`}>{count}</span>
                        </div>
                      ) : null;
                    })}
                    {inquiries.length === 0 && <div className="text-xs text-gray-600">No inquiries yet</div>}
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 col-span-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><Zap className="w-3.5 h-3.5"/>Quick Actions</div>
                  <div className="space-y-2">
                    {stats.pendingInquiries > 0 && (
                      <button onClick={()=>setTab('inquiries')} className="w-full flex items-center justify-between px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl hover:bg-yellow-500/15 transition-colors group">
                        <div className="flex items-center gap-3">
                          <AlertCircle className="w-4 h-4 text-yellow-400"/>
                          <span className="text-sm font-semibold text-yellow-300">{stats.pendingInquiries} pending inquir{stats.pendingInquiries===1?'y':'ies'} need review</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-yellow-500 group-hover:translate-x-0.5 transition-transform"/>
                      </button>
                    )}
                    <button onClick={()=>setTab('courses')} className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-750 transition-colors group">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-4 h-4 text-gray-400"/>
                        <span className="text-sm font-medium text-gray-300">Manage all courses</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:translate-x-0.5 transition-transform"/>
                    </button>
                    <button onClick={()=>setTab('create')} className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl hover:bg-gray-750 transition-colors group">
                      <div className="flex items-center gap-3">
                        <Plus className="w-4 h-4 text-gray-400"/>
                        <span className="text-sm font-medium text-gray-300">Add a new course</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:translate-x-0.5 transition-transform"/>
                    </button>
                  </div>
                </div>
              </div>
            </> : <div className="text-gray-600 text-center py-20 text-sm">Loading...</div>}
          </>}

          {/* ══ INQUIRIES ══ */}
          {tab==='inquiries' && <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-2xl font-black text-white">Course Inquiries</h1>
                <div className="text-sm text-gray-500 mt-0.5">Manage the pipeline from interest to live</div>
              </div>
              <button onClick={loadInquiries} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white px-3 py-2 rounded-xl hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors">
                <RefreshCw className="w-4 h-4"/>Refresh
              </button>
            </div>

            <PipelineBar inquiries={inquiries}/>

            <InquiryToggle
              view={inquiryView}
              onSwitch={setInquiryView}
              activeCount={inquiries.filter(i => ['pending','in_review','details_requested','details_submitted'].includes(i.status)).length}
              pastCount={inquiries.filter(i => ['building','live','rejected'].includes(i.status)).length}
            />

            {loading && <div className="text-gray-600 py-20 text-center text-sm">Loading...</div>}

            <div className="space-y-3">
              {inquiries
                .filter(inq => inquiryView==='active'
                  ? ['pending','in_review','details_requested','details_submitted'].includes(inq.status)
                  : ['building','live','rejected'].includes(inq.status))
                .map(inq => (
                <div key={inq.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition-colors">
                  <div className="px-5 py-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                        <span className="font-bold text-white">{inq.courseName}</span>
                        <span className={'text-xs px-2.5 py-0.5 rounded-full font-semibold ' + (STATUS_BADGE[inq.status]||'bg-gray-800 text-gray-400')}>{STATUS_LABEL[inq.status]||inq.status}</span>
                        {inq.hasMemberPricing && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Members</span>}
                        {inq.hasResidentPricing && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">Residents</span>}
                        {inq.hasCaddies && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Caddies</span>}
                      </div>
                      <div className="text-sm text-gray-400">{inq.contactName}{inq.contactTitle ? ' · ' + inq.contactTitle : ''} · <a href={'mailto:' + inq.email} className="hover:text-blue-400 transition-colors">{inq.email}</a></div>
                      <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-2">
                        <span>{inq.city}, {inq.state}</span>
                        <span>·</span>
                        <span className="capitalize">{inq.courseType}</span>
                        <span>·</span>
                        <span>{fmtDate(inq.createdAt)}</span>
                        {inq.greenFeeRange && <><span>·</span><span>Fees: {inq.greenFeeRange}</span></>}
                      </div>
                      {inq.adminNotes && (
                        <div className="mt-2 text-xs text-gray-500 bg-gray-800/50 rounded-lg px-3 py-1.5 border border-gray-700/50">
                          {'📝 ' + inq.adminNotes.split('\n')[0].slice(0,100) + (inq.adminNotes.length > 100 ? '...' : '')}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {inq.status==='pending' && <>
                        <button onClick={()=>inquiryAction(inq.id,'mark_in_review')} disabled={processing===inq.id} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"><Clock className="w-3.5 h-3.5"/>In Review</button>
                        <button onClick={()=>{ if(confirm('Reject this inquiry?')) inquiryAction(inq.id,'reject'); }} disabled={processing===inq.id} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                      </>}
                      {inq.status==='in_review' && <>
                        <button onClick={()=>{ if(confirm('Send ' + inq.contactName + ' the setup sheet?')) inquiryAction(inq.id,'request_details'); }} disabled={processing===inq.id} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"><Mail className="w-3.5 h-3.5"/>Send Setup Sheet</button>
                        <button onClick={()=>{ if(confirm('Reject?')) inquiryAction(inq.id,'reject'); }} disabled={processing===inq.id} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                        <button onClick={()=>{ if(confirm('Build ' + inq.courseName + ' now and configure yourself?')) buildAndConfigure(inq); }} disabled={processing===inq.id} className="text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 border border-gray-700 hover:border-gray-600 transition-colors"><Wrench className="w-3 h-3"/>Skip &amp; Build</button>
                      </>}
                      {inq.status==='details_requested' && <>
                        <button onClick={()=>{ if(confirm('Resend setup-sheet link to ' + inq.contactName + '?')) inquiryAction(inq.id,'resend_details'); }} disabled={processing===inq.id} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"><Mail className="w-3.5 h-3.5"/>Resend Sheet</button>
                        <button onClick={()=>{ if(confirm('Reject?')) inquiryAction(inq.id,'reject'); }} disabled={processing===inq.id} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                      </>}
                      {inq.status==='details_submitted' && <>
                        <button onClick={()=>{ if(confirm('Build ' + inq.courseName + '? Creates operator account and opens Setup.')) buildAndConfigure(inq); }} disabled={processing===inq.id} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"><CheckCircle className="w-3.5 h-3.5"/>Build Course</button>
                        <button onClick={()=>{ if(confirm('Reject?')) inquiryAction(inq.id,'reject'); }} disabled={processing===inq.id} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                      </>}
                      {inq.status==='building' && <>
                        {inq.builtCourseId && <button onClick={()=>openCourseSetup(inq.builtCourseId as string, inq.courseType)} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><Wrench className="w-3.5 h-3.5"/>Manage Setup</button>}
                        <button onClick={()=>{ if(confirm('Resend welcome email to ' + inq.contactName + '?')) inquiryAction(inq.id,'resend_welcome'); }} disabled={processing===inq.id} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><Mail className="w-3.5 h-3.5"/>Resend Email</button>
                        <button onClick={()=>{ if(confirm('Set ' + inq.courseName + ' LIVE?')) inquiryAction(inq.id,'mark_live'); }} disabled={processing===inq.id} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"><Power className="w-3.5 h-3.5"/>Go Live</button>
                      </>}
                      {inq.status==='live' && inq.builtCourseId && (
                        <button onClick={()=>openCourseSetup(inq.builtCourseId as string, inq.courseType)} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><Wrench className="w-3.5 h-3.5"/>Manage</button>
                      )}
                      {['building','live','rejected'].includes(inq.status) && (
                        <button onClick={()=>deleteInquiry(inq.id,inq.courseName)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
                      )}
                      <button onClick={()=>setExpanded(expanded===inq.id?null:inq.id)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors">
                        {expanded===inq.id ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                      </button>
                    </div>
                  </div>

                  {approveResults[inq.id] && (() => {
                    const res = approveResults[inq.id];
                    const isDetails = !!res.detailsLink;
                    const rows: [string,string][] = isDetails
                      ? [['Setup Sheet Link', res.detailsLink as string]]
                      : [['Temp Password', res.tempPassword||''],['Setup Link', res.setupLink||'']];
                    const failed = res.emailSent === false;
                    const bannerCls = 'px-5 pb-4 border-t ' + (failed ? 'bg-red-500/5 border-red-500/20' : 'bg-emerald-500/5 border-emerald-500/20');
                    const msgCls = 'text-xs font-semibold mb-2 mt-3 ' + (failed ? 'text-red-400' : 'text-emerald-400');
                    const msg = failed
                      ? ('Warning: ' + (isDetails ? 'Setup-sheet email failed' : 'Welcome email failed') + ' (' + (res.emailError || 'unknown') + '). Share manually:')
                      : ('Done: ' + (isDetails ? 'Setup-sheet sent.' : 'Course built - welcome email sent.'));
                    return (
                      <div className={bannerCls}>
                        <div className={msgCls}>{msg}</div>
                        <div className="space-y-1.5">
                          {rows.map(([label,val])=>(
                            <div key={label} className="flex items-center gap-3 bg-gray-900 rounded-lg px-3 py-2 border border-gray-800">
                              <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
                              <span className="text-xs text-gray-200 font-mono flex-1 truncate">{val}</span>
                              <button onClick={()=>navigator.clipboard.writeText(val)} className="text-gray-600 hover:text-emerald-400 transition-colors" title="Copy"><Copy className="w-3.5 h-3.5"/></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {expanded===inq.id && (
                    <div className="px-5 pb-5 border-t border-gray-800 pt-4 space-y-4">
                      <div className="grid grid-cols-2 gap-2.5 text-sm">
                        {[
                          ['Phone', inq.phone],
                          ['Website', inq.website||'—'],
                          ['Booking method', inq.currentBookingMethod||'—'],
                          ['Tee times/day', String(inq.teeTimesPerDay||'—')],
                          ['Green fees', inq.greenFeeRange||'—'],
                        ].map(([label,val])=>(
                          <div key={label} className="bg-gray-800/50 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                            <div className="text-gray-200 font-medium text-sm">{val}</div>
                          </div>
                        ))}
                        {inq.lookingFor?.length > 0 && (
                          <div className="col-span-2 bg-gray-800/50 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500 mb-0.5">Looking for</div>
                            <div className="text-gray-200 font-medium text-sm">{inq.lookingFor.join(', ')}</div>
                          </div>
                        )}
                        {inq.additionalNotes && (
                          <div className="col-span-2 bg-gray-800/50 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500 mb-0.5">Additional notes</div>
                            <div className="text-gray-200 text-sm">{inq.additionalNotes}</div>
                          </div>
                        )}
                        {inq.pricingNotes && (
                          <div className="col-span-2 bg-gray-800/50 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500 mb-0.5">Pricing notes</div>
                            <div className="text-gray-200 text-sm">{inq.pricingNotes}</div>
                          </div>
                        )}
                      </div>

                      {inq.needsJson && (() => {
                        let n: Record<string,unknown>={};
                        try { n=JSON.parse(inq.needsJson||''); } catch { /* ignore */ }
                        if (Object.keys(n).length === 0) return null;
                        return (
                          <div className="border-t border-gray-800 pt-4">
                            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">What They Need</div>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(n).map(([k,v])=>(
                                <div key={k} className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                                  <div className="text-xs text-amber-600 mb-0.5">{k}</div>
                                  <div className="text-amber-200 text-sm font-medium">{String(v)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {inq.detailsJson && (() => {
                        let d: Record<string,unknown>={};
                        try { d=JSON.parse(inq.detailsJson||''); } catch { /* ignore */ }
                        if (Object.keys(d).length === 0) return null;
                        const sch = d.schedule as Record<string,unknown>|undefined;
                        const rest = Object.fromEntries(Object.entries(d).filter(([k])=>k!=='schedule'));
                        return (
                          <div className="border-t border-gray-800 pt-4 space-y-3">
                            <div className="text-xs font-semibold text-teal-400 uppercase tracking-wide">Setup Sheet Submitted</div>
                            {sch && (sch.greenFeeWeekday || sch.greenFeeWeekend) && (
                              <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4">
                                <div className="text-teal-300 font-semibold text-sm mb-2">Proposed Tee Sheet</div>
                                <div className="text-gray-300 text-sm">
                                  {Array.isArray(sch.daysOfWeek) && (sch.daysOfWeek as number[]).length > 0
                                    ? (sch.daysOfWeek as number[]).map(dd => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dd]).join(', ')
                                    : 'Every day'} {' · '} {String(sch.startTime)}{'–'}{String(sch.endTime)} every {String(sch.intervalMinutes)}min
                                </div>
                                <div className="text-gray-500 text-xs mt-1">
                                  {'WD $' + String(sch.greenFeeWeekday||0) + ' / WE $' + String(sch.greenFeeWeekend||0) + ' · Cart $' + String(sch.cartFee||0) + (sch.memberRateWeekday ? ' · Member $' + String(sch.memberRateWeekday) : '') + (sch.residentRateWeekday ? ' · Resident $' + String(sch.residentRateWeekday) : '') + (sch.walkingAllowed ? ' · Walking' : '')}
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(rest).filter(([,v])=>v!==''&&v!==null&&!(Array.isArray(v)&&v.length===0)).map(([k,v])=>(
                                <div key={k} className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2">
                                  <div className="text-xs text-gray-500 mb-0.5">{k}</div>
                                  <div className="text-gray-200 text-sm">{Array.isArray(v)?v.join(', '):String(v)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="border-t border-gray-800 pt-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Internal Notes</div>
                        {inq.adminNotes && (
                          <pre className="text-xs text-gray-400 bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 mb-3 whitespace-pre-wrap font-sans">{inq.adminNotes}</pre>
                        )}
                        <div className="flex gap-2">
                          <textarea value={noteTexts[inq.id]||''} onChange={e=>setNoteTexts(p=>({...p,[inq.id]:e.target.value}))} placeholder="Add a note..." rows={2}
                            className="flex-1 bg-gray-800 border border-gray-700 text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none placeholder-gray-600"/>
                          <button onClick={()=>inquiryAction(inq.id,'add_note',{note:noteTexts[inq.id]||''})} disabled={!noteTexts[inq.id]?.trim()||processing===inq.id}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors self-start">Save</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!loading && inquiries.filter(inq => {
                const active = ['pending','in_review','details_requested','details_submitted'].includes(inq.status);
                return inquiryView === 'active' ? active : !active;
              }).length === 0 && (
                <div className="text-gray-600 text-center py-20 text-sm">
                  {inquiryView === 'active' ? 'No active inquiries — all caught up' : 'No past inquiries yet'}
                </div>
              )}
            </div>
          </>}

          {/* ══ COURSES ══ */}
          {tab==='courses' && <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-2xl font-black text-white">All Courses</h1>
                <div className="text-sm text-gray-500 mt-0.5">{courses.filter(c=>c.active).length} live · {courses.filter(c=>!c.active).length} offline</div>
              </div>
              <div className="flex gap-3">
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, city, state..." className="bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 w-52 placeholder-gray-600"/>
                <button onClick={loadCourses} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white px-3 py-2 rounded-xl hover:bg-gray-800 border border-gray-700 transition-colors"><RefreshCw className="w-4 h-4"/>Refresh</button>
              </div>
            </div>

            {loading && <div className="text-gray-600 py-20 text-center text-sm">Loading...</div>}

            <div className="space-y-2">
              {filteredCourses.map(c => (
                <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3.5 flex items-center gap-5 hover:border-gray-700 transition-colors">
                  <div className={'w-2 h-2 rounded-full shrink-0 ' + (c.active ? 'bg-emerald-500' : 'bg-gray-600')}/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-0.5">
                      <span className="font-semibold text-white truncate">{c.name}</span>
                      {c.featured && <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 shrink-0"/>}
                      {c.stripeAccountActive && <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 shrink-0">Stripe</span>}
                    </div>
                    <div className="text-xs text-gray-500">{c.city}, {c.state} · <span className="capitalize">{c.type||'public'}</span></div>
                  </div>
                  <div className="w-56 min-w-0 hidden md:block">
                    {c.operator ? <>
                      <div className="text-xs text-gray-300 truncate">{c.operator.name}</div>
                      <div className="text-xs text-gray-600 truncate">{c.operator.email}</div>
                    </> : <div className="text-xs text-gray-700">No operator</div>}
                  </div>
                  <div className="w-28 shrink-0 hidden lg:block">
                    <div className={'text-xs font-semibold mb-1 ' + (c.active ? 'text-emerald-400' : 'text-gray-600')}>{c.active ? 'Live' : 'Offline'}</div>
                    {c.operator && (
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{width: (c.operator.onboardingStep / 3 * 100) + '%'}}/>
                        </div>
                        <span className="text-xs text-gray-600">{c.operator.onboardingStep}/3</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={()=>toggleFeatured(c.id,!c.featured)} className={'w-8 h-8 flex items-center justify-center rounded-lg transition-colors ' + (c.featured ? 'text-yellow-400 bg-yellow-500/10' : 'text-gray-600 hover:text-yellow-400 hover:bg-gray-800')} title={c.featured ? 'Unfeature' : 'Feature'}><Star className="w-4 h-4"/></button>
                    <button onClick={()=>toggleCourseActive(c.id,!c.active)} className={'w-8 h-8 flex items-center justify-center rounded-lg transition-colors ' + (c.active ? 'text-emerald-400 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-600 hover:text-emerald-400 hover:bg-emerald-500/10')} title={c.active ? 'Take offline' : 'Set live'}><Power className="w-4 h-4"/></button>
                    <a href={'/courses/' + c.slug} target="_blank" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="View page"><Globe className="w-4 h-4"/></a>
                    <button onClick={()=>openDetail(c)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors" title="Details"><Eye className="w-4 h-4"/></button>
                    <button onClick={()=>deleteCourse(c.id,c.name)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>
              ))}
              {!loading && filteredCourses.length === 0 && (
                <div className="text-gray-600 text-center py-20 text-sm">No courses found</div>
              )}
            </div>
          </>}

          {/* ══ ADD COURSE ══ */}
          {tab==='create' && <>
            <div className="mb-7">
              <h1 className="text-2xl font-black text-white">Add New Course</h1>
              <div className="text-sm text-gray-500 mt-0.5">Create an operator account and course page in one step</div>
            </div>

            {createResult ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-8 max-w-xl">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-emerald-400"/>
                  </div>
                  <div>
                    <div className="font-black text-white">Course created!</div>
                    <div className="text-xs text-emerald-400">Welcome email sent to operator</div>
                  </div>
                </div>
                <div className="space-y-2 mb-6">
                  {[
                    ['Booking page', 'greenreserve.app/courses/' + createResult.slug],
                    ['Operator login', 'greenreserve.app/dashboard/login'],
                    ['Temp password', createResult.tempPassword],
                    ['Setup link', createResult.setupLink],
                  ].map(([label,val])=>(
                    <div key={label} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                      <span className="text-gray-500 text-xs w-28 shrink-0">{label}</span>
                      <span className="text-gray-200 text-xs font-mono flex-1 truncate">{val}</span>
                      <button onClick={()=>navigator.clipboard.writeText(val)} className="text-gray-600 hover:text-emerald-400 transition-colors shrink-0"><Copy className="w-3.5 h-3.5"/></button>
                    </div>
                  ))}
                </div>
                <button onClick={()=>{ setCreateResult(null); setCreateForm({ courseName:'', courseType:'public', address:'', city:'', state:'NJ', zipCode:'', phone:'', website:'', contactName:'', contactEmail:'', contactPhone:'', holes:18, par:72, description:'', hasMemberPricing:false, hasResidentPricing:false }); }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-colors">
                  Add Another Course
                </button>
              </div>
            ) : (
              <div className="max-w-2xl space-y-5">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Course Details</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1.5">Course Name *</label>
                      <input value={createForm.courseName} onChange={e=>setCreateForm(f=>({...f,courseName:e.target.value}))} className={iCls} placeholder="Pine Brook Golf Club"/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Type</label>
                      <select value={createForm.courseType} onChange={e=>setCreateForm(f=>({...f,courseType:e.target.value}))} className={iCls}>
                        {['public','semi-private','member','resident','resort','municipal'].map(t=><option key={t} value={t} className="capitalize">{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Phone</label>
                      <input value={createForm.phone} onChange={e=>setCreateForm(f=>({...f,phone:e.target.value}))} className={iCls} placeholder="(201) 555-0100"/>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1.5">Address</label>
                      <input value={createForm.address} onChange={e=>setCreateForm(f=>({...f,address:e.target.value}))} className={iCls} placeholder="123 Fairway Dr"/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">City</label>
                      <input value={createForm.city} onChange={e=>setCreateForm(f=>({...f,city:e.target.value}))} className={iCls}/>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5">State</label>
                        <input value={createForm.state} onChange={e=>setCreateForm(f=>({...f,state:e.target.value}))} className={iCls}/>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5">Zip</label>
                        <input value={createForm.zipCode} onChange={e=>setCreateForm(f=>({...f,zipCode:e.target.value}))} className={iCls}/>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Website</label>
                      <input value={createForm.website} onChange={e=>setCreateForm(f=>({...f,website:e.target.value}))} className={iCls} placeholder="https://"/>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5">Holes</label>
                        <select value={createForm.holes} onChange={e=>setCreateForm(f=>({...f,holes:Number(e.target.value)}))} className={iCls}>
                          {[9,18,27,36].map(n=><option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5">Par</label>
                        <input type="number" value={createForm.par} onChange={e=>setCreateForm(f=>({...f,par:Number(e.target.value)}))} className={iCls}/>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1.5">Description</label>
                      <textarea value={createForm.description} onChange={e=>setCreateForm(f=>({...f,description:e.target.value}))} rows={3} className={iCls + ' resize-none'}/>
                    </div>
                    <div className="col-span-2 flex gap-6">
                      {[['hasMemberPricing','Member pricing'],['hasResidentPricing','Resident pricing']].map(([k,label])=>(
                        <label key={k} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                          <input type="checkbox" checked={!!createForm[k as keyof typeof createForm]} onChange={e=>setCreateForm(f=>({...f,[k]:e.target.checked}))} className="w-4 h-4 accent-emerald-500 rounded"/>
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Operator Account</div>
                  <p className="text-xs text-gray-600">Creates their login. They will get a welcome email with temp password and setup link.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Contact Name *</label>
                      <input value={createForm.contactName} onChange={e=>setCreateForm(f=>({...f,contactName:e.target.value}))} className={iCls} placeholder="John Smith"/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Contact Email *</label>
                      <input type="email" value={createForm.contactEmail} onChange={e=>setCreateForm(f=>({...f,contactEmail:e.target.value}))} className={iCls} placeholder="gm@pinecreek.com"/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Contact Phone *</label>
                      <input type="tel" value={createForm.contactPhone} onChange={e=>setCreateForm(f=>({...f,contactPhone:e.target.value}))} className={iCls} placeholder="(201) 555-0100"/>
                      <p className="text-xs text-gray-600 mt-1">Used for SMS two-factor login codes.</p>
                    </div>
                  </div>
                </div>

                <button onClick={createCourse} disabled={creating||!createForm.courseName||!createForm.contactEmail||!createForm.contactName||!createForm.contactPhone}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black rounded-2xl text-base transition-colors">
                  {creating ? 'Creating...' : 'Create Course and Send Welcome Email'}
                </button>
              </div>
            )}
          </>}
        </div>
      </div>

      {(detail || detailLoading) && <DetailDrawer/>}
    </div>
  );
}
