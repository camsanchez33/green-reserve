'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Save, Plus, Trash2, Copy, Users, Eye, EyeOff, CreditCard, CheckCircle2, AlertCircle, Loader2, KeyRound, Mail, Smartphone, Image as ImageIcon, X } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import CourseLayoutTab from '@/components/dashboard/CourseLayoutTab';
import { TabIntroButton, TabIntroCard } from '@/components/dashboard/TabIntro';
import { useTabIntro } from '@/lib/use-tab-intro';
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from '@/lib/password';
import { downscaleImage } from '@/lib/image-resize';

type Course = Record<string, unknown>;
interface StaffMember { id: string; name: string; email: string; role: string; active: boolean; }
const SECTIONS = ['Course Info', 'Course & Layout', 'Photos', 'Payments', 'Pricing Policy', 'Course Policy', 'Facilities', 'Staff', 'Account'] as const;
type Section = typeof SECTIONS[number];
const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-lg p-5">
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-4">{title}</div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-ink-faint mt-1">{hint}</p>}
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
      <button onClick={onChange} className={'relative w-11 h-6 rounded-full transition-colors ' + (checked ? 'bg-pine' : 'bg-line-strong')}>
        <span className={'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ' + (checked ? 'translate-x-5' : '')}/>
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
      <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">{label}</label>
      <div className="flex items-center gap-4">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={kind === 'logo' ? 'h-14 w-14 object-contain bg-paper rounded-md p-1 border border-line' : 'h-14 w-24 object-cover rounded-md border border-line'}/>
        ) : (
          <div className="h-14 w-24 rounded-md bg-paper border border-dashed border-line flex items-center justify-center text-ink-faint">
            <ImageIcon size={16}/>
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
      <p className="text-xs text-ink-faint mt-1.5">{hint}</p>
      {err && <p className="text-xs text-bad mt-1">{err}</p>}
    </div>
  );
}

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const stripeParam = searchParams.get('stripe');

  const [active, setActive] = useState<Section>(stripeParam ? 'Payments' : 'Course Info');
  const intro = useTabIntro('settings');
  const [form, setForm] = useState<Record<string,unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [newStaff, setNewStaff] = useState({ name:'', email:'', role:'staff' });
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffResult, setStaffResult] = useState<{tempPassword:string;name:string}|null>(null);
  const [showPass, setShowPass] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [stripeError, setStripeError] = useState('');
  const [openingStripeDashboard, setOpeningStripeDashboard] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');
  const [operatorEmail, setOperatorEmail] = useState('');
  const [emailingReset, setEmailingReset] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [saving2FA, setSaving2FA] = useState(false);
  const [saved2FA, setSaved2FA] = useState(false);
  const [error2FA, setError2FA] = useState('');
  const [photos, setPhotos] = useState<{ id: string; url: string; sortOrder: number }[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoErr, setPhotoErr] = useState('');

  const refreshForm = () => fetch('/api/operator/settings').then(r=>r.json()).then(setForm);

  const refreshPhotos = () => fetch('/api/operator/photos').then(r=>r.json()).then(setPhotos);

  useEffect(() => {
    refreshForm();
    fetch('/api/operator/staff').then(r=>r.json()).then(setStaff);
    fetch('/api/operator/profile').then(r=>r.json()).then(p=>{ if(p?.email) setOperatorEmail(p.email); });
    refreshPhotos();
    // Admin can flip live/draft status or Stripe connection state while this
    // tab sits open in the background — refresh on refocus instead of
    // showing whatever was true when the page first loaded.
    window.addEventListener('focus', refreshForm);
    return () => window.removeEventListener('focus', refreshForm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    await fetch('/api/auth/forgot-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: operatorEmail }) });
    setEmailingReset(false);
    setResetEmailSent(true);
  }

  async function connectStripe() {
    setConnecting(true); setStripeError('');
    try {
      const res = await fetch('/api/operator/stripe/connect');
      const data = await res.json();
      if (!res.ok) { setStripeError(data.error || 'Could not start Stripe Connect.'); setConnecting(false); return; }
      if (data.url) { window.location.href = data.url; return; }
      if (data.connected) { await refreshForm(); }
    } catch { setStripeError('Could not reach Stripe. Try again.'); }
    setConnecting(false);
  }

  async function openStripeDashboard() {
    setOpeningStripeDashboard(true); setStripeError('');
    try {
      const res = await fetch('/api/operator/stripe/dashboard-link', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.url) { window.open(data.url, '_blank', 'noopener'); }
      else { setStripeError(data.error || 'Could not open the Stripe dashboard.'); }
    } catch { setStripeError('Could not reach Stripe. Try again.'); }
    setOpeningStripeDashboard(false);
  }

  const set = (k:string, v:unknown) => setForm(f=>({...f,[k]:v}));
  const tog = (k:string) => setForm(f=>({...f,[k]:!f[k]}));

  async function save() {
    setSaving(true);
    await fetch('/api/operator/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2000);
  }

  async function addStaffMember() {
    if(!newStaff.name||!newStaff.email) return;
    setAddingStaff(true);
    const res = await fetch('/api/operator/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newStaff)});
    const data = await res.json();
    setAddingStaff(false);
    if(res.ok){ setStaffResult({tempPassword:data.tempPassword,name:newStaff.name}); setNewStaff({name:'',email:'',role:'staff'}); fetch('/api/operator/staff').then(r=>r.json()).then(setStaff); }
    else alert(data.error);
  }

  async function removeStaff(id:string) {
    if(!confirm('Remove this staff member?')) return;
    await fetch('/api/operator/staff',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    setStaff(s=>s.filter(m=>m.id!==id));
  }

  async function toggleStaff(id:string, active:boolean) {
    await fetch('/api/operator/staff',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,active})});
    setStaff(s=>s.map(m=>m.id===id?{...m,active}:m));
  }

  async function save2FA() {
    const method = (form.twoFactorMethod as string) || 'email';
    const phone = (form.twoFactorPhone as string) || '';
    if (method === 'sms' && !phone.trim()) { setError2FA('Enter a phone number to receive SMS codes.'); return; }
    setError2FA(''); setSaving2FA(true);
    const res = await fetch('/api/operator/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twoFactorMethod: method, twoFactorPhone: phone }),
    });
    setSaving2FA(false);
    if (res.ok) { setSaved2FA(true); setTimeout(() => setSaved2FA(false), 2000); }
    else setError2FA('Could not save. Try again.');
  }

  async function changePassword() {
    setPwMsg(''); setPwError('');
    if (!pwForm.currentPassword || !pwForm.newPassword) { setPwError('Fill in both password fields.'); return; }
    const strengthError = validatePasswordStrength(pwForm.newPassword);
    if (strengthError) { setPwError(strengthError); return; }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('New passwords do not match.'); return; }
    setPwSaving(true);
    const res = await fetch('/api/operator/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
    });
    const data = await res.json();
    setPwSaving(false);
    if (res.ok) { setPwMsg('Password updated.'); setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); }
    else setPwError(data.error || 'Something went wrong.');
  }

  const dresscodes = (form.dresscode as string[])||[];

  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="settings"/>
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-line px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Settings</h1>
            <TabIntroButton onClick={intro.show}/>
          </div>
          {active !== 'Staff' && active !== 'Account' && active !== 'Photos' && (
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md font-medium text-[12.5px] disabled:opacity-50 transition-colors">
              <Save className="w-4 h-4"/> {saved ? 'Saved' : saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        <div className="max-w-3xl mx-auto px-6 py-6">
          <TabIntroCard
            open={intro.open}
            onDismiss={intro.dismiss}
            title="This is your Settings."
            bullets={[
              'Update your course info, photos, and green fees anytime.',
              'Connect or manage your Stripe account under Payments.',
              'Set your cancellation policy here — or turn it off if you don’t charge fees.',
              'Add staff accounts so your team can check golfers in without sharing your login.',
            ]}
          />
          <div className="flex gap-1 bg-white rounded-lg border border-line p-1 mb-6 overflow-x-auto">
            {SECTIONS.map(s => (
              <button key={s} onClick={() => setActive(s)}
                className={'flex-1 py-2 px-3 rounded-md text-xs font-medium whitespace-nowrap transition-colors ' + (active===s ? 'bg-pine text-white' : 'text-ink-soft hover:text-ink')}>
                {s}
              </button>
            ))}
          </div>

          {/* ── Course Info ── */}
          {active==='Course Info' && (
            <div className="space-y-5">
              <SectionCard title="Basic Information">
                <Field label="Course Name"><FInput value={form.name as string} onChange={v=>set('name',v)}/></Field>
                <Field label="Phone"><FInput value={form.phone as string} onChange={v=>set('phone',v)} type="tel"/></Field>
                <Field label="Website"><FInput value={form.website as string} onChange={v=>set('website',v)} placeholder="https://"/></Field>
                <Field label="Address"><FInput value={form.address as string} onChange={v=>set('address',v)}/></Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="City"><FInput value={form.city as string} onChange={v=>set('city',v)}/></Field>
                  <Field label="State"><FInput value={form.state as string} onChange={v=>set('state',v)} maxLength={2}/></Field>
                  <Field label="ZIP"><FInput value={form.zipCode as string} onChange={v=>set('zipCode',v)}/></Field>
                </div>
                <Field label="Course Type">
                  <select value={form.type as string} onChange={e=>set('type',e.target.value)} className={iCls}>
                    {['public','semi-private','private','resort','municipal'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Brand Color" hint="Used to accent your dashboard. Click the swatch to pick.">
                    <div className="flex items-center gap-2">
                      <input type="color" value={(form.brandColor as string) || '#24513B'} onChange={e => set('brandColor', e.target.value)}
                        className="w-10 h-10 rounded-md border border-line cursor-pointer p-0.5 bg-paper"/>
                      <input type="text" value={(form.brandColor as string) || '#24513B'} onChange={e => set('brandColor', e.target.value)}
                        placeholder="#24513B" maxLength={7}
                        className="bg-paper border border-line rounded-md px-3 py-2.5 text-sm font-mono text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors w-32"/>
                    </div>
                  </Field>
                  <Field label="Established Year" hint="Optional — shown in your sidebar identity.">
                    <input type="number" value={(form.establishedYear as number) || ''} onChange={e => set('establishedYear', e.target.value ? Number(e.target.value) : null)}
                      placeholder="e.g. 1927" min={1850} max={new Date().getFullYear()} className={iCls}/>
                  </Field>
                </div>
                <Field label="Description">
                  <textarea value={(form.description as string)||''} onChange={e=>set('description',e.target.value)} rows={4} className={iCls + ' resize-none'} placeholder="Tell golfers what makes your course special — history, signature holes, views, etc."/>
                </Field>
                <Field label="Gift Card URL" hint="Paste the URL to where golfers can buy gift cards (your website, Square, etc.). An optional button will appear on your course page.">
                  <FInput value={(form.giftCardUrl as string)||''} onChange={v=>set('giftCardUrl',v)} placeholder="https://"/>
                </Field>
              </SectionCard>
              <SectionCard title="Branding">
                <p className="text-sm text-ink-soft -mt-1">These appear on your public tee sheet. Uploads save immediately.</p>
                <ImageUpload label="Course Logo" kind="logo" value={(form.logoUrl as string)||''} onUploaded={url=>set('logoUrl',url)} hint="Square works best (PNG with transparent background ideal). Max 8MB (large photos are auto-resized)."/>
                <ImageUpload label="Course Photo" kind="hero" value={(form.heroImageUrl as string)||''} onUploaded={url=>set('heroImageUrl',url)} hint="Wide landscape shot of your course — shown as the banner behind your course name. Max 8MB (large photos are auto-resized)."/>
              </SectionCard>
            </div>
          )}

          {/* ── Course & Layout ── */}
          {active==='Course & Layout' && (
            <div className="space-y-5">
              <SectionCard title="Course Details">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Holes"><FInput value={form.holes as number} onChange={v=>set('holes',Number(v))} type="number"/></Field>
                  <Field label="Par"><FInput value={form.par as number} onChange={v=>set('par',Number(v))} type="number"/></Field>
                  <Field label="Yardage"><FInput value={form.yardage as number} onChange={v=>set('yardage',Number(v))} type="number"/></Field>
                  <Field label="Slope"><FInput value={form.slope as number} onChange={v=>set('slope',Number(v))} type="number"/></Field>
                  <Field label="Course Rating"><FInput value={form.courseRating as number} onChange={v=>set('courseRating',Number(v))} type="number" step="0.1"/></Field>
                </div>
                <p className="text-xs text-ink-faint">Standard fallback fields for a simple 18-hole (or 9-hole) course. For 27+ hole layouts with combos, set up Nines and Products below.</p>
              </SectionCard>
              <CourseLayoutTab />
            </div>
          )}

          {/* ── Photos ── */}
          {active==='Photos' && (
            <div className="space-y-5">
              <SectionCard title="Gallery Photos">
                <p className="text-sm text-ink-soft -mt-1">Add up to 8 photos of your course. These appear in the Photos tab on your booking page. Uploads save immediately.</p>
                {photoErr && (
                  <div className="flex items-center gap-2 bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0"/>{photoErr}
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
                          <ImageIcon className="w-5 h-5 text-ink-faint mb-1"/>
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

          {/* ── Payments ── */}
          {active==='Payments' && (
            <div className="space-y-5">
              <SectionCard title="Stripe Payouts">
                {stripeParam === 'pending' && (
                  <div className="flex items-start gap-2 bg-warn/5 border border-warn/20 rounded-md p-3 text-warn text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>
                    Stripe says your account isn&apos;t fully verified yet. Finish any remaining steps on Stripe, or click Connect again to pick back up.
                  </div>
                )}
                {stripeParam === 'error' && (
                  <div className="flex items-start gap-2 bg-bad/5 border border-bad/20 rounded-md p-3 text-bad text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>
                    Something went wrong connecting to Stripe. Try again below.
                  </div>
                )}
                {stripeError && (
                  <div className="flex items-start gap-2 bg-bad/5 border border-bad/20 rounded-md p-3 text-bad text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>
                    {stripeError}
                  </div>
                )}

                {form.stripeAccountActive ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 bg-ok/5 border border-ok/20 rounded-md p-4">
                      <CheckCircle2 className="w-6 h-6 text-ok shrink-0"/>
                      <div>
                        <div className="font-medium text-ok text-sm">Stripe connected</div>
                        <div className="text-xs text-ink-soft mt-0.5">Charges and payouts are enabled. Green fees go straight to your bank account.</div>
                      </div>
                    </div>
                    <button onClick={openStripeDashboard} disabled={openingStripeDashboard}
                      className="flex items-center justify-center gap-2 w-full bg-paper border border-line hover:border-line-strong text-ink-soft py-2.5 rounded-md font-medium text-[12.5px] disabled:opacity-50 transition-colors">
                      {openingStripeDashboard ? <><Loader2 className="w-4 h-4 animate-spin"/>Opening...</> : 'View payouts & balance →'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-ink-soft">Connect your bank account through Stripe so you can get paid for bookings. This takes about 5 minutes — you&apos;ll need your business/bank details. GreenReserve can&apos;t take your course live until this is connected.</p>
                    <button onClick={connectStripe} disabled={connecting}
                      className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[12.5px] disabled:opacity-50 transition-colors">
                      {connecting ? <><Loader2 className="w-4 h-4 animate-spin"/>Connecting...</> : <><CreditCard className="w-4 h-4"/>Connect with Stripe</>}
                    </button>
                  </div>
                )}

                <div className="text-xs text-ink-faint pt-2 border-t border-line-soft">
                  Status: <span className="font-medium text-ink-muted capitalize">{(form.liveStatus as string) || 'draft'}</span>
                  {form.liveStatus !== 'live' && form.stripeAccountActive ? ' — Stripe is connected. GreenReserve will review and take you live shortly.' : ''}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── Pricing Policy ── */}
          {active==='Pricing Policy' && (
            <div className="space-y-5">
              <SectionCard title="Member Pricing">
                <Toggle label="Enable member pricing" checked={!!form.hasMemberPricing} onChange={()=>tog('hasMemberPricing')}/>
                <div className="text-xs text-pine bg-pine/5 border border-pine/20 rounded-md px-3 py-2">Member rates are set per-schedule in your Schedule setup page. Member advance booking is set below, in Booking Windows.</div>
              </SectionCard>
              <SectionCard title="Resident Pricing">
                <Toggle label="Enable resident pricing" checked={!!form.hasResidentPricing} onChange={()=>tog('hasResidentPricing')}/>
                {!!form.hasResidentPricing && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Resident County"><FInput value={form.residentCounty as string} onChange={v=>set('residentCounty',v)} placeholder="e.g. Bergen"/></Field>
                      <Field label="Resident State"><FInput value={form.residentState as string} onChange={v=>set('residentState',v)} maxLength={2} placeholder="NJ"/></Field>
                    </div>
                    <Toggle label="Proof of residency required at check-in" checked={!!form.residentProofRequired} onChange={()=>tog('residentProofRequired')}/>
                  </>
                )}
              </SectionCard>
              <SectionCard title="Booking Windows">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Public advance (days)"><FInput value={form.publicAdvanceDays as number} onChange={v=>set('publicAdvanceDays',Number(v))} type="number"/></Field>
                  {!!form.hasMemberPricing && <Field label="Member advance (days)"><FInput value={form.memberAdvanceDays as number} onChange={v=>set('memberAdvanceDays',Number(v))} type="number"/></Field>}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── Course Policy ── */}
          {active==='Course Policy' && (
            <div className="space-y-5">
              <SectionCard title="Walking & Cart">
                <Field label="Walking policy">
                  <select value={form.walkingAllowed as string} onChange={e=>set('walkingAllowed',e.target.value)} className={iCls}>
                    <option value="always">Always allowed</option>
                    <option value="weekdays">Weekdays only</option>
                    <option value="after12">After 12pm only</option>
                    <option value="never">Cart required</option>
                  </select>
                </Field>
                <Field label="Walking note (optional)"><FInput value={form.walkingNote as string} onChange={v=>set('walkingNote',v)} placeholder="e.g. Walking allowed after 1pm weekends"/></Field>
              </SectionCard>
              <SectionCard title="Cancellation">
                <Toggle label="Cancellation fee" checked={!!form.lateCancellationFee} onChange={() => set('lateCancellationFee', form.lateCancellationFee ? 0 : 10)}/>
                {!!form.lateCancellationFee && (
                  <>
                    <Field label="Free cancellation window (hours)" hint="Golfers can cancel free up to this many hours before their tee time.">
                      <FInput value={form.cancellationHours as number} onChange={v=>set('cancellationHours',Number(v))} type="number"/>
                    </Field>
                    <Field label="Late cancellation fee ($)" hint="Charged automatically when the free window closes and the golfer hasn't cancelled.">
                      <FInput value={form.lateCancellationFee as number} onChange={v=>set('lateCancellationFee',Number(v))} type="number"/>
                    </Field>
                  </>
                )}
                {!form.lateCancellationFee && (
                  <p className="text-xs text-ink-muted">No fee — golfers get a same-day check-in reminder and pay at the course. No card is collected at booking.</p>
                )}
                <Field label="Check-in reminder window (hours)" hint="Golfers receive a check-in email this many hours before their tee time. They can check in online or at the clubhouse when they arrive.">
                  <FInput value={form.checkInWindowHours as number} onChange={v=>set('checkInWindowHours',Number(v))} type="number"/>
                </Field>
                <Field label="Rain check policy"><FInput value={form.rainCheckPolicy as string} onChange={v=>set('rainCheckPolicy',v)} placeholder="e.g. Rain checks issued for 9+ holes of rain"/></Field>
              </SectionCard>
              <SectionCard title="Player Limits">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min players per booking"><FInput value={form.minPlayers as number} onChange={v=>set('minPlayers',Number(v))} type="number"/></Field>
                  <Field label="Max players per booking"><FInput value={form.maxPlayers as number} onChange={v=>set('maxPlayers',Number(v))} type="number"/></Field>
                </div>
              </SectionCard>
              <SectionCard title="Dress Code">
                <div className="flex flex-wrap gap-2">
                  {['Collared shirt required','No denim','Soft spikes only','Golf shoes required','No shorts','Proper golf attire'].map(rule => {
                    const on = dresscodes.includes(rule);
                    return (
                      <button key={rule} onClick={() => set('dresscode', on ? dresscodes.filter(c=>c!==rule) : [...dresscodes,rule])}
                        className={'px-3 py-1.5 rounded-md text-sm border transition-colors ' + (on ? 'bg-pine text-white border-pine' : 'bg-paper text-ink-soft border-line hover:border-pine/40')}>
                        {rule}
                      </button>
                    );
                  })}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── Facilities ── */}
          {active==='Facilities' && (
            <div className="space-y-5">
              <SectionCard title="Practice">
                <Toggle label="Driving Range" checked={!!form.hasDrivingRange} onChange={()=>tog('hasDrivingRange')}/>
                {!!form.hasDrivingRange && (
                  <>
                    <Field label="Range type">
                      <select value={form.drivingRangeType as string} onChange={e=>set('drivingRangeType',e.target.value)} className={iCls}>
                        <option value="">Select...</option>
                        <option value="grass">Grass tees</option>
                        <option value="mat">Mat only</option>
                        <option value="both">Grass + Mat</option>
                        <option value="toptracer">TopTracer</option>
                      </select>
                    </Field>
                    <Toggle label="Range Balls Free / Included" checked={form.rangeBallsFree!==false} onChange={()=>tog('rangeBallsFree')}/>
                  </>
                )}
                <Toggle label="Putting Green" checked={!!form.hasPuttingGreen} onChange={()=>tog('hasPuttingGreen')}/>
                <Toggle label="Short Game / Chipping Area" checked={!!form.hasShortGameArea} onChange={()=>tog('hasShortGameArea')}/>
              </SectionCard>
              <SectionCard title="Amenities">
                <Toggle label="Pro Shop" checked={!!form.hasProShop} onChange={()=>tog('hasProShop')}/>
                {!!form.hasProShop && <Field label="Pro shop phone number"><FInput value={form.proShopPhone as string} onChange={v=>set('proShopPhone',v)} placeholder="(201) 555-0100"/></Field>}
                <Toggle label="Lessons Available" checked={!!form.hasLessons} onChange={()=>tog('hasLessons')}/>
                <Toggle label="Club Rental" checked={!!form.hasClubRental} onChange={()=>tog('hasClubRental')}/>
                {!!form.hasClubRental && <Field label="Club rental rate ($)"><FInput value={form.clubRentalRate as number} onChange={v=>set('clubRentalRate',Number(v))} type="number"/></Field>}
                <Toggle label="Push Cart Rental" checked={!!form.hasPushCartRental} onChange={()=>tog('hasPushCartRental')}/>
                {!!form.hasPushCartRental && <Field label="Push cart rate ($)"><FInput value={form.pushCartRate as number} onChange={v=>set('pushCartRate',Number(v))} type="number"/></Field>}
                <Toggle label="Bag Storage" checked={!!form.hasBagStorage} onChange={()=>tog('hasBagStorage')}/>
                <Toggle label="Locker Room" checked={!!form.hasLockerRoom} onChange={()=>tog('hasLockerRoom')}/>
                <Toggle label="GPS Carts" checked={!!form.hasGpsCarts} onChange={()=>tog('hasGpsCarts')}/>
                <Toggle label="Tournaments Hosted" checked={!!form.hasTournaments} onChange={()=>tog('hasTournaments')}/>
                {!!form.hasTournaments && (
                  <Field label="How often?">
                    <select value={form.tournamentFrequency as string} onChange={e=>set('tournamentFrequency',e.target.value)} className={iCls}>
                      <option value="">Select...</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="seasonally">A few times a season</option>
                      <option value="rarely">Rarely</option>
                    </select>
                  </Field>
                )}
              </SectionCard>
              <SectionCard title="Food & Beverage">
                <Field label="Restaurant / Bar">
                  <select value={form.restaurantType as string} onChange={e=>set('restaurantType',e.target.value)} className={iCls}>
                    <option value="none">None</option>
                    <option value="snack_bar">Snack Bar</option>
                    <option value="bar">Bar Only</option>
                    <option value="full">Full Restaurant</option>
                    <option value="beverage_cart">Beverage Cart</option>
                  </select>
                </Field>
                {['snack_bar','bar','full'].includes(form.restaurantType as string) && (
                  <Toggle label="Also Have a Beverage Cart / Cart Girl" checked={!!form.hasCartGirl} onChange={()=>tog('hasCartGirl')}/>
                )}
              </SectionCard>
              <SectionCard title="Caddies">
                <Toggle label="Caddies Available" checked={!!form.hasCaddies} onChange={()=>tog('hasCaddies')}/>
                {!!form.hasCaddies && (
                  <>
                    <Field label="Caddie type">
                      <select value={form.caddieType as string} onChange={e=>set('caddieType',e.target.value)} className={iCls}>
                        <option value="looper">Looper only</option>
                        <option value="fore_caddie">Fore caddie</option>
                        <option value="both">Both</option>
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Looper rate ($)"><FInput value={form.caddieLooperRate as number} onChange={v=>set('caddieLooperRate',Number(v))} type="number"/></Field>
                      <Field label="Fore caddie rate ($)"><FInput value={form.caddieForeRate as number} onChange={v=>set('caddieForeRate',Number(v))} type="number"/></Field>
                    </div>
                    <Field label="Caddie note"><FInput value={form.caddieNote as string} onChange={v=>set('caddieNote',v)} placeholder="e.g. Must request 48hrs in advance"/></Field>
                  </>
                )}
              </SectionCard>
            </div>
          )}

          {/* ── Staff ── */}
          {active==='Staff' && (
            <div className="space-y-5">
              <SectionCard title="Staff Accounts">
                <p className="text-sm text-ink-soft">Staff members get their own login credentials and full dashboard access for your course.</p>

                {staffResult && (
                  <div className="bg-ok/5 border border-ok/20 rounded-md p-4">
                    <div className="font-medium text-ok mb-2">{staffResult.name} added — share these credentials:</div>
                    <div className="flex items-center justify-between bg-paper rounded-md px-3 py-2 border border-line mb-2">
                      <span className="text-sm font-mono text-ink">{showPass ? staffResult.tempPassword : '••••••••••••'}</span>
                      <div className="flex gap-2">
                        <button onClick={() => setShowPass(!showPass)} className="text-ink-muted hover:text-ink">
                          {showPass ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                        </button>
                        <button onClick={() => navigator.clipboard.writeText(staffResult.tempPassword)} className="text-ink-muted hover:text-ink">
                          <Copy className="w-4 h-4"/>
                        </button>
                      </div>
                    </div>
                    <button onClick={() => setStaffResult(null)} className="text-xs text-pine underline">Dismiss</button>
                  </div>
                )}

                {staff.length > 0 && (
                  <div className="space-y-2">
                    {staff.map(m => (
                      <div key={m.id} className="flex items-center gap-3 bg-paper border border-line rounded-md px-4 py-3">
                        <div className="w-8 h-8 bg-pine/10 rounded-full flex items-center justify-center text-pine font-medium text-sm">{m.name[0]}</div>
                        <div className="flex-1">
                          <div className="font-medium text-ink text-sm">{m.name}</div>
                          <div className="text-xs text-ink-muted">{m.email} · <span className="capitalize">{m.role}</span></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={'text-xs font-medium ' + (m.active ? 'text-ok' : 'text-ink-muted')}>{m.active ? 'Active' : 'Disabled'}</span>
                          <button onClick={() => toggleStaff(m.id, !m.active)} className="text-xs text-pine hover:underline">{m.active ? 'Disable' : 'Enable'}</button>
                          <button onClick={() => removeStaff(m.id)} className="text-ink-faint hover:text-bad transition-colors"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-paper border border-dashed border-line rounded-md p-4">
                  <div className="font-medium text-ink text-sm mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-ink-muted"/>Add Staff Member</div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Field label="Name"><FInput value={newStaff.name} onChange={v=>setNewStaff(s=>({...s,name:v}))} placeholder="First Last"/></Field>
                    <Field label="Email"><FInput value={newStaff.email} onChange={v=>setNewStaff(s=>({...s,email:v}))} type="email"/></Field>
                  </div>
                  <Field label="Role">
                    <select value={newStaff.role} onChange={e=>setNewStaff(s=>({...s,role:e.target.value}))} className={iCls}>
                      <option value="staff">Staff (tee sheet access)</option>
                      <option value="manager">Manager (full access)</option>
                    </select>
                  </Field>
                  <button onClick={addStaffMember} disabled={addingStaff||!newStaff.name||!newStaff.email}
                    className="mt-3 w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4"/> {addingStaff ? 'Adding...' : 'Add Staff Member'}
                  </button>
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── Account ── */}
          {active==='Account' && (
            <div className="space-y-5">
              <SectionCard title="Two-Factor Authentication">
                <p className="text-sm text-ink-soft">Required on every login. Choose how you&apos;d like to receive your 6-digit code.</p>
                {error2FA && (
                  <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4"/>{error2FA}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => set('twoFactorMethod','email')}
                    className={'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium border transition-colors ' + ((form.twoFactorMethod as string) !== 'sms' ? 'bg-pine text-white border-pine' : 'bg-paper text-ink-soft border-line hover:border-pine/40')}>
                    <Mail className="w-4 h-4"/>Email
                  </button>
                  <button onClick={() => set('twoFactorMethod','sms')}
                    className={'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium border transition-colors ' + ((form.twoFactorMethod as string) === 'sms' ? 'bg-pine text-white border-pine' : 'bg-paper text-ink-soft border-line hover:border-pine/40')}>
                    <Smartphone className="w-4 h-4"/>SMS
                  </button>
                </div>
                {!form.twoFactorPhone && <p className="text-xs text-ink-muted">Add a phone number to enable SMS verification.</p>}
                {(form.twoFactorMethod as string) === 'sms' && (
                  <Field label="Phone number for codes">
                    <FInput value={form.twoFactorPhone as string} onChange={v=>set('twoFactorPhone',v)} type="tel" placeholder="+1 (201) 555-0100"/>
                  </Field>
                )}
                <button onClick={save2FA} disabled={saving2FA}
                  className="w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <Save className="w-4 h-4"/> {saving2FA ? 'Saving...' : saved2FA ? 'Saved' : 'Save 2FA Settings'}
                </button>
              </SectionCard>
              <SectionCard title="Change Password">
                <p className="text-sm text-ink-soft">Update the password for your own login. This doesn&apos;t affect staff accounts.</p>
                {pwMsg && (
                  <div className="bg-ok/5 border border-ok/20 text-ok rounded-md px-4 py-3 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4"/>{pwMsg}
                  </div>
                )}
                {pwError && (
                  <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4"/>{pwError}
                  </div>
                )}
                <Field label="Current Password"><FInput type="password" value={pwForm.currentPassword} onChange={v=>setPwForm(f=>({...f,currentPassword:v}))}/></Field>
                <Field label="New Password" hint={PASSWORD_REQUIREMENTS_HINT}>
                  <FInput type="password" value={pwForm.newPassword} onChange={v=>setPwForm(f=>({...f,newPassword:v}))}/>
                </Field>
                <Field label="Confirm New Password"><FInput type="password" value={pwForm.confirmPassword} onChange={v=>setPwForm(f=>({...f,confirmPassword:v}))}/></Field>
                <button onClick={changePassword} disabled={pwSaving}
                  className="w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <KeyRound className="w-4 h-4"/> {pwSaving ? 'Updating...' : 'Update Password'}
                </button>
                <div className="border-t border-line-soft pt-4 text-center">
                  {resetEmailSent ? (
                    <p className="text-sm text-ok flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4"/>Check {operatorEmail} for a reset link.</p>
                  ) : (
                    <>
                      <p className="text-xs text-ink-muted mb-2">Don&apos;t remember your current password?</p>
                      <button onClick={emailResetLinkInstead} disabled={emailingReset||!operatorEmail} className="text-sm font-medium text-pine hover:underline disabled:opacity-50">
                        {emailingReset ? 'Sending...' : 'Email me a reset link instead'}
                      </button>
                    </>
                  )}
                </div>
              </SectionCard>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return <Suspense><SettingsPageInner/></Suspense>;
}
