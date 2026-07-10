'use client';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, AlertTriangle, ChevronRight, ArrowLeft, Plus, Trash2, Upload, X } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const TEE_DESIGNATIONS = ['championship','back','middle','forward','senior','junior','combo'];

type TeeSetRow = {
  name: string; color: string; yardage: string; par: string; rating: string; slope: string;
  designation: string; note: string;
  frontYardage: string; backYardage: string;
  nineYardages: Record<string, string>;
  comboRatings: Record<string, { rating: string; slope: string }>;
  womensPar: string; womensRating: string; womensSlope: string;
};

type PassTier = {
  type: string; // 'membership' | 'season_pass' | 'resident_card' | 'resident_rate' | 'punch_card' | 'other'
  otherType: string;
  name: string; fee: string; feePeriod: string; includes: string;
  perRound: string; perRoundFee: string;
  perRoundType: string; // 'discount' | 'separate'
  perRoundWeekday: string; perRoundWeekend: string; perRoundTwilight: string; perRoundCartIncluded: string;
  residentWho: string; residentVerifType: string; residentVerification?: string;
  residentCardCost: string; residentCardWhere: string; residentCardRenewal: string;
  residentWeekday: string; residentWeekend: string; residentTwilight: string;
};

type Needs = {
  residentRates?: string; hasMemberships?: string;
  publicTeeTimes?: string; chargesMembersPerRound?: string; outsideOutings?: string;
};

type Draft = {
  holes: string; par: string; seasonOpen: string; seasonClose: string;
  // 9-hole-course replay
  nineReplay: string; nineReplayFee: string;
  // 18-hole 9-hole booking
  nineHoleSupport: string; nineHoleWhich: string; nineHoleFee: string; nineHolePar: string;
  // 27-hole layout
  layout27: string; nine27Names: string[];
  nine27Combos: string; // legacy free-text (kept for read compat)
  nine27CombosEnabled: string[]; nine27ComboNotes: Record<string, string>;
  nine27ParsPerNine: Record<string, string>;
  nine27BookableAlone: string;
  separate9Name: string; separate9Par: string; separate9Bookable: string; separate9Fee: string;
  // 36-hole layout
  layout36: string; course36Names: string[]; course36LayoutDesc: string;
  course36ParsPerCourse: Record<string, string>;
  // tee sets
  teeSets: TeeSetRow[];
  firstTeeTime: string; lastTeeTime: string; intervalMinutes: string; daysOpen: number[];
  greenFeeWeekday: string; greenFeeWeekend: string; cartFee: string; twilightFee: string; walkingAllowed: string;
  // unified passes (V3c)
  passes: PassTier[];
  // legacy resident fields (kept for backward compat reads)
  residentQualifies: string; residentWeekday: string; residentWeekend: string; residentTwilight: string; residentVerification: string;
  // legacy membership fields
  memberships: { name: string; fee: string; includes: string; perRound: string; perRoundFee: string; }[];
  starterTierName: string; starterTierFee: string;
  memberAdvanceDays: string; protectedTimes: string;
  publicGreenFee: string; publicWindow: string;
  memberRate: string;
  outingsVolume: string;
  cancellationPolicy: string; // 'yes' | 'no'
  cancellationHours: string; lateFee: string;
  facilitiesV2: FacilitiesV2;
  // legacy
  facilities: string[]; facilitiesNotes: Record<string, string>; restaurantType: string;
  website: string; description: string; photos: string[];
  additionalNotes: string;
};

type BucketRow = { label: string; price: string; balls: string; };

type FacilitiesV2 = {
  range: boolean; rangeBuckets: BucketRow[]; rangeTeeType: string;
  puttingGreen: boolean; chippingArea: boolean; proShop: boolean; proShopPhone: string;
  lessons: boolean; lessonsProName: string; lessonsProPhone: string;
  clubRental: boolean; clubRentalMethods: string[]; clubRentalPhone: string;
  clubRentalContact: string; // legacy
  cartRental: boolean; cartRentalCost: string;
  bagStorage: boolean;
  gpsCarts: boolean;
  eventSpace: boolean; eventSpaceContact: string;
  lockerRooms: boolean;
  tournaments: boolean; tournamentsFrequency: string;
  restaurantType: string;
};

const blankBucket = (): BucketRow => ({ label: 'Small', price: '', balls: '' });

const initFacilitiesV2 = (): FacilitiesV2 => ({
  range: false, rangeBuckets: [blankBucket()], rangeTeeType: 'grass',
  puttingGreen: false, chippingArea: false, proShop: false, proShopPhone: '',
  lessons: false, lessonsProName: '', lessonsProPhone: '',
  clubRental: false, clubRentalMethods: [], clubRentalPhone: '', clubRentalContact: '',
  cartRental: false, cartRentalCost: '',
  bagStorage: false,
  gpsCarts: false,
  eventSpace: false, eventSpaceContact: '',
  lockerRooms: false,
  tournaments: false, tournamentsFrequency: '',
  restaurantType: 'none',
});

const blankTeeSet = (): TeeSetRow => ({
  name: '', color: '', yardage: '', par: '72', rating: '', slope: '',
  designation: '', note: '',
  frontYardage: '', backYardage: '',
  nineYardages: {},
  comboRatings: {},
  womensPar: '', womensRating: '', womensSlope: '',
});

const blankPass = (): PassTier => ({
  type: 'membership', otherType: '',
  name: '', fee: '', feePeriod: 'annual', includes: '',
  perRound: 'no', perRoundFee: '',
  perRoundType: 'discount', perRoundWeekday: '', perRoundWeekend: '', perRoundTwilight: '', perRoundCartIncluded: 'no',
  residentWho: '', residentVerifType: 'free',
  residentCardCost: '', residentCardWhere: '', residentCardRenewal: '',
  residentWeekday: '', residentWeekend: '', residentTwilight: '',
});

const initDraft: Draft = {
  holes: '18', par: '72', seasonOpen: '', seasonClose: '',
  nineReplay: 'no', nineReplayFee: '',
  nineHoleSupport: 'no', nineHoleWhich: 'both', nineHoleFee: '', nineHolePar: '36',
  layout27: 'three_9s', nine27Names: ['', '', ''],
  nine27Combos: '', nine27CombosEnabled: [], nine27ComboNotes: {}, nine27ParsPerNine: {},
  nine27BookableAlone: 'no',
  separate9Name: '', separate9Par: '36', separate9Bookable: 'no', separate9Fee: '',
  layout36: 'two_18s', course36Names: ['', ''], course36LayoutDesc: '', course36ParsPerCourse: {},
  teeSets: [blankTeeSet()],
  firstTeeTime: '07:00', lastTeeTime: '17:00', intervalMinutes: '10', daysOpen: [],
  greenFeeWeekday: '', greenFeeWeekend: '', cartFee: '', twilightFee: '', walkingAllowed: 'yes',
  passes: [blankPass()],
  residentQualifies: '', residentWeekday: '', residentWeekend: '', residentTwilight: '', residentVerification: '',
  memberships: [],
  starterTierName: '', starterTierFee: '',
  memberAdvanceDays: '14', protectedTimes: '',
  publicGreenFee: '', publicWindow: '',
  memberRate: '',
  outingsVolume: '',
  cancellationPolicy: '', cancellationHours: '24', lateFee: '',
  facilitiesV2: initFacilitiesV2(),
  facilities: [], facilitiesNotes: {}, restaurantType: 'none',
  website: '', description: '', photos: [],
  additionalNotes: '',
};

