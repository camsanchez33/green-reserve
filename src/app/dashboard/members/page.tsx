'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Users, Edit2, Check, X, ArrowLeft, ArrowRight,
  RefreshCw, UserCheck, UserX, ChevronDown, AlertCircle, CheckCircle2, UserPlus,
} from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { TabIntroButton, TabIntroCard } from '@/components/dashboard/TabIntro';
import { useTabIntro } from '@/lib/use-tab-intro';

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
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const TIER_COLORS = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#f43f5e','#14b8a6','#94a3b8'];
const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const lblCls = 'block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5';
const fmtMoney = (n: number | null) => n == null ? '—' : `$${n.toFixed(2)}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

type PricingMode = 'flat' | 'pct';
type View = 'list' | 'wizard' | 'complete';
const WIZARD_STEPS = [{ n: 1, label: 'Name & Color' }, { n: 2, label: 'Pricing' }, { n: 3, label: 'Benefits & Fees' }];

/* ─── Main ────────────────────────────────────────────────────────────────── */
export default function MembersPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [panel, setPanel] = useState<'tiers' | 'members'>('tiers');
  const intro = useTabIntro('members');

  const [wizStep, setWizStep] = useState(1);
  const [tierForm, setTierForm] = useState<Partial<Tier>>(emptyTier());
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<PricingMode>('flat');
  const [tierSaving, setTierSaving] = useState(false);
  const [tierError, setTierError] = useState('');
  const [createdTier, setCreatedTier] = useState<Tier | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [memberForm, setMemberForm] = useState(emptyMember());
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState('');

  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMemberTierId, setEditMemberTierId] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');

  const loadAll = useCallback(async () => {
    const [tr, mb] = await Promise.all([
      fetch('/api/operator/tiers').then(r => r.ok ? r.json() : []),
      fetch('/api/operator/members').then(r => r.ok ? r.json() : []),
    ]);
    setTiers(tr); setMembers(mb); setLoading(false);
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
    const r = await fetch('/api/operator/tiers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (r.ok) {
      await loadAll();
      if (editingTier) { closeWizard(); } else { setCreatedTier(d); setView('complete'); }
      setTierForm(emptyTier()); setEditingTier(null);
    } else { setTierError(d.error || 'Save failed'); }
    setTierSaving(false);
  };

  const deleteTier = async (id: string) => {
    const r = await fetch(`/api/operator/tiers?id=${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (r.ok) setTiers(prev => prev.filter(t => t.id !== id));
    else alert(d.error);
  };

  const startAddMember = (tierId?: string) => {
    const t = tiers.find(x => x.id === tierId);
    setMemberForm({ ...emptyMember(), tierId: tierId ?? '', expiresAt: t ? addMonthsISO(t.termMonths || 12) : '' });
    setMemberError(''); setPanel('members'); setAddOpen(true); setView('list');
  };

  const addMember = async () => {
    setMemberSaving(true); setMemberError('');
    const r = await fetch('/api/operator/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memberForm) });
    const d = await r.json();
    if (r.ok) { await loadAll(); setMemberForm(emptyMember()); setAddOpen(false); }
    else setMemberError(d.error || 'Failed to add member');
    setMemberSaving(false);
  };

  const updateMemberTier = async (memberId: string, tierId: string) => {
    await fetch('/api/operator/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: memberId, tierId }) });
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const tier = tiers.find(t => t.id === tierId);
      return { ...m, tierId, tierName: tier?.name ?? m.tierName, tierColor: tier?.color ?? m.tierColor };
    }));
    setEditMemberId(null);
  };

  const toggleMemberStatus = async (m: Member) => {
    const newStatus = m.status === 'active' ? 'inactive' : 'active';
    await fetch('/api/operator/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, status: newStatus }) });
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, status: newStatus } : x));
  };

  const removeMember = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from this course?`)) return;
    await fetch(`/api/operator/members?id=${id}`, { method: 'DELETE' });
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const filteredMembers = members.filter(m => {
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    if (filterTier !== 'all' && m.tierId !== filterTier) return false;
    return true;
  });

  const setTF = (k: keyof typeof tierForm, v: unknown) => setTierForm(f => ({ ...f, [k]: v }));
  const canContinue = wizStep === 1 ? !!tierForm.name?.trim() : true;

  if (loading) return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="members"/>
      <main className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-pine animate-spin"/>
      </main>
    </div>
  );

  /* ── Wizard view ── */
  if (view === 'wizard') return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="members"/>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10">

          <button onClick={closeWizard} className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4"/>Back to Member Management
          </button>
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-1">
            {editingTier ? 'Edit Membership Tier' : 'New Membership Tier'}
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
                  <span className={'text-xs font-medium uppercase tracking-[0.06em] ' + (wizStep >= s.n ? 'text-ink' : 'text-ink-faint')}>{s.label}</span>
                </button>
                {i < WIZARD_STEPS.length - 1 && <div className="w-4 h-px bg-line shrink-0"/>}
              </div>
            ))}
          </div>

          <div className="bg-white border border-line rounded-lg p-6 space-y-5">

            {/* Step 1 */}
            {wizStep === 1 && (
              <>
                <div>
                  <label className={lblCls}>Tier Name *</label>
                  <input autoFocus className={iCls} value={tierForm.name ?? ''} onChange={e => setTF('name', e.target.value)} placeholder="e.g. Full Member, Senior, Junior"/>
                  <p className="text-xs text-ink-faint mt-1.5">This is what staff and members will see on bookings.</p>
                </div>
                <div>
                  <label className={lblCls}>Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {TIER_COLORS.map(c => (
                      <button key={c} onClick={() => setTF('color', c)} className={'w-8 h-8 rounded-full border-2 transition-all ' + (tierForm.color === c ? 'border-ink scale-110' : 'border-transparent')} style={{ background: c }}/>
                    ))}
                  </div>
                  <p className="text-xs text-ink-faint mt-1.5">Used to tag members of this tier across the tee sheet.</p>
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
                  <p className="text-xs text-ink-faint mt-1.5">
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
                    <label className={lblCls}>Advance booking (days)</label>
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
                <AlertCircle className="w-4 h-4 shrink-0"/>{tierError}
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
                  Continue<ArrowRight className="w-4 h-4"/>
                </button>
              ) : (
                <button onClick={saveTier} disabled={tierSaving || !tierForm.name?.trim()}
                  className="flex-1 bg-pine hover:bg-pine-hover text-white rounded-md text-sm font-medium disabled:opacity-40 transition-colors py-2.5">
                  {tierSaving ? 'Saving...' : editingTier ? 'Save Changes' : 'Complete Setup'}
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
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="members"/>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-ok/10 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-ok"/>
          </div>
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">Tier Created</h1>
          <p className="text-sm text-ink-soft mb-8">
            <span className="font-medium" style={{ color: createdTier.color }}>{createdTier.name}</span> is live. Anyone you add to it gets member rates automatically at checkout.
          </p>

          <div className="bg-white border border-line rounded-lg p-5 text-left mb-8">
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
              <UserPlus className="w-4 h-4"/>Add Your First Member
            </button>
            <button onClick={() => { setView('list'); setPanel('tiers'); }}
              className="border border-line text-ink-soft hover:border-line-strong py-3 rounded-md font-medium text-[12.5px] transition-colors">
              Back to Tiers
            </button>
          </div>
        </div>
      </main>
    </div>
  );

  /* ── List view ── */
  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="members"/>
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-line sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-pine"/>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Member Management</h1>
              <TabIntroButton onClick={intro.show}/>
            </div>
            <div className="ml-auto flex gap-1 bg-paper border border-line rounded-md p-1">
              {(['tiers', 'members'] as const).map(p => (
                <button key={p} onClick={() => setPanel(p)}
                  className={'px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ' + (panel === p ? 'bg-white text-ink border border-line shadow-sm' : 'text-ink-soft hover:text-ink')}>
                  {p === 'tiers' ? `Tiers (${tiers.length})` : `Members (${members.filter(m => m.status === 'active').length})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-8">

          <TabIntroCard
            open={intro.open}
            onDismiss={intro.dismiss}
            title="This is your Members page."
            bullets={[
              'Tiers are your membership or season-pass types — set pricing and perks per tier.',
              'See who’s signed up and whether their dues are paid.',
              'Add a member manually if they signed up in person, not through the site.',
              'Members get their tier’s pricing automatically when they book.',
            ]}
          />

          {/* ── Tiers panel ── */}
          {panel === 'tiers' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Your Tiers</div>
                <button onClick={() => openWizard()}
                  className="ml-auto bg-pine hover:bg-pine-hover text-white rounded-md text-[12.5px] font-medium transition-colors px-4 py-2 flex items-center gap-2">
                  <Plus className="w-4 h-4"/>New Membership Tier
                </button>
              </div>

              {tiers.length === 0 && (
                <div className="bg-white rounded-lg border border-dashed border-line p-12 text-center">
                  <Users className="w-8 h-8 text-line-strong mx-auto mb-3"/>
                  <div className="font-medium text-ink mb-1">No membership tiers yet</div>
                  <p className="text-sm text-ink-soft mb-5">Create your first tier and we&apos;ll walk you through pricing, benefits, and adding members.</p>
                  <button onClick={() => openWizard()} className="bg-pine hover:bg-pine-hover text-white px-5 py-2.5 rounded-md text-[12.5px] font-medium transition-colors inline-flex items-center gap-2">
                    <Plus className="w-4 h-4"/>Set Up Your First Tier
                  </button>
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-4">
                {tiers.map(t => (
                  <div key={t.id} className="bg-white border border-line rounded-lg p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }}/>
                        <div>
                          <div className="font-medium text-ink">{t.name}</div>
                          <div className="text-xs text-ink-muted">{t._count?.memberships ?? 0} active member{(t._count?.memberships ?? 0) !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openWizard(t)} className="p-1.5 text-ink-faint hover:text-pine transition-colors"><Edit2 className="w-3.5 h-3.5"/></button>
                        <button onClick={() => deleteTier(t.id)} className="p-1.5 text-ink-faint hover:text-bad transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
                      </div>
                    </div>

                    {t.discountPct != null ? (
                      <div className="bg-ok/5 border border-ok/20 rounded-md px-4 py-2 text-sm text-ok font-medium">
                        {t.discountPct}% off standard rate
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          ['Green fee (weekday)', fmtMoney(t.greenFeeWeekday)],
                          ['Green fee (weekend)', fmtMoney(t.greenFeeWeekend)],
                          ['Cart fee (weekday)',  fmtMoney(t.cartFeeWeekday)],
                          ['Cart fee (weekend)',  fmtMoney(t.cartFeeWeekend)],
                        ].map(([label, val]) => (
                          <div key={label} className="bg-paper border border-line-soft rounded-md px-3 py-2">
                            <div className="text-ink-muted">{label}</div>
                            <div className="font-medium text-ink mt-0.5 tabular-nums">{val}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted">
                      <span>Book {t.advanceBookingDays}d ahead</span>
                      {t.guestPassesPerYear > 0 && <span>{t.guestPassesPerYear} guest pass{t.guestPassesPerYear !== 1 ? 'es' : ''}/yr</span>}
                      {t.annualFee > 0 && <span>${t.annualFee}/yr</span>}
                      {t.notes && <span className="text-ink-faint italic">{t.notes}</span>}
                    </div>

                    <button onClick={() => startAddMember(t.id)}
                      className="mt-4 w-full border border-line text-ink-soft hover:border-line-strong rounded-md text-xs font-medium py-2 flex items-center justify-center gap-1.5 transition-colors">
                      <UserPlus className="w-3.5 h-3.5"/>Add Member to {t.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Members panel ── */}
          {panel === 'members' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
                  className="bg-white border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-pine/10 focus:border-pine/40">
                  <option value="all">All tiers</option>
                  {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="bg-white border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-pine/10 focus:border-pine/40">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="all">All statuses</option>
                </select>
                <span className="text-sm text-ink-muted">{filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}</span>
                <button onClick={() => startAddMember()} disabled={tiers.length === 0}
                  className="ml-auto bg-pine hover:bg-pine-hover text-white rounded-md text-[12.5px] font-medium transition-colors disabled:opacity-40 px-4 py-2 flex items-center gap-2">
                  <Plus className="w-4 h-4"/>Create New Member
                </button>
              </div>

              {/* Add member form */}
              {addOpen && (
                <div className="bg-white border border-pine/30 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-serif font-medium text-ink text-[17px]">Create New Member</h3>
                    <button onClick={() => { setAddOpen(false); setMemberError(''); }} className="text-ink-muted hover:text-ink"><X className="w-4 h-4"/></button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className={lblCls}>Email *</label>
                      <input className={iCls} value={memberForm.email} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} placeholder="member@email.com" type="email"/>
                    </div>
                    <div>
                      <label className={lblCls}>Full name</label>
                      <input className={iCls} value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith"/>
                    </div>
                    <div>
                      <label className={lblCls}>Phone</label>
                      <input className={iCls} value={memberForm.phone} onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))} placeholder="(201) 555-0100"/>
                    </div>
                    <div>
                      <label className={lblCls}>Tier *</label>
                      <select className={iCls} value={memberForm.tierId} onChange={e => {
                        const t = tiers.find(x => x.id === e.target.value);
                        setMemberForm(f => ({ ...f, tierId: e.target.value, expiresAt: t ? addMonthsISO(t.termMonths || 12) : f.expiresAt }));
                      }}>
                        <option value="">Select tier...</option>
                        {tiers.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lblCls}>Expires</label>
                      <input type="date" className={iCls} value={memberForm.expiresAt} onChange={e => setMemberForm(f => ({ ...f, expiresAt: e.target.value }))}/>
                      <p className="text-xs text-ink-faint mt-1">Auto-set from the tier&apos;s term — adjust if needed.</p>
                    </div>
                    <div className="col-span-2">
                      <label className={lblCls}>Internal notes</label>
                      <input className={iCls} value={memberForm.notes} onChange={e => setMemberForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional"/>
                    </div>
                  </div>
                  {memberError && (
                    <div className="flex gap-2 items-center text-bad text-sm bg-bad/5 border border-bad/20 rounded-md px-4 py-2 mt-3">
                      <AlertCircle className="w-4 h-4 shrink-0"/>{memberError}
                    </div>
                  )}
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => { setAddOpen(false); setMemberError(''); }} className="flex-1 border border-line text-ink-soft hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors py-2.5">Cancel</button>
                    <button onClick={addMember} disabled={memberSaving || !memberForm.email || !memberForm.tierId}
                      className="flex-1 bg-pine hover:bg-pine-hover text-white rounded-md text-[12.5px] font-medium disabled:opacity-40 transition-colors py-2.5">
                      {memberSaving ? 'Adding...' : 'Add Member'}
                    </button>
                  </div>
                </div>
              )}

              {tiers.length === 0 && (
                <div className="bg-warn/5 border border-warn/20 rounded-lg p-5 flex gap-3 items-center text-sm text-warn">
                  <AlertCircle className="w-5 h-5 shrink-0"/>
                  You need at least one tier before adding members.
                  <button onClick={() => openWizard()} className="underline font-medium ml-1">Set up a tier</button>
                </div>
              )}

              {filteredMembers.length === 0 && tiers.length > 0 && (
                <div className="bg-white rounded-lg border border-dashed border-line p-10 text-center text-ink-muted text-sm">
                  No members match this filter.
                </div>
              )}

              <div className="space-y-2">
                {filteredMembers.map(m => (
                  <div key={m.id} className={'bg-white rounded-lg border border-line px-5 py-4 flex items-center gap-4 ' + (m.status !== 'active' ? 'opacity-60' : '')}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-medium text-sm text-white shrink-0" style={{ background: m.tierColor }}>
                      {m.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-ink text-sm">{m.name || '—'}</span>
                        {!m.linked && (
                          <span className="text-xs text-warn bg-warn/5 border border-warn/20 px-2 py-0.5 rounded-md">No account yet</span>
                        )}
                        {m.status !== 'active' && (
                          <span className="text-xs text-ink-muted bg-paper border border-line px-2 py-0.5 rounded-md">Inactive</span>
                        )}
                      </div>
                      <div className="text-xs text-ink-muted truncate">{m.email}{m.phone ? ` · ${m.phone}` : ''}</div>
                      {m.expiresAt && <div className="text-xs text-warn mt-0.5">Expires {fmtDate(m.expiresAt)}</div>}
                      {m.notes && <div className="text-xs text-ink-faint italic mt-0.5">{m.notes}</div>}
                    </div>

                    <div className="shrink-0">
                      {editMemberId === m.id ? (
                        <div className="flex items-center gap-2">
                          <select value={editMemberTierId} onChange={e => setEditMemberTierId(e.target.value)}
                            className="bg-paper border border-line rounded-md px-2 py-1 text-xs text-ink outline-none focus:ring-2 focus:ring-pine/10 focus:border-pine/40">
                            {tiers.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <button onClick={() => updateMemberTier(m.id, editMemberTierId)} className="text-ok hover:text-ok/80"><Check className="w-4 h-4"/></button>
                          <button onClick={() => setEditMemberId(null)} className="text-ink-muted hover:text-ink"><X className="w-4 h-4"/></button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditMemberId(m.id); setEditMemberTierId(m.tierId ?? ''); }}
                          className="flex items-center gap-1.5 text-xs font-medium text-ink-soft px-2.5 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">
                          <span className="w-2 h-2 rounded-full" style={{ background: m.tierColor }}/>
                          {m.tierName}
                          <ChevronDown className="w-3 h-3 text-ink-faint"/>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleMemberStatus(m)} title={m.status === 'active' ? 'Deactivate' : 'Activate'}
                        className={'p-1.5 rounded-md transition-colors ' + (m.status === 'active' ? 'text-ok hover:bg-bad/5 hover:text-bad' : 'text-ink-faint hover:bg-ok/5 hover:text-ok')}>
                        {m.status === 'active' ? <UserCheck className="w-4 h-4"/> : <UserX className="w-4 h-4"/>}
                      </button>
                      <button onClick={() => removeMember(m.id, m.name)} className="p-1.5 text-ink-faint hover:text-bad rounded-md transition-colors"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
