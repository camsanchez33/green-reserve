'use client';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, AlertTriangle, ChevronRight, ArrowLeft, Plus, Trash2, Upload, X } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const FACILITIES_LIST = [
  { id: 'range', label: 'Driving range', hint: 'e.g. grass tees, lights at night' },
  { id: 'putting_green', label: 'Putting green', hint: '' },
  { id: 'chipping_area', label: 'Chipping / short game area', hint: '' },
  { id: 'pro_shop', label: 'Pro shop', hint: '' },
  { id: 'lessons', label: 'Lessons / teaching pros', hint: 'e.g. 2 PGA pros on staff' },
  { id: 'club_rental', label: 'Club rental', hint: '' },
  { id: 'cart_rental', label: 'Push / pull cart rental', hint: '' },
  { id: 'bag_storage', label: 'Bag storage', hint: '' },
  { id: 'gps_carts', label: 'GPS carts', hint: '' },
  { id: 'caddies', label: 'Caddies', hint: 'e.g. available weekends, forecaddie program' },
  { id: 'event_space', label: 'Event / banquet space', hint: 'e.g. seats 150, outdoor terrace' },
  { id: 'locker_rooms', label: 'Locker rooms', hint: '' },
  { id: 'tournaments', label: 'Hosts tournaments / outings', hint: '' },
];

type TeeSetRow = { name: string; color: string; yardage: string; par: string; rating: string; slope: string; };
type MembershipTierRow = { name: string; fee: string; includes: string; perRound: string; perRoundFee: string; };

type Needs = {
  residentRates?: string; hasMemberships?: string;
  publicTeeTimes?: string; chargesMembersPerRound?: string; outsideOutings?: string;
};

type Draft = {
  holes: string; par: string; seasonOpen: string; seasonClose: string;
  nineHoleSupport: string; nineHoleWhich: string; nineHoleFee: string; nineHolePar: string;
  teeSets: TeeSetRow[];
  firstTeeTime: string; lastTeeTime: string; intervalMinutes: string; daysOpen: number[];
  greenFeeWeekday: string; greenFeeWeekend: string; cartFee: string; twilightFee: string; walkingAllowed: string;
  residentQualifies: string; residentWeekday: string; residentWeekend: string; residentTwilight: string; residentVerification: string;
  memberships: MembershipTierRow[];
  starterTierName: string; starterTierFee: string;
  memberAdvanceDays: string; protectedTimes: string;
  publicGreenFee: string; publicWindow: string;
  memberRate: string;
  outingsVolume: string;
  cancellationHours: string; lateFee: string;
  facilities: string[]; facilitiesNotes: Record<string, string>; restaurantType: string;
  website: string; description: string; photos: string[];
  additionalNotes: string;
};

const blankTeeSet = (): TeeSetRow => ({ name: '', color: '', yardage: '', par: '72', rating: '', slope: '' });
const blankTier = (): MembershipTierRow => ({ name: '', fee: '', includes: '', perRound: 'no', perRoundFee: '' });

const initDraft: Draft = {
  holes: '18', par: '72', seasonOpen: '', seasonClose: '',
  nineHoleSupport: 'no', nineHoleWhich: 'both', nineHoleFee: '', nineHolePar: '36',
  teeSets: [blankTeeSet()],
  firstTeeTime: '07:00', lastTeeTime: '17:00', intervalMinutes: '10', daysOpen: [],
  greenFeeWeekday: '', greenFeeWeekend: '', cartFee: '', twilightFee: '', walkingAllowed: 'yes',
  residentQualifies: '', residentWeekday: '', residentWeekend: '', residentTwilight: '', residentVerification: '',
  memberships: [blankTier()],
  starterTierName: '', starterTierFee: '',
  memberAdvanceDays: '14', protectedTimes: '',
  publicGreenFee: '', publicWindow: '',
  memberRate: '',
  outingsVolume: '',
  cancellationHours: '24', lateFee: '',
  facilities: [], facilitiesNotes: {}, restaurantType: 'none',
  website: '', description: '', photos: [],
  additionalNotes: '',
};

type SectionId = 'basics' | 'playability' | 'tee_sets' | 'schedule' | 'fees' | 'resident' | 'tier' | 'member' | 'public_fees' | 'member_rate' | 'outings' | 'cancellation' | 'facilities' | 'about' | 'notes';