type SectionId = 'basics' | 'playability' | 'tee_sets' | 'schedule' | 'fees' | 'passes' | 'member' | 'public_fees' | 'member_rate' | 'outings' | 'cancellation' | 'facilities' | 'about' | 'notes';

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
  if (needs.residentRates === 'yes' || needs.hasMemberships === 'yes') {
    mid.push({ id: 'passes', title: 'Memberships & passes' });
  }
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

// type="text" inputMode="decimal" avoids React controlled type="number" bug where
// the browser silently drops keystrokes when the partially-typed value (e.g. "1.")
// fails internal step/min validation before onChange fires.
function DollarInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm pointer-events-none">$</span>
      <input
        type="text" inputMode="decimal" pattern="[0-9]*[.]?[0-9]*"
        value={value}
        onChange={e => {
          const raw = e.target.value.replace(/[^0-9.]/g, '');
          // allow at most one decimal point
          const parts = raw.split('.');
          const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : raw;
          onChange(sanitized);
        }}
        className={inp + ' pl-7'} placeholder={placeholder || '0.00'}
      />
    </div>
  );
}

function YesNo({ value, onChange, yesLabel, noLabel }: { value: string; onChange: (v: string) => void; yesLabel?: string; noLabel?: string }) {
  return (
    <div className="flex gap-2">
      {(['yes','no'] as const).map(v => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={'flex-1 py-2.5 rounded-md border text-sm transition-colors ' + (value === v ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line text-ink hover:border-pine/40')}>
          {v === 'yes' ? (yesLabel || 'Yes') : (noLabel || 'No')}
        </button>
      ))}
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
  const [teeWomensOpen, setTeeWomensOpen] = useState<Record<number, boolean>>({});

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v })), []);

  const setFv2 = useCallback((update: Partial<FacilitiesV2>) => {
    setDraft(d => ({ ...d, facilitiesV2: { ...d.facilitiesV2, ...update } }));
  }, []);

  const toggleDay = (day: number) => setDraft(d => ({
    ...d,
    daysOpen: d.daysOpen.includes(day) ? d.daysOpen.filter(x => x !== day) : [...d.daysOpen, day],
  }));

  const updateTeeSet = (i: number, update: Partial<TeeSetRow>) => {
    setDraft(d => {
      const t = [...d.teeSets];
      t[i] = { ...t[i], ...update };
      return { ...d, teeSets: t };
    });
  };

  const updatePass = (i: number, update: Partial<PassTier>) => {
    setDraft(d => {
      const p = [...d.passes];
      p[i] = { ...p[i], ...update };
      return { ...d, passes: p };
    });
  };

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

        // Migrate old teeSets
        const teeSetsLoaded = (Array.isArray(saved.teeSets) && saved.teeSets.length > 0
          ? saved.teeSets.map((t: Partial<TeeSetRow>) => ({ ...blankTeeSet(), ...t }))
          : [blankTeeSet()]);

        // Migrate old memberships → passes
        let passesLoaded: PassTier[] = Array.isArray(saved.passes) && saved.passes.length > 0
          ? saved.passes.map((p: Partial<PassTier>) => ({
              ...blankPass(), ...p,
              // Ensure fee is always stored as a string (guard against legacy number values)
              fee: p.fee !== undefined && p.fee !== null ? String(p.fee) : '',
              perRoundFee: p.perRoundFee !== undefined && p.perRoundFee !== null ? String(p.perRoundFee) : '',
            }))
          : [];
        if (passesLoaded.length === 0) {
          // Migrate old memberships
          if (Array.isArray(saved.memberships) && saved.memberships.length > 0) {
            passesLoaded = saved.memberships.map((m: { name?: string; fee?: string; includes?: string; perRound?: string; perRoundFee?: string }) => ({
              ...blankPass(), type: 'membership',
              name: m.name || '', fee: m.fee || '', includes: m.includes || '',
              perRound: m.perRound || 'no', perRoundFee: m.perRoundFee || '',
            }));
          }
          // Migrate old resident fields
          if (saved.residentWeekday || saved.residentWeekend) {
            passesLoaded.push({
              ...blankPass(), type: 'resident_rate',
              residentWho: saved.residentQualifies || '',
              residentWeekday: saved.residentWeekday || '',
              residentWeekend: saved.residentWeekend || '',
              residentTwilight: saved.residentTwilight || '',
              residentVerification: saved.residentVerification || '',
            } as PassTier);
          }
          if (passesLoaded.length === 0) passesLoaded = [blankPass()];
        }

        const fv2raw = (saved.facilitiesV2 && typeof saved.facilitiesV2 === 'object')
          ? { ...initFacilitiesV2(), ...saved.facilitiesV2 }
          : initFacilitiesV2();
        // Migrate legacy clubRentalContact string to clubRentalMethods array
        const fv2 = fv2raw.clubRentalMethods && fv2raw.clubRentalMethods.length > 0
          ? fv2raw
          : fv2raw.clubRentalContact
            ? { ...fv2raw, clubRentalMethods: [fv2raw.clubRentalContact as string] }
            : fv2raw;

        const photosLoaded = Array.isArray(saved.photos) ? saved.photos : [];
        const daysOpenLoaded = Array.isArray(saved.daysOpen) ? saved.daysOpen
          : (Array.isArray(saved.schedule?.daysOfWeek) ? saved.schedule.daysOfWeek : []);

        const nine27NamesLoaded = Array.isArray(saved.nine27Names) && saved.nine27Names.length === 3
          ? saved.nine27Names : ['', '', ''];
        const course36NamesLoaded = Array.isArray(saved.course36Names) && saved.course36Names.length === 2
          ? saved.course36Names : ['', ''];

        setDraft(prev => ({
          ...prev, ...saved,
          teeSets: teeSetsLoaded, passes: passesLoaded,
          facilitiesV2: fv2, photos: photosLoaded, daysOpen: daysOpenLoaded,
          nine27Names: nine27NamesLoaded, course36Names: course36NamesLoaded,
          nine27CombosEnabled: Array.isArray(saved.nine27CombosEnabled) ? saved.nine27CombosEnabled : [],
          nine27ComboNotes: (saved.nine27ComboNotes && typeof saved.nine27ComboNotes === 'object') ? saved.nine27ComboNotes : {},
          nine27ParsPerNine: (saved.nine27ParsPerNine && typeof saved.nine27ParsPerNine === 'object') ? saved.nine27ParsPerNine : {},
          course36ParsPerCourse: (saved.course36ParsPerCourse && typeof saved.course36ParsPerCourse === 'object') ? saved.course36ParsPerCourse : {},
        }));
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const filled = (v: unknown) => v !== '' && v !== null && v !== undefined;

  const validateSection = (id: SectionId): string => {
    if (id === 'fees') {
      if (!filled(draft.greenFeeWeekday)) return 'Please enter weekday green fee.';
      if (!filled(draft.greenFeeWeekend)) return 'Please enter weekend green fee.';
    }
    if (id === 'public_fees' && !filled(draft.publicGreenFee)) return 'Please enter the public green fee.';
    if (id === 'member_rate' && !filled(draft.memberRate)) return 'Please enter the member rate.';
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

  // Helper: get the names of the nine(s) based on current layout
  const getNineNames = (): string[] => {
    if (draft.holes === '27') {
      if (draft.layout27 === 'three_9s') return draft.nine27Names.filter(n => n.trim());
      return [draft.separate9Name || 'Separate 9'].filter(Boolean);
    }
    return ['Front', 'Back'];
  };

  const renderSection = (id: SectionId) => {
    switch (id) {
      case 'basics': {
        const parHidden = draft.holes === '27' || draft.holes === '36';
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label text="Number of holes" />
                <select className={sel} value={draft.holes} onChange={e => set('holes', e.target.value)}>
                  {['9','18','27','36'].map(h => <option key={h} value={h}>{h} holes</option>)}
                </select>
              </div>
              {parHidden ? (
                <div className="flex items-end pb-1.5">
                  <p className="text-[11px] text-ink-faint leading-snug">Par is set per nine in the Playability step.</p>
                </div>
              ) : (
                <div>
                  <Label text="Overall par" />
                  <input type="number" className={inp} value={draft.par} onChange={e => set('par', e.target.value)} placeholder="72" />
                </div>
              )}
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
      }

      case 'playability': {
        const h = draft.holes;

        // 9-hole course
        if (h === '9') return (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">Since you have a 9-hole course, golfers can always book that single loop. We just need to know about replaying.</p>
            <div>
              <Label text="Can golfers replay for a full 18?" />
              <YesNo value={draft.nineReplay} onChange={v => set('nineReplay', v)} />
            </div>
            {draft.nineReplay === 'yes' && (
              <div className="pl-3 border-l-2 border-pine/20 space-y-3">
                <div>
                  <Label text="18-hole (replay) rate" sub="(optional — leave blank if same as 2× the 9-hole rate)" />
                  <DollarInput value={draft.nineReplayFee} onChange={v => set('nineReplayFee', v)} placeholder="0.00" />
                </div>
                <p className="text-[11px] text-ink-faint">You can change this anytime after launch.</p>
              </div>
            )}
          </div>
        );

        // 27-hole course
        if (h === '27') return (
          <div className="space-y-4">
            <div>
              <Label text="Layout" />
              <div className="flex gap-2">
                {[
                  { v: 'three_9s', label: 'Three separate 9s' },
                  { v: '18_plus_9', label: 'One 18 + one 9' },
                ].map(({ v, label }) => (
                  <button key={v} type="button" onClick={() => set('layout27', v)}
                    className={'flex-1 py-2.5 rounded-md border text-sm transition-colors ' + (draft.layout27 === v ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line text-ink hover:border-pine/40')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {draft.layout27 === 'three_9s' && (() => {
              const validNines = draft.nine27Names.filter(n => n.trim());
              const comboPairs = validNines.length >= 2
                ? [[0, 1], [0, 2], [1, 2]]
                    .filter(([a, b]) => a < validNines.length && b < validNines.length)
                    .map(([a, b]) => ({ key: `${validNines[a]}+${validNines[b]}`, label: `${validNines[a]} + ${validNines[b]}` }))
                : [];
              return (
                <div className="space-y-4 pl-3 border-l-2 border-pine/20">
                  <div>
                    <Label text="Name your three nines" />
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 1, 2].map(ni => (
                        <input key={ni} className={inp} value={draft.nine27Names[ni] || ''} onChange={e => {
                          const names = [...draft.nine27Names]; names[ni] = e.target.value; set('nine27Names', names);
                        }} placeholder={['North','South','West'][ni]} />
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-faint mt-1">e.g. North / South / West, or Lakes / Pines / Meadows</p>
                  </div>
                  {validNines.length >= 2 && (
                    <>
                      <div>
                        <Label text="Par per nine" />
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${validNines.length}, 1fr)` }}>
                          {validNines.map(nineName => (
                            <div key={nineName}>
                              <p className="text-[11px] text-ink-faint mb-1">{nineName}</p>
                              <input type="number" className={inp} value={draft.nine27ParsPerNine[nineName] || ''}
                                onChange={e => set('nine27ParsPerNine', { ...draft.nine27ParsPerNine, [nineName]: e.target.value })}
                                placeholder="36" />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label text="Which 18-hole combos do you offer?" />
                        <p className="text-[11px] text-ink-faint mb-2">Turn on the pairings you actually play as 18.</p>
                        <div className="space-y-2">
                          {comboPairs.map(({ key, label }) => {
                            const enabled = draft.nine27CombosEnabled.includes(key);
                            return (
                              <div key={key}>
                                <button type="button" onClick={() => {
                                  const next = enabled
                                    ? draft.nine27CombosEnabled.filter(k => k !== key)
                                    : [...draft.nine27CombosEnabled, key];
                                  set('nine27CombosEnabled', next);
                                }}
                                  className={'flex items-center gap-3 px-3 py-2.5 rounded-md border text-sm text-left w-full transition-colors ' +
                                    (enabled ? 'border-pine bg-pine/5 text-pine' : 'border-line text-ink hover:border-pine/40')}>
                                  <div className={'w-4 h-4 rounded border flex items-center justify-center shrink-0 ' + (enabled ? 'bg-pine border-pine' : 'border-line-strong')}>
                                    {enabled && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                  <span className={enabled ? 'font-medium' : ''}>{label}</span>
                                </button>
                                {enabled && (
                                  <div className="mt-1.5 pl-4 border-l-2 border-pine/20">
                                    <input className={inp} value={draft.nine27ComboNotes[key] || ''}
                                      onChange={e => set('nine27ComboNotes', { ...draft.nine27ComboNotes, [key]: e.target.value })}
                                      placeholder="Optional note — e.g. Mornings only" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                  <div>
                    <Label text="Can each nine be booked individually?" />
                    <YesNo value={draft.nine27BookableAlone} onChange={v => set('nine27BookableAlone', v)} />
                    {draft.nine27BookableAlone === 'yes' && (
                      <p className="text-[11px] text-ink-faint mt-1">We&apos;ll note that for our team. Booking-sheet support for rotating nine combos is a future feature — flagged as a build note.</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {draft.layout27 === '18_plus_9' && (
              <div className="space-y-4 pl-3 border-l-2 border-pine/20">
                <p className="text-sm text-ink-muted">The main 18-hole course works like any 18-hole setup. Tell us about the separate 9 below.</p>
                <div>
                  <Label text="Can golfers book 9 holes on the main course?" />
                  <YesNo value={draft.nineHoleSupport} onChange={v => set('nineHoleSupport', v)} />
                </div>
                {draft.nineHoleSupport === 'yes' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label text="Which nine?" />
                      <select className={sel} value={draft.nineHoleWhich} onChange={e => set('nineHoleWhich', e.target.value)}>
                        <option value="front">Front only</option>
                        <option value="back">Back only</option>
                        <option value="both">Either nine</option>
                      </select>
                    </div>
                    <div>
                      <Label text="9-hole par" />
                      <input type="number" className={inp} value={draft.nineHolePar} onChange={e => set('nineHolePar', e.target.value)} placeholder="36" />
                    </div>
                  </div>
                )}
                <div className="border-t border-line pt-3">
                  <Label text="Separate 9 — name" />
                  <input className={inp} value={draft.separate9Name} onChange={e => set('separate9Name', e.target.value)} placeholder="e.g. Executive 9, Short Course" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label text="Par" />
                    <input type="number" className={inp} value={draft.separate9Par} onChange={e => set('separate9Par', e.target.value)} placeholder="36" />
                  </div>
                  <div>
                    <Label text="Rate" sub="(opt.)" />
                    <DollarInput value={draft.separate9Fee} onChange={v => set('separate9Fee', v)} placeholder="25.00" />
                  </div>
                </div>
                <div>
                  <Label text="Can the separate 9 be booked individually?" />
                  <YesNo value={draft.separate9Bookable} onChange={v => set('separate9Bookable', v)} />
                </div>
                <p className="text-[11px] text-ink-faint">You can change rates anytime after launch.</p>
              </div>
            )}
          </div>
        );

        // 36-hole course
        if (h === '36') return (
          <div className="space-y-4">
            <div>
              <Label text="Layout" />
              <div className="flex gap-2">
                {[
                  { v: 'two_18s', label: 'Two full 18-hole courses' },
                  { v: 'other', label: 'Other' },
                ].map(({ v, label }) => (
                  <button key={v} type="button" onClick={() => set('layout36', v)}
                    className={'flex-1 py-2.5 rounded-md border text-sm transition-colors ' + (draft.layout36 === v ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line text-ink hover:border-pine/40')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {draft.layout36 === 'two_18s' && (() => {
              const validCourses = draft.course36Names.filter(n => n.trim());
              return (
                <div className="space-y-3 pl-3 border-l-2 border-pine/20">
                  <Label text="Name your two courses" />
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1].map(ni => (
                      <input key={ni} className={inp} value={draft.course36Names[ni] || ''} onChange={e => {
                        const names = [...draft.course36Names]; names[ni] = e.target.value; set('course36Names', names);
                      }} placeholder={['North Course','South Course'][ni]} />
                    ))}
                  </div>
                  {validCourses.length >= 2 && (
                    <div>
                      <Label text="Par per course" />
                      <div className="grid grid-cols-2 gap-3">
                        {validCourses.map(cName => (
                          <div key={cName}>
                            <p className="text-[11px] text-ink-faint mb-1">{cName}</p>
                            <input type="number" className={inp} value={draft.course36ParsPerCourse[cName] || ''}
                              onChange={e => set('course36ParsPerCourse', { ...draft.course36ParsPerCourse, [cName]: e.target.value })}
                              placeholder="72" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-ink-faint">Each 18 gets its own front/back nine tee-set yardages in the next step.</p>
                </div>
              );
            })()}
            {draft.layout36 === 'other' && (
              <div className="pl-3 border-l-2 border-pine/20">
                <Label text="Describe your layout" />
                <textarea rows={3} className={inp} value={draft.course36LayoutDesc} onChange={e => set('course36LayoutDesc', e.target.value)} placeholder="e.g. Championship 18 + par-3 9 + additional 9" />
              </div>
            )}
            <div>
              <Label text="Can golfers book 9 holes?" />
              <YesNo value={draft.nineHoleSupport} onChange={v => set('nineHoleSupport', v)} />
            </div>
            {draft.nineHoleSupport === 'yes' && (
              <div className="pl-3 border-l-2 border-pine/20 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label text="9-hole par" />
                    <input type="number" className={inp} value={draft.nineHolePar} onChange={e => set('nineHolePar', e.target.value)} placeholder="36" />
                  </div>
                  <div>
                    <Label text="9-hole rate" sub="(opt.)" />
                    <DollarInput value={draft.nineHoleFee} onChange={v => set('nineHoleFee', v)} placeholder="25.00" />
                  </div>
                </div>
              </div>
            )}
            <p className="text-[11px] text-ink-faint">You can change rates anytime after launch.</p>
          </div>
        );

        // 18-hole (default)
        return (
          <div className="space-y-4">
            <div>
              <Label text="Can golfers book 9 holes?" />
              <YesNo value={draft.nineHoleSupport} onChange={v => set('nineHoleSupport', v)}
                noLabel="No — 18 holes only" />
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
                    <Label text="9-hole rate" sub="(in Fees too)" />
                    <DollarInput value={draft.nineHoleFee} onChange={v => set('nineHoleFee', v)} placeholder="25.00" />
                  </div>
                </div>
                <p className="text-[11px] text-ink-faint">You can change 9-hole pricing anytime after launch.</p>
              </div>
            )}
          </div>
        );
      }

      case 'tee_sets': {
        const h = draft.holes;
        const is27Three9s = h === '27' && draft.layout27 === 'three_9s';
        const is36Two18s = h === '36' && draft.layout36 === 'two_18s';

        const nineNamesFor27 = draft.nine27Names.filter(n => n.trim()) as string[];
        const courseNamesFor36 = draft.course36Names.filter(n => n.trim()) as string[];

        const descLabel = is27Three9s
          ? 'Add one row per tee set. For each tee, enter yardage per nine.'
          : is36Two18s
          ? 'Add one row per tee set. Enter total yardage and, if you have it, per-course splits.'
          : 'Add all tees you offer. You can edit these anytime after launch.';

        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">{descLabel}</p>
            <div className="space-y-4">
              {draft.teeSets.map((ts, i) => (
                <div key={i} className="bg-paper border border-line rounded-md p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">Tee {i + 1}</span>
                    {draft.teeSets.length > 1 && (
                      <button type="button" onClick={() => set('teeSets', draft.teeSets.filter((_, j) => j !== i))}
                        className="text-ink-faint hover:text-bad transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Name + designation */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label text="Tee name / color" />
                      <input className={inp} value={ts.name} onChange={e => updateTeeSet(i, { name: e.target.value })} placeholder="e.g. Blue, White, Red" />
                    </div>
                    <div>
                      <Label text="Designation" sub="(opt.)" />
                      <select className={sel} value={ts.designation} onChange={e => updateTeeSet(i, { designation: e.target.value })}>
                        <option value="">— select —</option>
                        {TEE_DESIGNATIONS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Yardage — conditional on layout */}
                  {is27Three9s && nineNamesFor27.length > 0 ? (
                    <div>
                      <Label text="Yardage per nine" />
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(nineNamesFor27.length, 3)}, 1fr)` }}>
                        {nineNamesFor27.map(name => (
                          <div key={name}>
                            <p className="text-[11px] text-ink-faint mb-1">{name}</p>
                            <input type="number" className={inp} value={ts.nineYardages[name] || ''} onChange={e => {
                              const ny = { ...ts.nineYardages, [name]: e.target.value };
                              updateTeeSet(i, { nineYardages: ny });
                            }} placeholder="3,200" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : is36Two18s && courseNamesFor36.length > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <Label text="Total yardage (all 36)" sub="(opt. if per-course below)" />
                        <input type="number" className={inp} value={ts.yardage} onChange={e => updateTeeSet(i, { yardage: e.target.value })} placeholder="13,000" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {courseNamesFor36.map(name => (
                          <div key={name}>
                            <Label text={name + ' yardage'} />
                            <input type="number" className={inp} value={ts.nineYardages[name] || ''} onChange={e => {
                              const ny = { ...ts.nineYardages, [name]: e.target.value };
                              updateTeeSet(i, { nineYardages: ny });
                            }} placeholder="6,500" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label text="Total yardage" />
                        <input type="number" className={inp} value={ts.yardage} onChange={e => updateTeeSet(i, { yardage: e.target.value })} placeholder="6,400" />
                      </div>
                      {h === '18' && (
                        <div>
                          <button type="button" className="text-xs text-ink-faint hover:text-ink transition-colors"
                            onClick={() => updateTeeSet(i, { frontYardage: ts.frontYardage || '', backYardage: ts.backYardage || '' })}>
                            {ts.frontYardage || ts.backYardage ? 'Front/back split' : '+ Add front/back split (optional)'}
                          </button>
                          {(ts.frontYardage !== undefined || ts.backYardage !== undefined) && (ts.yardage || ts.frontYardage || ts.backYardage) && (
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <div>
                                <p className="text-[11px] text-ink-faint mb-1">Front 9</p>
                                <input type="number" className={inp} value={ts.frontYardage} onChange={e => updateTeeSet(i, { frontYardage: e.target.value })} placeholder="3,200" />
                              </div>
                              <div>
                                <p className="text-[11px] text-ink-faint mb-1">Back 9</p>
                                <input type="number" className={inp} value={ts.backYardage} onChange={e => updateTeeSet(i, { backYardage: e.target.value })} placeholder="3,200" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Par / Rating / Slope */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label text="Par" />
                      <input type="number" className={inp} value={ts.par} onChange={e => updateTeeSet(i, { par: e.target.value })} placeholder="72" />
                    </div>
                    <div>
                      <Label text="Rating" sub="(opt.)" />
                      <input type="number" step="0.1" className={inp} value={ts.rating} onChange={e => updateTeeSet(i, { rating: e.target.value })} placeholder="71.4" />
                    </div>
                    <div>
                      <Label text="Slope" sub="(opt.)" />
                      <input type="number" className={inp} value={ts.slope} onChange={e => updateTeeSet(i, { slope: e.target.value })} placeholder="128" />
                    </div>
                  </div>

                  {/* Women's ratings toggle */}
                  <div>
                    {!teeWomensOpen[i] ? (
                      <button type="button" className="text-xs text-ink-faint hover:text-ink transition-colors"
                        onClick={() => setTeeWomensOpen(prev => ({ ...prev, [i]: true }))}>
                        + Add women&apos;s par / rating / slope (optional)
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Women&apos;s ratings</span>
                          <button type="button" className="text-[11px] text-ink-faint hover:text-bad transition-colors"
                            onClick={() => { setTeeWomensOpen(prev => ({ ...prev, [i]: false })); updateTeeSet(i, { womensPar: '', womensRating: '', womensSlope: '' }); }}>
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label text="Par" />
                            <input type="number" className={inp} value={ts.womensPar} onChange={e => updateTeeSet(i, { womensPar: e.target.value })} placeholder="74" />
                          </div>
                          <div>
                            <Label text="Rating" />
                            <input type="number" step="0.1" className={inp} value={ts.womensRating} onChange={e => updateTeeSet(i, { womensRating: e.target.value })} placeholder="73.2" />
                          </div>
                          <div>
                            <Label text="Slope" />
                            <input type="number" className={inp} value={ts.womensSlope} onChange={e => updateTeeSet(i, { womensSlope: e.target.value })} placeholder="131" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Per-combo ratings (27-hole three 9s only) */}
                  {is27Three9s && draft.nine27CombosEnabled.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-2">Rating / slope per combo (optional)</p>
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-[10px] text-ink-faint">Combo</span>
                          <span className="text-[10px] text-ink-faint">Rating</span>
                          <span className="text-[10px] text-ink-faint">Slope</span>
                        </div>
                        {draft.nine27CombosEnabled.map(comboKey => {
                          const cr = (ts.comboRatings || {})[comboKey] || { rating: '', slope: '' };
                          return (
                            <div key={comboKey} className="grid grid-cols-3 gap-2 items-center">
                              <span className="text-[11px] text-ink-muted truncate">{comboKey.replace('+', '+')}</span>
                              <input type="number" step="0.1" className={inp} value={cr.rating}
                                onChange={e => {
                                  const updated = { ...(ts.comboRatings || {}), [comboKey]: { ...cr, rating: e.target.value } };
                                  updateTeeSet(i, { comboRatings: updated });
                                }} placeholder="71.4" />
                              <input type="number" className={inp} value={cr.slope}
                                onChange={e => {
                                  const updated = { ...(ts.comboRatings || {}), [comboKey]: { ...cr, slope: e.target.value } };
                                  updateTeeSet(i, { comboRatings: updated });
                                }} placeholder="128" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Note */}
                  <div>
                    <Label text="Note" sub="(opt. — one line)" />
                    <input className={inp} value={ts.note} onChange={e => updateTeeSet(i, { note: e.target.value })} placeholder="e.g. combo tees: Blue front, White back" />
                  </div>
                </div>
              ))}
            </div>
            {draft.teeSets.length < 8 && (
              <button type="button" onClick={() => set('teeSets', [...draft.teeSets, blankTeeSet()])}
                className="flex items-center gap-1.5 text-sm text-pine hover:text-pine-hover font-medium transition-colors">
                <Plus className="w-4 h-4" /> Add another tee set
              </button>
            )}
            {is27Three9s && nineNamesFor27.length === 0 && (
              <p className="text-[11px] text-warn">Name your three nines in the Playability step to see per-nine yardage fields here.</p>
            )}
          </div>
        );
      }

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
            {(draft.nineHoleSupport === 'yes' || draft.nineReplay === 'yes') && (
              <div>
                <Label text={draft.holes === '9' ? '18-hole (replay) rate' : '9-hole rate'} sub="(optional)" />
                <DollarInput value={draft.holes === '9' ? draft.nineReplayFee : draft.nineHoleFee} onChange={v => draft.holes === '9' ? set('nineReplayFee', v) : set('nineHoleFee', v)} placeholder="25.00" />
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

      case 'passes': {
        const PASS_TYPE_LABELS: Record<string, string> = {
          membership: 'Membership',
          season_pass: 'Season pass',
          resident_card: 'Resident card',
          resident_rate: 'Resident rates (no card)',
          punch_card: 'Punch card',
          other: 'Other',
        };
        return (
          <div className="space-y-5">
            <p className="text-sm text-ink-muted">Add all your membership tiers, season passes, resident cards, and punch cards. Include resident rates if you offer them without a separate card. Add as many as you need.</p>
            <div className="space-y-4">
              {draft.passes.map((p, i) => (
                <div key={i} className="bg-paper border border-line rounded-md p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">Item {i + 1}</span>
                    {draft.passes.length > 1 && (
                      <button type="button" onClick={() => set('passes', draft.passes.filter((_, j) => j !== i))}
                        className="text-ink-faint hover:text-bad transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div>
                    <Label text="Type" />
                    <select className={sel} value={p.type} onChange={e => updatePass(i, { type: e.target.value })}>
                      {Object.entries(PASS_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>

                  {p.type === 'other' && (
                    <div>
                      <Label text="What is it?" />
                      <input className={inp} value={p.otherType || ''} onChange={e => updatePass(i, { otherType: e.target.value })} placeholder="e.g. Twilight pass, Junior card" />
                    </div>
                  )}

                  {p.type !== 'resident_rate' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label text="Name" />
                          <input className={inp} value={p.name} onChange={e => updatePass(i, { name: e.target.value })}
                            placeholder={p.type === 'membership' ? 'Full Member' : p.type === 'season_pass' ? 'Season Pass' : p.type === 'resident_card' ? 'Resident Card' : p.type === 'other' ? 'e.g. Twilight Pass' : 'Punch Card'} />
                        </div>
                        <div>
                          <Label text="Fee" />
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <DollarInput value={p.fee} onChange={v => updatePass(i, { fee: v })} placeholder="0.00" />
                            </div>
                            <select className={sel + ' w-auto'} value={p.feePeriod} onChange={e => updatePass(i, { feePeriod: e.target.value })}>
                              <option value="annual">/ yr</option>
                              <option value="season">/ season</option>
                              <option value="monthly">/ mo</option>
                              <option value="per_punch">/ punch</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label text="What&apos;s included" sub="(brief)" />
                        <textarea rows={2} className={inp} value={p.includes} onChange={e => updatePass(i, { includes: e.target.value })} placeholder="Unlimited rounds, range balls, guest passes…" />
                      </div>
                      <div>
                        <Label text="Do holders pay a green fee per round?" />
                        <YesNo value={p.perRound} onChange={v => updatePass(i, { perRound: v })} />
                        {p.perRound === 'yes' && (
                          <div className="space-y-3 mt-2 pl-3 border-l-2 border-pine/20">
                            <div>
                              <Label text="Is this a discounted green fee or a separate charge on top?" />
                              <div className="flex gap-2">
                                {[
                                  { v: 'discount', label: 'Discounted green fee' },
                                  { v: 'separate', label: 'Separate fee on top' },
                                ].map(({ v, label }) => (
                                  <button key={v} type="button" onClick={() => updatePass(i, { perRoundType: v })}
                                    className={'flex-1 py-2 rounded-md border text-sm transition-colors ' + (p.perRoundType === v ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line text-ink hover:border-pine/40')}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label text="Weekday rate" />
                                <DollarInput value={p.perRoundWeekday || p.perRoundFee} onChange={v => updatePass(i, { perRoundWeekday: v, perRoundFee: v })} placeholder="25.00" />
                              </div>
                              <div>
                                <Label text="Weekend rate" sub="(opt.)" />
                                <DollarInput value={p.perRoundWeekend} onChange={v => updatePass(i, { perRoundWeekend: v })} placeholder="35.00" />
                              </div>
                            </div>
                            <div>
                              <Label text="Twilight rate" sub="(opt.)" />
                              <DollarInput value={p.perRoundTwilight} onChange={v => updatePass(i, { perRoundTwilight: v })} placeholder="20.00" />
                            </div>
                            <div>
                              <Label text="Cart included?" />
                              <YesNo value={p.perRoundCartIncluded} onChange={v => updatePass(i, { perRoundCartIncluded: v })} />
                            </div>
                            <p className="text-[11px] text-ink-faint">You can change member rates anytime after launch.</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {(p.type === 'resident_card' || p.type === 'resident_rate') && (
                    <div className="space-y-3 border-t border-line pt-3">
                      <div>
                        <Label text="Who qualifies as a resident?" />
                        <input className={inp} value={p.residentWho} onChange={e => updatePass(i, { residentWho: e.target.value })}
                          placeholder="e.g. Town of Westport residents, Fairfield County" />
                      </div>
                      {p.type === 'resident_card' && (
                        <div>
                          <Label text="How does the resident card work?" />
                          <div className="flex gap-2">
                            {[
                              { v: 'free', label: 'Free — just show ID' },
                              { v: 'purchased', label: 'They buy a card' },
                            ].map(({ v, label }) => (
                              <button key={v} type="button" onClick={() => updatePass(i, { residentVerifType: v })}
                                className={'flex-1 py-2 rounded-md border text-sm transition-colors ' + (p.residentVerifType === v ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line text-ink hover:border-pine/40')}>
                                {label}
                              </button>
                            ))}
                          </div>
                          {p.residentVerifType === 'purchased' && (
                            <div className="space-y-3 mt-3 pl-3 border-l-2 border-pine/20">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label text="Card cost" />
                                  <DollarInput value={p.residentCardCost} onChange={v => updatePass(i, { residentCardCost: v })} placeholder="10.00" />
                                </div>
                                <div>
                                  <Label text="Renews" sub="(how often)" />
                                  <input className={inp} value={p.residentCardRenewal} onChange={e => updatePass(i, { residentCardRenewal: e.target.value })} placeholder="Annually, each spring" />
                                </div>
                              </div>
                              <div>
                                <Label text="Where / how do residents buy it?" />
                                <input className={inp} value={p.residentCardWhere} onChange={e => updatePass(i, { residentCardWhere: e.target.value })} placeholder="e.g. Town Hall, online at town website" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {p.type === 'resident_rate' && (
                        <div>
                          <Label text="Verification" sub="(what they show)" />
                          <input className={inp} value={p.residentVerification || ''} onChange={e => updatePass(i, { residentVerification: e.target.value } as Partial<PassTier>)} placeholder="County ID, utility bill" />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label text="Resident weekday rate" />
                          <DollarInput value={p.residentWeekday} onChange={v => updatePass(i, { residentWeekday: v })} placeholder="30.00" />
                        </div>
                        <div>
                          <Label text="Resident weekend rate" />
                          <DollarInput value={p.residentWeekend} onChange={v => updatePass(i, { residentWeekend: v })} placeholder="45.00" />
                        </div>
                      </div>
                      <div>
                        <Label text="Resident twilight rate" sub="(optional)" />
                        <DollarInput value={p.residentTwilight} onChange={v => updatePass(i, { residentTwilight: v })} placeholder="20.00" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {draft.passes.length < 8 && (
              <button type="button" onClick={() => set('passes', [...draft.passes, blankPass()])}
                className="flex items-center gap-1.5 text-sm text-pine hover:text-pine-hover font-medium transition-colors">
                <Plus className="w-4 h-4" /> Add another
              </button>
            )}
            <p className="text-[11px] text-ink-faint">You can add, edit, or remove tiers anytime after launch.</p>
          </div>
        );
      }

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

      case 'cancellation': {
        const hasPolicy = draft.cancellationPolicy === 'yes';
        const noPolicy = draft.cancellationPolicy === 'no';
        return (
          <div className="space-y-5">
            <div>
              <Label text="Do you charge for late cancellations or no-shows?" />
              <div className="flex gap-2">
                {[
                  { v: 'yes', label: 'Yes — we charge a fee' },
                  { v: 'no', label: 'No — cancel anytime free' },
                ].map(({ v, label }) => (
                  <button key={v} type="button" onClick={() => set('cancellationPolicy', v)}
                    className={'flex-1 py-2.5 rounded-md border text-sm transition-colors ' + (draft.cancellationPolicy === v ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line text-ink hover:border-pine/40')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {noPolicy && (
              <div className="bg-paper border border-line rounded-md p-4 text-sm text-ink-soft leading-relaxed">
                <p>Golfers will book without saving a card and can cancel anytime at no cost. They pay their green fee at the course on the day of play.</p>
              </div>
            )}

            {hasPolicy && (
              <>
                <div className="bg-pine/5 border border-pine/20 rounded-md p-4 space-y-2 text-sm text-ink-soft leading-relaxed">
                  <p className="font-medium text-ink text-[13px]">How this works on GreenReserve</p>
                  <p>Golfers save their card at booking — nothing is charged until tee time. If they cancel <em>before</em> your window, it&apos;s free. If they cancel <em>after</em>, the late fee is automatically charged to their saved card. If they show up and check in, the fee is refunded.</p>
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
                  <Label text="Late cancellation fee" />
                  <DollarInput value={draft.lateFee} onChange={v => set('lateFee', v)} placeholder="25.00" />
                </div>
                <p className="text-[11px] text-ink-faint">The window and fee can be changed anytime after launch.</p>
              </>
            )}

            {!hasPolicy && !noPolicy && (
              <p className="text-[11px] text-ink-faint">Select an option above to continue.</p>
            )}
          </div>
        );
      }

      case 'facilities': {
        const fv2 = draft.facilitiesV2;
        const tog = (field: keyof FacilitiesV2, cur: boolean) => setFv2({ [field]: !cur } as Partial<FacilitiesV2>);
        const togBtn = (on: boolean, onToggle: () => void, label: string) => (
          <button type="button" onClick={onToggle}
            className={'flex items-center gap-3 px-3 py-2.5 rounded-md border text-sm text-left w-full transition-colors ' + (on ? 'border-pine bg-pine/5 text-pine' : 'border-line text-ink hover:border-pine/40')}>
            <div className={'w-4 h-4 rounded border flex items-center justify-center shrink-0 ' + (on ? 'bg-pine border-pine' : 'border-line-strong')}>
              {on && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <span className={on ? 'font-medium' : ''}>{label}</span>
          </button>
        );

        return (
          <div className="space-y-5">
            {/* Driving range */}
            <div className="space-y-2">
              {togBtn(fv2.range, () => tog('range', fv2.range), 'Driving range')}
              {fv2.range && (
                <div className="pl-4 space-y-3 border-l-2 border-pine/20">
                  <div>
                    <Label text="Tee surface" />
                    <select className={sel} value={fv2.rangeTeeType} onChange={e => setFv2({ rangeTeeType: e.target.value })}>
                      <option value="grass">Grass tees</option>
                      <option value="mats">Mats only</option>
                      <option value="both">Both grass and mats</option>
                    </select>
                  </div>
                  <div>
                    <Label text="Bucket sizes & prices" />
                    <div className="space-y-2">
                      {fv2.rangeBuckets.map((b, bi) => (
                        <div key={bi} className="grid grid-cols-3 gap-2 items-center">
                          <input className={inp} value={b.label} onChange={e => {
                            const bkts = [...fv2.rangeBuckets]; bkts[bi] = { ...bkts[bi], label: e.target.value }; setFv2({ rangeBuckets: bkts });
                          }} placeholder="Small" />
                          <DollarInput value={b.price} onChange={v => {
                            const bkts = [...fv2.rangeBuckets]; bkts[bi] = { ...bkts[bi], price: v }; setFv2({ rangeBuckets: bkts });
                          }} placeholder="6.00" />
                          <div className="flex items-center gap-1">
                            <input type="number" className={inp} value={b.balls} onChange={e => {
                              const bkts = [...fv2.rangeBuckets]; bkts[bi] = { ...bkts[bi], balls: e.target.value }; setFv2({ rangeBuckets: bkts });
                            }} placeholder="35" />
                            <span className="text-xs text-ink-faint shrink-0">balls</span>
                            {fv2.rangeBuckets.length > 1 && (
                              <button type="button" onClick={() => setFv2({ rangeBuckets: fv2.rangeBuckets.filter((_, j) => j !== bi) })} className="text-ink-faint hover:text-bad shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {fv2.rangeBuckets.length < 5 && (
                      <button type="button" onClick={() => setFv2({ rangeBuckets: [...fv2.rangeBuckets, blankBucket()] })}
                        className="flex items-center gap-1 text-xs text-pine hover:text-pine-hover mt-2 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Add size
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Simple yes/no items */}
            {togBtn(fv2.puttingGreen, () => tog('puttingGreen', fv2.puttingGreen), 'Putting green')}
            {togBtn(fv2.chippingArea, () => tog('chippingArea', fv2.chippingArea), 'Chipping / short-game area')}
            <div className="space-y-2">
              {togBtn(fv2.proShop, () => tog('proShop', fv2.proShop), 'Pro shop')}
              {fv2.proShop && (
                <div className="pl-4 border-l-2 border-pine/20">
                  <Label text="Pro shop phone" sub="(opt.)" />
                  <input type="tel" className={inp} value={fv2.proShopPhone || ''} onChange={e => setFv2({ proShopPhone: e.target.value })} placeholder="(555) 000-0000" />
                </div>
              )}
            </div>

            {/* Lessons */}
            <div className="space-y-2">
              {togBtn(fv2.lessons, () => tog('lessons', fv2.lessons), 'Lessons / teaching pros')}
              {fv2.lessons && (
                <div className="pl-4 grid grid-cols-2 gap-3 border-l-2 border-pine/20">
                  <div>
                    <Label text="Pro name(s)" sub="(opt.)" />
                    <input className={inp} value={fv2.lessonsProName} onChange={e => setFv2({ lessonsProName: e.target.value })} placeholder="e.g. John Smith, PGA" />
                  </div>
                  <div>
                    <Label text="Contact number" sub="(opt.)" />
                    <input type="tel" className={inp} value={fv2.lessonsProPhone} onChange={e => setFv2({ lessonsProPhone: e.target.value })} placeholder="(555) 000-0000" />
                  </div>
                </div>
              )}
            </div>

            {/* Club rental */}
            <div className="space-y-2">
              {togBtn(fv2.clubRental, () => tog('clubRental', fv2.clubRental), 'Club rental')}
              {fv2.clubRental && (
                <div className="pl-4 space-y-2 border-l-2 border-pine/20">
                  <Label text="How to arrange (select all that apply)" />
                  {[
                    { v: 'pro_shop', label: 'Walk into the pro shop' },
                    { v: 'phone', label: 'Call ahead' },
                  ].map(({ v, label }) => {
                    const methods = fv2.clubRentalMethods || [];
                    const on = methods.includes(v);
                    return (
                      <button key={v} type="button" onClick={() => {
                        const next = on ? methods.filter(m => m !== v) : [...methods, v];
                        setFv2({ clubRentalMethods: next });
                      }}
                        className={'flex items-center gap-3 px-3 py-2 rounded-md border text-sm text-left w-full transition-colors ' +
                          (on ? 'border-pine bg-pine/5 text-pine' : 'border-line text-ink hover:border-pine/40')}>
                        <div className={'w-4 h-4 rounded border flex items-center justify-center shrink-0 ' + (on ? 'bg-pine border-pine' : 'border-line-strong')}>
                          {on && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <span className={on ? 'font-medium' : ''}>{label}</span>
                      </button>
                    );
                  })}
                  {(fv2.clubRentalMethods || []).includes('phone') && (
                    <div>
                      <Label text="Phone to call" sub="(opt.)" />
                      <input type="tel" className={inp} value={fv2.clubRentalPhone || ''}
                        onChange={e => setFv2({ clubRentalPhone: e.target.value })}
                        placeholder={fv2.proShopPhone || '(555) 000-0000'} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Push/pull cart rental */}
            <div className="space-y-2">
              {togBtn(fv2.cartRental, () => tog('cartRental', fv2.cartRental), 'Push / pull cart rental')}
              {fv2.cartRental && (
                <div className="pl-4 border-l-2 border-pine/20">
                  <Label text="Cost" sub="(opt.)" />
                  <DollarInput value={fv2.cartRentalCost} onChange={v => setFv2({ cartRentalCost: v })} placeholder="5.00" />
                </div>
              )}
            </div>

            {/* Bag storage — private only */}
            {courseType === 'private' && togBtn(fv2.bagStorage, () => tog('bagStorage', fv2.bagStorage), 'Bag storage')}

            {togBtn(fv2.gpsCarts, () => tog('gpsCarts', fv2.gpsCarts), 'GPS on carts')}

            {/* Event space */}
            <div className="space-y-2">
              {togBtn(fv2.eventSpace, () => tog('eventSpace', fv2.eventSpace), 'Event / banquet space')}
              {fv2.eventSpace && (
                <div className="pl-4 border-l-2 border-pine/20">
                  <Label text="Contact number for inquiries" sub="(opt.)" />
                  <input type="tel" className={inp} value={fv2.eventSpaceContact} onChange={e => setFv2({ eventSpaceContact: e.target.value })} placeholder="(555) 000-0000" />
                </div>
              )}
            </div>

            {togBtn(fv2.lockerRooms, () => tog('lockerRooms', fv2.lockerRooms), 'Locker rooms')}

            {/* Tournaments */}
            <div className="space-y-2">
              {togBtn(fv2.tournaments, () => tog('tournaments', fv2.tournaments), 'Hosts tournaments & outings')}
              {fv2.tournaments && (
                <div className="pl-4 border-l-2 border-pine/20">
                  <Label text="How often?" />
                  <select className={sel} value={fv2.tournamentsFrequency} onChange={e => setFv2({ tournamentsFrequency: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="seasonal">A few per season</option>
                    <option value="rarely">Rarely</option>
                  </select>
                </div>
              )}
            </div>

            {/* Food & drink */}
            <div>
              <Label text="Food & drink" />
              <select className={sel} value={fv2.restaurantType} onChange={e => setFv2({ restaurantType: e.target.value })}>
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
            disabled={saving || (!draft.cancellationPolicy && section?.id === 'cancellation')}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : isLast ? 'Submit setup sheet' : (
              <>Next <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
        {section?.id === 'cancellation' && !draft.cancellationPolicy && (
          <p className="text-[11px] text-ink-faint text-center mt-2">Select Yes or No above to continue.</p>
        )}
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
