'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { INPUT } from '@/components/ui/field';
import { US_TIMEZONES } from '@/lib/course-time';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, Loader2, X } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { StaffPermissions } from '@/components/dashboard/StaffPermissions';
import { ShopCatalog } from '@/components/dashboard/ShopCatalog';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { describePolicy, policyFrom, LATE_FEE_TIMINGS } from '@/lib/cancel-policy';
import { toast } from '@/components/dashboard/Toast';
import CourseLayoutTab from '@/components/dashboard/CourseLayoutTab';
import CoursePreview from '@/components/dashboard/CoursePreview';
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from '@/lib/password';
import { setLeaveGuard, useBackGuard } from '@/lib/unsaved-guard';
import { downscaleImage } from '@/lib/image-resize';
import { StatusDot } from '@/components/ui/StatusDot';
import { walkingWords } from '@/lib/walking';
import { askBirdie, useBirdieReady, APPLIED_EVENT } from '@/lib/birdie/ask';
import { facilityLines, RANGE_TYPES, FOOD_TYPES, TOURNAMENT_FREQ, type FacilityFields } from '@/lib/facilities';
import { Card } from '@/components/ui/Card';
import { FinishSetup, type SetupItem } from '@/components/dashboard/settings/FinishSetup';
import { WhoPaysWhat } from '@/components/dashboard/settings/WhoPaysWhat';

type Course = Record<string, unknown>;
// U-O (UI_REVISE_SPEC §3, "Settings: sub-nav on the left naming the existing
// sections in this order"). The sections are the same forms and the same
// fields as before — only their names, grouping and the nav's axis change.
// Facilities and Account are not in the spec's list but still exist, so they
// keep their places rather than disappearing.
// SD-8: twelve sub-tabs became five. Nothing was deleted — the same forms are
// grouped by the question an operator is actually asking. Payouts left
// entirely: getting paid is money, and it lives on /dashboard/money now.
// Settings rework (Cam 2026-10-19): the sections in the order a course sets
// itself up. Staff (people and what each may do) and Your account (this
// login's email, password, two-step) were one muddled section; now two.
const SECTIONS = [
  'Your course',
  'Course layout',
  'Booking rules',
  'Prices & fees',
  'Facilities',
  'Pro shop',
  'Staff',
  'Your account',
] as const;
type Section = typeof SECTIONS[number];
// Old ?section= names still land somewhere sensible.
const SECTION_ALIASES: Record<string, Section> = {
  'Pricing & cancellation': 'Prices & fees',
  'Staff & account': 'Staff',
};
// Sections whose contents save themselves (layout, shop, staff, password,
// 2FA) — the header Save button is hidden on these.
const NO_SAVE_BUTTON: Section[] = ['Course layout', 'Pro shop', 'Staff', 'Your account'];
// SP-A: the cancellation policy is the owner's alone — a staff login with
// "Edit course settings" never sends these (the API refuses them too).
const POLICY_FIELDS = ['cancellationHours', 'lateCancellationFee', 'checkInWindowHours', 'rainCheckPolicy', 'lateFeeBasis', 'lateFeeTiming', 'noShowFee', 'noShowFeeBasis', 'autoNoShowMinutes'];

// SD-8: Save used to PATCH the WHOLE form, so saving a dress-code chip also
// re-sent every facility toggle and every price — two people editing different
// sections overwrote each other, and one stale field travelled with every save.
// Each section now sends only its own fields.
const SECTION_FIELDS: Record<Section, string[]> = {
  'Your course': [
    'brandColor', 'phone', 'website', 'type', 'establishedYear', 'description', 'giftCardUrl', 'confirmationNote',
  ],
  'Course layout': [],
  'Booking rules': [
    'timezone', 'publicAdvanceDays', 'memberAdvanceDays', 'minPlayers', 'maxPlayers', 'dresscode',
    'walkingAllowed', 'walkingNote', 'cartRequired',
  ],
  'Prices & fees': [
    'hasMemberPricing', 'hasResidentPricing', 'residentCounty', 'residentState', 'residentProofRequired',
    'cancellationHours', 'lateCancellationFee', 'checkInWindowHours', 'rainCheckPolicy',
    'lateFeeBasis', 'lateFeeTiming', 'noShowFee', 'noShowFeeBasis', 'autoNoShowMinutes',
  ],
  'Facilities': [
    'hasDrivingRange', 'drivingRangeType', 'rangeBallsFree', 'hasPuttingGreen', 'hasShortGameArea',
    'hasProShop', 'proShopPhone', 'hasLessons', 'hasClubRental', 'clubRentalRate',
    'hasPushCartRental', 'pushCartRate', 'hasBagStorage', 'hasLockerRoom', 'hasGpsCarts',
    'hasTournaments', 'tournamentFrequency', 'restaurantType', 'hasCartGirl',
    'hasCaddies', 'caddieType', 'caddieLooperRate', 'caddieForeRate', 'caddieNote', 'amenities',
  ],
  'Pro shop': [],
  'Staff': [],
  'Your account': [],
};

// SD-8: the course's identity is what GreenReserve listed and what golfers
// searched for. It is read-only here and changed by asking us — the row shows
// the value and opens a prefilled message.
const IDENTITY_ROWS: { key: string; label: string }[] = [
  { key: 'name', label: 'Course name' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zipCode', label: 'ZIP' },
];
// Facilities checklist, in the order golfers think about them. Food and drink
// (one choice) and "Anything else" sit below the groups.
const FACILITY_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  { title: 'Practice', items: [
    { key: 'hasDrivingRange', label: 'Driving range' },
    { key: 'hasPuttingGreen', label: 'Putting green' },
    { key: 'hasShortGameArea', label: 'Chipping and short-game area' },
  ] },
  { title: 'Shop, rentals and help', items: [
    { key: 'hasProShop', label: 'Pro shop' },
    { key: 'hasLessons', label: 'Lessons' },
    { key: 'hasClubRental', label: 'Club rental' },
    { key: 'hasPushCartRental', label: 'Push carts' },
    { key: 'hasCaddies', label: 'Caddies' },
  ] },
  { title: 'Clubhouse and carts', items: [
    { key: 'hasGpsCarts', label: 'GPS in the carts' },
    { key: 'hasBagStorage', label: 'Bag storage' },
    { key: 'hasLockerRoom', label: 'Locker room' },
    { key: 'hasTournaments', label: 'Tournaments' },
  ] },
];
// The four walking rules the settings API accepts, in golfers' words.
const WALKING_CHOICES = [
  { key: 'always', label: 'Golfers can walk any time' },
  { key: 'weekdays', label: 'Walking on weekdays only' },
  { key: 'after12', label: 'Walking after 12pm only' },
  { key: 'never', label: 'Carts only — no walking' },
] as const;
const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-card p-5">
      <div className="text-[15px] font-semibold text-ink mb-4">{title}</div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-ink mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[12.5px] text-ink-soft mt-1">{hint}</p>}
    </div>
  );
}
function FInput({ value, onChange, type='text', placeholder='', maxLength, step }: { value: string|number; onChange:(v:string)=>void; type?:string; placeholder?:string; maxLength?:number; step?:string }) {
  return <input type={type} value={value??''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} step={step} className={iCls}/>;
}
function Toggle({ label, checked, onChange }: { label:string; checked:boolean; onChange:()=>void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-ink">{label}</span>
      <button onClick={onChange} className={'relative w-11 h-6 rounded-sm transition-colors ' + (checked ? 'bg-pine' : 'bg-line-strong')}>
        <span className={'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-sm shadow-sm transition-transform ' + (checked ? 'translate-x-5' : '')}/>
      </button>
    </div>
  );
}

