'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, XCircle, Users, DollarSign, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface ActivityItem {
  type: 'booking' | 'cancellation' | 'membership' | 'membership_payment';
  id: string;
  timestamp: string;
  courseName: string;
  golferName?: string;
  golferEmail?: string;
  players?: number;
  totalAmount?: number;
  cancellationFeeTotal?: number;
  teeDate?: string;
  teeTime?: string;
  memberName?: string;
  memberEmail?: string;
  tierName?: string | null;
  amount?: number;
}

const todayStr = () => new Date().toISOString().split('T')[0];
const thirtyAgoStr = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

function fmtMoney(n: number) { return '$' + n.toFixed(2); }

function fmtTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtTeeSlot(date: string, time: string) {
  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const [h, m] = time.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${label} ${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ap}`;
}

const TYPE_META = {
  booking:            { label: 'Booking', icon: Calendar,   chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  cancellation:       { label: 'Cancel',  icon: XCircle,    chip: 'bg-red-500/15 text-red-400 border-red-500/30' },
  membership:         { label: 'Member',  icon: Users,      chip: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  membership_payment: { label: 'Dues',    icon: DollarSign, chip: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
};

function EventRow({ item }: { item: ActivityItem }) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;

  const isBookingLike = item.type === 'booking' || item.type === 'cancellation';
  const who = isBookingLike ? (item.golferName || '—') : (item.memberName || '—');
  const email = isBookingLike ? item.golferEmail : item.memberEmail;

  const detailParts: string[] = [];
  if (isBookingLike) {
    if (item.players) detailParts.push(`${item.players}p`);
    if (item.teeDate && item.teeTime) detailParts.push(fmtTeeSlot(item.teeDate, item.teeTime));
  }
  if (!isBookingLike && item.tierName) detailParts.push(item.tierName);

  const amountNode = (() => {
    if (item.type === 'booking' && item.totalAmount != null && item.totalAmount > 0) {
      return <span className="text-sm font-bold text-emerald-400 whitespace-nowrap">{fmtMoney(item.totalAmount)}</span>;
    }
    if (item.type === 'cancellation' && item.cancellationFeeTotal != null && item.cancellationFeeTotal > 0) {
      return <span className="text-sm font-bold text-red-400 whitespace-nowrap">{fmtMoney(item.cancellationFeeTotal)} fee</span>;
    }
    if (item.type === 'membership_payment' && item.amount != null && item.amount > 0) {
      return <span className="text-sm font-bold text-violet-400 whitespace-nowrap">{fmtMoney(item.amount)}/yr</span>;
    }
    return null;
  })();

  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/30 transition-colors min-w-0">
      <span className={'flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ' + meta.chip}>
        <Icon className="w-3 h-3"/>{meta.label}
      </span>
      <div className="text-xs text-gray-500 w-36 shrink-0 truncate hidden lg:block">{item.courseName}</div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <span className="text-sm text-white font-medium">{who}</span>
        {email && <span className="text-xs text-gray-600 ml-2 hidden sm:inline truncate">{email}</span>}
        {detailParts.length > 0 && (
          <span className="text-xs text-gray-500 ml-2 hidden md:inline">{detailParts.join(' · ')}</span>
        )}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {amountNode}
        <span className="text-xs text-gray-600 whitespace-nowrap hidden sm:block w-28 text-right">{fmtTs(item.timestamp)}</span>
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [courseId, setCourseId] = useState('');
  const [from, setFrom] = useState(thirtyAgoStr());
  const [to, setTo] = useState(todayStr());

  async function doLoad(p: number, cId: string, f: string, t: string) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p) });
    if (cId) params.set('courseId', cId);
    if (f) params.set('from', f);
    if (t) params.set('to', t);
    try {
      const [sRes, dRes] = await Promise.all([
        fetch('/api/admin/session'),
        fetch('/api/admin/activity?' + params.toString()),
      ]);
      if (!sRes.ok) { router.push('/admin/login'); return; }
      const data = await dRes.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
      setCurrentPage(p);
      if (Array.isArray(data.courses) && data.courses.length > 0) setCourses(data.courses);
      setAdminReady(true);
    } catch { router.push('/admin/login'); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { doLoad(1, '', thirtyAgoStr(), todayStr()); }, []);

  function apply() { doLoad(1, courseId, from, to); }

  function onCourseChange(id: string) {
    setCourseId(id);
    doLoad(1, id, from, to);
  }

  function goPage(p: number) { doLoad(p, courseId, from, to); }

  if (!adminReady) return null;

  const iCls = 'bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-gray-600 transition-colors';

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar active="activity" />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7">

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-black text-white">Activity</h1>
              <div className="text-sm text-gray-500 mt-0.5">Cross-course event feed</div>
            </div>
            <button onClick={() => doLoad(currentPage, courseId, from, to)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors">
              <RefreshCw className="w-4 h-4"/>Refresh
            </button>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <select value={courseId} onChange={e => onCourseChange(e.target.value)} className={iCls + ' cursor-pointer'}>
              <option value="">All courses</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={iCls}/>
              <span className="text-gray-600 text-sm">to</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={iCls}/>
            </div>
            <button onClick={apply} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-colors">
              Load
            </button>
            {!loading && (
              <span className="text-xs text-gray-600 ml-auto">
                {total} event{total !== 1 ? 's' : ''}{pages > 1 ? ` · page ${currentPage} of ${pages}` : ''}
              </span>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {(Object.entries(TYPE_META) as [string, typeof TYPE_META['booking']][]).map(([, m]) => {
              const I = m.icon;
              return (
                <span key={m.label} className={'flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ' + m.chip}>
                  <I className="w-3 h-3"/>{m.label}
                </span>
              );
            })}
          </div>

          {/* Event list */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="flex items-center gap-4 px-5 py-2.5 border-b border-gray-800 bg-gray-900">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600 w-20 shrink-0">Type</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600 w-36 shrink-0 hidden lg:block">Course</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600 flex-1">Who · Detail</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600 text-right">Amount · When</span>
            </div>

            {loading && <div className="py-16 text-center text-sm text-gray-600">Loading...</div>}

            {!loading && items.length === 0 && (
              <div className="py-16 text-center text-sm text-gray-600">No activity in this date range</div>
            )}

            {!loading && items.length > 0 && (
              <div className="divide-y divide-gray-800/50">
                {items.map(item => <EventRow key={item.id + item.type} item={item}/>)}
              </div>
            )}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={() => goPage(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4"/>Prev
              </button>
              <span className="text-sm text-gray-500">Page {currentPage} of {pages}</span>
              <button
                onClick={() => goPage(currentPage + 1)}
                disabled={currentPage >= pages || loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next<ChevronRight className="w-4 h-4"/>
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