function buildSections(courseType: string, needs: Needs): { id: SectionId; title: string }[] {
  const head: { id: SectionId; title: string }[] = [
    { id: 'basics', title: 'Course basics' },
    { id: 'playability', title: 'Playability' },
    { id: 'tee_sets', title: 'Tee sets & yardages' },
    { id: 'schedule', title: 'Tee sheet schedule' },
  ];
  const tail: { id: SectionId; title: string }[] = [
    { id: 'cancellation', title: 'Cancellation policy' },
    { id: 'facilities', title: 'Facilities' },
    { id: 'about', title: 'About your course' },
    { id: 'notes', title: 'Anything else' },
  ];

  if (courseType === 'private') {
    const mid: { id: SectionId; title: string }[] = [
      { id: 'fees', title: 'Green fees' },
      { id: 'member', title: 'Member booking' },
    ];
    if (needs.publicTeeTimes === 'yes_regularly' || needs.publicTeeTimes === 'limited') {
      mid.push({ id: 'public_fees', title: 'Public tee times' });
    }
    if (needs.chargesMembersPerRound === 'yes') mid.push({ id: 'member_rate', title: 'Member rate' });
    if (needs.outsideOutings === 'yes') mid.push({ id: 'outings', title: 'Outside outings' });
    return [...head, ...mid, ...tail];
  }

  const mid: { id: SectionId; title: string }[] = [{ id: 'fees', title: 'Green fees' }];
  if (needs.residentRates === 'yes') mid.push({ id: 'resident', title: 'Resident pricing' });
  if (needs.hasMemberships === 'yes') mid.push({ id: 'tier', title: 'Memberships' });
  return [...head, ...mid, ...tail];
}

