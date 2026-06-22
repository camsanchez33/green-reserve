'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Save, Plus, Trash2, Copy, Users, Eye, EyeOff, CreditCard, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

type Course = Record<string, unknown>;
interface StaffMember { id: string; name: string; email: string; role: string; active: boolean; }
const SECTIONS = ['Course Info', 'Payments', 'Pricing Policy', 'Course Policy', 'Facilities', 'Staff'] as const;
type Section = typeof SECTIONS[number];
const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="font-bold mb-4 text-xs uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{label}</label>{children}</div>;
}
function FInput({ value, onChange, type='text', placeholder='', maxLength, step }: { value: string|number; onChange:(v:string)=>void; type?:string; placeholder?:string; maxLength?:number; step?:string }) {
  return <input type={type} value={value??''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} step={step} className={inputCls} />;
}
function Toggle({ label, checked, onChange }: { label:string; checked:boolean; onChange:()=>void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-700">{label}</span>
      <button onClick={onChange} className={`relative w-11 h-6 rounded-full transition-colors ${checked?'bg-green-600':'bg-gray-200'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked?'translate-x-5':''}`} />
      </button>
    </div>
  );
}

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const stripeParam = searchParams.get('stripe'); // 'success' | 'pending' | 'error' on return from Stripe

  const [active, setActive] = useState<Section>(stripeParam ? 'Payments' : 'Course Info');
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

  const refreshForm = () => fetch('/api/operator/settings').then(r=>r.json()).then(setForm);

  useEffect(() => {
    refreshForm();
    fetch('/api/operator/staff').then(r=>r.json()).then(setStaff);
  }, []);

  async function connectStripe() {
    setConnecting(true);
    setStripeError('');
    try {
      const res = await fetch('/api/operator/stripe/connect');
      const data = await res.json();
      if (!res.ok) { setStripeError(data.error || 'Could not start Stripe Connect.'); setConnecting(false); return; }
      if (data.url) { window.location.href = data.url; return; }
      if (data.connected) { await refreshForm(); }
    } catch {
      setStripeError('Could not reach Stripe. Try again.');
    }
    setConnecting(false);
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

  const dresscodes = (form.dresscode as string[])||[];

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <OperatorSidebar active="settings" courseName={form.name as string} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-[#1b4332] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <span className="text-white font-black text-lg">Settings</span>
        {active!=='Staff'&&(
          <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-white text-[#1b4332] px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-50 disabled:opacity-50">
            <Save className="w-4 h-4"/> {saved?'Saved!':saving?'Saving...':'Save Changes'}
          </button>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 mb-6 overflow-x-auto">
          {SECTIONS.map(s=>(
            <button key={s} onClick={()=>setActive(s)} className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${active===s?'bg-[#1b4332] text-white':'text-gray-500 hover:text-gray-800'}`}>{s}</button>
          ))}
        </div>

        {active==='Course Info'&&(
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
                <select value={form.type as string} onChange={e=>set('type',e.target.value)} className={inputCls}>
                  {['public','semi-private','private','resort','municipal'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </select>
              </Field>
              <Field label="Description">
                <textarea value={form.description as string||''} onChange={e=>set('description',e.target.value)} rows={4} className={inputCls} placeholder="Tell golfers what makes your course special — history, signature holes, views, etc."/>
              </Field>
            </SectionCard>
            <SectionCard title="Course Details">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Holes"><FInput value={form.holes as number} onChange={v=>set('holes',Number(v))} type="number"/></Field>
                <Field label="Par"><FInput value={form.par as number} onChange={v=>set('par',Number(v))} type="number"/></Field>
                <Field label="Yardage"><FInput value={form.yardage as number} onChange={v=>set('yardage',Number(v))} type="number"/></Field>
                <Field label="Slope"><FInput value={form.slope as number} onChange={v=>set('slope',Number(v))} type="number"/></Field>
                <Field label="Course Rating"><FInput value={form.courseRating as number} onChange={v=>set('courseRating',Number(v))} type="number" step="0.1"/></Field>
              </div>
            </SectionCard>
          </div>
        )}

        {active==='Payments'&&(
          <div className="space-y-5">
            <SectionCard title="Stripe Payouts">
              {stripeParam === 'pending' && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  Stripe says your account isn&apos;t fully verified yet (charges or payouts not enabled). Finish any remaining steps on Stripe, or click Connect again to pick back up.
                </div>
              )}
              {stripeParam === 'error' && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  Something went wrong connecting to Stripe. Try again below.
                </div>
              )}
              {stripeError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {stripeError}
                </div>
              )}

              {form.stripeAccountActive ? (
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                  <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-green-800 text-sm">Stripe connected</div>
                    <div className="text-green-700 text-xs">Charges and payouts are enabled. Green fees go straight to your bank account.</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Connect your bank account through Stripe so you can get paid for bookings. This takes about 5 minutes — you&apos;ll need your business/bank details.
                    GreenReserve can&apos;t take your course live until this is connected.
                  </p>
                  <button onClick={connectStripe} disabled={connecting}
                    className="flex items-center justify-center gap-2 w-full bg-[#1b4332] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#2d6a4f] disabled:opacity-50 transition-colors">
                    {connecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</> : <><CreditCard className="w-4 h-4" /> Connect with Stripe</>}
                  </button>
                </div>
              )}

              <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                Current status: <span className="font-semibold text-gray-600 capitalize">{(form.liveStatus as string) || 'draft'}</span>
                {form.liveStatus !== 'live' && form.stripeAccountActive ? ' — Stripe is connected. GreenReserve will review and take you live shortly.' : ''}
              </div>
            </SectionCard>
          </div>
        )}

        {active==='Pricing Policy'&&(
          <div className="space-y-5">
            <SectionCard title="Member Pricing">
              <Toggle label="Enable member pricing" checked={!!form.hasMemberPricing} onChange={()=>tog('hasMemberPricing')}/>
              {form.hasMemberPricing&&<Field label="Member advance booking (days)"><FInput value={form.memberAdvanceDays as number} onChange={v=>set('memberAdvanceDays',Number(v))} type="number"/></Field>}
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">Member rates are set per-schedule in your Schedule setup page.</div>
            </SectionCard>
            <SectionCard title="Resident Pricing">
              <Toggle label="Enable resident pricing" checked={!!form.hasResidentPricing} onChange={()=>tog('hasResidentPricing')}/>
              {form.hasResidentPricing&&<>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Resident County"><FInput value={form.residentCounty as string} onChange={v=>set('residentCounty',v)} placeholder="e.g. Bergen"/></Field>
                  <Field label="Resident State"><FInput value={form.residentState as string} onChange={v=>set('residentState',v)} maxLength={2} placeholder="NJ"/></Field>
                </div>
                <Toggle label="Proof of residency required at check-in" checked={!!form.residentProofRequired} onChange={()=>tog('residentProofRequired')}/>
              </>}
            </SectionCard>
            <SectionCard title="Booking Windows">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Public advance (days)"><FInput value={form.publicAdvanceDays as number} onChange={v=>set('publicAdvanceDays',Number(v))} type="number"/></Field>
                <Field label="Member advance (days)"><FInput value={form.memberAdvanceDays as number} onChange={v=>set('memberAdvanceDays',Number(v))} type="number"/></Field>
              </div>
            </SectionCard>
          </div>
        )}

        {active==='Course Policy'&&(
          <div className="space-y-5">
            <SectionCard title="Walking & Cart">
              <Field label="Walking policy">
                <select value={form.walkingAllowed as string} onChange={e=>set('walkingAllowed',e.target.value)} className={inputCls}>
                  <option value="always">Always allowed</option>
                  <option value="weekdays">Weekdays only</option>
                  <option value="after12">After 12pm only</option>
                  <option value="never">Cart required</option>
                </select>
              </Field>
              <Field label="Walking note (optional)"><FInput value={form.walkingNote as string} onChange={v=>set('walkingNote',v)} placeholder="e.g. Walking allowed after 1pm weekends"/></Field>
            </SectionCard>
            <SectionCard title="Cancellation">
              <Field label="Free cancellation window (hours)">
                <FInput value={form.cancellationHours as number} onChange={v=>set('cancellationHours',Number(v))} type="number"/>
                <p className="text-xs text-gray-400 mt-1">Golfers get a full refund if they cancel at least this many hours before tee time</p>
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
                {['Collared shirt required','No denim','Soft spikes only','Golf shoes required','No shorts','Proper golf attire'].map(rule=>{
                  const on=dresscodes.includes(rule);
                  return <button key={rule} onClick={()=>set('dresscode',on?dresscodes.filter(c=>c!==rule):[...dresscodes,rule])} className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on?'bg-green-600 text-white border-green-600':'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`}>{rule}</button>;
                })}
              </div>
            </SectionCard>
          </div>
        )}

        {active==='Facilities'&&(
          <div className="space-y-5">
            <SectionCard title="Practice">
              <Toggle label="Driving Range" checked={!!form.hasDrivingRange} onChange={()=>tog('hasDrivingRange')}/>
              {form.hasDrivingRange&&<>
                <Field label="Range type"><select value={form.drivingRangeType as string} onChange={e=>set('drivingRangeType',e.target.value)} className={inputCls}><option value="">Select...</option><option value="grass">Grass tees</option><option value="mat">Mat only</option><option value="both">Grass + Mat</option><option value="toptracer">TopTracer</option></select></Field>
                <Toggle label="Range Balls Free / Included" checked={form.rangeBallsFree!==false} onChange={()=>tog('rangeBallsFree')}/>
              </>}
              <Toggle label="Putting Green" checked={!!form.hasPuttingGreen} onChange={()=>tog('hasPuttingGreen')}/>
              <Toggle label="Short Game / Chipping Area" checked={!!form.hasShortGameArea} onChange={()=>tog('hasShortGameArea')}/>
            </SectionCard>
            <SectionCard title="Amenities">
              <Toggle label="Pro Shop" checked={!!form.hasProShop} onChange={()=>tog('hasProShop')}/>
              {form.hasProShop&&<Field label="Pro shop phone number"><FInput value={form.proShopPhone as string} onChange={v=>set('proShopPhone',v)} placeholder="(201) 555-0100"/></Field>}
              <Toggle label="Lessons Available" checked={!!form.hasLessons} onChange={()=>tog('hasLessons')}/>
              <Toggle label="Club Rental" checked={!!form.hasClubRental} onChange={()=>tog('hasClubRental')}/>
              {form.hasClubRental&&<Field label="Club rental rate ($)"><FInput value={form.clubRentalRate as number} onChange={v=>set('clubRentalRate',Number(v))} type="number"/></Field>}
              <Toggle label="Push Cart Rental" checked={!!form.hasPushCartRental} onChange={()=>tog('hasPushCartRental')}/>
              {form.hasPushCartRental&&<Field label="Push cart rate ($)"><FInput value={form.pushCartRate as number} onChange={v=>set('pushCartRate',Number(v))} type="number"/></Field>}
              <Toggle label="Bag Storage" checked={!!form.hasBagStorage} onChange={()=>tog('hasBagStorage')}/>
              <Toggle label="Locker Room" checked={!!form.hasLockerRoom} onChange={()=>tog('hasLockerRoom')}/>
              <Toggle label="GPS Carts" checked={!!form.hasGpsCarts} onChange={()=>tog('hasGpsCarts')}/>
              <Toggle label="Tournaments Hosted" checked={!!form.hasTournaments} onChange={()=>tog('hasTournaments')}/>
              {form.hasTournaments&&<Field label="How often?"><select value={form.tournamentFrequency as string} onChange={e=>set('tournamentFrequency',e.target.value)} className={inputCls}><option value="">Select...</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="seasonally">A few times a season</option><option value="rarely">Rarely</option></select></Field>}
            </SectionCard>
            <SectionCard title="Food & Beverage">
              <Field label="Restaurant / Bar">
                <select value={form.restaurantType as string} onChange={e=>set('restaurantType',e.target.value)} className={inputCls}>
                  <option value="none">None</option><option value="snack_bar">Snack Bar</option><option value="bar">Bar Only</option><option value="full">Full Restaurant</option><option value="beverage_cart">Beverage Cart</option>
                </select>
              </Field>
              {['snack_bar','bar','full'].includes(form.restaurantType as string)&&<Toggle label="Also Have a Beverage Cart / Cart Girl" checked={!!form.hasCartGirl} onChange={()=>tog('hasCartGirl')}/>}
            </SectionCard>
            <SectionCard title="Caddies">
              <Toggle label="Caddies Available" checked={!!form.hasCaddies} onChange={()=>tog('hasCaddies')}/>
              {form.hasCaddies&&<>
                <Field label="Caddie type"><select value={form.caddieType as string} onChange={e=>set('caddieType',e.target.value)} className={inputCls}><option value="looper">Looper only</option><option value="fore_caddie">Fore caddie</option><option value="both">Both</option></select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Looper rate ($)"><FInput value={form.caddieLooperRate as number} onChange={v=>set('caddieLooperRate',Number(v))} type="number"/></Field>
                  <Field label="Fore caddie rate ($)"><FInput value={form.caddieForeRate as number} onChange={v=>set('caddieForeRate',Number(v))} type="number"/></Field>
                </div>
                <Field label="Caddie note"><FInput value={form.caddieNote as string} onChange={v=>set('caddieNote',v)} placeholder="e.g. Must request 48hrs in advance"/></Field>
              </>}
            </SectionCard>
          </div>
        )}

        {active==='Staff'&&(
          <div className="space-y-5">
            <SectionCard title="Staff Accounts">
              <p className="text-sm text-gray-500">Staff members get their own login credentials and full dashboard access for your course.</p>

              {staffResult&&(
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="font-semibold text-green-800 mb-2">✅ {staffResult.name} added — share these login credentials:</div>
                  <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200 mb-2">
                    <span className="text-sm font-mono">{showPass?staffResult.tempPassword:'••••••••••••'}</span>
                    <div className="flex gap-2">
                      <button onClick={()=>setShowPass(!showPass)} className="text-gray-400 hover:text-gray-600">{showPass?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button>
                      <button onClick={()=>navigator.clipboard.writeText(staffResult.tempPassword)} className="text-gray-400 hover:text-gray-600"><Copy className="w-4 h-4"/></button>
                    </div>
                  </div>
                  <button onClick={()=>setStaffResult(null)} className="text-xs text-green-700 underline">Dismiss</button>
                </div>
              )}

              {staff.length>0&&(
                <div className="space-y-2">
                  {staff.map(m=>(
                    <div key={m.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-sm">{m.name[0]}</div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 text-sm">{m.name}</div>
                        <div className="text-xs text-gray-500">{m.email} · <span className="capitalize">{m.role}</span></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>{m.active?'Active':'Disabled'}</span>
                        <button onClick={()=>toggleStaff(m.id,!m.active)} className="text-xs text-blue-600 hover:underline">{m.active?'Disable':'Enable'}</button>
                        <button onClick={()=>removeStaff(m.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4">
                <div className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-2"><Users className="w-4 h-4"/> Add Staff Member</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="Name"><FInput value={newStaff.name} onChange={v=>setNewStaff(s=>({...s,name:v}))} placeholder="First Last"/></Field>
                  <Field label="Email"><FInput value={newStaff.email} onChange={v=>setNewStaff(s=>({...s,email:v}))} type="email"/></Field>
                </div>
                <Field label="Role">
                  <select value={newStaff.role} onChange={e=>setNewStaff(s=>({...s,role:e.target.value}))} className={inputCls}>
                    <option value="staff">Staff (tee sheet access)</option>
                    <option value="manager">Manager (full access)</option>
                  </select>
                </Field>
                <button onClick={addStaffMember} disabled={addingStaff||!newStaff.name||!newStaff.email}
                  className="mt-3 w-full bg-[#1b4332] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#2d6a4f] disabled:opacity-50 flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4"/> {addingStaff?'Adding...':'Add Staff Member'}
                </button>
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
  return <Suspense><SettingsPageInner /></Suspense>;
}
