'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, AlertTriangle, ChevronRight, ArrowLeft } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const FACILITIES_LIST = [
  { id: 'range', label: 'Driving range' },
  { id: 'putting_green', label: 'Putting green' },
  { id: 'short_game', label: 'Short game area' },
  { id: 'pro_shop', label: 'Pro shop' },
  { id: 'lessons', label: 'Lessons' },
  { id: 'club_rental', label: 'Club rental' },
  { id: 'bag_storage', label: 'Bag storage' },
  { id: 'gps_carts', label: 'GPS carts' },
  { id: 'caddies', label: 'Caddies' },
  { id: 'tournaments', label: 'Hosts tournaments/outings' },
];

type Needs = {
  residentRates?: string; hasMemberships?: string;
  publicTeeTimes?: string; chargesMembersPerRound?: string; outsideOutings?: string;
};

type Draft = {
  holes: string; par: string; seasonOpen: string; seasonClose: string;
  firstTeeTime: string; lastTeeTime: string; intervalMinutes: string; daysOpen: number[];
  greenFeeWeekday: string; greenFeeWeekend: string; cartFee: string; twilightFee: string; walkingAllowed: string;
  residentWeekday: string; residentWeekend: string; residentVerification: string;
  starterTierName: string; starterTierFee: string;
  memberAdvanceDays: string; protectedTimes: string;
  publicGreenFee: string; publicWindow: string;
  memberRate: string;
  outingsVolume: string;
  cancellationHours: string; lateFee: string;
  facilities: string[]; restaurantType: string;
  website: string; description: string;
  additionalNotes: string;
};

const initDraft: Draft = {
  holes: '18', par: '72', seasonOpen: '', seasonClose: '',
  firstTeeTime: '07:00', lastTeeTime: '17:00', intervalMinutes: '10', daysOpen: [],
  greenFeeWeekday: '', greenFeeWeekend: '', cartFee: '', twilightFee: '', walkingAllowed: 'yes',
  residentWeekday: '', residentWeekend: '', residentVerification: '',
  starterTierName: '', starterTierFee: '',
  memberAdvanceDays: '14', protectedTimes: '',
  publicGreenFee: '', publicWindow: '',
  memberRate: '',
  outingsVolume: '',
  cancellationHours: '24', lateFee: '',
  facilities: [], restaurantType: 'none',
  website: '', description: '',
  additionalNotes: '',
};

type SectionId = 'basics' | 'schedule' | 'fees' | 'resident' | 'tier' | 'member' | 'public_fees' | 'member_rate' | 'outings' | 'cancellation' | 'facilities' | 'about' | 'notes';

function buildSections(courseType: string, needs: Needs): { id: SectionId; title: string }[] {
  const head: { id: SectionId; title: string }[] = [
    { id: 'basics', title: 'Course basics' },
    { id: 'schedule', title: 'Tee sheet schedule' },
  ];
  const tail: { id: SectionId; title: string }[] = [
    { id: 'cancellation', title: 'Cancellation policy' },
    { id: 'facilities', title: 'Facilities' },
    { id: 'about', title: 'About your course' },
    { id: 'notes', title: 'Anything else' },
  ];

  if (courseType === 'private') {
    const mid: { id: SectionId; title: string }[] = [{ id: 'member', title: 'Member booking' }];
    if (needs.publicTeeTimes === 'yes_regularly' || needs.publicTeeTimes === 'limited') {
      mid.push({ id: 'public_fees', title: 'Public tee times' });
    }
    if (needs.chargesMembersPerRound === 'yes') mid.push({ id: 'member_rate', title: 'Member rate' });
    if (needs.outsideOutings === 'yes') mid.push({ id: 'outings', title: 'Outside outings' });
    return [...head, ...mid, ...tail];
  }

  const mid: { id: SectionId; title: string }[] = [{ id: 'fees', title: 'Green fees' }];
  if (needs.residentRates === 'yes') mid.push({ id: 'resident', title: 'Resident rates' });
  if (needs.hasMemberships === 'yes') mid.push({ id: 'tier', title: 'Membership tier' });
  return [...head, ...mid, ...tail];
}

