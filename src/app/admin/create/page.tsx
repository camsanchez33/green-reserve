'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Copy, ChevronRight, ArrowLeft, Eye, Globe, Lock } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const H = () => ({ 'Content-Type': 'application/json' });

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const COURSE_TYPES = [
  { value: 'public',   label: 'Public',   Icon: Globe, desc: 'Open to all golfers. Standard weekday/weekend rates.' },
  { value: 'private',  label: 'Private',  Icon: Lock,  desc: 'Member-controlled access. Restricted or limited public tee times.' },
];

interface Basics {
  name: string; slug: string; address: string;
  city: string; state: string; zipCode: string; phone: string; website: string;
}
interface FeesData {
  weekdayFee: string; weekendFee: string; cartFee: string; walkingAllowed: boolean;
  hasTwilight: boolean; twilightFee: string;
  seasonOpen: string; seasonClose: string;
  hasResidentRates: boolean; residentWeekday: string; residentWeekend: string; residentNote: string;
  memberAdvanceDays: string; hasStarterTier: boolean; starterTierName: string; starterTierFee: string;
  hasGuestRate: boolean; guestRate: string; packagesNote: string;
}
interface OpData { contactName: string; contactEmail: string; contactPhone: string; }
interface Result {
  slug: string; tempPassword: string; setupLink: string; courseId: string | null;
  emailSent: boolean; emailError?: string; notesItems?: string[];
  seedScheduleCreated?: boolean; seedTierCreated?: boolean;
}

const BLANK_BASICS: Basics = { name: '', slug: '', address: '', city: '', state: 'NJ', zipCode: '', phone: '', website: '' };
const BLANK_FEES: FeesData = {
  weekdayFee: '', weekendFee: '', cartFee: '', walkingAllowed: true,
  hasTwilight: false, twilightFee: '', seasonOpen: '', seasonClose: '',
  hasResidentRates: true, residentWeekday: '', residentWeekend: '', residentNote: '',
  memberAdvanceDays: '14', hasStarterTier: false, starterTierName: '', starterTierFee: '',
  hasGuestRate: false, guestRate: '', packagesNote: '',
};
const BLANK_OP: OpData = { contactName: '', contactEmail: '', contactPhone: '' };

const STEPS = [
  { n: 1, label: 'Type' }, { n: 2, label: 'Basics' }, { n: 3, label: 'Fees' },
  { n: 4, label: 'Operator' }, { n: 5, label: 'Review' },
] as const;
type WStep = 1 | 2 | 3 | 4 | 5;

function MonthSelect({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={iCls}>
      <option value="">{placeholder}</option>
      {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
    </select>
  );
}

function DollarInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm pointer-events-none">$</span>
      <input
        type="number" min="0" step="0.01"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={iCls + ' pl-7'}
        placeholder={placeholder || '0.00'}
      />
    </div>
  );
}

function WizardContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [adminReady, setAdminReady] = useState(false);
  const [inquiryId, setInquiryId] = useState('');
  const [step, setStep] = useState<WStep>(1);
  const [courseType, setCourseType] = useState('public');
  const [basics, setBasics] = useState<Basics>(BLANK_BASICS);
  const [fees, setFees] = useState<FeesData>(BLANK_FEES);
  const [op, setOp] = useState<OpData>(BLANK_OP);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    const pType = params.get('type') || '';
    if (pType) {
      // Map legacy inquiry values to the two canonical types
      const mapped = (pType === 'semi-private' || pType === 'private') ? 'private' : 'public';
      setCourseType(mapped);
    }
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
      const payload: Record<string, unknown> = {
        courseName: basics.name, courseType,
        address: basics.address, city: basics.city, state: basics.state,
        zipCode: basics.zipCode, phone: basics.phone, website: basics.website,
        slug: basics.slug,
        contactName: op.contactName, contactEmail: op.contactEmail, contactPhone: op.contactPhone,
        ...(inquiryId ? { inquiryId } : {}),
      };
      const wd = parseFloat(fees.weekdayFee);
      const we = parseFloat(fees.weekendFee);
      if (!isNaN(wd) && !isNaN(we)) {
        payload.seedWeekdayFee = wd;
        payload.seedWeekendFee = we;
        payload.seedCartFee = parseFloat(fees.cartFee) || 0;
        payload.seedWalkingAllowed = fees.walkingAllowed;
      }
      if (fees.hasTwilight && fees.twilightFee) payload.seedTwilightFee = parseFloat(fees.twilightFee) || null;
      if (fees.seasonOpen) payload.seedSeasonOpen = fees.seasonOpen;
      if (fees.seasonClose) payload.seedSeasonClose = fees.seasonClose;
      if (courseType === 'public' && fees.hasResidentRates) {
        if (fees.residentWeekday) payload.seedResidentWeekday = parseFloat(fees.residentWeekday);
        if (fees.residentWeekend) payload.seedResidentWeekend = parseFloat(fees.residentWeekend);
        if (fees.residentNote) payload.seedResidentNote = fees.residentNote;
      }
      if (courseType === 'private') {
        payload.seedMemberAdvanceDays = parseInt(fees.memberAdvanceDays) || 14;
        if (fees.hasStarterTier && fees.starterTierName) {
          payload.seedStarterTierName = fees.starterTierName;
          payload.seedStarterTierFee = parseFloat(fees.starterTierFee) || 0;
        }
      }
      const r = await fetch('/api/admin/create-course', { method: 'POST', headers: H(), body: JSON.stringify(payload) });
      const d = await r.json();
      if (r.ok) setResult(d);
      else alert(`Error: ${d.error}`);
    } catch (e) { alert(`Error: ${e}`); }
    setCreating(false);
  }

  function reset() {
    setResult(null); setStep(1); setCourseType('public');
    setBasics(BLANK_BASICS); setFees(BLANK_FEES); setOp(BLANK_OP);
    setSlugManuallyEdited(false); setInquiryId(''); setSlugStatus('idle');
  }

  if (!adminReady) return null;

  const step2Valid = basics.name.length > 0 && basics.city.length > 0 && basics.state.length > 0 && basics.slug.length > 0 && slugStatus === 'ok';
  const step3Valid = fees.weekdayFee !== '' && fees.weekendFee !== '' && !isNaN(parseFloat(fees.weekdayFee)) && !isNaN(parseFloat(fees.weekendFee));
  const step4Valid = op.contactName.length > 0 && op.contactEmail.includes('@') && op.contactPhone.length > 0;

  const slugStatusLabel = slugStatus === 'ok' ? 'available' : slugStatus === 'taken' ? 'taken' : slugStatus === 'checking' ? 'checking...' : '';
  const slugStatusCls = slugStatus === 'ok' ? 'text-ok' : slugStatus === 'taken' ? 'text-bad' : 'text-ink-muted';
  const slugInputCls = iCls + (slugStatus === 'taken' ? ' border-bad/40' : slugStatus === 'ok' ? ' border-ok/30' : '');

  // Pre-compute review rows to avoid multi-line ternaries in JSX
  const reviewCourseRows: [string, string][] = [
    ['Course name', basics.name],
    ['Type', courseType],
    ['URL slug', basics.slug],
    ['Location', [basics.city, basics.state, basics.zipCode].filter(Boolean).join(', ')],
    ['Address', basics.address || '—'],
    ['Phone', basics.phone || '—'],
    ['Website', basics.website || '—'],
  ];
  const reviewFeeRows: [string, string][] = [
    ['Weekday fee', fees.weekdayFee ? `$${fees.weekdayFee}` : '—'],
    ['Weekend fee', fees.weekendFee ? `$${fees.weekendFee}` : '—'],
    ['Cart fee', fees.cartFee ? `$${fees.cartFee}` : '$0'],
    ['Walking', fees.walkingAllowed ? 'Allowed' : 'Cart required'],
  ];
  if (fees.hasTwilight && fees.twilightFee) reviewFeeRows.push(['Twilight fee', `$${fees.twilightFee} (notes)`]);
  if (fees.seasonOpen) reviewFeeRows.push(['Season opens', MONTHS[parseInt(fees.seasonOpen)] || fees.seasonOpen]);
  if (fees.seasonClose) reviewFeeRows.push(['Season closes', MONTHS[parseInt(fees.seasonClose)] || fees.seasonClose]);
  if (courseType === 'public' && fees.hasResidentRates) {
    if (fees.residentWeekday) reviewFeeRows.push(['Resident weekday', `$${fees.residentWeekday}`]);
    if (fees.residentWeekend) reviewFeeRows.push(['Resident weekend', `$${fees.residentWeekend}`]);
  }
  if (courseType === 'private') {
    reviewFeeRows.push(['Member advance booking', `${fees.memberAdvanceDays} days`]);
    if (fees.hasStarterTier && fees.starterTierName) {
      reviewFeeRows.push(['Starter tier', `${fees.starterTierName} · $${fees.starterTierFee}/yr`]);
    }
  }

  const copyRows: [string, string][] = result
    ? [
        ['Booking page', 'greenreserve.app/courses/' + result.slug],
        ['Temp password', result.tempPassword],
        ['Setup link', result.setupLink],
      ]
    : [];

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
              <div className="space-y-2 mb-5">
                {copyRows.map(([label, val]) => (
                  <div key={label} className="flex items-center gap-3 bg-paper border border-line rounded-md px-4 py-3">
                    <span className="text-ink-muted text-xs w-28 shrink-0">{label}</span>
                    <span className="text-ink text-xs font-mono flex-1 truncate">{val}</span>
                    <button onClick={() => navigator.clipboard.writeText(val)} className="text-ink-muted hover:text-pine transition-colors shrink-0"><Copy className="w-3.5 h-3.5"/></button>
                  </div>
                ))}
              </div>
              {result.seedScheduleCreated && (
                <div className="bg-pine/5 border border-pine/20 rounded-md px-3 py-2 text-xs text-pine mb-3">
                  Seed schedule created (7am–5:30pm, 10-min intervals, all days). Operator can adjust in their dashboard.
                </div>
              )}
              {result.seedTierCreated && (
                <div className="bg-pine/5 border border-pine/20 rounded-md px-3 py-2 text-xs text-pine mb-3">
                  Starter membership tier created. Operator can configure it in Members.
                </div>
              )}
              {result.notesItems && result.notesItems.length > 0 && (
                <div className="bg-warn/5 border border-warn/20 rounded-md px-4 py-3 mb-4">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-warn mb-1.5">Stored as description notes</div>
                  <ul className="text-xs text-ink-soft space-y-0.5">
                    {result.notesItems.map((n: string, i: number) => <li key={i}>• {n}</li>)}
                  </ul>
                  <p className="text-[10px] text-ink-faint mt-1.5">Visible in Course Settings → Description.</p>
                </div>
              )}
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
          <div className="flex items-center mb-8 overflow-x-auto pb-1">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center shrink-0">
                <div className="flex items-center gap-2">
                  <div className={'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ' + (step >= s.n ? 'bg-pine text-white' : 'bg-paper border border-line text-ink-muted')}>
                    {step > s.n ? <CheckCircle className="w-4 h-4"/> : s.n}
                  </div>
                  <span className={'text-xs font-medium hidden sm:block ' + (step === s.n ? 'text-ink' : step > s.n ? 'text-ok' : 'text-ink-muted')}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={'w-8 h-px mx-2 shrink-0 ' + (step > s.n ? 'bg-ok' : 'bg-line')}/>}
              </div>
            ))}
          </div>

          {/* ── Step 1: Type ──────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="bg-white border border-line rounded-lg p-6">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-4">What kind of course is this?</div>
                <div className="grid grid-cols-2 gap-3">
                  {COURSE_TYPES.map(t => {
                    const IconComp = t.Icon;
                    const sel = courseType === t.value;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setCourseType(t.value)}
                        className={'text-left p-4 rounded-lg border-2 transition-colors ' + (sel ? 'border-pine bg-pine/5' : 'border-line hover:border-pine/30 bg-white')}
                      >
                        <div className={'flex items-center gap-2 mb-1.5 ' + (sel ? 'text-pine' : 'text-ink-soft')}>
                          <IconComp className="w-4 h-4"/>
                          <span className="text-[13px] font-medium text-ink">{t.label}</span>
                        </div>
                        <p className="text-xs text-ink-soft leading-relaxed">{t.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
              <button onClick={() => setStep(2)}
                className="w-full py-3 bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-[12.5px] transition-colors flex items-center justify-center gap-2">
                Continue <ChevronRight className="w-4 h-4"/>
              </button>
            </div>
          )}

          {/* ── Step 2: Basics ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="bg-white border border-line rounded-lg p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Course Details</div>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Phone</label>
                    <input value={basics.phone} onChange={e => setBasics(b => ({ ...b, phone: e.target.value }))} className={iCls} placeholder="(201) 555-0100"/>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Website</label>
                    <input value={basics.website} onChange={e => setBasics(b => ({ ...b, website: e.target.value }))} className={iCls} placeholder="https://"/>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-5 py-3 border border-line text-ink-muted hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors">
                  <ArrowLeft className="w-4 h-4"/>Back
                </button>
                <button onClick={() => setStep(3)} disabled={!step2Valid}
                  className="flex-1 py-3 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors flex items-center justify-center gap-2">
                  Fees <ChevronRight className="w-4 h-4"/>
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Fees ──────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="bg-white border border-line rounded-lg p-6 space-y-5">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                  Pricing — {courseType === 'private' ? 'Private' : 'Public'}
                </div>

                {/* Common: weekday/weekend/cart/walking */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Weekday green fee *</label>
                    <DollarInput value={fees.weekdayFee} onChange={v => setFees(f => ({ ...f, weekdayFee: v }))} placeholder="45.00"/>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Weekend green fee *</label>
                    <DollarInput value={fees.weekendFee} onChange={v => setFees(f => ({ ...f, weekendFee: v }))} placeholder="60.00"/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 items-end">
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Cart fee per player</label>
                    <DollarInput value={fees.cartFee} onChange={v => setFees(f => ({ ...f, cartFee: v }))} placeholder="18.00"/>
                  </div>
                  <div className="pb-2">
                    <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                      <input type="checkbox" checked={fees.walkingAllowed} onChange={e => setFees(f => ({ ...f, walkingAllowed: e.target.checked }))} className="w-4 h-4 accent-pine rounded"/>
                      Walking allowed
                    </label>
                  </div>
                </div>

                {/* Twilight */}
                <div className="border-t border-line-soft pt-4 space-y-3">
                  <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                    <input type="checkbox" checked={fees.hasTwilight} onChange={e => setFees(f => ({ ...f, hasTwilight: e.target.checked }))} className="w-4 h-4 accent-pine rounded"/>
                    <span>Twilight rate <span className="text-ink-muted">(stored in description notes)</span></span>
                  </label>
                  {fees.hasTwilight && (
                    <DollarInput value={fees.twilightFee} onChange={v => setFees(f => ({ ...f, twilightFee: v }))} placeholder="25.00"/>
                  )}
                </div>

                {/* Season */}
                <div className="border-t border-line-soft pt-4 space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Season <span className="normal-case tracking-normal font-normal">(optional — stored in description notes)</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-ink-muted block mb-1">Opens</label>
                      <MonthSelect value={fees.seasonOpen} onChange={v => setFees(f => ({ ...f, seasonOpen: v }))} placeholder="Year-round"/>
                    </div>
                    <div>
                      <label className="text-[10px] text-ink-muted block mb-1">Closes</label>
                      <MonthSelect value={fees.seasonClose} onChange={v => setFees(f => ({ ...f, seasonClose: v }))} placeholder="Year-round"/>
                    </div>
                  </div>
                </div>

                {/* Public: optional resident rates */}
                {courseType === 'public' && (
                  <div className="border-t border-line-soft pt-4 space-y-4">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Resident pricing</div>
                    <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                      <input type="checkbox" checked={fees.hasResidentRates} onChange={e => setFees(f => ({ ...f, hasResidentRates: e.target.checked }))} className="w-4 h-4 accent-pine rounded"/>
                      Enable resident rates
                    </label>
                    {fees.hasResidentRates && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Resident weekday</label>
                            <DollarInput value={fees.residentWeekday} onChange={v => setFees(f => ({ ...f, residentWeekday: v }))} placeholder="30.00"/>
                          </div>
                          <div>
                            <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Resident weekend</label>
                            <DollarInput value={fees.residentWeekend} onChange={v => setFees(f => ({ ...f, residentWeekend: v }))} placeholder="40.00"/>
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Resident verification note <span className="normal-case tracking-normal text-ink-faint">(stored in notes)</span></label>
                          <input value={fees.residentNote} onChange={e => setFees(f => ({ ...f, residentNote: e.target.value }))} className={iCls} placeholder="County ID or utility bill required"/>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Private: member advance + starter tier */}
                {courseType === 'private' && (
                  <div className="border-t border-line-soft pt-4 space-y-4">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Member access</div>
                    <div>
                      <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Member advance booking window</label>
                      <div className="flex items-center gap-2">
                        <input type="number" min="1" max="365" value={fees.memberAdvanceDays} onChange={e => setFees(f => ({ ...f, memberAdvanceDays: e.target.value }))} className={iCls + ' w-24'}/>
                        <span className="text-sm text-ink-soft">days</span>
                      </div>
                      <p className="text-[10px] text-ink-muted mt-1">Public booking window defaults to 7 days.</p>
                    </div>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                        <input type="checkbox" checked={fees.hasStarterTier} onChange={e => setFees(f => ({ ...f, hasStarterTier: e.target.checked }))} className="w-4 h-4 accent-pine rounded"/>
                        Create a starter membership tier
                      </label>
                      {fees.hasStarterTier && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Tier name</label>
                            <input value={fees.starterTierName} onChange={e => setFees(f => ({ ...f, starterTierName: e.target.value }))} className={iCls} placeholder="Full Member"/>
                          </div>
                          <div>
                            <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Annual fee</label>
                            <DollarInput value={fees.starterTierFee} onChange={v => setFees(f => ({ ...f, starterTierFee: v }))} placeholder="1200.00"/>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-5 py-3 border border-line text-ink-muted hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors">
                  <ArrowLeft className="w-4 h-4"/>Back
                </button>
                <button onClick={() => setStep(4)} disabled={!step3Valid}
                  className="flex-1 py-3 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors flex items-center justify-center gap-2">
                  Operator <ChevronRight className="w-4 h-4"/>
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Operator ──────────────────────────────────────── */}
          {step === 4 && (
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
                <button onClick={() => setStep(3)} className="flex items-center gap-1.5 px-5 py-3 border border-line text-ink-muted hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors">
                  <ArrowLeft className="w-4 h-4"/>Back
                </button>
                <button onClick={() => setStep(5)} disabled={!step4Valid}
                  className="flex-1 py-3 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors flex items-center justify-center gap-2">
                  Review <ChevronRight className="w-4 h-4"/>
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: Review ────────────────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-5">
              <div className="bg-white border border-line rounded-lg p-6 space-y-5">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Review before creating</div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  {reviewCourseRows.map(([label, val]) => (
                    <div key={label}>
                      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">{label}</div>
                      <div className="text-ink font-medium text-sm break-all">{val}</div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-line pt-4">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Pricing</div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                    {reviewFeeRows.map(([label, val]) => (
                      <div key={label}>
                        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">{label}</div>
                        <div className="text-ink text-sm">{val}</div>
                      </div>
                    ))}
                  </div>
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
                <button onClick={() => setStep(4)} className="flex items-center gap-1.5 px-5 py-3 border border-line text-ink-muted hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors">
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