function ImageUpload({ label, kind, value, onUploaded, hint }: { label: string; kind: 'logo' | 'hero'; value: string; onUploaded: (url: string) => void; hint: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('file', await downscaleImage(file));
    fd.append('kind', kind);
    try {
      const res = await fetch('/api/operator/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) onUploaded(data.url);
      else setErr(data.error || 'Upload failed');
    } catch { setErr('Upload failed — try again.'); }
    setBusy(false);
  }

  async function remove() {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/operator/upload?kind=${kind}`, { method: 'DELETE' });
      if (res.ok) onUploaded('');
      else setErr('Could not remove the image — try again.');
    } catch { setErr('Could not remove the image — try again.'); }
    setBusy(false);
  }

  return (
    <div>
      <label className="block text-[13px] font-semibold text-ink mb-1.5">{label}</label>
      <div className="flex items-center gap-4">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={kind === 'logo' ? 'h-14 w-14 object-contain bg-paper rounded-md p-1 border border-line' : 'h-14 w-24 object-cover rounded-md border border-line'}/>
        ) : (
          <div className="h-14 w-24 rounded-md bg-paper border border-dashed border-line flex items-center justify-center text-ink-faint">
            
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="cursor-pointer inline-flex px-3 py-1.5 rounded-md bg-paper border border-line hover:border-line-strong text-xs font-medium text-ink-soft w-fit transition-colors">
            {busy ? 'Working…' : value ? 'Replace' : 'Upload image'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy} onChange={e => handleFile(e.target.files?.[0] ?? null)}/>
          </label>
          {value && <button onClick={remove} disabled={busy} className="text-xs text-ink-faint hover:text-bad text-left transition-colors">Remove</button>}
        </div>
      </div>
      <p className="text-xs text-ink-soft mt-1.5">{hint}</p>
      {err && <p className="text-xs text-bad mt-1">{err}</p>}
    </div>
  );
}

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // SD-8: Stripe's return URL used to land here. Send it where Stripe lives now.
  const stripeParam = searchParams.get('stripe');
  useEffect(() => {
    if (stripeParam) router.replace(`/dashboard/money?tab=payouts&stripe=${encodeURIComponent(stripeParam)}`);
  }, [stripeParam, router]);

  // Money rework (Cam 2026-10-19): other pages link straight to a section, e.g. ?section=Pricing+%26+cancellation.
  const sectionParam = searchParams.get('section') ?? '';
  const [active, setActive] = useState<Section>(() => (SECTIONS as readonly string[]).includes(sectionParam) ? sectionParam as Section : SECTION_ALIASES[sectionParam] ?? 'Your course');
  const [teeSetCount, setTeeSetCount] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string,unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // SD-8: true from the first edit until a successful save. The focus-refetch
  // below used to replace the whole form with the server copy on every
  // window focus — switching to a calendar tab and back wiped an in-progress
  // edit. While dirty, nothing overwrites the form.
  // SD-8: now that Save is per-section, ONE dirty flag would let saving
  // Facilities clear the "unsaved" state on an edit still sitting in Booking
  // rules. Track which FIELDS changed; the section's button reads its own.
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState('');
  // SD-8 review: blank fields and a failed load used to look identical.
  const [formLoaded, setFormLoaded] = useState(false);
  const [formError, setFormError] = useState('');
  const access = useDashboardAccess();
  const isStaffLogin = access.isStaff;
  // SP-B: the policy as currently on screen, in golfers' words.
  const cents = (v: unknown) => Math.round(Number(v || 0) * 100);
  const formTerms = describePolicy(policyFrom({
    cancellationHours: Number(form.cancellationHours ?? 24), lateCancellationFeeCents: cents(form.lateCancellationFee),
    lateFeeBasis: form.lateFeeBasis, lateFeeTiming: form.lateFeeTiming,
    noShowFeeCents: cents(form.noShowFee), noShowFeeBasis: form.noShowFeeBasis,
    autoNoShowMinutes: form.autoNoShowMinutes ? Number(form.autoNoShowMinutes) : null,
    checkInWindowHours: Number(form.checkInWindowHours ?? 3),
  }));
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const [operatorEmail, setOperatorEmail] = useState('');
  const [emailingReset, setEmailingReset] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [saving2FA, setSaving2FA] = useState(false);
  const [saved2FA, setSaved2FA] = useState(false);
  const [error2FA, setError2FA] = useState('');
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeText, setChangeText] = useState('');
  const [changeSending, setChangeSending] = useState(false);
  const [changeSent, setChangeSent] = useState(false);
  const [photos, setPhotos] = useState<{ id: string; url: string; sortOrder: number }[]>([]);
  // "Finish setting up" must not call a course photo-less before the list has loaded.
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoErr, setPhotoErr] = useState('');

  const anyDirty = dirtyFields.size > 0;
  const dirty = SECTION_FIELDS[active].some(k => dirtyFields.has(k));
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = anyDirty; }, [anyDirty]);
  const refreshForm = () => fetch('/api/operator/settings')
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`Could not load your settings (${r.status}).`)))
    .then(d => { if (d && !dirtyRef.current) setForm(d); setFormLoaded(true); setFormError(''); })
    .catch((e: Error) => { setFormError(e.message || 'Network error loading your settings.'); });

  // SD-10: `{error}` into setPhotos crashed the Photos tab on `.map`.
  const refreshPhotos = () => fetch('/api/operator/photos').then(r => r.ok ? r.json() : null).then(d => { if (Array.isArray(d)) { setPhotos(d); setPhotosLoaded(true); } else setPhotoErr('Could not load your photos — reload to try again.'); }).catch(() => setPhotoErr('Network error loading photos.'));

  useEffect(() => {
    refreshForm();
    fetch('/api/operator/profile').then(r => r.ok ? r.json() : null).then(p => { if (p?.email) setOperatorEmail(p.email); }).catch(() => {});
    refreshPhotos();
    // Admin can flip live/draft status or Stripe connection state while this
    // tab sits open in the background — refresh on refocus instead of
    // showing whatever was true when the page first loaded.
    window.addEventListener('focus', refreshForm);
    return () => window.removeEventListener('focus', refreshForm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Finish setting up" asks whether any tee exists; re-read on every section
  // change so adding one under Course layout clears the item. Null (unknown or
  // failed) never shows the item.
  useEffect(() => {
    fetch('/api/operator/tee-sets').then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setTeeSetCount(d.length); }).catch(() => {});
  }, [active]);

  async function uploadGalleryPhoto(file: File | null) {
    if (!file) return;
    setUploadingPhoto(true); setPhotoErr('');
    const fd = new FormData();
    fd.append('file', await downscaleImage(file));
    try {
      const res = await fetch('/api/operator/photos', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) setPhotos(ps => [...ps, data]);
      else setPhotoErr(data.error || 'Upload failed');
    } catch { setPhotoErr('Upload failed — try again.'); }
    setUploadingPhoto(false);
  }

  async function deleteGalleryPhoto(id: string) {
    setPhotoErr('');
    try {
      const res = await fetch(`/api/operator/photos/${id}`, { method: 'DELETE' });
      if (res.ok) setPhotos(ps => ps.filter(p => p.id !== id));
      else setPhotoErr('Could not remove that photo — try again.');
    } catch { setPhotoErr('Could not remove that photo — try again.'); }
  }

  async function emailResetLinkInstead() {
    if (!operatorEmail) return;
    setEmailingReset(true);
    try {
      const r = await fetch('/api/auth/forgot-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: operatorEmail }) });
      if (!r.ok) { toast('Could not send the reset link — try again.'); return; }
      setResetEmailSent(true);
    } catch { toast('Network error — the reset link was not sent.'); }
    finally { setEmailingReset(false); }
  }

  // SD-8: the identity rows go through the change-request channel that
  // already exists (V13b) - it mirrors to the course's message thread, records
  // a structured event on the admin activity ledger, and emails us, all
  // rate-limited. A raw message would have done only the first of those.
  async function requestChange() {
    const note = changeText.trim();
    if (!note) return;
    setChangeSending(true);
    try {
      const res = await fetch('/api/operator/request-changes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ category: 'course_details', detail: note }] }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast(d.error || 'Could not send that request — try again.'); return; }
      setChangeSent(true); setChangeText(''); setChangeOpen(false);
    } catch {
      toast('Network error — your change request was not sent. Check your connection and try again.');
    } finally {
      setChangeSending(false);
    }
  }

  const markDirty = (k: string) => setDirtyFields(s => { const next = new Set(s); next.add(k); return next; });
  const set = (k:string, v:unknown) => { markDirty(k); setForm(f=>({...f,[k]:v})); };
  const tog = (k:string) => { markDirty(k); setForm(f=>({...f,[k]:!f[k]})); };

  // Leaving with unsaved edits asks first — the browser's own prompt. This
  // only covers a real document unload (tab close, refresh, cross-origin nav).
  useEffect(() => {
    if (!anyDirty) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [anyDirty]);

  // SD-8b: the sidebar navigates with router.push, which fires no unload event
  // — the most common way anyone leaves this page was also the one way the
  // guard above never saw. Name the sections so the prompt is worth reading.
  useEffect(() => {
    if (!anyDirty) { setLeaveGuard(null); return; }
    setLeaveGuard(() => {
      const pending = SECTIONS.filter(s => SECTION_FIELDS[s].some(k => dirtyFields.has(k)));
      const which = pending.length ? pending.join(' and ') : 'this page';
      return confirm(`You have unsaved changes in ${which}. Leave without saving?`);
    });
    return () => setLeaveGuard(null);
  }, [anyDirty, dirtyFields]);

  // SD-8d: browser Back is an App Router popstate — neither of the guards
  // above sees it. This routes it through the same named prompt.
  useBackGuard(anyDirty);

  async function save() {
    setSaving(true); setSaveError('');
    // Only this section's fields travel. A key the operator never saw on
    // screen cannot be re-sent by a save they did not mean to make.
    const patch: Record<string, unknown> = {};
    for (const k of SECTION_FIELDS[active]) if (k in form && !(isStaffLogin && POLICY_FIELDS.includes(k))) patch[k] = form[k];
    try {
      const res = await fetch('/api/operator/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
      if (!res.ok) {
        // SD-8: this never checked res.ok, so "Saved" showed on a 400 (the
        // validation SD-1 added) and on a 500 alike. Say what was refused.
        const d = await res.json().catch(() => ({}));
        setSaveError(d.error || `Could not save (${res.status}). Nothing was changed.`);
        toast(d.error || 'Settings were not saved.');
        return;
      }
      // Only this section stops being dirty. An edit waiting in another
      // section still guards the tab and still lights its own button.
      setDirtyFields(s => { const next = new Set(s); for (const k of SECTION_FIELDS[active]) next.delete(k); return next; });
      setSaved(true); setTimeout(()=>setSaved(false),2000);
      refreshForm();
    } catch {
      setSaveError('Network error — nothing was saved. Check your connection and try again.');
      toast('Network error — settings were not saved.');
    } finally {
      setSaving(false);
    }
  }


  async function save2FA() {
    const method = (form.twoFactorMethod as string) || 'email';
    const phone = (form.twoFactorPhone as string) || '';
    if (method === 'sms' && !phone.trim()) { setError2FA('Enter a phone number to receive SMS codes.'); return; }
    setError2FA(''); setSaving2FA(true);
    try {
      const res = await fetch('/api/operator/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twoFactorMethod: method, twoFactorPhone: phone }),
      });
      if (res.ok) { setSaved2FA(true); setDirtyFields(s => { const next = new Set(s); next.delete('twoFactorMethod'); next.delete('twoFactorPhone'); return next; }); setTimeout(() => setSaved2FA(false), 2000); }
      else { const d = await res.json().catch(() => ({})); setError2FA(d.error || 'Could not save. Try again.'); }
    } catch {
      setError2FA('Network error — nothing was saved. Check your connection and try again.');
    } finally {
      setSaving2FA(false);
    }
  }

  async function changePassword() {
    setPwMsg(''); setPwError('');
    if (!pwForm.currentPassword || !pwForm.newPassword) { setPwError('Fill in both password fields.'); return; }
    const strengthError = validatePasswordStrength(pwForm.newPassword);
    if (strengthError) { setPwError(strengthError); return; }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('New passwords do not match.'); return; }
    setPwSaving(true);
    try {
      const res = await fetch('/api/operator/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setPwMsg('Password updated.'); setPwOpen(false); setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); }
      else setPwError(data.error || 'Something went wrong.');
    } catch {
      setPwError('Network error — your password was not changed. Check your connection and try again.');
    } finally {
      setPwSaving(false);
    }
  }

  const dresscodes = (form.dresscode as string[])||[];

  // Settings rework (Cam 2026-10-19: "AI should help write" the description).
  // Birdie gets the course's own facts in the question, drafts, and shows a
  // confirm card; nothing is saved until the owner confirms it there.
  const birdieOn = useBirdieReady();
  function askForDescription() {
    const facts = [
      `${String(form.name ?? '')}${form.city ? `, ${form.city}, ${form.state}` : ''}`,
      `${form.type === 'private' ? 'Private' : 'Public'} course${form.holes ? `, ${form.holes} holes` : ''}${form.par ? `, par ${form.par}` : ''}${form.establishedYear ? `, opened ${form.establishedYear}` : ''}`,
      walkingWords(form.walkingAllowed as string),
      facilityPreview.length ? `Facilities: ${facilityPreview.join('; ')}` : '',
    ].filter(Boolean).join('\n');
    // Birdie's box takes 1500 characters; the current text gets what the facts leave.
    const intro = 'Draft the description for our booking page — 3 to 5 sentences, friendly and plain. Use only these facts, and ask me for anything else you want to say:\n';
    const current = String(form.description ?? '').trim();
    const room = 1500 - intro.length - facts.length - 25;
    const currentLine = current && room > 80 ? `\nCurrent description: ${current.length > room ? current.slice(0, room - 1) + '…' : current}` : '';
    askBirdie(`${intro}${facts}${currentLine}`.slice(0, 1500));
  }
  useEffect(() => {
    const onApplied = (e: Event) => {
      const paths = (e as CustomEvent<{ paths?: string[] }>).detail?.paths ?? [];
      if (!paths.includes('/api/operator/settings')) return;
      fetch('/api/operator/settings').then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
        .then(d => {
          if (!d || typeof d.description !== 'string') return;
          // The confirmed card is the newest intent for the description: take it,
          // and stop treating an older unsaved draft of it as a pending edit.
          setForm(f => ({ ...f, description: d.description }));
          setDirtyFields(s => { if (!s.has('description')) return s; const next = new Set(s); next.delete('description'); return next; });
        })
        .catch(() => toast('Birdie saved the description. Reload to see it here.'));
    };
    window.addEventListener(APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(APPLIED_EVENT, onApplied);
  }, []);
  const dresscodeLines = dresscodes.map(l => l.trim()).filter(Boolean);
  // The preview reads the same lines the booking page does; the form holds dollars, the lib wants cents.
  const cents$ = (v: unknown) => Math.round(Number(v || 0) * 100);
  const facilityPreview = facilityLines({
    ...(form as FacilityFields),
    clubRentalRateCents: cents$(form.clubRentalRate), pushCartRateCents: cents$(form.pushCartRate),
    caddieLooperRateCents: cents$(form.caddieLooperRate), caddieForeRateCents: cents$(form.caddieForeRate),
  });
  const walking = WALKING_CHOICES.some(o => o.key === form.walkingAllowed) ? form.walkingAllowed as string : 'always';

  const goTo = (sec: Section) => { setActive(sec); document.querySelector('main')?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); };
  const missing = (v: unknown) => !String(v ?? '').trim();
  const setupItems: SetupItem[] = [
    missing(form.logoUrl) && { key: 'logo', title: 'Add your logo', why: 'It sits beside your name on your booking page and every email.', action: 'Add logo', onClick: () => goTo('Your course') },
    missing(form.heroImageUrl) && { key: 'hero', title: 'Add a course photo', why: 'The wide banner at the top of your booking page.', action: 'Add photo', onClick: () => goTo('Your course') },
    missing(form.description) && { key: 'description', title: 'Describe your course', why: 'A few sentences golfers read before they book.', action: 'Write it', onClick: () => goTo('Your course') },
    missing(form.phone) && { key: 'phone', title: 'Add your phone number', why: 'Golfers call it with questions about their booking.', action: 'Add phone', onClick: () => goTo('Your course') },
    photosLoaded && photos.length === 0 && { key: 'gallery', title: 'Add gallery photos', why: 'Up to 8 photos in the Photos section of your booking page.', action: 'Add photos', onClick: () => goTo('Your course') },
    teeSetCount === 0 && { key: 'teesets', title: 'Add your tees', why: 'Golfers see each tee’s yardage, rating and slope on your booking page.', action: 'Add tees', onClick: () => goTo('Course layout') },
    (!form.holes || !form.par) && { key: 'holes', title: 'Say how many holes and the par', why: 'Shown at the top of your booking page.', action: 'Set it', onClick: () => goTo('Course layout') },
  ].filter((i): i is SetupItem => !!i);

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="settings"/>
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <StaffNotice what="these settings" edit="settings.edit" />
        {/* Settings rework: the serif title alone — what is missing is the Finish setting up list below. */}
        <div className="bg-white border-b border-line px-6 py-4 flex flex-wrap items-start justify-between gap-3 sticky top-0 z-10">
          <div className="min-w-0">
            <h1 className="text-[30px] font-serif font-semibold leading-none tracking-tight text-ink">Settings</h1>
          </div>
          {!NO_SAVE_BUTTON.includes(active) && (
            <button onClick={save} disabled={saving || !formLoaded || (!dirty && !saved)}
              className="shrink-0 flex items-center gap-2 bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md font-medium text-[12.5px] disabled:opacity-50 transition-colors">
               {saved ? 'Saved' : saving ? 'Saving...' : dirty ? `Save ${active}` : 'No changes'}
            </button>
          )}
        </div>
        {formError && (
          <div className="mx-6 mt-4 bg-bad/5 border border-bad/20 rounded-lg px-4 py-3 text-sm text-bad flex items-center justify-between gap-3" role="alert">
            <span>{formError} Nothing below is your course&apos;s real settings until this loads — don&apos;t save over it.</span>
            <button onClick={() => { setFormError(''); refreshForm(); }} className="text-xs font-medium underline shrink-0">Retry</button>
          </div>
        )}
        {saveError && (
          <div className="mx-6 mt-4 bg-bad/5 border border-bad/20 rounded-lg px-4 py-3 text-sm text-bad flex items-center justify-between gap-3" role="alert">
            <span>{saveError}</span>
            <button onClick={() => setSaveError('')} className="text-xs text-ink-muted hover:text-ink">Dismiss</button>
          </div>
        )}

        <div className="max-w-5xl mx-auto px-6 py-6">
          {formLoaded && <FinishSetup items={setupItems} />}

          <div className="flex flex-col md:flex-row gap-6">
            {/* U-O: the sub-nav moves to the left rail and names the sections
                in plain English, in the spec's order. Active item = pine text,
                3px left border, paper bg — the §1b active pattern. */}
            <nav aria-label="Settings sections" className="md:w-52 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {SECTIONS.map(s => (
                <button key={s} onClick={() => setActive(s)}
                  aria-current={active===s ? 'page' : undefined}
                  className={'text-left whitespace-nowrap px-3 py-2 text-[13.5px] font-medium border-l-[3px] transition-colors ' + (active===s ? 'border-pine bg-paper text-pine' : 'border-transparent text-ink-soft hover:text-ink hover:bg-line-soft/60')}>
                  {s}
                </button>
              ))}
            </nav>

            <div className="flex-1 min-w-0">

          {/* ── How you look ── */}
          {active==='Your course' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
              <SectionCard title="How you look">
                <p className="text-sm text-ink-soft -mt-1">The three things golfers see first. Logo and photo save the moment you upload them; the colour saves with the button above.</p>
                <ImageUpload label="Your logo" kind="logo" value={(form.logoUrl as string)||''} onUploaded={url=>setForm(f=>({...f,logoUrl:url}))} hint="Square works best (a PNG with a transparent background is ideal). Max 8MB — large photos are auto-resized."/>
                <Field label="Your colour" hint="One accent colour. It tints your dashboard and the buttons on your booking page. Click the swatch to pick.">
                  <div className="flex items-center gap-2">
                    <input type="color" value={(form.brandColor as string) || '#173B2A'} onChange={e => set('brandColor', e.target.value)}
                      className="w-10 h-10 rounded-full border border-line cursor-pointer p-0.5 bg-paper"/>
                    <input type="text" value={(form.brandColor as string) || '#173B2A'} onChange={e => set('brandColor', e.target.value)}
                      placeholder="#173B2A" maxLength={7}
                      className="bg-paper border border-line rounded-md px-3 py-2.5 text-sm font-mono text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors w-32"/>
                  </div>
                </Field>
                <ImageUpload label="Your course photo" kind="hero" value={(form.heroImageUrl as string)||''} onUploaded={url=>setForm(f=>({...f,heroImageUrl:url}))} hint="A wide landscape shot — it sits behind your course name as the banner. Max 8MB — large photos are auto-resized."/>
                {/* PERS-1: the golfer's checkout, confirmation, check-in and manage pages wear the photo,
                    logo and colour above automatically. This note is the one thing they add. */}
                <Field label="A note for golfers after they book" hint="Optional. Shown on the confirmation page and in the confirmation email — e.g. where to check in or park. 400 characters.">
                  <textarea value={(form.confirmationNote as string) || ''} onChange={e => set('confirmationNote', e.target.value)} rows={3} maxLength={400}
                    placeholder="Check in at the pro shop 15 minutes before your tee time. Carts are behind the clubhouse."
                    className={INPUT + ' w-full'}/>
                </Field>
              </SectionCard>
              {/* B-6: the live preview — the form state, drawn as the golfer's page.
                  Read-only; it saves nothing. Sticky beside the fields on wide
                  screens, below them otherwise. */}
              <div className="xl:sticky xl:top-6">
                <div className="text-[13px] font-semibold text-ink mb-2">What golfers see</div>
                <CoursePreview
                  name={(form.name as string) || ''}
                  type={(form.type as string) || 'public'}
                  city={(form.city as string) || ''}
                  state={(form.state as string) || ''}
                  holes={typeof form.holes === 'number' ? form.holes : null}
                  par={typeof form.par === 'number' ? form.par : null}
                  establishedYear={typeof form.establishedYear === 'number' ? form.establishedYear : null}
                  accent={(form.brandColor as string) || '#173B2A'}
                  logoUrl={(form.logoUrl as string) || ''}
                  heroImageUrl={(form.heroImageUrl as string) || ''}
                />
                <p className="text-[12px] text-ink-soft mt-2">Updates as you type. The real page shows your live tee times and prices.</p>
              </div>
            </div>
          )}

          {/* ── Basic information ── */}
          {active==='Your course' && (
            <div className="space-y-5">
              <SectionCard title="Course identity">
                <p className="text-sm text-ink-soft -mt-1">Your name and address are what GreenReserve listed and what golfers search for, so we change them with you rather than silently. Everything else on this page you edit yourself.</p>
                <dl className="divide-y divide-line-soft border border-line rounded-md">
                  {IDENTITY_ROWS.map(r => (
                    <div key={r.key} className="flex items-baseline gap-3 px-3 py-2.5">
                      <dt className="w-28 shrink-0 text-[13px] font-semibold text-ink">{r.label}</dt>
                      <dd className="text-sm text-ink min-w-0 break-words">{(form[r.key] as string) || <span className="text-ink-faint">Not set</span>}</dd>
                    </div>
                  ))}
                  <div className="flex items-baseline gap-3 px-3 py-2.5">
                    <dt className="w-28 shrink-0 text-[13px] font-semibold text-ink">Status</dt>
                    <dd className="text-sm text-ink capitalize">{(form.liveStatus as string) === 'live' ? 'Live to golfers' : `${(form.liveStatus as string) || 'draft'} — not live yet`}</dd>
                  </div>
                </dl>
                {changeSent ? (
                  <div className="flex items-center gap-2 bg-ok/5 border border-ok/20 text-ok rounded-md px-3 py-2.5 text-[13.5px]">
                    <StatusDot status="ok" />
                    Sent. We&apos;ll reply on <a href="/dashboard/messages" className="underline font-medium">Messages</a>.
                  </div>
                ) : changeOpen ? (
                  <div className="space-y-2">
                    <textarea value={changeText} onChange={e => setChangeText(e.target.value)} rows={3} maxLength={2000}
                      placeholder="e.g. We rebranded to Hollow Creek Golf Club — please update the name and our new address."
                      className={iCls + ' resize-none'} aria-label="What should we change?"/>
                    <div className="flex items-center gap-2">
                      <button onClick={requestChange} disabled={changeSending || !changeText.trim()}
                        className="bg-pine hover:bg-pine-hover text-white text-[12.5px] font-medium px-4 py-2 rounded-md disabled:opacity-50 transition-colors">
                        {changeSending ? 'Sending…' : 'Send request'}
                      </button>
                      <button onClick={() => { setChangeOpen(false); setChangeText(''); }} className="text-[12.5px] text-ink-muted hover:text-ink px-2 py-2">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setChangeOpen(true)}
                    className="text-[12.5px] font-medium text-pine border border-pine/30 hover:bg-pine/5 rounded-md px-3 py-1.5 transition-colors w-fit">
                    Request a change
                  </button>
                )}
              </SectionCard>

              <SectionCard title="Contact">
                <Field label="Phone"><FInput value={form.phone as string} onChange={v=>set('phone',v)} type="tel"/></Field>
                <Field label="Website"><FInput value={form.website as string} onChange={v=>set('website',v)} placeholder="https://"/></Field>
                <Field label="Course Type">
                  <select value={form.type as string} onChange={e=>set('type',e.target.value)} className={iCls}>
                    {/* A-04b: new selections are Public/Private only — a legacy
                        value (semi-private/resort/municipal) stays visible/
                        selected here rather than silently blanking out. */}
                    {(typeof form.type === 'string' && form.type && !['public','private'].includes(form.type) ? ['public','private', form.type] : ['public','private']).map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </Field>
                <Field label="Established Year" hint="Optional — shown in your sidebar identity.">
                  <input type="number" value={(form.establishedYear as number) || ''} onChange={e => set('establishedYear', e.target.value ? Number(e.target.value) : null)}
                    placeholder="e.g. 1927" min={1850} max={new Date().getFullYear()} className={iCls}/>
                </Field>
                <Field label="Description">
                  {birdieOn && access.can('settings.edit') && (
                    <button type="button" onClick={askForDescription} className="mb-1.5 text-[12.5px] font-medium text-pine hover:underline underline-offset-4">
                      {String(form.description ?? '').trim() ? 'Ask Birdie to improve it' : 'Ask Birdie to write it'}
                    </button>
                  )}
                  <textarea value={(form.description as string)||''} onChange={e=>set('description',e.target.value)} rows={4} className={iCls + ' resize-none'} placeholder="Tell golfers what makes your course special — history, signature holes, views, etc."/>
                </Field>
                <Field label="Gift Card URL" hint="Paste the URL to where golfers can buy gift cards (your website, Square, etc.). An optional button will appear on your course page.">
                  <FInput value={(form.giftCardUrl as string)||''} onChange={v=>set('giftCardUrl',v)} placeholder="https://"/>
                </Field>
              </SectionCard>
            </div>
          )}

          {/* ── Course layout ── guided steps; each saves itself (CourseLayoutTab). */}
          {active==='Course layout' && (
            <CourseLayoutTab
              holes={typeof form.holes === 'number' ? form.holes : null}
              par={typeof form.par === 'number' ? form.par : null}
              readOnly={isStaffLogin}
              onCourseSaved={patch => setForm(f => ({ ...f, ...patch }))}
            />
          )}

          {/* ── Photos ── */}
          {active==='Your course' && (
            <div className="space-y-5">
              <SectionCard title="Gallery Photos">
                <p className="text-sm text-ink-soft -mt-1">Add up to 8 photos of your course. These appear in the Photos section of your booking page. Uploads save immediately.</p>
                {photoErr && (
                  <div className="flex items-center gap-2 bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm">
                    <StatusDot status="bad" />{photoErr}
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {photos.map(p => (
                    <div key={p.id} className="relative group aspect-video rounded-md overflow-hidden border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="w-full h-full object-cover"/>
                      <button
                        onClick={() => deleteGalleryPhoto(p.id)}
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-bad"
                        title="Remove photo"
                      >
                        <X className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  ))}
                  {photos.length < 8 && (
                    <label className={`aspect-video rounded-md border-2 border-dashed border-line flex flex-col items-center justify-center cursor-pointer hover:border-pine/40 transition-colors ${uploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}>
                      {uploadingPhoto ? (
                        <Loader2 className="w-5 h-5 text-ink-faint animate-spin"/>
                      ) : (
                        <>
                          
                          <span className="text-xs text-ink-faint">Add photo</span>
                        </>
                      )}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingPhoto} onChange={e => uploadGalleryPhoto(e.target.files?.[0] ?? null)}/>
                    </label>
                  )}
                </div>
                <p className="text-xs text-ink-faint">{photos.length}/8 photos · JPEG, PNG, or WebP · Max 8MB each (large photos are auto-resized)</p>
              </SectionCard>
            </div>
          )}



          {/* ── Member & resident pricing ── */}
          {active==='Prices & fees' && (
            <div className="space-y-5">
              {/* Cam 2026-10-19: member vs resident pricing confused people. One
                  table of who pays what, read from Schedule and Members. */}
              <WhoPaysWhat accessLoaded={access.loaded} accessFailed={!!access.failed} canSeeSchedule={access.can('schedule.view')} canSeeMembers={access.can('members.view')} />
              <SectionCard title="Members and residents">
                <Toggle label="We offer member prices" checked={!!form.hasMemberPricing} onChange={()=>tog('hasMemberPricing')}/>
                <Toggle label="We offer resident prices" checked={!!form.hasResidentPricing} onChange={()=>tog('hasResidentPricing')}/>
                {!!form.hasResidentPricing && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Who counts as a resident: county"><FInput value={form.residentCounty as string} onChange={v=>set('residentCounty',v)} placeholder="e.g. Bergen"/></Field>
                      <Field label="State"><FInput value={form.residentState as string} onChange={v=>set('residentState',v)} maxLength={2} placeholder="NJ"/></Field>
                    </div>
                    <Toggle label="Residents show proof of residency at check-in" checked={!!form.residentProofRequired} onChange={()=>tog('residentProofRequired')}/>
                  </>
                )}
              </SectionCard>
            </div>
          )}

          {/* ── Booking rules ── Settings rework (Cam 2026-10-19: "reword and organise";
              the dress-code and walking selection buttons were bad). Plain questions,
              and the two things golfers read get a text box with a live preview. */}
          {active==='Booking rules' && (
            <div className="space-y-5">
              <SectionCard title="When golfers can book">
                {/* SD-3: the course's clock — every "today" on the sheet and in the crons reads it. */}
                <Field label="Your time zone" hint="Your tee sheet's today, and the check-in and cancellation clocks, all run on this.">
                  <select value={String(form.timezone ?? 'America/New_York')} onChange={e=>set('timezone',e.target.value)} className={iCls}>
                    {US_TIMEZONES.map(z => <option key={z.id} value={z.id}>{z.label} — {z.id}</option>)}
                  </select>
                </Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Days ahead anyone can book" hint={`Golfers see today plus the next ${Number(form.publicAdvanceDays) || 0} days.`}>
                    <FInput value={form.publicAdvanceDays as number} onChange={v=>set('publicAdvanceDays',Number(v))} type="number"/>
                  </Field>
                  {!!form.hasMemberPricing && (
                    <Field label="Days ahead members can book" hint="Each membership can set its own on Members.">
                      <FInput value={form.memberAdvanceDays as number} onChange={v=>set('memberAdvanceDays',Number(v))} type="number"/>
                    </Field>
                  )}
                </div>
              </SectionCard>
              <SectionCard title="Group size">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fewest players in a booking"><FInput value={form.minPlayers as number} onChange={v=>set('minPlayers',Number(v))} type="number"/></Field>
                  <Field label="Most players in a booking"><FInput value={form.maxPlayers as number} onChange={v=>set('maxPlayers',Number(v))} type="number"/></Field>
                </div>
              </SectionCard>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
                <SectionCard title="What golfers should know">
                  <Field label="Dress code" hint="One rule per line. Leave it empty if you don't have one.">
                    <textarea value={dresscodes.join('\n')} onChange={e => set('dresscode', e.target.value.split('\n'))} rows={4}
                      placeholder={'Collared shirts\nNo denim\nSoft spikes only'} className={iCls + ' resize-none'}/>
                  </Field>
                  <Field label="Walking">
                    <div className="space-y-2">
                      {WALKING_CHOICES.map(o => (
                        <label key={o.key} className={'flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer bg-white text-sm text-ink ' + (walking === o.key ? 'border-pine/40' : 'border-line')}>
                          <input type="radio" name="walking" checked={walking === o.key} onChange={() => set('walkingAllowed', o.key)} className="accent-pine"/>
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Anything else about walking or carts" hint="Optional, one sentence.">
                    <FInput value={form.walkingNote as string} onChange={v=>set('walkingNote',v)} placeholder="e.g. Push carts are free at the pro shop." maxLength={500}/>
                  </Field>
                </SectionCard>
                <div className="xl:sticky xl:top-6">
                  <div className="text-[13px] font-semibold text-ink mb-2">On your booking page</div>
                  <Card className="p-4 space-y-3 text-sm">
                    <div>
                      <div className="text-[13px] font-semibold text-ink">Walking</div>
                      <div className="text-ink">{walkingWords(walking)}{String(form.walkingNote ?? '').trim() ? ` ${String(form.walkingNote).trim()}` : ''}</div>
                    </div>
                    {dresscodeLines.length > 0 && (
                      <div>
                        <div className="text-[13px] font-semibold text-ink">Dress code</div>
                        <ul className="text-ink list-disc pl-5">{dresscodeLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                      </div>
                    )}
                  </Card>
                  <p className="text-[12px] text-ink-soft mt-2">Updates as you type. Shown in the About section of your booking page.</p>
                </div>
              </div>
            </div>
          )}


          {/* ── Cancellation ── */}
          {active==='Prices & fees' && (
            <div className="space-y-5">
              {/* SP-B: the course's cancellation & card policy. The preview is
                  describePolicy() — word for word what golfers are shown. */}
              {isStaffLogin ? (
                <SectionCard title="Cancellation & card">
                  <ul className="space-y-1 text-sm text-ink-soft">{formTerms.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  <p className="text-xs text-ink-soft">Only the course owner&apos;s login can change the cancellation policy.</p>
                </SectionCard>
              ) : (<SectionCard title="Cancellation & card">
                {/* CARD-1 (Cam 2026-10-05: "a way for the course to not require a card"): the
                    choice made explicit. Nothing new is stored — "no card" IS both fees at $0
                    (cardRequired() in lib/cancel-policy), so picking it clears the fees and the
                    pay-link hours below become the whole policy. */}
                <Field label="Card at booking">
                  <div className="space-y-2">
                    {([
                      { key: 'card', label: 'Ask for a card at booking', help: 'Lets you charge a late-cancellation or no-show fee. Nothing is charged at booking.' },
                      { key: 'none', label: 'No card at booking', help: 'Golfers book with their name and email only, then get a link to check in and pay before their round. No late or no-show fees — there would be no card to charge.' },
                    ] as const).map(o => {
                      const sel = (o.key === 'card') === formTerms.cardNeeded;
                      return (
                        <label key={o.key} className={'flex items-start gap-2.5 px-3 py-2.5 rounded-md border cursor-pointer bg-white ' + (sel ? 'border-pine/40' : 'border-line')}>
                          <input type="radio" name="card-at-booking" checked={sel} className="mt-0.5 accent-pine"
                            onChange={() => {
                              if (o.key === 'none') { set('lateCancellationFee', 0); set('noShowFee', 0); }
                              else if (!formTerms.cardNeeded) set('lateCancellationFee', 10);
                            }}/>
                          <span><span className="block text-sm font-medium text-ink">{o.label}</span><span className="block text-xs text-ink-muted">{o.help}</span></span>
                        </label>
                      );
                    })}
                  </div>
                </Field>
                {formTerms.cardNeeded && <Toggle label="Late-cancellation fee" checked={!!form.lateCancellationFee} onChange={() => set('lateCancellationFee', form.lateCancellationFee ? 0 : 10)}/>}
                {formTerms.cardNeeded && !!form.lateCancellationFee && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field label="Fee ($)">
                        <FInput value={form.lateCancellationFee as number} onChange={v=>set('lateCancellationFee',Number(v))} type="number" step="0.01"/>
                      </Field>
                      <Field label="Charged">
                        <select value={(form.lateFeeBasis as string) || 'booking'} onChange={e=>set('lateFeeBasis',e.target.value)} className={iCls}>
                          <option value="booking">Per booking</option>
                          <option value="player">Per player</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Free cancellation until (hours before the tee time)">
                      <FInput value={form.cancellationHours as number} onChange={v=>set('cancellationHours',Number(v))} type="number"/>
                    </Field>
                    <Field label="When the fee is taken">
                      <div className="space-y-2">
                        {LATE_FEE_TIMINGS.map(t => (
                          <label key={t.key} className={'flex items-start gap-2.5 px-3 py-2.5 rounded-md border cursor-pointer bg-white ' + (((form.lateFeeTiming as string) || 'hold_at_cutoff') === t.key ? 'border-pine/40' : 'border-line')}>
                            <input type="radio" name="late-fee-timing" checked={((form.lateFeeTiming as string) || 'hold_at_cutoff') === t.key} onChange={() => set('lateFeeTiming', t.key)} className="mt-0.5 accent-pine"/>
                            <span><span className="block text-sm font-medium text-ink">{t.label}</span><span className="block text-xs text-ink-muted">{t.help}</span></span>
                          </label>
                        ))}
                      </div>
                    </Field>
                  </>
                )}
                {formTerms.cardNeeded && <Toggle label="No-show fee" checked={!!form.noShowFee} onChange={() => set('noShowFee', form.noShowFee ? 0 : 20)}/>}
                {formTerms.cardNeeded && !!form.noShowFee && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="No-show fee ($)" hint="Charged at midnight when a group marked a no-show never checked in. Under “cancel late or don’t show” this replaces the late fee for a no-show.">
                      <FInput value={form.noShowFee as number} onChange={v=>set('noShowFee',Number(v))} type="number" step="0.01"/>
                    </Field>
                    <Field label="Charged">
                      <select value={(form.noShowFeeBasis as string) || 'booking'} onChange={e=>set('noShowFeeBasis',e.target.value)} className={iCls}>
                        <option value="booking">Per booking</option>
                        <option value="player">Per player</option>
                      </select>
                    </Field>
                  </div>
                )}
                <Toggle label="Mark no-shows automatically" checked={!!form.autoNoShowMinutes} onChange={() => set('autoNoShowMinutes', form.autoNoShowMinutes ? null : 30)}/>
                {!!form.autoNoShowMinutes && (
                  <Field label="Minutes after the tee time with nobody checked in" hint="Checked every hour. It only flags the group — nothing is charged until midnight, and “Still coming” or a check-in before then clears it.">
                    <FInput value={form.autoNoShowMinutes as number} onChange={v=>set('autoNoShowMinutes',Number(v))} type="number"/>
                  </Field>
                )}
                <Field label={formTerms.cardNeeded ? 'Check-in reminder (hours before the round)' : 'Pay link (hours before the round)'} hint={formTerms.cardNeeded ? 'Golfers get their check-in link this many hours before their tee time.' : 'Golfers get a link this many hours before their tee time to check in and pay.'}>
                  <FInput value={(form.checkInWindowHours ?? 3) as number} onChange={v=>set('checkInWindowHours',Number(v))} type="number"/>
                </Field>
                <Field label="Rain check policy"><FInput value={form.rainCheckPolicy as string} onChange={v=>set('rainCheckPolicy',v)} placeholder="e.g. Rain checks issued for 9+ holes of rain"/></Field>
                <div className="bg-paper/70 rounded-md p-4">
                  <Eyebrow className="mb-2">What golfers will see</Eyebrow>
                  <ul className="space-y-1 text-sm text-ink">{formTerms.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  <p className="text-xs text-ink-soft mt-2">{formTerms.cardNeeded ? 'A card is saved at booking because a fee above can be charged.' : 'No card is asked for at booking — there is nothing to charge it for.'} Weather and course-closed cancellations are always free.</p>
                </div>
              </SectionCard>)}
            </div>
          )}

          {/* ── Facilities ── Settings rework (Cam 2026-10-19: "the worst thing I have
              ever seen"). One checklist of what the course has; ticking a line opens
              its one or two details. Beside it, the list exactly as golfers read it. */}
          {active==='Facilities' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
              <Card className="p-5">
                <h2 className="text-[15px] font-semibold text-ink">What your course has</h2>
                <p className="text-sm text-ink-soft mt-1 mb-3">Tick everything golfers can use. It shows on your booking page.</p>
                {FACILITY_GROUPS.map(g => (
                  <div key={g.title} className="border-t border-line-soft pt-3 mt-3 first-of-type:border-0">
                    <h3 className="text-[13px] font-semibold text-ink mb-1">{g.title}</h3>
                    <ul>
                      {g.items.map(it => (
                        <li key={it.key} className="py-1.5">
                          <label className="flex items-center gap-2.5 text-sm text-ink cursor-pointer">
                            <input type="checkbox" checked={!!form[it.key]} onChange={() => tog(it.key)} className="accent-pine w-4 h-4"/>
                            {it.label}
                          </label>
                          {!!form[it.key] && it.key === 'hasDrivingRange' && (
                            <div className="pl-[26px] mt-2 flex flex-wrap items-center gap-3">
                              <select value={String(form.drivingRangeType ?? '')} onChange={e=>set('drivingRangeType',e.target.value)} className={iCls + ' !w-auto'} aria-label="Range type">
                                <option value="">Type of range…</option>
                                {Object.entries(RANGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                              </select>
                              <label className="flex items-center gap-2 text-[13px] text-ink-soft"><input type="checkbox" checked={form.rangeBallsFree !== false} onChange={() => set('rangeBallsFree', form.rangeBallsFree === false)} className="accent-pine"/>Balls included with a round</label>
                            </div>
                          )}
                          {!!form[it.key] && it.key === 'hasProShop' && (
                            <div className="pl-[26px] mt-2 max-w-xs"><FInput value={form.proShopPhone as string} onChange={v=>set('proShopPhone',v)} placeholder="Pro shop phone (optional)" type="tel"/></div>
                          )}
                          {!!form[it.key] && it.key === 'hasClubRental' && (
                            <label className="pl-[26px] mt-2 flex items-center gap-2 text-[13px] text-ink-soft">Price $<span className="w-28"><FInput value={(form.clubRentalRate as number) || ''} onChange={v=>set('clubRentalRate',Number(v))} placeholder="optional" type="number"/></span></label>
                          )}
                          {!!form[it.key] && it.key === 'hasPushCartRental' && (
                            <label className="pl-[26px] mt-2 flex items-center gap-2 text-[13px] text-ink-soft">Price $<span className="w-28"><FInput value={(form.pushCartRate as number) || ''} onChange={v=>set('pushCartRate',Number(v))} placeholder="optional" type="number"/></span></label>
                          )}
                          {!!form[it.key] && it.key === 'hasCaddies' && (
                            <div className="pl-[26px] mt-2 grid sm:grid-cols-3 gap-2">
                              <select value={String(form.caddieType || 'looper')} onChange={e=>set('caddieType',e.target.value)} className={iCls} aria-label="Caddie type">
                                <option value="looper">Caddies carry the bag</option>
                                <option value="fore_caddie">Fore caddies</option>
                                <option value="both">Both</option>
                              </select>
                              {form.caddieType !== 'fore_caddie' && <label className="flex items-center gap-2 text-[13px] text-ink-soft whitespace-nowrap">Per bag $<FInput value={(form.caddieLooperRate as number) || ''} onChange={v=>set('caddieLooperRate',Number(v))} placeholder="optional" type="number"/></label>}
                              {(form.caddieType === 'fore_caddie' || form.caddieType === 'both') && <label className="flex items-center gap-2 text-[13px] text-ink-soft whitespace-nowrap">Fore caddie $<FInput value={(form.caddieForeRate as number) || ''} onChange={v=>set('caddieForeRate',Number(v))} placeholder="optional" type="number"/></label>}
                              <div className="sm:col-span-3"><FInput value={form.caddieNote as string} onChange={v=>set('caddieNote',v)} placeholder="e.g. Book 48 hours ahead (optional)"/></div>
                            </div>
                          )}
                          {!!form[it.key] && it.key === 'hasTournaments' && (
                            <div className="pl-[26px] mt-2 max-w-xs">
                              <select value={String(form.tournamentFrequency ?? '')} onChange={e=>set('tournamentFrequency',e.target.value)} className={iCls} aria-label="How often">
                                <option value="">How often? (optional)</option>
                                {Object.entries(TOURNAMENT_FREQ).map(([k, v]) => <option key={k} value={k}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                              </select>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="border-t border-line-soft pt-3 mt-3">
                  <h3 className="text-[13px] font-semibold text-ink mb-1">Food and drink</h3>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {Object.entries(FOOD_TYPES).map(([k, v]) => (
                      <label key={k} className="flex items-center gap-2.5 text-sm text-ink cursor-pointer py-1">
                        <input type="radio" name="food" checked={(form.restaurantType || 'none') === k} onChange={() => set('restaurantType', k)} className="accent-pine"/>{v}
                      </label>
                    ))}
                  </div>
                  {['snack_bar','bar','full'].includes(form.restaurantType as string) && (
                    <label className="flex items-center gap-2.5 text-sm text-ink cursor-pointer py-1 mt-1">
                      <input type="checkbox" checked={!!form.hasCartGirl} onChange={() => tog('hasCartGirl')} className="accent-pine w-4 h-4"/>A beverage cart on the course as well
                    </label>
                  )}
                </div>
                <div className="border-t border-line-soft pt-3 mt-3">
                  <Field label="Anything else" hint="One per line — e.g. Dog-friendly, Simulator bay. Each shows as its own line.">
                    <textarea value={((form.amenities as string[]) || []).join('\n')} onChange={e => set('amenities', e.target.value.split('\n'))} rows={3} className={iCls + ' resize-none'}/>
                  </Field>
                </div>
              </Card>
              <div className="xl:sticky xl:top-6">
                <div className="text-[13px] font-semibold text-ink mb-2">On your booking page</div>
                <Card className="p-4 text-sm">
                  {facilityPreview.length ? (
                    <ul className="list-disc pl-5 space-y-0.5 text-ink">{facilityPreview.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  ) : <p className="text-ink-soft">Nothing ticked yet, so golfers see no Facilities section.</p>}
                </Card>
                <p className="text-[12px] text-ink-soft mt-2">Updates as you tick. Prices here are shown to golfers, never charged.</p>
              </div>
            </div>
          )}

          {/* ── Pro shop (POS-1a) ── items save themselves. */}
          {active==='Pro shop' && (
            <div className="space-y-5">
              <SectionCard title="Pro shop">
                <ShopCatalog />
              </SectionCard>
            </div>
          )}

          {/* ── Staff ── */}
          {active==='Staff' && (
            <div className="space-y-5">
              {/* SP-A: who works here and what each person may do — the owner's alone. */}
              <SectionCard title="Staff & permissions">
                {isStaffLogin
                  ? <p className="text-sm text-ink-soft">Staff accounts and what each person can do are managed from the course owner&apos;s login.</p>
                  : <StaffPermissions />}
              </SectionCard>
            </div>
          )}

          {/* ── Your account ── this login's email, password and two-step, top to bottom. */}
          {active==='Your account' && (
            <div className="space-y-5">
              {/* W2-2 (Cam 2026-10-19): say plainly whose login this is — the owner is the admin of their own course. */}
              {access.loaded && (
                <div className="bg-white rounded-lg shadow-card p-5">
                  <div className="text-[15px] font-semibold text-ink">{isStaffLogin ? 'Staff login' : 'Owner account'}</div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {isStaffLogin
                      ? <>You are signed in as staff at {String(form.name || 'this course')}. The course owner decides what you can see and change.</>
                      : <>This is the owner login for {String(form.name || 'your course')}: the admin for your own course. You can change everything here, and you decide what each staff login can do in <button type="button" onClick={() => goTo('Staff')} className="text-pine underline">Staff</button>.</>}
                  </p>
                </div>
              )}
              <SectionCard title="Signing in">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink">Email</div>
                    <div className="text-sm text-ink break-all">{operatorEmail || '…'}</div>
                  </div>
                  <p className="text-[12.5px] text-ink-muted">{isStaffLogin ? 'To change it, ask the course owner.' : <>To change it, message us on <a href="/dashboard/messages" className="text-pine underline">Messages</a>.</>}</p>
                </div>
                {/* Staff logins are a separate account: the password and two-step
                    routes here are the owner's only (both refuse staff). */}
                {isStaffLogin && <p className="border-t border-line-soft pt-4 text-sm text-ink-soft">Your password and sign-in codes are set up by the course owner. Ask them if you need a new password.</p>}
                {!isStaffLogin && <div className="border-t border-line-soft pt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-semibold text-ink">Password</div>
                      <p className="text-[12.5px] text-ink-muted">For your own login only. Staff keep their own passwords.</p>
                    </div>
                    {!pwOpen && (
                      <button onClick={() => { setPwOpen(true); setPwMsg(''); }}
                        className="text-[12.5px] font-medium text-pine border border-pine/30 hover:bg-pine/5 rounded-md px-3 py-1.5 transition-colors">
                        Change password
                      </button>
                    )}
                  </div>
                  {pwMsg && (
                    <div className="mt-3 bg-ok/5 border border-ok/20 text-ok rounded-md px-4 py-3 text-sm flex items-center gap-2">
                      <StatusDot status="ok" />{pwMsg}
                    </div>
                  )}
                  {pwOpen && (
                    <div className="mt-3 space-y-3">
                      {pwError && (
                        <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm flex items-center gap-2">
                          <StatusDot status="bad" />{pwError}
                        </div>
                      )}
                      <Field label="Current password"><FInput type="password" value={pwForm.currentPassword} onChange={v=>setPwForm(f=>({...f,currentPassword:v}))}/></Field>
                      <Field label="New password" hint={PASSWORD_REQUIREMENTS_HINT}>
                        <FInput type="password" value={pwForm.newPassword} onChange={v=>setPwForm(f=>({...f,newPassword:v}))}/>
                      </Field>
                      <Field label="New password again"><FInput type="password" value={pwForm.confirmPassword} onChange={v=>setPwForm(f=>({...f,confirmPassword:v}))}/></Field>
                      <div className="flex flex-wrap items-center gap-3">
                        <button onClick={changePassword} disabled={pwSaving}
                          className="bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors">
                          {pwSaving ? 'Updating…' : 'Update password'}
                        </button>
                        <button onClick={() => { setPwOpen(false); setPwError(''); setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); }} className="text-[12.5px] text-ink-muted hover:text-ink">Cancel</button>
                      </div>
                      <div className="text-[12.5px] text-ink-soft">
                        {resetEmailSent ? (
                          <span className="flex items-center gap-2 text-ok"><StatusDot status="ok" />Check {operatorEmail} for a reset link.</span>
                        ) : (
                          <>Don&apos;t remember your current password?{' '}
                            <button onClick={emailResetLinkInstead} disabled={emailingReset||!operatorEmail} className="font-medium text-pine hover:underline disabled:opacity-50">
                              {emailingReset ? 'Sending…' : 'Email me a reset link'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>}
              </SectionCard>
              {!isStaffLogin && <SectionCard title="Two-step sign-in">
                <p className="text-sm text-ink-soft -mt-1">Every sign-in asks for a 6-digit code as well as your password. Choose where it&apos;s sent.</p>
                {error2FA && (
                  <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm flex items-center gap-2">
                    <StatusDot status="bad" />{error2FA}
                  </div>
                )}
                <div className="space-y-2">
                  {([
                    { key: 'email', label: 'Email', help: operatorEmail ? `Sent to ${operatorEmail}.` : 'Sent to your sign-in email.' },
                    { key: 'sms', label: 'Text message', help: 'Sent to a mobile number you add below.' },
                  ] as const).map(o => {
                    const sel = ((form.twoFactorMethod as string) === 'sms' ? 'sms' : 'email') === o.key;
                    return (
                      <label key={o.key} className={'flex items-start gap-2.5 px-3 py-2.5 rounded-md border cursor-pointer bg-white ' + (sel ? 'border-pine/40' : 'border-line')}>
                        <input type="radio" name="two-step" checked={sel} onChange={() => set('twoFactorMethod', o.key)} className="mt-0.5 accent-pine"/>
                        <span><span className="block text-sm font-medium text-ink">{o.label}</span><span className="block text-xs text-ink-muted">{o.help}</span></span>
                      </label>
                    );
                  })}
                </div>
                {(form.twoFactorMethod as string) === 'sms' && (
                  <Field label="Mobile number for codes">
                    <FInput value={form.twoFactorPhone as string} onChange={v=>set('twoFactorPhone',v)} type="tel" placeholder="+1 (201) 555-0100"/>
                  </Field>
                )}
                <button onClick={save2FA} disabled={saving2FA || (!dirtyFields.has('twoFactorMethod') && !dirtyFields.has('twoFactorPhone') && !saved2FA)}
                  className="w-fit bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors">
                  {saving2FA ? 'Saving…' : saved2FA ? 'Saved' : 'Save'}
                </button>
              </SectionCard>}
            </div>
          )}

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return <Suspense><SettingsPageInner/></Suspense>;
}