const inp = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";
const sel = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";

function Label({ text, sub }: { text: string; sub?: string }) {
  return (
    <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
      {text}{sub && <span className="normal-case tracking-normal font-normal text-ink-faint ml-1">{sub}</span>}
    </label>
  );
}

function DollarInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm pointer-events-none">$</span>
      <input type="number" min="0" step="0.01" value={value} onChange={e => onChange(e.target.value)} className={inp + ' pl-7'} placeholder={placeholder || '0.00'} />
    </div>
  );
}

function DetailsForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseType, setCourseType] = useState('public');
  const [needs, setNeeds] = useState<Needs>({});
  const [draft, setDraft] = useState<Draft>(initDraft);
  const [sections, setSections] = useState<{ id: SectionId; title: string }[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v })), []);
  const toggleFacility = (id: string) => setDraft(d => ({
    ...d,
    facilities: d.facilities.includes(id) ? d.facilities.filter(f => f !== id) : [...d.facilities, id],
  }));
  const toggleDay = (day: number) => setDraft(d => ({
    ...d,
    daysOpen: d.daysOpen.includes(day) ? d.daysOpen.filter(x => x !== day) : [...d.daysOpen, day],
  }));

  useEffect(() => {
    if (!token) { setLoadError('Missing setup link.'); setLoading(false); return; }
    fetch(`/api/inquiries/details?token=${encodeURIComponent(token)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load.'); return d; })
      .then(d => {
        setCourseName(d.courseName);
        const ct = d.courseType || 'public';
        setCourseType(ct);
        const n = d.needs || {};
        setNeeds(n);
        setSections(buildSections(ct, n));
        const saved = d.details || {};
        setDraft(prev => ({ ...prev, ...saved, daysOpen: Array.isArray(saved.daysOpen) ? saved.daysOpen : (saved.schedule?.daysOfWeek || []) }));
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const validateSection = (id: SectionId): string => {
    if (id === 'fees') {
      if (!draft.greenFeeWeekday) return 'Please enter weekday green fee.';
      if (!draft.greenFeeWeekend) return 'Please enter weekend green fee.';
    }
    if (id === 'public_fees' && !draft.publicGreenFee) return 'Please enter the public green fee.';
    if (id === 'member_rate' && !draft.memberRate) return 'Please enter the member rate.';
    if (id === 'resident') {
      if (!draft.residentWeekday) return 'Please enter resident weekday rate.';
      if (!draft.residentWeekend) return 'Please enter resident weekend rate.';
    }
    if (id === 'tier' && !draft.starterTierName) return 'Please enter the tier name.';
    if (id === 'about' && !draft.description) return 'Please enter a short course description.';
    return '';
  };

  const saveDraft = async (sectionData: Partial<Draft>) => {
    try {
      await fetch('/api/inquiries/details', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...sectionData }),
      });
    } catch { /* silently continue — draft save is best-effort */ }
  };

  const goNext = async () => {
    const section = sections[activeIdx];
    const validErr = validateSection(section.id);
    if (validErr) { setError(validErr); return; }
    setError('');

    const isLast = activeIdx === sections.length - 1;
    if (isLast) {
      setSaving(true);
      const res = await fetch('/api/inquiries/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...draft }),
      });
      setSaving(false);
      if (res.ok) { setSubmitted(true); return; }
      const d = await res.json();
      setError(d.error || 'Something went wrong.');
      return;
    }

    setSaving(true);
    await saveDraft(draft);
    setSaving(false);
    setActiveIdx(i => i + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => { setError(''); setActiveIdx(i => i - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  if (loading) return <div className="min-h-screen bg-paper flex items-center justify-center text-ink-muted text-sm">Loading...</div>;
  if (loadError) return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="bg-white rounded-lg p-8 max-w-md w-full text-center border border-line">
        <AlertTriangle className="w-10 h-10 text-warn mx-auto mb-4" />
        <h1 className="text-[18px] font-serif font-medium tracking-tight text-ink mb-2">Can&apos;t load this link</h1>
        <p className="text-ink-muted text-sm">{loadError}</p>
        <p className="text-ink-faint text-xs mt-4">If you think this is a mistake, reply to the email we sent you.</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="bg-white rounded-lg p-10 max-w-lg w-full text-center border border-line">
        <CheckCircle className="w-14 h-14 text-ok mx-auto mb-5" />
        <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">Thanks — we&apos;ve got it.</h1>
        <p className="text-ink-muted text-sm leading-relaxed">
          We&apos;ll build {courseName}&apos;s booking page with these details and email your login shortly.
          You&apos;ll be able to fine-tune everything before going live.
        </p>
      </div>
    </div>
  );

  const section = sections[activeIdx];
  const progress = sections.length > 0 ? ((activeIdx + 1) / sections.length) * 100 : 0;
  const isLast = activeIdx === sections.length - 1;

  const renderSection = (id: SectionId) => {
    switch (id) {
      case 'basics':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label text="Number of holes" />
                <select className={sel} value={draft.holes} onChange={e => set('holes', e.target.value)}>
                  {['9','18','27','36'].map(h => <option key={h} value={h}>{h} holes</option>)}
                </select>
              </div>
              <div>
                <Label text="Par" />
                <input type="number" className={inp} value={draft.par} onChange={e => set('par', e.target.value)} placeholder="72" />
              </div>
            </div>
            <div>
              <Label text="Season" sub="(optional — leave blank if year-round)" />
              <div className="grid grid-cols-2 gap-3">
                <select className={sel} value={draft.seasonOpen} onChange={e => set('seasonOpen', e.target.value)}>
                  <option value="">Year-round</option>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className={sel} value={draft.seasonClose} onChange={e => set('seasonClose', e.target.value)}>
                  <option value="">–</option>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {draft.seasonOpen && !draft.seasonClose && <p className="text-[11px] text-ink-faint mt-1">Select a closing month too.</p>}
            </div>
          </div>
        );

      case 'schedule':
        return (
          <div className="space-y-4">
            <div>
              <Label text="Days open" sub="(leave all unselected if open every day)" />
              <div className="flex gap-1.5 flex-wrap">
                {DAYS_SHORT.map((day, i) => (
                  <button key={day} type="button" onClick={() => toggleDay(i)}
                    className={'px-3 py-2 rounded-md border text-sm transition-colors ' + (draft.daysOpen.includes(i) ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line text-ink hover:border-pine/40')}>
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label text="First tee time" />
                <input type="time" className={inp} value={draft.firstTeeTime} onChange={e => set('firstTeeTime', e.target.value)} />
              </div>
              <div>
                <Label text="Last tee time" />
                <input type="time" className={inp} value={draft.lastTeeTime} onChange={e => set('lastTeeTime', e.target.value)} />
              </div>
            </div>
            <div>
              <Label text="Interval between tee times" />
              <select className={sel} value={draft.intervalMinutes} onChange={e => set('intervalMinutes', e.target.value)}>
                {['7','8','9','10','12','15'].map(v => <option key={v} value={v}>{v} minutes</option>)}
              </select>
            </div>
          </div>
        );

      case 'fees':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label text="Weekday green fee" />
                <DollarInput value={draft.greenFeeWeekday} onChange={v => set('greenFeeWeekday', v)} placeholder="45.00" />
              </div>
              <div>
                <Label text="Weekend green fee" />
                <DollarInput value={draft.greenFeeWeekend} onChange={v => set('greenFeeWeekend', v)} placeholder="65.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label text="Cart fee per player" sub="(optional)" />
                <DollarInput value={draft.cartFee} onChange={v => set('cartFee', v)} placeholder="18.00" />
              </div>
              <div>
                <Label text="Twilight rate" sub="(optional)" />
                <DollarInput value={draft.twilightFee} onChange={v => set('twilightFee', v)} placeholder="30.00" />
              </div>
            </div>
            <div>
              <Label text="Walking allowed?" />
              <select className={sel} value={draft.walkingAllowed} onChange={e => set('walkingAllowed', e.target.value)}>
                <option value="yes">Yes, always</option>
                <option value="weekdays">Weekdays only</option>
                <option value="no">No — cart required</option>
              </select>
            </div>
          </div>
        );

      case 'resident':
        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">Rates for verified town/county residents.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label text="Resident weekday rate" />
                <DollarInput value={draft.residentWeekday} onChange={v => set('residentWeekday', v)} placeholder="30.00" />
              </div>
              <div>
                <Label text="Resident weekend rate" />
                <DollarInput value={draft.residentWeekend} onChange={v => set('residentWeekend', v)} placeholder="45.00" />
              </div>
            </div>
            <div>
              <Label text="How is residency verified?" sub="(e.g. county ID, utility bill)" />
              <input className={inp} value={draft.residentVerification} onChange={e => set('residentVerification', e.target.value)} placeholder="County ID or utility bill" />
            </div>
          </div>
        );

      case 'tier':
        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">We&apos;ll create a starter membership tier on your course page.</p>
            <div>
              <Label text="Tier name" />
              <input className={inp} value={draft.starterTierName} onChange={e => set('starterTierName', e.target.value)} placeholder="Full Member" />
            </div>
            <div>
              <Label text="Annual membership fee" />
              <DollarInput value={draft.starterTierFee} onChange={v => set('starterTierFee', v)} placeholder="1,200.00" />
            </div>
          </div>
        );

      case 'member':
        return (
          <div className="space-y-4">
            <div>
              <Label text="Member advance booking window" />
              <div className="flex items-center gap-2">
                <input type="number" min="1" max="365" className={inp + ' w-24'} value={draft.memberAdvanceDays} onChange={e => set('memberAdvanceDays', e.target.value)} />
                <span className="text-sm text-ink-soft">days ahead</span>
              </div>
              <p className="text-[11px] text-ink-faint mt-1">Public booking window defaults to 7 days.</p>
            </div>
            <div>
              <Label text="Protected tee time windows" sub="(optional — e.g. weekday mornings before 11am)" />
              <textarea rows={2} className={inp} value={draft.protectedTimes} onChange={e => set('protectedTimes', e.target.value)} placeholder="e.g. Weekday mornings before 10am are reserved for members" />
            </div>
          </div>
        );

      case 'public_fees':
        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">Rates for non-member public tee times.</p>
            <div>
              <Label text="Public green fee" />
              <DollarInput value={draft.publicGreenFee} onChange={v => set('publicGreenFee', v)} placeholder="95.00" />
            </div>
            <div>
              <Label text="When can the public book?" sub="(optional)" />
              <input className={inp} value={draft.publicWindow} onChange={e => set('publicWindow', e.target.value)} placeholder="e.g. Afternoons after 1pm on weekdays" />
            </div>
          </div>
        );

      case 'member_rate':
        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">Members are charged per round when they book through GreenReserve.</p>
            <div>
              <Label text="Member rate per round" />
              <DollarInput value={draft.memberRate} onChange={v => set('memberRate', v)} placeholder="35.00" />
            </div>
          </div>
        );

      case 'outings':
        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">Tell us about your outside events so we can plan around them.</p>
            <div>
              <Label text="How often do you host outside outings or tournaments?" />
              <select className={sel} value={draft.outingsVolume} onChange={e => set('outingsVolume', e.target.value)}>
                <option value="">Select...</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="seasonally">A few times per season</option>
                <option value="rarely">Rarely (1–2 per year)</option>
              </select>
            </div>
          </div>
        );

      case 'cancellation':
        return (
          <div className="space-y-4">
            <div>
              <Label text="Cancellation window" />
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="168" className={inp + ' w-24'} value={draft.cancellationHours} onChange={e => set('cancellationHours', e.target.value)} />
                <span className="text-sm text-ink-soft">hours before tee time</span>
              </div>
            </div>
            <div>
              <Label text="Late cancellation fee" sub="(leave blank for no fee)" />
              <DollarInput value={draft.lateFee} onChange={v => set('lateFee', v)} placeholder="0.00" />
              {draft.lateFee && <p className="text-[11px] text-ink-faint mt-1">Golfers who cancel after the window will be charged this fee automatically.</p>}
            </div>
          </div>
        );

      case 'facilities':
        return (
          <div className="space-y-4">
            <div>
              <Label text="What do you have?" sub="(select all that apply)" />
              <div className="flex flex-wrap gap-2">
                {FACILITIES_LIST.map(f => (
                  <button key={f.id} type="button" onClick={() => toggleFacility(f.id)}
                    className={'px-3 py-2 rounded-md border text-sm transition-colors ' + (draft.facilities.includes(f.id) ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line text-ink hover:border-pine/40')}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label text="Restaurant / food service" />
              <select className={sel} value={draft.restaurantType} onChange={e => set('restaurantType', e.target.value)}>
                <option value="none">None</option>
                <option value="snack_bar">Snack bar</option>
                <option value="bar">Bar only</option>
                <option value="full">Full restaurant</option>
                <option value="beverage_cart">Beverage cart only</option>
              </select>
            </div>
          </div>
        );

      case 'about':
        return (
          <div className="space-y-4">
            <div>
              <Label text="Course website" sub="(optional)" />
              <input type="url" className={inp} value={draft.website} onChange={e => set('website', e.target.value)} placeholder="https://yourcourse.com" />
            </div>
            <div>
              <Label text="Course description" sub="(2–3 sentences — shown on your public booking page)" />
              <textarea rows={4} className={inp} value={draft.description} onChange={e => set('description', e.target.value)} placeholder="Describe your course — setting, character, what makes it unique." />
              <p className="text-[11px] text-ink-faint mt-1">{draft.description.length}/400 characters</p>
            </div>
          </div>
        );

      case 'notes':
        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">Anything else we should know? Timeline, software you&apos;re replacing, special setup — whatever&apos;s useful. This goes directly to our team.</p>
            <textarea rows={4} className={inp} value={draft.additionalNotes} onChange={e => set('additionalNotes', e.target.value)} placeholder="Optional" />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <div className="bg-pine px-6 py-8 text-center">
        <span className="text-[17px] font-serif font-medium tracking-tight text-white">Green<span className="text-paper/70">Reserve</span></span>
        <h1 className="text-white text-[20px] font-serif font-medium mt-3 mb-0.5 tracking-tight">Setup sheet — {courseName}</h1>
        <p className="text-white/50 text-sm">Takes about 5 minutes. Saves as you go.</p>
      </div>

      {/* Progress bar */}
      <div className="bg-pine/10 h-1">
        <div className="h-full bg-pine transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">
            Step {activeIdx + 1} of {sections.length}
          </p>
          <p className="text-[11px] text-ink-faint">{Math.round(progress)}% complete</p>
        </div>

        {/* Section card */}
        <div className="bg-white rounded-lg border border-line p-6 mb-5">
          <h2 className="text-[18px] font-serif font-medium tracking-tight text-ink mb-5">
            {section?.title}
          </h2>
          {section && renderSection(section.id)}
        </div>

        {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{error}</div>}

        {/* Navigation */}
        <div className="flex gap-3">
          {activeIdx > 0 && (
            <button onClick={goBack} className="flex items-center gap-1.5 px-5 py-3 border border-line text-ink-muted hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors">
              <ArrowLeft className="w-4 h-4" />Back
            </button>
          )}
          <button
            onClick={goNext}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : isLast ? 'Submit setup sheet' : (
              <>Next <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DetailsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <DetailsForm />
    </Suspense>
  );
}
