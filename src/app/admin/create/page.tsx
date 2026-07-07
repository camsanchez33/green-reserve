'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Copy } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

const iCls = 'w-full bg-gray-800/80 border border-gray-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 placeholder-gray-600 transition-colors';
const H = () => ({ 'Content-Type': 'application/json' });

const defaultForm = {
  courseName: '', courseType: 'public', address: '', city: '', state: 'NJ', zipCode: '',
  phone: '', website: '', contactName: '', contactEmail: '', contactPhone: '',
  holes: 18, par: 72, description: '', hasMemberPricing: false, hasResidentPricing: false,
};

export default function CreateCoursePage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [createForm, setCreateForm] = useState(defaultForm);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ tempPassword: string; setupLink: string; slug: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  async function createCourse() {
    setCreating(true); setCreateResult(null);
    try {
      const r = await fetch('/api/admin/create-course', { method: 'POST', headers: H(), body: JSON.stringify(createForm) });
      const d = await r.json();
      if (r.ok) { setCreateResult(d); }
      else alert(`Error: ${d.error}`);
    } catch (e) { alert(`Error: ${e}`); }
    setCreating(false);
  }

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar active="create" />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-3xl">
          <div className="mb-7">
            <h1 className="text-2xl font-black text-white">Add New Course</h1>
            <div className="text-sm text-gray-500 mt-0.5">Create an operator account and course page in one step</div>
          </div>

          {createResult ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-8 max-w-xl">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-400"/>
                </div>
                <div>
                  <div className="font-black text-white">Course created!</div>
                  <div className="text-xs text-emerald-400">Welcome email sent to operator</div>
                </div>
              </div>
              <div className="space-y-2 mb-6">
                {([
                  ['Booking page', 'greenreserve.app/courses/' + createResult.slug],
                  ['Operator login', 'greenreserve.app/dashboard/login'],
                  ['Temp password', createResult.tempPassword],
                  ['Setup link', createResult.setupLink],
                ] as [string,string][]).map(([label, val]) => (
                  <div key={label} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                    <span className="text-gray-500 text-xs w-28 shrink-0">{label}</span>
                    <span className="text-gray-200 text-xs font-mono flex-1 truncate">{val}</span>
                    <button onClick={() => navigator.clipboard.writeText(val)} className="text-gray-600 hover:text-emerald-400 transition-colors shrink-0"><Copy className="w-3.5 h-3.5"/></button>
                  </div>
                ))}
              </div>
              <button onClick={() => { setCreateResult(null); setCreateForm(defaultForm); }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors">
                Add Another Course
              </button>
            </div>
          ) : (
            <div className="max-w-2xl space-y-5">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Course Details</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 block mb-1.5">Course Name *</label>
                    <input value={createForm.courseName} onChange={e => setCreateForm(f => ({ ...f, courseName: e.target.value }))} className={iCls} placeholder="Pine Brook Golf Club"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Type</label>
                    <select value={createForm.courseType} onChange={e => setCreateForm(f => ({ ...f, courseType: e.target.value }))} className={iCls}>
                      {['public','semi-private','member','resident','resort','municipal'].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Phone</label>
                    <input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} className={iCls} placeholder="(201) 555-0100"/>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 block mb-1.5">Address</label>
                    <input value={createForm.address} onChange={e => setCreateForm(f => ({ ...f, address: e.target.value }))} className={iCls} placeholder="123 Fairway Dr"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">City</label>
                    <input value={createForm.city} onChange={e => setCreateForm(f => ({ ...f, city: e.target.value }))} className={iCls}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">State</label>
                      <input value={createForm.state} onChange={e => setCreateForm(f => ({ ...f, state: e.target.value }))} className={iCls}/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Zip</label>
                      <input value={createForm.zipCode} onChange={e => setCreateForm(f => ({ ...f, zipCode: e.target.value }))} className={iCls}/>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Website</label>
                    <input value={createForm.website} onChange={e => setCreateForm(f => ({ ...f, website: e.target.value }))} className={iCls} placeholder="https://"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Holes</label>
                      <select value={createForm.holes} onChange={e => setCreateForm(f => ({ ...f, holes: Number(e.target.value) }))} className={iCls}>
                        {[9, 18, 27, 36].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Par</label>
                      <input type="number" value={createForm.par} onChange={e => setCreateForm(f => ({ ...f, par: Number(e.target.value) }))} className={iCls}/>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 block mb-1.5">Description</label>
                    <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} rows={3} className={iCls + ' resize-none'}/>
                  </div>
                  <div className="col-span-2 flex gap-6">
                    {(['hasMemberPricing', 'hasResidentPricing'] as const).map(k => (
                      <label key={k} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                        <input type="checkbox" checked={!!createForm[k]} onChange={e => setCreateForm(f => ({ ...f, [k]: e.target.checked }))} className="w-4 h-4 accent-emerald-500 rounded"/>
                        {k === 'hasMemberPricing' ? 'Member pricing' : 'Resident pricing'}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Operator Account</div>
                <p className="text-xs text-gray-600">Creates their login. They will get a welcome email with temp password and setup link.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Contact Name *</label>
                    <input value={createForm.contactName} onChange={e => setCreateForm(f => ({ ...f, contactName: e.target.value }))} className={iCls} placeholder="John Smith"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Contact Email *</label>
                    <input type="email" value={createForm.contactEmail} onChange={e => setCreateForm(f => ({ ...f, contactEmail: e.target.value }))} className={iCls} placeholder="gm@pinecreek.com"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Contact Phone *</label>
                    <input type="tel" value={createForm.contactPhone} onChange={e => setCreateForm(f => ({ ...f, contactPhone: e.target.value }))} className={iCls} placeholder="(201) 555-0100"/>
                    <p className="text-xs text-gray-600 mt-1">Used for SMS two-factor login codes.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={createCourse}
                disabled={creating || !createForm.courseName || !createForm.contactEmail || !createForm.contactName || !createForm.contactPhone}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black rounded-lg text-base transition-colors"
              >
                {creating ? 'Creating...' : 'Create Course and Send Welcome Email'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
