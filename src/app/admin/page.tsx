'use client';
import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Copy, ExternalLink, RefreshCw } from 'lucide-react';

interface Inquiry {
  id: string; contactName: string; contactTitle: string; email: string; phone: string;
  courseName: string; address: string; city: string; state: string; zipCode: string;
  website: string; courseType: string; currentBookingMethod: string; teeTimesPerDay: number | null;
  greenFeeRange: string; hasResidentPricing: boolean; hasMemberPricing: boolean;
  hasCaddies: boolean; pricingNotes: string; lookingFor: string[]; additionalNotes: string;
  status: string; createdAt: string;
}

interface Course {
  id: string; name: string; city: string; state: string; active: boolean; stripeAccountActive: boolean;
  operator: { email: string; name: string; onboardingStep: number; emailVerified: boolean } | null;
  createdAt: string;
}

interface ApproveResult { tempPassword: string; setupLink: string; }

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  setup: 'bg-blue-100 text-blue-800 border-blue-200',
};

export default function AdminPage() {
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<'inquiries' | 'courses'>('inquiries');
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approveResults, setApproveResults] = useState<Record<string, ApproveResult>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', 'x-admin-key': key }), [key]);

  const loadInquiries = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/inquiries', { headers: headers() });
    if (res.ok) setInquiries(await res.json());
    setLoading(false);
  }, [headers]);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/courses', { headers: headers() });
    if (res.ok) setCourses(await res.json());
    setLoading(false);
  }, [headers]);

  useEffect(() => {
    if (!authed) return;
    if (tab === 'inquiries') loadInquiries();
    else loadCourses();
  }, [authed, tab, loadInquiries, loadCourses]);

  async function login() {
    const res = await fetch('/api/admin/inquiries', { headers: { 'x-admin-key': key } });
    if (res.ok) setAuthed(true);
    else alert('Wrong key');
  }

  async function approve(id: string) {
    setProcessing(id);
    const res = await fetch('/api/admin/inquiries', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ inquiryId: id, action: 'approve' }),
    });
    const data = await res.json();
    if (res.ok) {
      setApproveResults(r => ({ ...r, [id]: { tempPassword: data.tempPassword, setupLink: data.setupLink } }));
      loadInquiries();
    } else alert(data.error);
    setProcessing(null);
  }

  async function reject(id: string) {
    setProcessing(id);
    await fetch('/api/admin/inquiries', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ inquiryId: id, action: 'reject' }),
    });
    loadInquiries();
    setProcessing(null);
  }

  function copy(text: string) { navigator.clipboard.writeText(text); }

  if (!authed) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 w-80">
        <h1 className="text-xl font-black mb-4 text-gray-900">Admin Access</h1>
        <input type="password" value={key} onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          placeholder="Admin secret key" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-3 focus:ring-2 focus:ring-green-500" />
        <button onClick={login} className="w-full bg-[#1b4332] text-white py-3 rounded-xl font-bold hover:bg-[#2d6a4f]">Enter</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1b4332] px-6 py-4 flex items-center justify-between">
        <span className="text-white font-black text-xl">Green<span className="text-green-300">Reserve</span> <span className="text-green-200/60 font-normal text-sm">Admin</span></span>
        <div className="flex gap-2">
          {(['inquiries', 'courses'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-white text-[#1b4332]' : 'text-white/60 hover:text-white'}`}>
              {t}
            </button>
          ))}
          <button onClick={() => tab === 'inquiries' ? loadInquiries() : loadCourses()}
            className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        {loading && <div className="text-center py-12 text-gray-400">Loading...</div>}

        {/* Inquiries */}
        {tab === 'inquiries' && !loading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-gray-900">Course Inquiries</h2>
              <span className="text-sm text-gray-500">{inquiries.length} total · {inquiries.filter(i => i.status === 'pending').length} pending</span>
            </div>
            {inquiries.length === 0 && <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-200">No inquiries yet</div>}
            {inquiries.map(inq => (
              <div key={inq.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-black text-gray-900">{inq.courseName}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[inq.status] || STATUS_COLORS.pending}`}>
                        {inq.status}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(inq.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="text-sm text-gray-600">{inq.city}, {inq.state} · {inq.courseType} · {inq.contactName} ({inq.contactTitle})</div>
                    <div className="text-sm text-gray-500 mt-0.5">{inq.email} · {inq.phone}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {inq.status === 'pending' && (
                      <>
                        <button onClick={() => approve(inq.id)} disabled={processing === inq.id}
                          className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => reject(inq.id)} disabled={processing === inq.id}
                          className="flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-50 disabled:opacity-50">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                    <button onClick={() => setExpanded(expanded === inq.id ? null : inq.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                      {expanded === inq.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Approve result */}
                {approveResults[inq.id] && (
                  <div className="mx-5 mb-4 bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                    <div className="text-sm font-semibold text-green-800">✅ Account created — send these to {inq.contactName}:</div>
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                      <div className="text-xs text-gray-500">Setup link</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-700 font-mono truncate max-w-xs">{approveResults[inq.id].setupLink}</span>
                        <button onClick={() => copy(approveResults[inq.id].setupLink)} className="text-gray-400 hover:text-gray-600"><Copy className="w-3.5 h-3.5" /></button>
                        <a href={approveResults[inq.id].setupLink} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-gray-600"><ExternalLink className="w-3.5 h-3.5" /></a>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                      <div className="text-xs text-gray-500">Temp password</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-700">{approveResults[inq.id].tempPassword}</span>
                        <button onClick={() => copy(approveResults[inq.id].tempPassword)} className="text-gray-400 hover:text-gray-600"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Expanded details */}
                {expanded === inq.id && (
                  <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-2 gap-4 text-sm bg-gray-50">
                    <div><span className="text-gray-500">Address: </span>{inq.address}, {inq.city}, {inq.state} {inq.zipCode}</div>
                    <div><span className="text-gray-500">Website: </span>{inq.website || '—'}</div>
                    <div><span className="text-gray-500">Current booking: </span>{inq.currentBookingMethod}</div>
                    <div><span className="text-gray-500">Tee times/day: </span>{inq.teeTimesPerDay || '—'}</div>
                    <div><span className="text-gray-500">Fee range: </span>{inq.greenFeeRange || '—'}</div>
                    <div><span className="text-gray-500">Resident pricing: </span>{inq.hasResidentPricing ? 'Yes' : 'No'}</div>
                    <div><span className="text-gray-500">Member pricing: </span>{inq.hasMemberPricing ? 'Yes' : 'No'}</div>
                    <div><span className="text-gray-500">Caddies: </span>{inq.hasCaddies ? 'Yes' : 'No'}</div>
                    {inq.pricingNotes && <div className="col-span-2"><span className="text-gray-500">Pricing notes: </span>{inq.pricingNotes}</div>}
                    {inq.lookingFor?.length > 0 && <div className="col-span-2"><span className="text-gray-500">Looking for: </span>{inq.lookingFor.join(', ')}</div>}
                    {inq.additionalNotes && <div className="col-span-2"><span className="text-gray-500">Notes: </span>{inq.additionalNotes}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Courses */}
        {tab === 'courses' && !loading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-gray-900">All Courses</h2>
              <span className="text-sm text-gray-500">{courses.length} total · {courses.filter(c => c.active).length} live</span>
            </div>
            {courses.length === 0 && <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-200">No courses yet</div>}
            {courses.map(c => (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-900">{c.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.active ? 'Live' : 'Inactive'}
                    </span>
                    {c.stripeAccountActive && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Stripe ✓</span>}
                  </div>
                  <div className="text-sm text-gray-500">{c.city}, {c.state}</div>
                  {c.operator && (
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                      {c.operator.email}
                      <span className={`px-1.5 py-0.5 rounded ${c.operator.emailVerified ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
                        {c.operator.emailVerified ? 'Verified' : 'Unverified'}
                      </span>
                      <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        Step {c.operator.onboardingStep}/3
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {c.operator?.onboardingStep === 3 ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-yellow-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
