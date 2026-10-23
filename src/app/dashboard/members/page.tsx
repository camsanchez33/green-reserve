'use client';
import { useState, useEffect, useCallback } from 'react';
import { Check, X, ArrowLeft, RefreshCw } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { formatMoney as fmtMoney, formatDate as fmtDate } from '@/lib/format';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { INPUT_COMPACT } from '@/components/ui/field';
import { ImportMembers } from '@/components/dashboard/members/ImportMembers';
import { ResidentsCard } from '@/components/dashboard/members/ResidentsCard';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Tier {
  id: string; name: string; color: string;
  greenFeeWeekday: number | null; greenFeeWeekend: number | null;
  cartFeeWeekday: number | null; cartFeeWeekend: number | null;
  discountPct: number | null;
  advanceBookingDays: number; guestPassesPerYear: number;
  annualFee: number; initiationFee: number; termMonths: number;
  notes: string; active: boolean;
  _count?: { memberships: number };
}
interface Member {
  id: string; name: string; email: string; phone: string;
  tierId: string | null; tierName: string; tierColor: string;
  status: string; linked: boolean; inviteAccepted: boolean;
  expiresAt: string | null; notes: string; createdAt: string;
  paymentStatus?: string; lastPaidAt?: string | null; annualFee?: number; initiationFee?: number;
  /** YYYY-MM-DD of their latest checked-in round here, or null. */
  lastRound?: string | null;
  /** Imported members already belong: no joining fee in what they owe. */
  initiationWaived?: boolean;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const TIER_COLORS = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#f43f5e','#14b8a6','#94a3b8'];
const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const lblCls = 'block text-[13px] font-semibold text-ink mb-1.5';
const addMonthsISO = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); };

const emptyTier = (): Partial<Tier> => ({
  name: '', color: '#10b981',
  greenFeeWeekday: null, greenFeeWeekend: null,
  cartFeeWeekday: null, cartFeeWeekend: null,
  discountPct: null,
  advanceBookingDays: 14, guestPassesPerYear: 0, annualFee: 0,
  initiationFee: 0, termMonths: 12, notes: '',
});
const emptyMember = () => ({ email: '', name: '', phone: '', tierId: '', notes: '', expiresAt: '' });

/** One plain dues status per member (CourseMembership.paymentStatus + expiresAt — the same
 *  "overdue" the Remind button uses: unpaid, or past expiry and not comped). */