const inp = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const sel = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v })), []);

  const toggleFacility = (id: string) => setDraft(d => ({
    ...d,
    facilities: d.facilities.includes(id) ? d.facilities.filter(f => f !== id) : [...d.facilities, id],
  }));

  const setFacilityNote = (id: string, note: string) => setDraft(d => ({
    ...d,
    facilitiesNotes: { ...d.facilitiesNotes, [id]: note },
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
        const teeSetsLoaded = Array.isArray(saved.teeSets) && saved.teeSets.length > 0 ? saved.teeSets : [blankTeeSet()];
        const membershipsLoaded = Array.isArray(saved.memberships) && saved.memberships.length > 0
          ? saved.memberships
          : (saved.starterTierName ? [{ name: saved.starterTierName, fee: saved.starterTierFee || '', includes: '', perRound: 'no', perRoundFee: '' }] : [blankTier()]);
        const facilitiesNotesLoaded = saved.facilitiesNotes && typeof saved.facilitiesNotes === 'object' ? saved.facilitiesNotes : {};
        const photosLoaded = Array.isArray(saved.photos) ? saved.photos : [];
        const daysOpenLoaded = Array.isArray(saved.daysOpen) ? saved.daysOpen : (Array.isArray(saved.schedule?.daysOfWeek) ? saved.schedule.daysOfWeek : []);
        setDraft(prev => ({ ...prev, ...saved, teeSets: teeSetsLoaded, memberships: membershipsLoaded, facilitiesNotes: facilitiesNotesLoaded, photos: photosLoaded, daysOpen: daysOpenLoaded }));
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
    if (id === 'tier') {
      const first = draft.memberships[0];
      if (!first || !first.name) return 'Please enter a membership tier name.';
    }
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
    } catch { /* silently continue */ }
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

  async function handlePhotoUpload(file: File) {
    const currentPhotos = draft.photos || [];
    if (currentPhotos.length >= 6) { setUploadError('Maximum 6 photos.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch(`/api/inquiries/upload?token=${encodeURIComponent(token)}`, {
        method: 'POST', body: form,
      });
      const d = await r.json();
      if (!r.ok) { setUploadError(d.error || 'Upload failed'); return; }
      const newPhotos = [...currentPhotos, d.url as string];
      setDraft(prev => ({ ...prev, photos: newPhotos }));
      saveDraft({ photos: newPhotos });
    } catch { setUploadError('Upload failed — try again'); }
    finally { setUploading(false); }
  }

  function removePhoto(url: string) {
    const newPhotos = (draft.photos || []).filter(p => p !== url);
    setDraft(prev => ({ ...prev, photos: newPhotos }));
    saveDraft({ photos: newPhotos });
  }

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

      case 'playability':
        return (
          <div className="space-y-4">
            <div>
              <Label text="Can golfers book 9 holes?" />
              <div className="flex gap-2">
                {(['no','yes'] as const).map(v => (
                  <button key={v} type="button" onClick={() => set('nineHoleSupport', v)}
                    className={'flex-1 py-2.5 rounded-md border text-sm transition-colors ' + (draft.nineHoleSupport === v ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line text-ink hover:border-pine/40')}>
                    {v === 'yes' ? 'Yes' : 'No — 18 holes only'}
                  </button>
                ))}
              </div>
            </div>
            {draft.nineHoleSupport === 'yes' && (
              <div className="space-y-4 pl-3 border-l-2 border-pine/20">
                <div>
                  <Label text="Which nine(s) can be booked?" />
                  <select className={sel} value={draft.nineHoleWhich} onChange={e => set('nineHoleWhich', e.target.value)}>
                    <option value="front">Front nine only</option>
                    <option value="back">Back nine only</option>
                    <option value="both">Either nine</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label text="9-hole par" />
                    <input type="number" className={inp} value={draft.nineHolePar} onChange={e => set('nineHolePar', e.target.value)} placeholder="36" />
                  </div>
                  <div>
                    <Label text="9-hole rate" sub="(set in Fees section)" />
                    <DollarInput value={draft.nineHoleFee} onChange={v => set('nineHoleFee', v)} placeholder="25.00" />
                  </div>
                </div>
                <p className="text-[11px] text-ink-faint">You can change 9-hole pricing anytime after launch.</p>
              </div>
            )}
          </div>
        );

      case 'tee_sets':
        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">Add all the tees you offer. This shows golfers distance info on your booking page. You can edit these anytime.</p>
            <div className="space-y-3">
              {draft.teeSets.map((ts, i) => (
                <div key={i} className="bg-paper border border-line rounded-md p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ink-muted">Tee {i + 1}</span>
                    {draft.teeSets.length > 1 && (
                      <button type="button" onClick={() => set('teeSets', draft.teeSets.filter((_, j) => j !== i))}
                        className="text-ink-faint hover:text-bad transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label text="Tee name / color" />
                      <input className={inp} value={ts.name} onChange={e => {
                        const t = [...draft.teeSets]; t[i] = { ...t[i], name: e.target.value }; set('teeSets', t);
                      }} placeholder="e.g. Blue, White, Red" />
                    </div>
                    <div>
                      <Label text="Total yardage" />
                      <input type="number" className={inp} value={ts.yardage} onChange={e => {
                        const t = [...draft.teeSets]; t[i] = { ...t[i], yardage: e.target.value }; set('teeSets', t);
                      }} placeholder="6,400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label text="Par" />
                      <input type="number" className={inp} value={ts.par} onChange={e => {
                        const t = [...draft.teeSets]; t[i] = { ...t[i], par: e.target.value }; set('teeSets', t);
                      }} placeholder="72" />
                    </div>
                    <div>
                      <Label text="Rating" sub="(opt.)" />
                      <input type="number" step="0.1" className={inp} value={ts.rating} onChange={e => {
                        const t = [...draft.teeSets]; t[i] = { ...t[i], rating: e.target.value }; set('teeSets', t);
                      }} placeholder="71.4" />
                    </div>
                    <div>
                      <Label text="Slope" sub="(opt.)" />
                      <input type="number" className={inp} value={ts.slope} onChange={e => {
                        const t = [...draft.teeSets]; t[i] = { ...t[i], slope: e.target.value }; set('teeSets', t);
                      }} placeholder="128" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {draft.teeSets.length < 6 && (
              <button type="button" onClick={() => set('teeSets', [...draft.teeSets, blankTeeSet()])}
                className="flex items-center gap-1.5 text-sm text-pine hover:text-pine-hover font-medium transition-colors">
                <Plus className="w-4 h-4" /> Add another tee set
              </button>
            )}
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
            <p className="text-[11px] text-ink-faint">You can change hours and days anytime after launch.</p>
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
            {draft.nineHoleSupport === 'yes' && (
              <div>
                <Label text="9-hole rate" sub="(optional)" />
                <DollarInput value={draft.nineHoleFee} onChange={v => set('nineHoleFee', v)} placeholder="25.00" />
              </div>
            )}
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
            <p className="text-[11px] text-ink-faint">You can adjust all pricing anytime after launch.</p>
          </div>
        );

      case 'resident':
        return (
          <div className="space-y-4">
            <div>
              <Label text="Who qualifies as a resident?" />
              <input className={inp} value={draft.residentQualifies} onChange={e => set('residentQualifies', e.target.value)} placeholder="e.g. Town of Westport residents, Fairfield County residents" />
            </div>
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
              <Label text="Resident twilight rate" sub="(optional)" />
              <DollarInput value={draft.residentTwilight} onChange={v => set('residentTwilight', v)} placeholder="20.00" />
            </div>
            <div>
              <Label text="How is residency verified?" sub="(e.g. county ID, utility bill)" />
              <input className={inp} value={draft.residentVerification} onChange={e => set('residentVerification', e.target.value)} placeholder="County ID or utility bill" />
            </div>
            <p className="text-[11px] text-ink-faint">These rates can be changed anytime after launch.</p>
          </div>
        );

      case 'tier':
        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">Add your membership tiers. We&apos;ll create these on your course page so golfers can sign up. You can add, edit, or remove tiers anytime.</p>
            <div className="space-y-4">
              {draft.memberships.map((m, i) => (
                <div key={i} className="bg-paper border border-line rounded-md p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">Tier {i + 1}</span>
                    {draft.memberships.length > 1 && (
                      <button type="button" onClick={() => set('memberships', draft.memberships.filter((_, j) => j !== i))}
                        className="text-ink-faint hover:text-bad transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label text="Tier name" />
                      <input className={inp} value={m.name} onChange={e => {
                        const t = [...draft.memberships]; t[i] = { ...t[i], name: e.target.value }; set('memberships', t);
                      }} placeholder="Full Member" />
                    </div>
                    <div>
                      <Label text="Annual fee" />
                      <DollarInput value={m.fee} onChange={v => {
                        const t = [...draft.memberships]; t[i] = { ...t[i], fee: v }; set('memberships', t);
                      }} placeholder="1,200.00" />
                    </div>
                  </div>
                  <div>
                    <Label text="What&apos;s included" sub="(brief description)" />
                    <textarea rows={2} className={inp} value={m.includes} onChange={e => {
                      const t = [...draft.memberships]; t[i] = { ...t[i], includes: e.target.value }; set('memberships', t);
                    }} placeholder="Unlimited rounds, range balls included, guest passes" />
                  </div>
                  <div>
                    <Label text="Do members pay a green fee per round?" />
                    <div className="flex gap-2">
                      {(['no','yes'] as const).map(v => (
                        <button key={v} type="button" onClick={() => {
                          const t = [...draft.memberships]; t[i] = { ...t[i], perRound: v }; set('memberships', t);
                        }}
                          className={'flex-1 py-2 rounded-md border text-sm transition-colors ' + (m.perRound === v ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line text-ink hover:border-pine/40')}>
                          {v === 'yes' ? 'Yes' : 'No — rounds are included'}
                        </button>
                      ))}
                    </div>
                    {m.perRound === 'yes' && (
                      <div className="mt-3">
                        <Label text="Per-round fee" />
                        <DollarInput value={m.perRoundFee} onChange={v => {
                          const t = [...draft.memberships]; t[i] = { ...t[i], perRoundFee: v }; set('memberships', t);
                        }} placeholder="25.00" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {draft.memberships.length < 5 && (
              <button type="button" onClick={() => set('memberships', [...draft.memberships, blankTier()])}
                className="flex items-center gap-1.5 text-sm text-pine hover:text-pine-hover font-medium transition-colors">
                <Plus className="w-4 h-4" /> Add another tier
              </button>
            )}
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
              <Label text="Protected tee time windows" sub="(optional)" />
              <textarea rows={2} className={inp} value={draft.protectedTimes} onChange={e => set('protectedTimes', e.target.value)} placeholder="e.g. Weekday mornings before 10am are reserved for members" />
            </div>
            <p className="text-[11px] text-ink-faint">These can be adjusted anytime after launch.</p>
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
            <p className="text-[11px] text-ink-faint">You can adjust public access anytime after launch.</p>
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
            <p className="text-[11px] text-ink-faint">You can change this rate anytime after launch.</p>
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
          <div className="space-y-5">
            <div className="bg-pine/5 border border-pine/20 rounded-md p-4 space-y-2 text-sm text-ink-soft leading-relaxed">
              <p className="font-medium text-ink text-[13px]">How cancellations work on GreenReserve</p>
              <p>When a golfer books, we save their card but don&apos;t charge it. Nothing is due at booking.</p>
              <p>If they cancel <em>before</em> your window — the cancellation is free, no fee is charged.</p>
              <p>If they cancel <em>after</em> your window — your late fee is automatically charged to their saved card. No chasing needed.</p>
              <p>If the late-cancelled golfer still shows up and checks in — the fee is refunded at that point.</p>
            </div>
            <div>
              <Label text="Free cancellation window" />
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="168" className={inp + ' w-24'} value={draft.cancellationHours} onChange={e => set('cancellationHours', e.target.value)} />
                <span className="text-sm text-ink-soft">hours before tee time</span>
              </div>
              <p className="text-[11px] text-ink-faint mt-1">e.g. 24 means golfers can cancel up to 24 hours before their tee time for free.</p>
            </div>
            <div>
              <Label text="Late cancellation fee" sub="(leave blank for no fee)" />
              <DollarInput value={draft.lateFee} onChange={v => set('lateFee', v)} placeholder="0.00" />
              {draft.lateFee && <p className="text-[11px] text-ink-faint mt-1">Golfers who cancel after the window will be charged ${draft.lateFee} automatically.</p>}
            </div>
            <p className="text-[11px] text-ink-faint">The cancellation window and fee can be changed anytime after launch.</p>
          </div>
        );

      case 'facilities': {
        const checkedFacilities = draft.facilities || [];
        return (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label text="What do you have?" sub="(check all that apply)" />
              {FACILITIES_LIST.map(f => {
                const checked = checkedFacilities.includes(f.id);
                return (
                  <div key={f.id} className="space-y-1">
                    <button type="button" onClick={() => toggleFacility(f.id)}
                      className={'w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-sm text-left transition-colors ' + (checked ? 'border-pine bg-pine/5 text-pine' : 'border-line text-ink hover:border-pine/40')}>
                      <div className={'w-4 h-4 rounded border flex items-center justify-center shrink-0 ' + (checked ? 'bg-pine border-pine' : 'border-line-strong')}>
                        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className={checked ? 'font-medium' : ''}>{f.label}</span>
                    </button>
                    {checked && (
                      <input
                        className={inp + ' text-xs mt-0.5'}
                        value={draft.facilitiesNotes[f.id] || ''}
                        onChange={e => setFacilityNote(f.id, e.target.value)}
                        placeholder={f.hint || 'Add a note (optional)'}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div>
              <Label text="Restaurant / food service" />
              <select className={sel} value={draft.restaurantType} onChange={e => set('restaurantType', e.target.value)}>
                <option value="none">None</option>
                <option value="beverage_cart">Beverage cart only</option>
                <option value="snack_bar">Snack bar</option>
                <option value="bar">Bar only</option>
                <option value="full">Full restaurant</option>
              </select>
            </div>
          </div>
        );
      }

      case 'about':
        return (
          <div className="space-y-5">
            <div>
              <Label text="Course website" sub="(optional)" />
              <input type="url" className={inp} value={draft.website} onChange={e => set('website', e.target.value)} placeholder="https://yourcourse.com" />
            </div>
            <div>
              <Label text="Course description" sub="(2–3 sentences — shown on your booking page)" />
              <textarea rows={4} className={inp} value={draft.description} onChange={e => set('description', e.target.value)} placeholder="Describe your course — setting, character, what makes it unique." />
              <p className="text-[11px] text-ink-faint mt-1">{draft.description.length}/400 characters</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label text={`Photos (${(draft.photos || []).length}/6)`} sub="(hero, clubhouse, signature holes)" />
              </div>
              {(draft.photos || []).length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {(draft.photos || []).map((url, i) => (
                    <div key={i} className="relative group aspect-video rounded-md overflow-hidden border border-line bg-paper">
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removePhoto(url)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(draft.photos || []).length < 6 && (
                <>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ''; }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="flex items-center gap-2 px-4 py-2.5 border border-line rounded-md text-sm text-ink-muted hover:border-pine/40 hover:text-ink transition-colors disabled:opacity-50">
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Uploading...' : 'Upload a photo'}
                  </button>
                  <p className="text-[11px] text-ink-faint mt-1">JPEG, PNG, or WebP · max 5MB each · up to 6 photos</p>
                  {uploadError && <p className="text-[11px] text-bad mt-1">{uploadError}</p>}
                </>
              )}
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
      <div className="bg-pine px-6 py-8 text-center">
        <span className="text-[17px] font-serif font-medium tracking-tight text-white">Green<span className="text-paper/70">Reserve</span></span>
        <h1 className="text-white text-[20px] font-serif font-medium mt-3 mb-0.5 tracking-tight">Setup sheet — {courseName}</h1>
        <p className="text-white/50 text-sm">Takes 10–15 minutes. Saves as you go.</p>
      </div>

      <div className="bg-pine/10 h-1">
        <div className="h-full bg-pine transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">
            Step {activeIdx + 1} of {sections.length}
          </p>
          <p className="text-[11px] text-ink-faint">{Math.round(progress)}% complete</p>
        </div>

        <div className="bg-white rounded-lg border border-line p-6 mb-5">
          <h2 className="text-[18px] font-serif font-medium tracking-tight text-ink mb-5">
            {section?.title}
          </h2>
          {section && renderSection(section.id)}
        </div>

        {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{error}</div>}

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
