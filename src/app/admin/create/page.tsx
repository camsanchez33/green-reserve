'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Copy, ChevronRight, ArrowLeft, Eye } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
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

  useEffect(() => {
    if (slugManuallyEdited) return;
    const auto = basics.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setBasics(b => (b.slug === auto ? b : { ...b, slug: auto }));
  }, [basics.name, slugManuallyEdited]);

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

  const slugStatusLabel = slugStatus === 'ok' ? 'available' : slugStatus === 'taken' ? 'taken' : slugStatus === 'checking' ? 'checking...' : '';
  const slugStatusCls = slugStatus === 'ok' ? 'text-ok' : slugStatus === 'taken' ? 'text-bad' : 'text-ink-muted';
  const slugInputCls = iCls + (slugStatus === 'taken' ? ' border-bad/40' : slugStatus === 'ok' ? ' border-ok/30' : '');

  const copyRows: [string, string][] = result ? [
    ['Booking page', 'greenreserve.app/courses/' + result.slug],
    ['Temp password', result.tempPassword],
    ['Setup link', result.setupLink],
  ] : [];

  if (result) {
    return (
      <div className="min-h-screen bg-paper flex">
        <AdminSidebar active="create" />
        <div className="ml-56 flex-1 min-h-screen flex items-start justify-center pt-16">
          <div className="w-full max-w-lg px-4">
            <div className="bg-white border border-line rounded-lg p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-md bg-ok/10 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5 text-ok"/>
                </div>
                <div>
                  <div className="font-serif font-medium text-ink text-lg">Course created!</div>
                  <div className={'text-xs mt-0.5 ' + (result.emailSent ? 'text-ok' : 'text-bad')}>
                    {result.emailSent ? 'Welcome email sent to operator' : 'Email failed — share credentials manually'}
                  </div>
                </div>
              </div>
              <div className="space-y-2 mb-6">
                {copyRows.map(([label, val]) => (
                  <div key={label} className="flex items-center gap-3 bg-paper border border-line rounded-md px-4 py-3">
                    <span className="text-ink-muted text-xs w-28 shrink-0">{label}</span>
                    <span className="text-ink text-xs font-mono flex-1 truncate">{val}</span>
                    <button onClick={() => navigator.clipboard.writeText(val)} className="text-ink-muted hover:text-pine transition-colors shrink-0"><Copy className="w-3.5 h-3.5"/></button>
                  </div>
                ))}
              </div>
              {result.emailError && (
                <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-xs text-bad mb-4">
                  Email error: {result.emailError}
                </div>
              )}
              <div className="flex gap-3">
                {result.courseId && (
                  <button onClick={() => router.push(`/admin/courses/${result.courseId}`)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-pine hover:bg-pine-hover text-white rounded-md text-[12.5px] font-medium transition-colors">
                    <Eye className="w-4 h-4"/>View in admin
                  </button>
                )}
                <button onClick={reset}
                  className="flex-1 py-2.5 border border-line text-ink-soft hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors">
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
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="create" />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-2xl">
          <div className="mb-7">
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Add New Course</h1>
            <p className="text-sm text-ink-soft mt-0.5">
              {inquiryId ? 'Pre-filled from inquiry · ' : ''}Create an operator account and course page
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center mb-8">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div className={'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ' + (step >= s.n ? 'bg-pine text-white' : 'bg-paper border border-line text-ink-muted')}>
                    {step > s.n ? <CheckCircle className="w-4 h-4"/> : s.n}
                  </div>
                  <span className={'text-xs font-medium hidden sm:block ' + (step === s.n ? 'text-ink' : step > s.n ? 'text-ok' : 'text-ink-muted')}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={'w-10 h-px mx-3 ' + (step > s.n ? 'bg-ok' : 'bg-line')}/>}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-5">
              <div className="bg-white border border-line rounded-lg p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Course Basics</div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Course Name *</label>
                  <input value={basics.name} onChange={e => setBasics(b => ({ ...b, name: e.target.value }))} className={iCls} placeholder="Pine Brook Golf Club" autoFocus/>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">
                    URL Slug *
                    {slugStatusLabel && <span className={'ml-2 text-[10px] font-medium ' + slugStatusCls}>{slugStatusLabel}</span>}
                  </label>
                  <input
                    value={basics.slug}
                    onChange={e => { setSlugManuallyEdited(true); setBasics(b => ({ ...b, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })); }}
                    className={slugInputCls}
                    placeholder="pine-brook-golf-club"
                  />
                  <p className="text-[10px] text-ink-muted mt-1">greenreserve.app/courses/{basics.slug || '...'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Course Type</label>
                    <select value={basics.type} onChange={e => setBasics(b => ({ ...b, type: e.target.value }))} className={iCls}>
                      {TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Phone</label>
                    <input value={basics.phone} onChange={e => setBasics(b => ({ ...b, phone: e.target.value }))} className={iCls} placeholder="(201) 555-0100"/>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Address</label>
                  <input value={basics.address} onChange={e => setBasics(b => ({ ...b, address: e.target.value }))} className={iCls} placeholder="123 Fairway Dr"/>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">City *</label>
                    <input value={basics.city} onChange={e => setBasics(b => ({ ...b, city: e.target.value }))} className={iCls}/>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">State *</label>
                    <input value={basics.state} onChange={e => setBasics(b => ({ ...b, state: e.target.value.toUpperCase() }))} className={iCls} maxLength={2}/>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Zip</label>
                    <input value={basics.zipCode} onChange={e => setBasics(b => ({ ...b, zipCode: e.target.value }))} className={iCls}/>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Website</label>
                  <input value={basics.website} onChange={e => setBasics(b => ({ ...b, website: e.target.value }))} className={iCls} placeholder="https://"/>
                </div>
                <div className="flex gap-6">
                  {(['hasMemberPricing', 'hasResidentPricing'] as const).map(k => (
                    <label key={k} className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                      <input type="checkbox" checked={basics[k]} onChange={e => setBasics(b => ({ ...b, [k]: e.target.checked }))} className="w-4 h-4 accent-pine rounded"/>
                      {k === 'hasMemberPricing' ? 'Member pricing' : 'Resident pricing'}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={() => setStep(2)} disabled={!step1Valid}
                className="w-full py-3 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors flex items-center justify-center gap-2">
                Operator details <ChevronRight className="w-4 h-4"/>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="bg-white border border-line rounded-lg p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Operator Account</div>
                <p className="text-xs text-ink-muted">Creates their dashboard login. They receive a welcome email with a temp password and setup link.</p>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Full Name *</label>
                  <input value={op.contactName} onChange={e => setOp(f => ({ ...f, contactName: e.target.value }))} className={iCls} placeholder="John Smith" autoFocus/>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Email *</label>
                  <input type="email" value={op.contactEmail} onChange={e => setOp(f => ({ ...f, contactEmail: e.target.value }))} className={iCls} placeholder="gm@pinecreek.com"/>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Phone *</label>
                  <input type="tel" value={op.contactPhone} onChange={e => setOp(f => ({ ...f, contactPhone: e.target.value }))} className={iCls} placeholder="(201) 555-0100"/>
                  <p className="text-[10px] text-ink-muted mt-1">Used for SMS two-factor login codes.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-5 py-3 border border-line text-ink-muted hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors">
                  <ArrowLeft className="w-4 h-4"/>Back
                </button>
                <button onClick={() => setStep(3)} disabled={!step2Valid}
                  className="flex-1 py-3 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors flex items-center justify-center gap-2">
                  Review <ChevronRight className="w-4 h-4"/>
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="bg-white border border-line rounded-lg p-6 space-y-5">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Review before creating</div>
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
                      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">{label}</div>
                      <div className="text-ink font-medium text-sm break-all">{val}</div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-line pt-4">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Operator</div>
                  <div className="grid grid-cols-3 gap-4">
                    {([['Name', op.contactName], ['Email', op.contactEmail], ['Phone', op.contactPhone]] as [string, string][]).map(([label, val]) => (
                      <div key={label}>
                        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">{label}</div>
                        <div className="text-ink font-medium text-sm break-all">{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-pine/5 border border-pine/20 rounded-md px-4 py-3 text-xs text-pine">
                  A welcome email with a temporary password and setup link will be sent to <strong>{op.contactEmail}</strong>.
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-5 py-3 border border-line text-ink-muted hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors">
                  <ArrowLeft className="w-4 h-4"/>Back
                </button>
                <button onClick={create} disabled={creating}
                  className="flex-1 py-3 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors">
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