type Dues = { kind: 'comped' | 'unpaid' | 'expired' | 'renewing' | 'paid' | 'inactive'; label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' };
function duesOf(m: Member, now: Date): Dues {
  if (m.status !== 'active') return { kind: 'inactive', label: 'Not active', tone: 'neutral' };
  // What they'd owe now — the same sum the dues pay link and the Remind button use.
  // A free membership owes nothing, whatever paymentStatus still says (it defaults to 'unpaid').
  const owed = (m.annualFee ?? 0) + ((m.lastPaidAt || m.initiationWaived) ? 0 : (m.initiationFee ?? 0));
  if (m.paymentStatus === 'comped' || owed <= 0) return { kind: 'comped', label: 'No dues', tone: 'ok' };
  if (m.paymentStatus === 'unpaid') return { kind: 'unpaid', label: `Dues unpaid · ${fmtMoney(owed)}`, tone: 'bad' };
  if (m.expiresAt && new Date(m.expiresAt) < now) return { kind: 'expired', label: `Expired ${fmtDate(m.expiresAt)}`, tone: 'bad' };
  if (m.expiresAt && new Date(m.expiresAt).getTime() - now.getTime() < 30 * 86400000) return { kind: 'renewing', label: `Renews ${fmtDate(m.expiresAt)}`, tone: 'warn' };
  return { kind: 'paid', label: m.expiresAt ? `Paid to ${fmtDate(m.expiresAt)}` : 'Paid', tone: 'ok' };
}

type PricingMode = 'flat' | 'pct';
type View = 'list' | 'wizard' | 'complete';
const WIZARD_STEPS = [{ n: 1, label: 'Name & Color' }, { n: 2, label: 'Pricing' }, { n: 3, label: 'Benefits & Fees' }];

/* ─── Main ────────────────────────────────────────────────────────────────── */
export default function MembersPage() {
  const pageAccess = useDashboardAccess();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>('list');

  const [wizStep, setWizStep] = useState(1);
  const [tierForm, setTierForm] = useState<Partial<Tier>>(emptyTier());
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<PricingMode>('flat');
  const [tierSaving, setTierSaving] = useState(false);
  const [tierDeleting, setTierDeleting] = useState<string | null>(null);
  // B-10: one click reminds every overdue member; the result is a sentence.
  const [remindingOverdue, setRemindingOverdue] = useState(false);

  const remindOverdue = async () => {
    if (remindingOverdue) return;
    setRemindingOverdue(true);
    const r = await dfetch<{ overdue: number; sent: number; skippedRecent: number; skippedFree: number; skippedNoEmail: number; failed: string[] }>('/api/operator/members/remind-overdue', { method: 'POST' });
    setRemindingOverdue(false);
    if (!r.ok) { toast(r.error); return; }
    const d = r.data;
    if (!d || d.overdue === 0) { toast('Nobody is overdue — every active member is paid up.', 'ok'); return; }
    const parts = [`Reminded ${d.sent} member${d.sent === 1 ? '' : 's'}`];
    if (d.skippedRecent) parts.push(`${d.skippedRecent} already reminded this week`);
    if (d.skippedFree) parts.push(`${d.skippedFree} on a free tier (nothing owed)`);
    if (d.skippedNoEmail) parts.push(`${d.skippedNoEmail} with no email on file`);
    if (d.failed.length) parts.push(`${d.failed.length} FAILED (${d.failed.join(', ')})`);
    toast(parts.join(' · ') + '.', d.failed.length ? 'warn' : 'ok');
  };
  const [tierError, setTierError] = useState('');
  const [createdTier, setCreatedTier] = useState<Tier | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [memberForm, setMemberForm] = useState(emptyMember());
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState('');

  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMemberTierId, setEditMemberTierId] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const canEdit = pageAccess.can('members.edit');

  const loadAll = useCallback(async () => {
    const [tr, mb] = await Promise.all([dfetch<Tier[]>('/api/operator/tiers'), dfetch<Member[]>('/api/operator/members')]);
    // SD-10: a 403/500 here used to render "No membership tiers yet".
    setTiers(tr.ok && Array.isArray(tr.data) ? tr.data : []);
    setMembers(mb.ok && Array.isArray(mb.data) ? mb.data : []);
    setLoadError(!tr.ok ? tr.error : !mb.ok ? mb.error : '');
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openWizard = (t?: Tier) => {
    if (t) { setEditingTier(t.id); setTierForm({ ...t }); setPricingMode(t.discountPct != null ? 'pct' : 'flat'); }
    else { setEditingTier(null); setTierForm(emptyTier()); setPricingMode('flat'); }
    setWizStep(1); setTierError(''); setView('wizard');
  };
  const closeWizard = () => { setView('list'); setTierForm(emptyTier()); setEditingTier(null); setTierError(''); };

  const saveTier = async () => {
    setTierSaving(true); setTierError('');
    const payload = { ...tierForm, ...(pricingMode === 'pct' ? { greenFeeWeekday: null, greenFeeWeekend: null, cartFeeWeekday: null, cartFeeWeekend: null } : { discountPct: null }) };
    const method = editingTier ? 'PATCH' : 'POST';
    const body   = editingTier ? { ...payload, id: editingTier } : payload;
    // Review (no-silent-failures): raw fetch + unguarded r.json() threw past
    // the busy reset on a network drop or an HTML error page, locking the
    // wizard on "Saving…". dfetch never throws.
    const r = await dfetch<Tier>('/api/operator/tiers', { method, body: JSON.stringify(body) });
    if (r.ok) {
      await loadAll();
      if (editingTier) { closeWizard(); } else { setCreatedTier(r.data); setView('complete'); }
      setTierForm(emptyTier()); setEditingTier(null);
    } else { setTierError(r.error); }
    setTierSaving(false);
  };

  const deleteTier = async (id: string) => {
    if (tierDeleting) return;
    setTierDeleting(id);
    const r = await dfetch(`/api/operator/tiers?id=${id}`, { method: 'DELETE' });
    if (r.ok) setTiers(prev => prev.filter(t => t.id !== id));
    else toast(r.error);
    setTierDeleting(null);
  };

  const startAddMember = (tierId?: string) => {
    const t = tiers.find(x => x.id === tierId);
    setMemberForm({ ...emptyMember(), tierId: tierId ?? '', expiresAt: t ? addMonthsISO(t.termMonths || 12) : '' });
    setMemberError(''); setAddOpen(true); setView('list');
  };

  const addMember = async () => {
    setMemberSaving(true); setMemberError('');
    const r = await dfetch('/api/operator/members', { method: 'POST', body: JSON.stringify(memberForm) });
    if (r.ok) { await loadAll(); setMemberForm(emptyMember()); setAddOpen(false); }
    else setMemberError(r.error);
    setMemberSaving(false);
  };

  const updateMemberTier = async (memberId: string, tierId: string) => {
    const r = await dfetch('/api/operator/members', { method: 'PATCH', body: JSON.stringify({ id: memberId, tierId }) });
    if (!r.ok) { toast(r.error); return; }
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const tier = tiers.find(t => t.id === tierId);
      return { ...m, tierId, tierName: tier?.name ?? m.tierName, tierColor: tier?.color ?? m.tierColor };
    }));
    setEditMemberId(null);
  };

  const toggleMemberStatus = async (m: Member) => {
    const newStatus = m.status === 'active' ? 'inactive' : 'active';
    const r = await dfetch('/api/operator/members', { method: 'PATCH', body: JSON.stringify({ id: m.id, status: newStatus }) });
    if (!r.ok) { toast(r.error); return; }
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, status: newStatus } : x));
  };

  const removeMember = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from this course?`)) return;
    const r = await dfetch(`/api/operator/members?id=${id}`, { method: 'DELETE' });
    if (!r.ok) { toast(r.error); return; }
    setMembers(prev => prev.filter(m => m.id !== id));
    toast(`${name} removed.`, 'ok');
  };

  const filteredMembers = members.filter(m => {
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    if (filterTier !== 'all' && m.tierId !== filterTier) return false;
    return true;
  });

  const setTF = (k: keyof typeof tierForm, v: unknown) => setTierForm(f => ({ ...f, [k]: v }));
  const canContinue = wizStep === 1 ? !!tierForm.name?.trim() : true;

  // SP-A: a login without "members.view" sees only why — never a working page whose every action is refused.
  if (pageAccess.loaded && !pageAccess.can('members.view')) return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="members"/>
      <main className="flex-1 md:overflow-y-auto"><StaffNotice what="the members list" view="members.view" /></main>
    </div>
  );
  if (loading) return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="members"/>
      <main className="flex-1 flex items-center justify-center">
        {loadError && <div className="px-6 pt-6"><LoadError message={loadError} onRetry={loadAll} /></div>}
        <RefreshCw className="w-6 h-6 text-pine animate-spin"/>
      </main>
    </div>
  );

  /* ── Wizard view ── */
  if (view === 'wizard') return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="members"/>
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <StaffNotice what="the members list" view="members.view" edit="members.edit" />
        <div className="max-w-2xl mx-auto px-6 py-10">

          <button onClick={closeWizard} className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4"/>Back to Member Management
          </button>
          <h1 className="font-serif text-[32px] leading-none text-ink">
            {editingTier ? 'Edit membership tier' : 'New membership tier'}
          </h1>
          <p className="text-sm text-ink-soft mb-8">
            {editingTier ? 'Update the details of this tier.' : 'Set up a tier in three quick steps. Members assigned to it get these rates automatically at checkout.'}
          </p>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-8">
            {WIZARD_STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => { if (s.n < wizStep) setWizStep(s.n); }}
                  className={'flex items-center gap-2 w-full rounded-md border px-3 py-2 text-left transition-colors ' + (
                    wizStep === s.n ? 'border-pine bg-pine/5' :
                    wizStep > s.n ? 'border-line bg-white cursor-pointer hover:border-line-strong' :
                    'border-line bg-white opacity-50'
                  )}>
                  <span className={'w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ' + (
                    wizStep >= s.n ? 'bg-pine text-white' : 'bg-paper border border-line text-ink-muted'
                  )}>
                    {wizStep > s.n ? <Check className="w-3 h-3"/> : s.n}
                  </span>
                  <span className={'text-[13px] font-semibold ' + (wizStep >= s.n ? 'text-ink' : 'text-ink-faint')}>{s.label}</span>
                </button>
                {i < WIZARD_STEPS.length - 1 && <div className="w-4 h-px bg-line shrink-0"/>}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-card p-6 space-y-5">

            {/* Step 1 */}
            {wizStep === 1 && (
              <>
                <div>
                  <label className={lblCls}>Tier Name *</label>
                  <input autoFocus className={iCls} value={tierForm.name ?? ''} onChange={e => setTF('name', e.target.value)} placeholder="e.g. Full Member, Senior, Junior"/>
                  <p className="text-xs text-ink-soft mt-1.5">This is what staff and members will see on bookings.</p>
                </div>
                <div>
                  <label className={lblCls}>Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {TIER_COLORS.map(c => (
                      <button key={c} onClick={() => setTF('color', c)} className={'w-8 h-8 rounded-full border-2 transition-all ' + (tierForm.color === c ? 'border-ink scale-110' : 'border-transparent')} style={{ background: c }}/>
                    ))}
                  </div>
                  <p className="text-xs text-ink-soft mt-1.5">Used to tag members of this tier across the tee sheet.</p>
                </div>
              </>
            )}

            {/* Step 2 */}
            {wizStep === 2 && (
              <>
                <div>
                  <label className={lblCls}>Pricing type</label>
                  <div className="flex gap-2">
                    {(['flat','pct'] as PricingMode[]).map(m => (
                      <button key={m} onClick={() => setPricingMode(m)}
                        className={'flex-1 py-2.5 rounded-md text-sm font-medium border transition-colors ' + (pricingMode === m ? 'bg-pine text-white border-pine' : 'border-line text-ink-soft hover:border-line-strong bg-paper')}>
                        {m === 'flat' ? 'Flat rates' : '% discount'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-ink-soft mt-1.5">
                    {pricingMode === 'flat'
                      ? 'Set exact dollar amounts. Overrides the standard tee time price for members of this tier. Leave a field blank to inherit standard pricing.'
                      : 'Apply a percentage off the standard rate for every booking.'}
                  </p>
                </div>

                {pricingMode === 'flat' ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['Green fee — weekday', 'greenFeeWeekday'],
                      ['Green fee — weekend', 'greenFeeWeekend'],
                      ['Cart fee — weekday',  'cartFeeWeekday'],
                      ['Cart fee — weekend',  'cartFeeWeekend'],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <label className={lblCls}>{label}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                          <input type="number" min="0" step="0.01" className={iCls + ' pl-6'}
                            value={tierForm[key as keyof Tier] as number ?? ''}
                            onChange={e => setTF(key as keyof Tier, e.target.value === '' ? null : Number(e.target.value))}
                            placeholder="e.g. 45"/>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <label className={lblCls}>Discount %</label>
                    <div className="relative">
                      <input type="number" min="0" max="100" step="1" className={iCls + ' pr-8'}
                        value={tierForm.discountPct ?? ''}
                        onChange={e => setTF('discountPct', e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="e.g. 20"/>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">%</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 3 */}
            {wizStep === 3 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lblCls}>Members of this tier can book this many days ahead</label>
                    <input type="number" min="0" className={iCls} value={tierForm.advanceBookingDays ?? 14} onChange={e => setTF('advanceBookingDays', Number(e.target.value))}/>
                  </div>
                  <div>
                    <label className={lblCls}>Guest passes / year</label>
                    <input type="number" min="0" className={iCls} value={tierForm.guestPassesPerYear ?? 0} onChange={e => setTF('guestPassesPerYear', Number(e.target.value))}/>
                  </div>
                  <div>
                    <label className={lblCls}>Annual fee ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                      <input type="number" min="0" step="0.01" className={iCls + ' pl-6'} value={tierForm.annualFee ?? 0} onChange={e => setTF('annualFee', Number(e.target.value))}/>
                    </div>
                  </div>
                  <div>
                    <label className={lblCls}>Initiation fee ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                      <input type="number" min="0" step="0.01" className={iCls + ' pl-6'} value={tierForm.initiationFee ?? 0} onChange={e => setTF('initiationFee', Number(e.target.value))}/>
                    </div>
                  </div>
                  <div>
                    <label className={lblCls}>Term (months)</label>
                    <input type="number" min="1" className={iCls} value={tierForm.termMonths ?? 12} onChange={e => setTF('termMonths', Number(e.target.value))}/>
                  </div>
                </div>
                <div>
                  <label className={lblCls}>Notes (internal)</label>
                  <textarea rows={2} className={iCls + ' resize-none'} value={tierForm.notes ?? ''} onChange={e => setTF('notes', e.target.value)} placeholder="Any extra details about this tier..."/>
                </div>
              </>
            )}

            {tierError && (
              <div className="flex gap-2 items-center text-bad text-sm bg-bad/5 border border-bad/20 rounded-md px-4 py-2">
                <StatusDot status="bad" />{tierError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              {wizStep > 1 && (
                <button onClick={() => setWizStep(s => s - 1)} className="border border-line text-ink-soft hover:border-line-strong rounded-md text-sm font-medium transition-colors px-5 py-2.5 flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4"/>Back
                </button>
              )}
              {wizStep < 3 ? (
                <button onClick={() => setWizStep(s => s + 1)} disabled={!canContinue}
                  className="flex-1 bg-pine hover:bg-pine-hover text-white rounded-md text-sm font-medium disabled:opacity-40 transition-colors py-2.5 flex items-center justify-center gap-2">
                  Continue
                </button>
              ) : (
                <button onClick={saveTier} disabled={tierSaving || !tierForm.name?.trim()}
                  className="flex-1 bg-pine hover:bg-pine-hover text-white rounded-md text-sm font-medium disabled:opacity-40 transition-colors py-2.5">
                  {tierSaving ? 'Saving...' : editingTier ? 'Save changes' : 'Complete setup'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );

  /* ── Complete view ── */
  if (view === 'complete' && createdTier) return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="members"/>
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <StaffNotice what="the members list" view="members.view" edit="members.edit" />
        <div className="max-w-lg mx-auto px-6 py-16 text-center">
          <h1 className="font-serif text-[32px] leading-none text-ink">Tier created</h1>
          <p className="text-sm text-ink-soft mb-8">
            <span className="font-medium" style={{ color: createdTier.color }}>{createdTier.name}</span> is live. Anyone you add to it gets member rates automatically at checkout.
          </p>

          <div className="bg-white rounded-lg shadow-card p-5 text-left mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: createdTier.color }}/>
              <span className="font-medium text-ink">{createdTier.name}</span>
            </div>
            {createdTier.discountPct != null ? (
              <div className="bg-ok/5 border border-ok/20 rounded-md px-4 py-2 text-sm text-ok font-medium">
                {createdTier.discountPct}% off standard rate
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['Green fee (weekday)', fmtMoney(createdTier.greenFeeWeekday)],
                  ['Green fee (weekend)', fmtMoney(createdTier.greenFeeWeekend)],
                  ['Cart fee (weekday)',  fmtMoney(createdTier.cartFeeWeekday)],
                  ['Cart fee (weekend)',  fmtMoney(createdTier.cartFeeWeekend)],
                ].map(([label, val]) => (
                  <div key={label} className="bg-paper border border-line-soft rounded-md px-3 py-2">
                    <div className="text-ink-muted">{label}</div>
                    <div className="font-medium text-ink mt-0.5 tabular-nums">{val}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted">
              <span>Book {createdTier.advanceBookingDays}d ahead</span>
              {createdTier.guestPassesPerYear > 0 && <span>{createdTier.guestPassesPerYear} guest passes/yr</span>}
              {createdTier.annualFee > 0 && <span>${createdTier.annualFee}/yr</span>}
              {createdTier.initiationFee > 0 && <span>${createdTier.initiationFee} initiation</span>}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button onClick={() => startAddMember(createdTier.id)}
              className="bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[12.5px] transition-colors flex items-center justify-center gap-2">
              Add your first member
            </button>
            <button onClick={() => { setView('list'); }}
              className="border border-line text-ink-soft hover:border-line-strong py-3 rounded-md font-medium text-[12.5px] transition-colors">
              Back to Tiers
            </button>
          </div>
        </div>
      </main>
    </div>
  );

  /* ── List view ── Members rework (Cam 2026-10-19: list first). Counts on top,
     one searchable list with each member's dues, tiers underneath. */
  const now = new Date();
  const q = search.trim().toLowerCase();
  const shown = filteredMembers.filter(m => !q || (m.name ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q) || (m.phone ?? '').includes(q))
    .filter(m => !unpaidOnly || ['unpaid', 'expired'].includes(duesOf(m, now).kind));
  const active = members.filter(m => m.status === 'active');
  const unpaid = active.filter(m => ['unpaid', 'expired'].includes(duesOf(m, now).kind)).length;
  const renewing = active.filter(m => duesOf(m, now).kind === 'renewing').length;
  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="members"/>
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <StaffNotice what="the members list" view="members.view" edit="members.edit" />
        <div className="px-4 sm:px-10 py-7 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 max-w-[46em]">
              <h1 className="font-serif text-[32px] leading-none text-ink">Members</h1>
              <p className="text-[14px] text-ink-soft mt-2.5 leading-snug">
                {members.length === 0 ? 'Your members, what they pay and when they renew. Members book at their own rates and further ahead.'
                  : <>{active.length} active · {unpaid} with dues unpaid · {renewing} renewing in the next 30 days</>}
              </p>
            </div>
            {canEdit && (
              <div className="flex gap-2 shrink-0">
                {unpaid > 0 && (
                  <button onClick={remindOverdue} disabled={remindingOverdue}
                    title="Emails the dues link to every active member who is unpaid or past their expiry — at most once a week each"
                    className="bg-white border border-line hover:border-line-strong text-ink rounded-md text-[13px] font-medium px-4 py-2 disabled:opacity-50">
                    {remindingOverdue ? 'Sending…' : `Remind ${unpaid} unpaid`}
                  </button>
                )}
                {tiers.some(t => t.active) && (
                  <button onClick={() => { setImportOpen(true); setAddOpen(false); }}
                    className="bg-white border border-line hover:border-line-strong text-ink rounded-md text-[13px] font-medium px-4 py-2">Import a list</button>
                )}
                <button onClick={() => tiers.length ? startAddMember() : openWizard()}
                  className="bg-pine hover:bg-pine-hover text-white rounded-md text-[13px] font-medium px-4 py-2">{tiers.length ? 'Add a member' : 'Set up a membership'}</button>
              </div>
            )}
          </div>
          {loadError && <LoadError message={loadError} onRetry={loadAll} />}

          {importOpen && <ImportMembers tiers={tiers} onClose={() => setImportOpen(false)} onImported={loadAll} />}

          {/* Add member */}
          {addOpen && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif font-semibold text-ink text-[20px]">Add a member</h2>
                <button onClick={() => { setAddOpen(false); setMemberError(''); }} aria-label="Close" className="text-ink-muted hover:text-ink"><X className="w-4 h-4"/></button>
              </div>
              <p className="text-[13px] text-ink-soft -mt-2 mb-4">We email them an invite to link their GreenReserve account, so they get member rates when they book online.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className={lblCls} htmlFor="m-email">Email</label>
                  <input id="m-email" className={iCls} value={memberForm.email} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} placeholder="member@email.com" type="email"/></div>
                <div><label className={lblCls} htmlFor="m-name">Full name</label>
                  <input id="m-name" className={iCls} value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith"/></div>
                <div><label className={lblCls} htmlFor="m-phone">Phone <span className="font-normal text-ink-muted">(optional)</span></label>
                  <input id="m-phone" className={iCls} value={memberForm.phone} onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))} placeholder="(201) 555-0100"/></div>
                <div><label className={lblCls} htmlFor="m-tier">Membership</label>
                  <select id="m-tier" className={iCls} value={memberForm.tierId} onChange={e => {
                    const t = tiers.find(x => x.id === e.target.value);
                    setMemberForm(f => ({ ...f, tierId: e.target.value, expiresAt: t ? addMonthsISO(t.termMonths || 12) : f.expiresAt }));
                  }}>
                    <option value="">Pick one…</option>
                    {tiers.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select></div>
                <div><label className={lblCls} htmlFor="m-exp">Membership runs until</label>
                  <input id="m-exp" type="date" className={iCls} value={memberForm.expiresAt} onChange={e => setMemberForm(f => ({ ...f, expiresAt: e.target.value }))}/>
                  <p className="text-[12.5px] text-ink-muted mt-1">Filled in from the membership&apos;s length — change it if needed.</p></div>
                <div className="sm:col-span-2"><label className={lblCls} htmlFor="m-notes">Notes for your staff <span className="font-normal text-ink-muted">(optional)</span></label>
                  <input id="m-notes" className={iCls} value={memberForm.notes} onChange={e => setMemberForm(f => ({ ...f, notes: e.target.value }))}/></div>
              </div>
              {memberError && <div className="mt-3"><LoadError message={memberError} onRetry={addMember} /></div>}
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => { setAddOpen(false); setMemberError(''); }} className="px-4 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Cancel</button>
                <button onClick={addMember} disabled={memberSaving || !memberForm.email || !memberForm.tierId}
                  className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">{memberSaving ? 'Adding…' : 'Add member'}</button>
              </div>
            </Card>
          )}

          {/* The list */}
          {tiers.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-[15px] font-semibold text-ink">No memberships set up yet</p>
              <p className="text-[13.5px] text-ink-soft mt-1 max-w-[36em] mx-auto">Set up a membership — its price, member rates and how far ahead members can book — then add your members to it.</p>
              {canEdit && <button onClick={() => openWizard()} className="mt-4 bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md text-[13px] font-medium">Set up a membership</button>}
            </Card>
          ) : (
            <Card>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line-soft">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a member" aria-label="Find a member"
                  className={INPUT_COMPACT + ' !w-56'}/>
                <select value={filterTier} onChange={e => setFilterTier(e.target.value)} aria-label="Membership"
                  className={INPUT_COMPACT + ' !w-auto'}>
                  <option value="all">Every membership</option>
                  {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} aria-label="Status"
                  className={INPUT_COMPACT + ' !w-auto'}>
                  <option value="active">Active</option>
                  <option value="inactive">Not active</option>
                  <option value="all">Everyone</option>
                </select>
                <label className="flex items-center gap-2 text-[13.5px] text-ink"><input type="checkbox" checked={unpaidOnly} onChange={e => setUnpaidOnly(e.target.checked)} className="w-4 h-4 accent-pine"/>Dues unpaid only</label>
                <span className="ml-auto text-[12.5px] text-ink-muted">{shown.length} of {members.length}</span>
              </div>
              {shown.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13.5px] text-ink-soft">{members.length === 0 ? 'No members yet. Add your first one above.' : 'Nobody matches that.'}</p>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {shown.map(m => {
                    const d = duesOf(m, now);
                    const openRow = expanded === m.id;
                    return (
                      <li key={m.id} className={m.status !== 'active' ? 'text-ink-soft' : ''}>
                        <button onClick={() => setExpanded(openRow ? null : m.id)} aria-expanded={openRow}
                          className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.7fr)] gap-x-4 gap-y-0.5 px-4 py-3 text-left hover:bg-paper/60">
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium text-ink truncate">{m.name || m.email}</span>
                            <span className="block text-[12.5px] text-ink-muted truncate">{m.email}{m.phone ? ` · ${m.phone}` : ''}</span>
                          </span>
                          <span className="hidden sm:inline-flex items-center gap-2 text-[13.5px] text-ink min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.tierColor }}/><span className="truncate">{m.tierName}</span></span>
                          <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ink justify-end sm:justify-start"><StatusDot status={d.tone} />{d.label}</span>
                          <span className="hidden lg:block text-[13px] text-ink-muted">{m.lastRound ? `Last round ${fmtDate(m.lastRound + 'T12:00:00')}` : 'No rounds yet'}</span>
                        </button>
                        {openRow && (
                          <div className="px-4 pb-4 -mt-1 grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                            <div className="text-[13px] text-ink-soft space-y-0.5">
                              <p>{m.linked ? 'Account linked — member rates apply when they book online.' : m.inviteAccepted ? 'Invite accepted.' : 'Invite sent; they haven’t linked an account yet, so online bookings don’t get member rates.'}</p>
                              {m.lastPaidAt && <p>Last paid {fmtDate(m.lastPaidAt)}.</p>}
                              <p>{m.lastRound ? `Last round here ${fmtDate(m.lastRound + 'T12:00:00')}.` : 'No rounds here yet.'}</p>
                              {m.notes && <p>Note: {m.notes}</p>}
                            </div>
                            {canEdit && (
                              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                                {editMemberId === m.id ? (
                                  <>
                                    <select value={editMemberTierId} onChange={e => setEditMemberTierId(e.target.value)} aria-label="New membership"
                                      className="bg-paper border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink">
                                      {tiers.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    <button onClick={() => updateMemberTier(m.id, editMemberTierId)} className="text-[13px] font-medium text-pine hover:underline">Save</button>
                                    <button onClick={() => setEditMemberId(null)} className="text-[13px] text-ink-soft hover:text-ink">Cancel</button>
                                  </>
                                ) : (
                                  <button onClick={() => { setEditMemberId(m.id); setEditMemberTierId(m.tierId ?? ''); }} className="text-[13px] font-medium text-pine hover:underline">Change membership</button>
                                )}
                                <button onClick={() => toggleMemberStatus(m)} className="text-[13px] font-medium text-ink-soft hover:text-ink">{m.status === 'active' ? 'Make not active' : 'Make active'}</button>
                                <button onClick={() => removeMember(m.id, m.name)} className="text-[13px] font-medium text-bad hover:underline">Remove</button>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {/* Memberships (tiers) */}
          {tiers.length > 0 && (
            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-semibold text-ink">Memberships you offer</h2>
                {canEdit && <button onClick={() => openWizard()} className="text-[13px] font-medium text-pine hover:underline">Add a membership</button>}
              </div>
              <ul className="mt-3 divide-y divide-line-soft">
                {tiers.map(t => (
                  <li key={t.id} className="py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-2 text-[14px] font-medium text-ink min-w-[10em]"><span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }}/>{t.name}</span>
                    <span className="text-[13px] text-ink-soft flex-1 min-w-0">
                      {[
                        t.annualFee > 0 ? `${fmtMoney(t.annualFee)} a ${t.termMonths === 12 ? 'year' : `${t.termMonths} months`}` : 'No dues',
                        t.initiationFee > 0 ? `${fmtMoney(t.initiationFee)} to join` : null,
                        t.discountPct != null ? `${t.discountPct}% off public rates` : (t.greenFeeWeekday != null ? `rounds ${fmtMoney(t.greenFeeWeekday)} weekdays, ${fmtMoney(t.greenFeeWeekend)} weekends` : null),
                        `books ${t.advanceBookingDays} days ahead`,
                        t.guestPassesPerYear > 0 ? `${t.guestPassesPerYear} guest pass${t.guestPassesPerYear === 1 ? '' : 'es'} a year` : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                    <span className="text-[12.5px] text-ink-muted">{t._count?.memberships ?? 0} active</span>
                    {canEdit && (
                      <span className="flex gap-3">
                        <button onClick={() => openWizard(t)} className="text-[13px] font-medium text-pine hover:underline">Edit</button>
                        <button onClick={() => { if (confirm(`Delete the ${t.name} membership?`)) deleteTier(t.id); }} disabled={tierDeleting === t.id} className="text-[13px] font-medium text-bad hover:underline disabled:opacity-50">{tierDeleting === t.id ? 'Deleting…' : 'Delete'}</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[12.5px] text-ink-muted mt-2">When members pay dues through GreenReserve, a 1% fee is added to what they pay.</p>
            </Card>
          )}

          <ResidentsCard canEdit={canEdit} />
        </div>
      </main>
    </div>
  );
}
