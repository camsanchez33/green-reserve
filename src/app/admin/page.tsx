'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Copy,
  RefreshCw, BarChart2, Users, DollarSign, TrendingUp, AlertCircle,
  Building2, Star, Power, ArrowLeft, Eye, X, Globe, Phone, Mail,
  Ban, Plus, Calendar, Trash2,
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
  stripeAccountActive: boolean; slug: string;
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

/* ─── Helpers ─── */
const STATUS_COLORS: Record<string, string> = {
  pending:           'bg-yellow-100 text-yellow-800 border-yellow-200',
  in_review:         'bg-blue-100 text-blue-800 border-blue-200',
  details_requested: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  details_submitted: 'bg-teal-100 text-teal-800 border-teal-200',
  building:          'bg-orange-100 text-orange-800 border-orange-200',
  live:              'bg-green-100 text-green-800 border-green-200',
  rejected:          'bg-red-100 text-red-800 border-red-200',
  // legacy
  approved:          'bg-green-100 text-green-800 border-green-200',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', in_review: 'In Review',
  details_requested: 'Setup Sheet Sent', details_submitted: 'Setup Sheet In',
  building: 'Building', live: 'Live', rejected: 'Rejected', approved: 'Approved',
};
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');

function Stat({ label, value, sub, icon, color='text-gray-900' }: { label:string; value:string|number; sub?:string; icon:React.ReactNode; color?:string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        <span className="text-gray-300">{icon}</span>
      </div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      {sub&&<div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ─── Mini bar chart ─── */
function TinyBars({ data }: { data: {date:string;platform:number}[] }) {
  if(!data.length) return null;
  const max = Math.max(...data.map(d=>d.platform), 0.01);
  return (
    <div className="flex items-end gap-px h-10">
      {data.map(d=>(
        <div key={d.date} className="flex-1 bg-green-500 rounded-sm opacity-80 hover:opacity-100 transition-opacity" style={{height:`${Math.max(2,(d.platform/max)*100)}%`}} title={`${d.date}: ${fmtMoney(d.platform)}`}/>
      ))}
    </div>
  );
}

/* ─── Main ─── */
export default function AdminPage() {
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<'overview'|'inquiries'|'courses'|'create'>('overview');
  const [createForm, setCreateForm] = useState({ courseName:'', courseType:'public', address:'', city:'', state:'NJ', zipCode:'', phone:'', website:'', contactName:'', contactEmail:'', holes:18, par:72, description:'', hasMemberPricing:false, hasResidentPricing:false });
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
  const [drawerTab, setDrawerTab] = useState<'overview'|'contact'|'teesheet'>('overview');
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
        if (action === 'add_note') {
          setInquiries(prev => prev.map(inq => inq.id === id ? { ...inq, adminNotes: d.adminNotes as string } : inq));
          setNoteTexts(p => ({ ...p, [id]: '' }));
        } else {
          loadInquiries();
        }
      } else {
        alert(`Failed (${r.status}): ${(d.error as string) || text.slice(0, 200)}`);
      }
    } catch (e) {
      alert(`Error: ${e}`);
    }
    setProcessing(null);
  }

  async function deleteInquiry(id: string, name: string) {
    if (!confirm(`Permanently delete inquiry for "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/inquiries?id=${id}`, { method: 'DELETE', headers: H() });
    setInquiries(prev => prev.filter(i => i.id !== id));
  }

  async function deleteCourse(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}" and ALL its data (tee times, bookings, schedules)? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/courses?id=${id}`, { method: 'DELETE', headers: H() });
    if (r.ok) {
      setCourses(prev => prev.filter(c => c.id !== id));
      setDetail(null);
    } else {
      const d = await r.json();
      alert(`Delete failed: ${d.error}`);
    }
  }

  async function openDetail(course: Course) {
    setDetailLoading(true); setDetail(null);
    const r = await fetch(`/api/admin/course-detail?courseId=${course.id}`,{headers:H()});
    if(r.ok) setDetail(await r.json());
    setDetailLoading(false);
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

  const filteredCourses = courses.filter(c=>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.city.toLowerCase().includes(search.toLowerCase()) || c.state.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Login screen ── */
  if(!authed) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl">
        <div className="text-center mb-6">
          <div className="text-3xl font-black text-[#1b4332] mb-1">GreenReserve</div>
          <div className="text-sm text-gray-400 font-medium">Admin Dashboard</div>
        </div>
        <input type="password" placeholder="Admin key" value={key} onChange={e=>setKey(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-3 focus:ring-2 focus:ring-green-500 outline-none"/>
        <button onClick={login} className="w-full bg-[#1b4332] text-white py-3 rounded-xl font-bold hover:bg-[#2d6a4f]">Enter</button>
      </div>
    </div>
  );

  /* ── Course Detail Drawer ── */
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

  const DetailDrawer = () => {
    if(!detail && !detailLoading) return null;
    const c = detail?.course;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
        <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl flex flex-col">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <button onClick={()=>setDetail(null)} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5"/></button>
                <span className="font-bold text-gray-900">{c?.name||'Loading...'}</span>
                {c&&<span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>{c.active?'Live':'Offline'}</span>}
              </div>
              <div className="flex gap-2">
                {c&&<>
                  <button onClick={()=>toggleFeatured(c.id,!c.featured)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${c.featured?'bg-yellow-50 text-yellow-700 border-yellow-300':'bg-white text-gray-500 border-gray-200 hover:border-yellow-300'}`}><Star className="w-3 h-3"/>{c.featured?'Featured':'Feature'}</button>
                  <button onClick={()=>toggleCourseActive(c.id,!c.active)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1 ${c.active?'bg-green-50 text-green-700 border-green-200':'bg-red-50 text-red-700 border-red-200'}`}><Power className="w-3 h-3"/>{c.active?'Set Offline':'Set Live'}</button>
                  <button onClick={()=>deleteCourse(c.id,c.name)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 text-red-600 bg-white hover:bg-red-50 flex items-center gap-1"><Trash2 className="w-3 h-3"/>Delete</button>
                </>}
              </div>
            </div>
            {/* Tabs */}
            <div className="flex gap-1">
              {(['overview','contact','teesheet'] as const).map(t=>(
                <button key={t} onClick={()=>{ setDrawerTab(t); if(t==='teesheet'&&c) loadTeeSheet(c.id,tsDate); }} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${drawerTab===t?'bg-[#1b4332] text-white':'text-gray-500 hover:text-gray-800'}`}>
                  {t==='teesheet'?'Tee Sheet':t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {detailLoading&&<div className="p-12 text-center text-gray-400">Loading...</div>}

          {detail&&<div className="p-6 flex-1 overflow-y-auto">

            {/* ── Overview Tab ── */}
            {drawerTab==='overview'&&<div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                {[
                  {label:'Gross (30d)',value:fmtMoney(detail.revenue30d.gross)},
                  {label:'GR Fees (30d)',value:fmtMoney(detail.revenue30d.platform),color:'text-green-700'},
                  {label:'Total Bookings',value:detail.totalBookings},
                ].map(({label,value,color})=>(
                  <div key={label} className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className="text-xs text-gray-400 font-medium mb-1">{label}</div>
                    <div className={`font-black text-lg ${color||'text-gray-900'}`}>{value}</div>
                  </div>
                ))}
              </div>

              {detail.staff.length>0&&<div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Staff ({detail.staff.length})</div>
                <div className="space-y-2">
                  {detail.staff.map(s=>(
                    <div key={s.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                      <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs">{s.name[0]}</div>
                      <div className="flex-1 text-sm"><span className="font-medium">{s.name}</span><span className="text-gray-400 text-xs"> · {s.email} · {s.role}</span></div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-400'}`}>{s.active?'Active':'Off'}</span>
                    </div>
                  ))}
                </div>
              </div>}

              {detail.recentBookings.length>0&&<div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recent Bookings (30d)</div>
                <div className="space-y-2">
                  {detail.recentBookings.map(b=>(
                    <div key={b.id} className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm text-gray-900">{b.golferName}</div>
                        <div className="text-xs text-gray-400">{b.teeTime.date} {b.teeTime.time} · {b.players} player{b.players!==1?'s':''}</div>
                        <div className="text-xs text-gray-400">{b.golferEmail}</div>
                      </div>
                      <div className="text-sm font-bold text-gray-900">{fmtMoney(b.totalAmount/100)}</div>
                    </div>
                  ))}
                </div>
              </div>}
            </div>}

            {/* ── Contact Tab ── */}
            {drawerTab==='contact'&&<div className="space-y-4">
              {c?.operator&&<>
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                  <div className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-3">Operator / Owner</div>
                  <div className="text-lg font-black text-gray-900 mb-0.5">{String(c.operator.name)}</div>
                  <div className="space-y-3 mt-3">
                    <a href={`mailto:${String(c.operator.email)}`} className="flex items-center gap-3 text-sm text-gray-700 hover:text-blue-600">
                      <Mail className="w-4 h-4 text-gray-400"/>{String(c.operator.email)}
                    </a>
                    {String((c.operator as Record<string,unknown>).phone||'')&&(
                      <a href={`tel:${String((c.operator as Record<string,unknown>).phone)}`} className="flex items-center gap-3 text-sm text-gray-700 hover:text-blue-600">
                        <Phone className="w-4 h-4 text-gray-400"/>{String((c.operator as Record<string,unknown>).phone)}
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4 flex-wrap">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.operator.emailVerified?'bg-green-100 text-green-700':'bg-red-100 text-red-600'}`}>{c.operator.emailVerified?'✓ Email verified':'✗ Not verified'}</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">Onboarding step {String(c.operator.onboardingStep)}/3</span>
                    {c.stripeAccountActive&&<span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">Stripe connected ✓</span>}
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Course Info</div>
                  <div className="space-y-2 text-sm">
                    {[
                      ['Address', String((c as Record<string,unknown>).address||'—')],
                      ['Phone', String((c as Record<string,unknown>).phone||'—')],
                      ['Website', String((c as Record<string,unknown>).website||'—')],
                      ['Type', String((c as Record<string,unknown>).type||'—')],
                    ].map(([label, val])=>(
                      <div key={label} className="flex gap-2">
                        <span className="text-gray-400 w-20 shrink-0">{label}</span>
                        <span className="text-gray-800 font-medium">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>}

              {detail.staff.length>0&&<div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Staff Contacts</div>
                <div className="space-y-3">
                  {detail.staff.map(s=>(
                    <div key={s.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs shrink-0">{s.name[0]}</div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-gray-900">{s.name} <span className="text-xs text-gray-400 font-normal">· {s.role}</span></div>
                        <a href={`mailto:${s.email}`} className="text-xs text-blue-600 hover:underline">{s.email}</a>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-400'}`}>{s.active?'Active':'Off'}</span>
                    </div>
                  ))}
                </div>
              </div>}
            </div>}

            {/* ── Tee Sheet Tab ── */}
            {drawerTab==='teesheet'&&<div>
              {/* Date picker */}
              <div className="flex items-center gap-3 mb-5">
                <Calendar className="w-4 h-4 text-gray-400"/>
                <input type="date" value={tsDate} onChange={e=>{ setTsDate(e.target.value); if(c) loadTeeSheet(c.id,e.target.value); }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-green-500"/>
                <span className="text-sm text-gray-400">{tsSlots.length} slots</span>
              </div>

              {tsLoading&&<div className="text-center text-gray-400 py-12">Loading tee sheet...</div>}

              {!tsLoading&&tsSlots.length===0&&<div className="text-center text-gray-400 py-12">No tee times for this date</div>}

              <div className="space-y-3">
                {tsSlots.map(slot=>(
                  <div key={slot.id} className={`rounded-xl border ${slot.status==='blocked'?'border-red-200 bg-red-50':slot.bookings.length>0?'border-green-200 bg-green-50':'border-gray-200 bg-white'}`}>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-gray-900 text-sm w-16">{slot.time}</span>
                        <span className="text-xs text-gray-500">{slot.holes}h · ${slot.greenFee}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${slot.status==='blocked'?'bg-red-100 text-red-700':slot.playersAvailable===0?'bg-gray-100 text-gray-500':'bg-green-100 text-green-700'}`}>
                          {slot.status==='blocked'?'Blocked':`${slot.playersAvailable} open`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={()=>setManualSlot(slot.id)} className="text-xs px-2 py-1 bg-[#1b4332] text-white rounded-lg flex items-center gap-1 hover:bg-[#2d6a4f]"><Plus className="w-3 h-3"/>Add</button>
                        <button onClick={()=>blockSlot(slot.id, slot.status!=='blocked')} className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 border transition-colors ${slot.status==='blocked'?'border-green-300 text-green-700 bg-green-50 hover:bg-green-100':'border-red-200 text-red-600 bg-white hover:bg-red-50'}`}>
                          <Ban className="w-3 h-3"/>{slot.status==='blocked'?'Unblock':'Block'}
                        </button>
                      </div>
                    </div>
                    {slot.bookings.length>0&&<div className="border-t border-gray-100 px-4 py-2 space-y-2">
                      {slot.bookings.map(b=>(
                        <div key={b.id} className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-medium text-gray-900">{b.golferName}</span>
                            <span className="text-gray-400 text-xs"> · {b.players} player{b.players!==1?'s':''} · </span>
                            <a href={`mailto:${b.golferEmail}`} className="text-xs text-blue-600 hover:underline">{b.golferEmail}</a>
                            {b.golferPhone&&<span className="text-xs text-gray-400"> · {b.golferPhone}</span>}
                            {b.paymentStatus==='manual'&&<span className="ml-2 text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">Manual</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-700">{fmtMoney(b.totalAmount/100)}</span>
                            <button onClick={()=>cancelBooking(b.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 border border-red-200 rounded-lg">Cancel</button>
                          </div>
                        </div>
                      ))}
                    </div>}
                  </div>
                ))}
              </div>

              {/* Manual booking modal */}
              {manualSlot&&<div className="fixed inset-0 bg-black/40 z-60 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900">Add Manual Booking</h3>
                    <button onClick={()=>setManualSlot(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="space-y-3">
                    {[['Golfer Name*','name','text'],['Email*','email','email'],['Phone','phone','tel']].map(([label,field,type])=>(
                      <div key={field}>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">{label}</label>
                        <input type={type} value={(manualForm as Record<string,unknown>)[field] as string} onChange={e=>setManualForm(f=>({...f,[field]:e.target.value}))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"/>
                      </div>
                    ))}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Players*</label>
                      <select value={manualForm.players} onChange={e=>setManualForm(f=>({...f,players:Number(e.target.value)}))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500">
                        {[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={()=>setManualSlot(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600">Cancel</button>
                    <button onClick={addManualBooking} className="flex-1 px-4 py-2 bg-[#1b4332] text-white rounded-xl text-sm font-semibold hover:bg-[#2d6a4f]">Add Booking</button>
                  </div>
                </div>
              </div>}
            </div>}

          </div>}
        </div>
      </div>
    );
  };

  /* ── Main layout ── */
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-56 bg-gray-900 border-r border-gray-800 flex flex-col z-10">
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="font-black text-lg text-white">GreenReserve</div>
          <div className="text-xs text-gray-500 font-medium">Admin Console</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {([['overview','Overview',<BarChart2 key="b" className="w-4 h-4"/>],['inquiries','Inquiries',<AlertCircle key="a" className="w-4 h-4"/>],['courses','Courses',<Building2 key="c" className="w-4 h-4"/>],['create','Add Course',<Plus key="p" className="w-4 h-4"/>]] as const).map(([id,label,icon])=>(
            <button key={id} onClick={()=>setTab(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab===id?'bg-[#1b4332] text-white':'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              {icon}{label}
              {id==='inquiries'&&stats?.pendingInquiries>0&&<span className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">{stats.pendingInquiries}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800">
          <button onClick={()=>setAuthed(false)} className="w-full text-left text-xs text-gray-500 hover:text-gray-300 px-3 py-2">Sign out</button>
        </div>
      </div>

      {/* Content */}
      <div className="ml-56 min-h-screen">
        <div className="px-8 py-6">

          {/* ── Overview ── */}
          {tab==='overview'&&<>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-black text-white">Platform Overview</h1>
              <button onClick={loadStats} className="text-gray-400 hover:text-white flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4"/>Refresh</button>
            </div>
            {stats&&<>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2"><Building2 className="w-3.5 h-3.5"/>Courses</div>
                  <div className="text-3xl font-black text-white">{stats.activeCourses}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{stats.totalCourses} total · {stats.activeCourses} live</div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2"><Users className="w-3.5 h-3.5"/>Golfers</div>
                  <div className="text-3xl font-black text-white">{stats.totalGolfers}</div>
                  <div className="text-xs text-gray-500 mt-0.5">registered accounts</div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5"/>Bookings (30d)</div>
                  <div className="text-3xl font-black text-white">{stats.recentBookings}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{stats.totalBookings} all time</div>
                </div>
                <div className="bg-gray-900 border border-green-900 rounded-2xl p-5">
                  <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-2"><DollarSign className="w-3.5 h-3.5"/>GR Revenue (30d)</div>
                  <div className="text-3xl font-black text-green-400">{fmtMoney(stats.platformRevenue30d)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">$1.50/player service fee</div>
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Platform Revenue — Last 30 Days</div>
                {stats.revenueByDay.length>0
                  ? <div className="flex items-end gap-px h-16">{(() => { const max=Math.max(...stats.revenueByDay.map(d=>d.platform),0.01); return stats.revenueByDay.map(d=><div key={d.date} className="flex-1 bg-green-500 rounded-sm opacity-70 hover:opacity-100" style={{height:`${Math.max(2,(d.platform/max)*100)}%`}} title={`${d.date}: ${fmtMoney(d.platform)}`}/>); })()}</div>
                  : <div className="text-sm text-gray-600 py-4 text-center">No bookings yet</div>
                }
              </div>
              {stats.pendingInquiries>0&&(
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3"><AlertCircle className="w-5 h-5 text-yellow-500"/><span className="text-yellow-200 font-semibold">{stats.pendingInquiries} pending course inquir{stats.pendingInquiries===1?'y':'ies'} need review</span></div>
                  <button onClick={()=>setTab('inquiries')} className="text-xs font-bold text-yellow-400 hover:text-yellow-200 underline">Review →</button>
                </div>
              )}
            </>}
            {!stats&&<div className="text-gray-500 text-center py-20">Loading stats...</div>}
          </>}

          {/* ── Inquiries ── */}
          {tab==='inquiries'&&<>
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-black text-white">Course Inquiries</h1>
              <button onClick={loadInquiries} className="text-gray-400 hover:text-white flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4"/>Refresh</button>
            </div>
            {/* Active / Past toggle */}
            <div className="flex gap-1 mb-5 bg-gray-800 rounded-xl p-1 w-fit">
              {(['active','past'] as const).map(v=>(
                <button key={v} onClick={()=>setInquiryView(v)} className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${inquiryView===v?'bg-white text-gray-900':'text-gray-400 hover:text-white'}`}>
                  {v==='active'?`Active (${inquiries.filter(i=>['pending','in_review','details_requested','details_submitted'].includes(i.status)).length})`:`Past (${inquiries.filter(i=>['building','live','rejected'].includes(i.status)).length})`}
                </button>
              ))}
            </div>
            {loading&&<div className="text-gray-500 py-20 text-center">Loading...</div>}
            <div className="space-y-3">
              {inquiries.filter(inq=>inquiryView==='active'?['pending','in_review','details_requested','details_submitted'].includes(inq.status):['building','live','rejected'].includes(inq.status)).map(inq=>(
                <div key={inq.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-white">{inq.courseName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[inq.status]||'bg-gray-700 text-gray-300 border-gray-600'}`}>{STATUS_LABEL[inq.status]||inq.status}</span>
                        {inq.hasMemberPricing&&<span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-300 border border-blue-800">Members</span>}
                        {inq.hasResidentPricing&&<span className="text-xs px-2 py-0.5 rounded-full bg-purple-900 text-purple-300 border border-purple-800">Residents</span>}
                        {inq.hasCaddies&&<span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300 border border-green-800">Caddies</span>}
                      </div>
                      <div className="text-sm text-gray-400">{inq.contactName} · {inq.contactTitle} · {inq.email}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{inq.city}, {inq.state} · {inq.courseType} · {fmtDate(inq.createdAt)}</div>
                      {inq.greenFeeRange&&<div className="text-xs text-gray-500">Fees: {inq.greenFeeRange}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {inq.status==='pending'&&<>
                        <button onClick={()=>inquiryAction(inq.id,'mark_in_review')} disabled={processing===inq.id} className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Clock className="w-3.5 h-3.5"/>In Review</button>
                        <button onClick={()=>{ if(confirm('Reject this inquiry?')) inquiryAction(inq.id,'reject'); }} disabled={processing===inq.id} className="bg-red-900 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                      </>}
                      {inq.status==='in_review'&&<>
                        <button onClick={()=>{ if(confirm(`Send ${inq.contactName} the setup sheet? They'll fill in pricing, policies, and facilities before we build their page.`)) inquiryAction(inq.id,'request_details'); }} disabled={processing===inq.id} className="bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Mail className="w-3.5 h-3.5"/>Request Setup Sheet</button>
                        <button onClick={()=>{ if(confirm('Reject this inquiry?')) inquiryAction(inq.id,'reject'); }} disabled={processing===inq.id} className="bg-red-900 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                      </>}
                      {inq.status==='details_requested'&&<>
                        <button onClick={()=>{ if(confirm(`Resend the setup-sheet link to ${inq.contactName}?`)) inquiryAction(inq.id,'resend_details'); }} disabled={processing===inq.id} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Mail className="w-3.5 h-3.5"/>Resend Setup Sheet</button>
                        <button onClick={()=>{ if(confirm('Reject this inquiry?')) inquiryAction(inq.id,'reject'); }} disabled={processing===inq.id} className="bg-red-900 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                      </>}
                      {inq.status==='details_submitted'&&<>
                        <button onClick={()=>{ if(confirm(`Build course draft for ${inq.courseName}? This creates their operator account, pre-fills their settings from the setup sheet, and sends the welcome email.`)) inquiryAction(inq.id,'build_course'); }} disabled={processing===inq.id} className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5"/>Build Course</button>
                        <button onClick={()=>{ if(confirm('Reject this inquiry?')) inquiryAction(inq.id,'reject'); }} disabled={processing===inq.id} className="bg-red-900 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                      </>}
                      {inq.status==='building'&&<>
                        <button onClick={()=>{ if(confirm(`Resend welcome email to ${inq.contactName}? This generates a fresh temp password — the old one will stop working.`)) inquiryAction(inq.id,'resend_welcome'); }} disabled={processing===inq.id} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Mail className="w-3.5 h-3.5"/>Resend Email</button>
                        <button onClick={()=>{ if(confirm(`Set ${inq.courseName} LIVE? This makes it publicly bookable.`)) inquiryAction(inq.id,'mark_live'); }} disabled={processing===inq.id} className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Power className="w-3.5 h-3.5"/>Go Live</button>
                      </>}
                      {['building','live','rejected'].includes(inq.status)&&(
                        <button onClick={()=>deleteInquiry(inq.id, inq.courseName)} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors" title="Delete inquiry"><Trash2 className="w-3.5 h-3.5"/></button>
                      )}
                      <button onClick={()=>setExpanded(expanded===inq.id?null:inq.id)} className="text-gray-500 hover:text-gray-300 p-1">
                        {expanded===inq.id?<ChevronUp className="w-4 h-4"/>:<ChevronDown className="w-4 h-4"/>}
                      </button>
                    </div>
                  </div>

                  {approveResults[inq.id]&&(()=>{
                    const res = approveResults[inq.id];
                    const isDetailsAction = !!res.detailsLink;
                    const rows: [string,string][] = isDetailsAction
                      ? [['Setup Sheet Link', res.detailsLink as string]]
                      : [['Temp Password', res.tempPassword||''],['Setup Link', res.setupLink||'']];
                    return (
                      <div className={`px-5 pb-4 border-t ${res.emailSent===false?'bg-red-950 border-red-900':'bg-green-950 border-green-900'}`}>
                        {res.emailSent===false ? (
                          <div className="text-xs font-semibold text-red-400 mb-2 mt-3">
                            ⚠️ {isDetailsAction?'Saved, but the setup-sheet email failed to send':'Course built, but the welcome email failed to send'} ({res.emailError || 'unknown error'}). Share this link manually, or fix email and hit Resend:
                          </div>
                        ) : (
                          <div className="text-xs font-semibold text-green-400 mb-2 mt-3">✅ {isDetailsAction?'Setup-sheet email sent.':'Course built — welcome email sent.'} Share manually if needed:</div>
                        )}
                        <div className="space-y-2">
                          {rows.map(([label,val])=>(
                            <div key={label} className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
                              <span className="text-xs text-gray-400 w-28 shrink-0">{label}</span>
                              <span className="text-xs text-gray-100 font-mono flex-1 truncate">{val}</span>
                              <button onClick={()=>navigator.clipboard.writeText(val)} className="text-gray-500 hover:text-green-400"><Copy className="w-3.5 h-3.5"/></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {expanded===inq.id&&(
                    <div className="px-5 pb-5 border-t border-gray-800 pt-4 space-y-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-gray-500">Phone: </span><span className="text-gray-300">{inq.phone}</span></div>
                        <div><span className="text-gray-500">Website: </span><span className="text-gray-300">{inq.website||'—'}</span></div>
                        {inq.currentBookingMethod&&<div><span className="text-gray-500">Current booking: </span><span className="text-gray-300">{inq.currentBookingMethod}</span></div>}
                        <div><span className="text-gray-500">Tee times/day: </span><span className="text-gray-300">{inq.teeTimesPerDay||'—'}</span></div>
                        {inq.greenFeeRange&&<div><span className="text-gray-500">Fees: </span><span className="text-gray-300">{inq.greenFeeRange}</span></div>}
                        {inq.lookingFor?.length>0&&<div className="col-span-2"><span className="text-gray-500">Looking for: </span><span className="text-gray-300">{inq.lookingFor.join(', ')}</span></div>}
                        {inq.additionalNotes&&<div className="col-span-2"><span className="text-gray-500">Notes: </span><span className="text-gray-300">{inq.additionalNotes}</span></div>}
                        {inq.pricingNotes&&<div className="col-span-2"><span className="text-gray-500">Pricing notes: </span><span className="text-gray-300">{inq.pricingNotes}</span></div>}
                      </div>

                      {/* What they need (from the interest form's type-specific questions) */}
                      {inq.needsJson&&(()=>{ let n:Record<string,unknown>={}; try{n=JSON.parse(inq.needsJson||'');}catch{ /* ignore */ } return Object.keys(n).length>0 ? (
                        <div className="border-t border-gray-800 pt-4">
                          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">What They Need</div>
                          <div className="grid grid-cols-2 gap-2 text-sm bg-gray-800 rounded-lg p-3">
                            {Object.entries(n).map(([k,v])=>(
                              <div key={k}><span className="text-gray-500">{k}: </span><span className="text-gray-300">{String(v)}</span></div>
                            ))}
                          </div>
                        </div>
                      ) : null; })()}

                      {/* Submitted setup sheet (once they've sent it back) */}
                      {inq.detailsJson&&(()=>{ let d:Record<string,unknown>={}; try{d=JSON.parse(inq.detailsJson||'');}catch{ /* ignore */ } return Object.keys(d).length>0 ? (
                        <div className="border-t border-gray-800 pt-4">
                          <div className="text-xs font-semibold text-teal-400 uppercase tracking-wide mb-2">Submitted Setup Sheet</div>
                          <div className="grid grid-cols-2 gap-2 text-sm bg-gray-800 rounded-lg p-3">
                            {Object.entries(d).filter(([,v])=>v!==''&&v!==null&&!(Array.isArray(v)&&v.length===0)).map(([k,v])=>(
                              <div key={k}><span className="text-gray-500">{k}: </span><span className="text-gray-300">{Array.isArray(v)?v.join(', '):String(v)}</span></div>
                            ))}
                          </div>
                        </div>
                      ) : null; })()}

                      {/* Admin notes */}
                      <div className="border-t border-gray-800 pt-4">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Internal Notes</div>
                        {inq.adminNotes&&(
                          <pre className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2 mb-3 whitespace-pre-wrap font-sans">{inq.adminNotes}</pre>
                        )}
                        <div className="flex gap-2">
                          <textarea
                            value={noteTexts[inq.id]||''}
                            onChange={e=>setNoteTexts(p=>({...p,[inq.id]:e.target.value}))}
                            placeholder="Add a note..."
                            rows={2}
                            className="flex-1 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-green-500 resize-none"
                          />
                          <button
                            onClick={()=>inquiryAction(inq.id,'add_note',{note:noteTexts[inq.id]||''})}
                            disabled={!noteTexts[inq.id]?.trim()||processing===inq.id}
                            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors self-start"
                          >Save</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!loading&&inquiries.filter(inq=>inquiryView==='active'?['pending','in_review','details_requested','details_submitted'].includes(inq.status):['building','live','rejected'].includes(inq.status)).length===0&&(
                <div className="text-gray-500 text-center py-20">
                  {inquiryView==='active'?'No active inquiries — all caught up ✓':'No past inquiries yet'}
                </div>
              )}
            </div>
          </>}

          {/* ── Courses ── */}
          {tab==='courses'&&<>
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-black text-white">All Courses</h1>
              <div className="flex gap-3">
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search courses..." className="bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-green-500 w-48"/>
                <button onClick={loadCourses} className="text-gray-400 hover:text-white flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4"/>Refresh</button>
              </div>
            </div>
            <div className="text-xs text-gray-500 mb-4">{filteredCourses.length} of {courses.length} courses</div>
            {loading&&<div className="text-gray-500 py-20 text-center">Loading...</div>}
            <div className="space-y-2">
              {filteredCourses.map(c=>(
                <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-white">{c.name}</span>
                      {c.featured&&<Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400"/>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active?'bg-green-900 text-green-400':'bg-gray-800 text-gray-500'}`}>{c.active?'Live':'Offline'}</span>
                      {c.stripeAccountActive&&<span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-900 text-purple-400">Stripe ✓</span>}
                    </div>
                    <div className="text-xs text-gray-500">{c.city}, {c.state}</div>
                    {c.operator&&<div className="text-xs text-gray-600 mt-0.5">{c.operator.email} · Step {c.operator.onboardingStep}/3</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={()=>toggleFeatured(c.id,!c.featured)} className={`p-1.5 rounded-lg transition-colors ${c.featured?'text-yellow-400':'text-gray-600 hover:text-yellow-400'}`}><Star className="w-4 h-4"/></button>
                    <button onClick={()=>toggleCourseActive(c.id,!c.active)} className={`p-1.5 rounded-lg transition-colors ${c.active?'text-green-400':'text-gray-600 hover:text-green-400'}`}><Power className="w-4 h-4"/></button>
                    <a href={`/courses/${c.slug}`} target="_blank" className="p-1.5 rounded-lg text-gray-600 hover:text-blue-400 transition-colors"><Globe className="w-4 h-4"/></a>
                    <button onClick={()=>openDetail(c)} className="p-1.5 rounded-lg text-gray-600 hover:text-white transition-colors"><Eye className="w-4 h-4"/></button>
                    <button onClick={()=>deleteCourse(c.id,c.name)} className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 transition-colors" title="Delete course"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>
              ))}
              {!loading&&filteredCourses.length===0&&<div className="text-gray-500 text-center py-20">No courses found</div>}
            </div>
          </>}

          {/* ── Add Course ── */}
          {tab==='create'&&<>
            <h1 className="text-2xl font-black text-white mb-6">Add New Course</h1>

            {createResult ? (
              <div className="bg-green-950 border border-green-800 rounded-2xl p-8 max-w-xl">
                <div className="text-green-400 font-black text-lg mb-4">✓ Course created!</div>
                <div className="space-y-3 mb-6">
                  {[
                    ['Booking page', `greenreserve.app/courses/${createResult.slug}`],
                    ['Operator login', 'greenreserve.app/dashboard/login'],
                    ['Temp password', createResult.tempPassword],
                    ['Setup link', createResult.setupLink],
                  ].map(([label, val]) => (
                    <div key={label} className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-3">
                      <span className="text-gray-400 text-xs w-32 shrink-0">{label}</span>
                      <span className="text-gray-100 text-xs font-mono flex-1 truncate">{val}</span>
                      <button onClick={()=>navigator.clipboard.writeText(val)} className="text-gray-500 hover:text-green-400 shrink-0"><Copy className="w-3.5 h-3.5"/></button>
                    </div>
                  ))}
                </div>
                <button onClick={()=>{ setCreateResult(null); setCreateForm({ courseName:'', courseType:'public', address:'', city:'', state:'NJ', zipCode:'', phone:'', website:'', contactName:'', contactEmail:'', holes:18, par:72, description:'', hasMemberPricing:false, hasResidentPricing:false }); }} className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-xl text-sm font-bold">
                  Add Another Course
                </button>
              </div>
            ) : (
              <div className="max-w-2xl space-y-6">
                {/* Course details */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Course Details</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-400 block mb-1">Course Name *</label>
                      <input value={createForm.courseName} onChange={e=>setCreateForm(f=>({...f,courseName:e.target.value}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="Pine Brook Golf Club"/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Type</label>
                      <select value={createForm.courseType} onChange={e=>setCreateForm(f=>({...f,courseType:e.target.value}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500">
                        {['public','semi-private','member','resident','resort','municipal'].map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Phone</label>
                      <input value={createForm.phone} onChange={e=>setCreateForm(f=>({...f,phone:e.target.value}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="(201) 555-0100"/>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-400 block mb-1">Address</label>
                      <input value={createForm.address} onChange={e=>setCreateForm(f=>({...f,address:e.target.value}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="123 Fairway Dr"/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">City</label>
                      <input value={createForm.city} onChange={e=>setCreateForm(f=>({...f,city:e.target.value}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"/>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">State</label>
                        <input value={createForm.state} onChange={e=>setCreateForm(f=>({...f,state:e.target.value}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"/>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Zip</label>
                        <input value={createForm.zipCode} onChange={e=>setCreateForm(f=>({...f,zipCode:e.target.value}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"/>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Website</label>
                      <input value={createForm.website} onChange={e=>setCreateForm(f=>({...f,website:e.target.value}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="https://"/>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Holes</label>
                        <select value={createForm.holes} onChange={e=>setCreateForm(f=>({...f,holes:Number(e.target.value)}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500">
                          <option value={9}>9</option><option value={18}>18</option><option value={27}>27</option><option value={36}>36</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Par</label>
                        <input type="number" value={createForm.par} onChange={e=>setCreateForm(f=>({...f,par:Number(e.target.value)}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"/>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-400 block mb-1">Description</label>
                      <textarea value={createForm.description} onChange={e=>setCreateForm(f=>({...f,description:e.target.value}))} rows={3} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500 resize-none"/>
                    </div>
                    <div className="col-span-2 flex gap-6">
                      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input type="checkbox" checked={createForm.hasMemberPricing} onChange={e=>setCreateForm(f=>({...f,hasMemberPricing:e.target.checked}))} className="accent-green-500"/>
                        Member pricing
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input type="checkbox" checked={createForm.hasResidentPricing} onChange={e=>setCreateForm(f=>({...f,hasResidentPricing:e.target.checked}))} className="accent-green-500"/>
                        Resident pricing
                      </label>
                    </div>
                  </div>
                </div>

                {/* Operator/contact */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Operator Account</div>
                  <p className="text-xs text-gray-500">This creates their login. They&apos;ll get a welcome email with their temp password and setup link.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Contact Name *</label>
                      <input value={createForm.contactName} onChange={e=>setCreateForm(f=>({...f,contactName:e.target.value}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="John Smith"/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Contact Email *</label>
                      <input type="email" value={createForm.contactEmail} onChange={e=>setCreateForm(f=>({...f,contactEmail:e.target.value}))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="gm@pinecreek.com"/>
                    </div>
                  </div>
                </div>

                <button onClick={createCourse} disabled={creating||!createForm.courseName||!createForm.contactEmail||!createForm.contactName} className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-black rounded-2xl text-base transition-colors">
                  {creating ? 'Creating...' : 'Create Course & Send Welcome Email →'}
                </button>
              </div>
            )}
          </>}
        </div>
      </div>

      {(detail||detailLoading)&&<DetailDrawer/>}
    </div>
  );
}
