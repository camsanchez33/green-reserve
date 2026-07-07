'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Copy, ChevronRight, ArrowLeft, Eye } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

const iCls = 'w-full bg-gray-800/80 border border-gray-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 placeholder-gray-600 transition-colors';
const H = () => ({ 'Content-Type': 'application/json' });
const TYPES = ['public', 'semi-private', 'private', 'resort', 'municipal'];

interface Basics {
  name: string; slug: string; type: string; address: string;
  city: string; state: string; zipCode: string; phone: string; website: string;
  hasMemberPricing: boolean; hasResidentPricing: boolean;
}
interface OpData { contactName: string; contactEmail: string; contactPhone: string; }
interface Result { slug: string; tempPassword: string; setupLink: string; courseId: string | null; emailSent: boolean; emailError?: string; }

const BLANK_BASICS: Basics = { name: '', slug: '', type: 'public', address: '', city: '', state: 'NJ', zipCode: '', phone: '', website: '', hasMemberPricing: false, hasResidentPricing: false };
const BLANK_OP: OpData = { contactName: '', contactEmail: '', contactPhone: '' };

const STEPS = [{ n: 1, label: 'Basics' }, { n: 2, label: 'Operator' }, { n: 3, label: 'Review' }] as const;

function WizardContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [adminReady, setAdminReady] = useState(false);
  const [inquiryId, setInquiryId] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [basics, setBasics] = useState<Basics>(BLANK_BASICS);
  const [op, setOp] = useState<OpData>(BLANK_OP);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  // Pre-fill from inquiry URL params
  useEffect(() => {
    const name = params.get('name') || '';
    if (!name) return;
    setBasics(b => ({
      ...b, name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      city: params.get('city') || b.city,
      state: params.get('state') || b.state,
      zipCode: params.get('zip') || b.zipCode,
      address: params.get('address') || b.address,
      website: params.get('website') || b.website,
      type: params.get('type') || b.type,
    }));
    setOp(f => ({
      ...f,
      contactName: params.get('contactName') || f.contactName,
      contactEmail: params.get('contactEmail') || f.contactEmail,
    }));
    setInquiryId(params.get('inquiryId') || '');
  }, [params]);

  // Auto-generate slug from name unless user has manually edited it
  useEffect(() => {
    if (slugManuallyEdited) return;
    const auto = basics.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setBasics(b => (b.slug === auto ? b : { ...b, slug: auto }));
  }, [basics.name, slugManuallyEdited]);

  // Debounced slug uniqueness check
  useEffect(() => {
    if (!basics.slug) { setSlugStatus('idle'); return; }
    setSlugStatus('checking');
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/create-course?slug=${encodeURIComponent(basics.slug)}`);
        const d = await r.json();
        setSlugStatus(d.available ? 'ok' : 'taken');
      } catch { setSlugStatus('idle'); }
    }, 400);
    return () => clearTimeout(t);
  }, [basics.slug]);

  async function create() {
    setCreating(true);
    try {
      const payload = {
        courseName: basics.name, courseType: basics.type, address: basics.address,
        city: basics.city, state: basics.state, zipCode: basics.zipCode,
        phone: basics.phone, website: basics.website,
        hasMemberPricing: basics.hasMemberPricing, hasResidentPricing: basics.hasResidentPricing,
        slug: basics.slug,
        contactName: op.contactName, contactEmail: op.contactEmail, contactPhone: op.contactPhone,
        ...(inquiryId ? { inquiryId } : {}),
      };
      const r = await fetch('/api/admin/create-course', { method: 'POST', headers: H(), body: JSON.stringify(payload) });
      const d = await r.json();
      if (r.ok) setResult(d);
      else alert(`Error: ${d.error}`);
    } catch (e) { alert(`Error: ${e}`); }
    setCreating(false);
  }

  function reset() {
    setResult(null); setStep(1); setBasics(BLANK_BASICS); setOp(BLANK_OP);
    setSlugManuallyEdited(false); setInquiryId(''); setSlugStatus('idle');
  }

  if (!adminReady) return null;

  const step1Valid = basics.name.length > 0 && basics.city.length > 0 && basics.state.length > 0 && basics.slug.length > 0 && slugStatus === 'ok';
  const step2Valid = op.contactName.length > 0 && op.contactEmail.includes('@') && op.contactPhone.length > 0;

  const slugStatusLabel = slugStatus === 'ok' ? '✓ available' : slugStatus === 'taken' ? '✗ already taken' : slugStatus === 'checking' ? 'checking...' : '';
  const slugStatusCls = slugStatus === 'ok' ? 'text-emerald-400' : slugStatus === 'taken' ? 'text-red-400' : 'text-gray-500';
  const slugInputCls = iCls + (slugStatus === 'taken' ? ' border-red-500/50' : slugStatus === 'ok' ? ' border-emerald-500/40' : '');

  const copyRows: [string, string][] = result ? [
    ['Booking page', 'greenreserve.app/courses/' + result.slug],
    ['Temp password', result.tempPassword],
    ['Setup link', result.setupLink],
  ] : [];

  if (result) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex">
        <AdminSidebar active="create" />
        <div className="ml-56 flex-1 min-h-screen flex items-start justify-center pt-16">
          <div className="w-full max-w-lg px-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5 text-emerald-400"/>
                </div>
                <div>
                  <div className="font-black text-white text-lg">Course created!</div>
                  <div className={'text-xs mt-0.5 ' + (result.emailSent ? 'text-emerald-400' : 'text-red-400')}>
                    {result.emailSent ? 'Welcome email sent to operator' : 'Email failed — share credentials manually'}
                  </div>
                </div>
              </div>
              <div className="space-y-2 mb-6">
                {copyRows.map(([label, val]) => (
                  <div key={label} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                    <span className="text-gray-500 text-xs w-28 shrink-0">{label}</span>
                    <span className="text-gray-200 text-xs font-mono flex-1 truncate">{val}</span>
                    <button onClick={() => navigator.clipboard.writeText(val)} className="text-gray-600 hover:text-emerald-400 transition-colors shrink-0"><Copy className="w-3.5 h-3.5"/></button>
                  </div>
                ))}
              </div>
              {result.emailError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 mb-4">
                  Email error: {result.emailError}
                </div>
              )}
              <div className="flex gap-3">
                {result.courseId && (
                  <button onClick={() => router.push(`/admin/courses?courseId=${result.courseId}`)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors">
                    <Eye className="w-4 h-4"/>View in admin
                  </button>
                )}
                <button onClick={reset}
                  className="flex-1 py-2.5 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 rounded-lg text-sm font-semibold transition-colors">
                  Add another
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar active="create" />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-2xl">
          <div className="mb-7">
            <h1 className="text-2xl font-black text-white">Add New Course</h1>
            <div className="text-sm text-gray-500 mt-0.5">
              {inquiryId ? 'Pre-filled from inquiry · ' : ''}Create an operator account and course page
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center mb-8">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div className={'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-colors ' + (step >= s.n ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-600')}>
                    {step > s.n ? <CheckCircle className="w-4 h-4"/> : s.n}
                  </div>
                  <span className={'text-xs font-semibold hidden sm:block ' + (step === s.n ? 'text-white' : step > s.n ? 'text-emerald-400' : 'text-gray-600')}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={'w-10 h-px mx-3 ' + (step > s.n ? 'bg-emerald-600' : 'bg-gray-800')}/>}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-5">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
                <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Course Basics</div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Course Name *</label>
                  <input value={basics.name} onChange={e => setBasics(b => ({ ...b, name: e.target.value }))} className={iCls} placeholder="Pine Brook Golf Club" autoFocus/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">
                    URL Slug *
                    {slugStatusLabel && <span className={'ml-2 text-[10px] font-bold ' + slugStatusCls}>{slugStatusLabel}</span>}
                  </label>
                  <input
                    value={basics.slug}
                    onChange={e => { setSlugManuallyEdited(true); setBasics(b => ({ ...b, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })); }}
                    className={slugInputCls}
                    placeholder="pine-brook-golf-club"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">greenreserve.app/courses/{basics.slug || '...'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Course Type</label>
                    <select value={basics.type} onChange={e => setBasics(b => ({ ...b, type: e.target.value }))} className={iCls}>
                      {TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Phone</label>
                    <input value={basics.phone} onChange={e => setBasics(b => ({ ...b, phone: e.target.value }))} className={iCls} placeholder="(201) 555-0100"/>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Address</label>
                  <input value={basics.address} onChange={e => setBasics(b => ({ ...b, address: e.target.value }))} className={iCls} placeholder="123 Fairway Dr"/>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">City *</label>
                    <input value={basics.city} onChange={e => setBasics(b => ({ ...b, city: e.target.value }))} className={iCls}/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">State *</label>
                    <input value={basics.state} onChange={e => setBasics(b => ({ ...b, state: e.target.value.toUpperCase() }))} className={iCls} maxLength={2}/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Zip</label>
                    <input value={basics.zipCode} onChange={e => setBasics(b => ({ ...b, zipCode: e.target.value }))} className={iCls}/>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Website</label>
                  <input value={basics.website} onChange={e => setBasics(b => ({ ...b, website: e.target.value }))} className={iCls} placeholder="https://"/>
                </div>
                <div className="flex gap-6">
                  {(['hasMemberPricing', 'hasResidentPricing'] as const).map(k => (
                    <label key={k} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                      <input type="checkbox" checked={basics[k]} onChange={e => setBasics(b => ({ ...b, [k]: e.target.checked }))} className="w-4 h-4 accent-emerald-500 rounded"/>
                      {k === 'hasMemberPricing' ? 'Member pricing' : 'Resident pricing'}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={() => setStep(2)} disabled={!step1Valid}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
                Operator details <ChevronRight className="w-4 h-4"/>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
                <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Operator Account</div>
                <p className="text-xs text-gray-600">Creates their dashboard login. They receive a welcome email with a temp password and setup link.</p>
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Full Name *</label>
                  <input value={op.contactName} onChange={e => setOp(f => ({ ...f, contactName: e.target.value }))} className={iCls} placeholder="John Smith" autoFocus/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Email *</label>
                  <input type="email" value={op.contactEmail} onChange={e => setOp(f => ({ ...f, contactEmail: e.target.value }))} className={iCls} placeholder="gm@pinecreek.com"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Phone *</label>
                  <input type="tel" value={op.contactPhone} onChange={e => setOp(f => ({ ...f, contactPhone: e.target.value }))} className={iCls} placeholder="(201) 555-0100"/>
                  <p className="text-[10px] text-gray-600 mt-1">Used for SMS two-factor login codes.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-5 py-3 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-lg text-sm font-semibold transition-colors">
                  <ArrowLeft className="w-4 h-4"/>Back
                </button>
                <button onClick={() => setStep(3)} disabled={!step2Valid}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
                  Review <ChevronRight className="w-4 h-4"/>
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-5">
                <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Review before creating</div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  {([
                    ['Course name', basics.name],
                    ['URL slug', basics.slug],
                    ['Type', basics.type],
                    ['Location', [basics.city, basics.state, basics.zipCode].filter(Boolean).join(', ')],
                    ['Address', basics.address || '—'],
                    ['Phone', basics.phone || '—'],
                    ['Website', basics.website || '—'],
                    ['Member pricing', basics.hasMemberPricing ? 'Yes' : 'No'],
                    ['Resident pricing', basics.hasResidentPricing ? 'Yes' : 'No'],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label}>
                      <div className="text-[10px] text-gray-600 mb-0.5 uppercase tracking-wide">{label}</div>
                      <div className="text-gray-200 font-medium text-sm break-all">{val}</div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-800 pt-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Operator</div>
                  <div className="grid grid-cols-3 gap-4">
                    {([['Name', op.contactName], ['Email', op.contactEmail], ['Phone', op.contactPhone]] as [string, string][]).map(([label, val]) => (
                      <div key={label}>
                        <div className="text-[10px] text-gray-600 mb-0.5 uppercase tracking-wide">{label}</div>
                        <div className="text-gray-200 font-medium text-sm break-all">{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 text-xs text-blue-300">
                  A welcome email with a temporary password and setup link will be sent to <strong>{op.contactEmail}</strong>.
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-5 py-3 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-lg text-sm font-semibold transition-colors">
                  <ArrowLeft className="w-4 h-4"/>Back
                </button>
                <button onClick={create} disabled={creating}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black rounded-lg text-sm transition-colors">
                  {creating ? 'Creating...' : 'Create Course and Send Welcome Email'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateCoursePage() {
  return (
    <Suspense fallback={null}>
      <WizardContent />
    </Suspense>
  );
}
