'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Users, Edit2, Check, X, ArrowLeft, ArrowRight,
  RefreshCw, UserCheck, UserX, ChevronDown, AlertCircle, CheckCircle2, UserPlus,
} from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Tier {
  id: string;
  name: string;
  color: string;
  greenFeeWeekday: number | null;
  greenFeeWeekend: number | null;
  cartFeeWeekday: number | null;
  cartFeeWeekend: number | null;
  discountPct: number | null;
  advanceBookingDays: number;
  guestPassesPerYear: number;
  annualFee: number;
  initiationFee: number;
  termMonths: number;
  notes: string;
  active: boolean;
  _count?: { memberships: number };
}

interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  tierId: string | null;
  tierName: string;
  tierColor: string;
  status: string;
  linked: boolean;
  inviteAccepted: boolean;
  expiresAt: string | null;
  notes: string;
  createdAt: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const TIER_COLORS = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#f43f5e','#14b8a6','#94a3b8'];
const inp = 'w-full bg-gray-950 border border-white/10 rounded-md px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none';
const lbl = 'block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5';
const btnPrimary = 'bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-sm font-bold transition-colors disabled:opacity-40';
const btnGhost = 'border border-white/10 text-gray-300 hover:bg-white/5 rounded-md text-sm font-semibold transition-colors';
const fmtMoney = (n: number | null) => n == null ? '—' : `$${n.toFixed(2)}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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

const WIZARD_STEPS = [
  { n: 1, label: 'Name & Color' },
  { n: 2, label: 'Pricing' },
  { n: 3, label: 'Benefits & Fees' },
];

/* ─── Main ────────────────────────────────────────────────────────────── */
export default function MembersPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [panel, setPanel] = useState<'tiers' | 'members'>('tiers');
  const [courseName, setCourseName] = useState('');

  // Wizard
  const [wizStep, setWizStep] = useState(1);
  const [tierForm, setTierForm] = useState<Partial<Tier>>(emptyTier());
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<PricingMode>('flat');
  const [tierSaving, setTierSaving] = useState(false);
  const [tierError, setTierError] = useState('');
  const [createdTier, setCreatedTier] = useState<Tier | null>(null);

  // Member form
  const [addOpen, setAddOpen] = useState(false);
  const [memberForm, setMemberForm] = useState(emptyMember());
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState('');

  // Edit member tier inline
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
  useEffect(() => { fetch('/api/operator/courses').then(r => r.json()).then(c => { if (c?.name) setCourseName(c.name); }); }, []);

  /* ── Wizard control ── */
  const openWizard = (t?: Tier) => {
    if (t) {
      setEditingTier(t.id);
      setTierForm({ ...t });
      setPricingMode(t.discountPct != null ? 'pct' : 'flat');
    } else {
      setEditingTier(null);
      setTierForm(emptyTier());
      setPricingMode('flat');
    }
    setWizStep(1);
    setTierError('');
    setView('wizard');
  };

  const closeWizard = () => {
    setView('list');
    setTierForm(emptyTier());
    setEditingTier(null);
    setTierError('');
  };

  const saveTier = async () => {
    setTierSaving(true); setTierError('');
    const payload = {
      ...tierForm,
      ...(pricingMode === 'pct'
        ? { greenFeeWeekday: null, greenFeeWeekend: null, cartFeeWeekday: null, cartFeeWeekend: null }
        : { discountPct: null }
      ),
    };
    const method = editingTier ? 'PATCH' : 'POST';
    const body   = editingTier ? { ...payload, id: editingTier } : payload;
    const r = await fetch('/api/operator/tiers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (r.ok) {
      await loadAll();
      if (editingTier) {
        closeWizard();
      } else {
        setCreatedTier(d);
        setView('complete');
      }
      setTierForm(emptyTier());
      setEditingTier(null);
    } else {
      setTierError(d.error || 'Save failed');
    }
    setTierSaving(false);
  };

  const deleteTier = async (id: string) => {
    const r = await fetch(`/api/operator/tiers?id=${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (r.ok) { setTiers(prev => prev.filter(t => t.id !== id)); }
    else alert(d.error);
  };

  /* ── Member CRUD ── */
  const startAddMember = (tierId?: string) => {
    setMemberForm({ ...emptyMember(), tierId: tierId ?? '' });
    setMemberError('');
    setPanel('members');
    setAddOpen(true);
    setView('list');
  };

  const addMember = async () => {
    setMemberSaving(true); setMemberError('');
    const r = await fetch('/api/operator/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memberForm) });
    const d = await r.json();
    if (r.ok) {
      await loadAll();
      setMemberForm(emptyMember());
      setAddOpen(false);
    } else {
      setMemberError(d.error || 'Failed to add member');
    }
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

  /* ── Derived ── */
  const filteredMembers = members.filter(m => {
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    if (filterTier !== 'all' && m.tierId !== filterTier) return false;
    return true;
  });

  const setTF = (k: keyof typeof tierForm, v: unknown) => setTierForm(f => ({ ...f, [k]: v }));

  const canContinue = wizStep === 1 ? !!tierForm.name?.trim() : true;

  if (loading) return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <OperatorSidebar active="members" courseName={courseName} />
      <main className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-gray-600 animate-spin" />
      </main>
    </div>
  );

  /* ══════════════════ WIZARD VIEW ══════════════════ */
  if (view === 'wizard') return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <OperatorSidebar active="members" courseName={courseName} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10">

          {/* Back + title */}
          <button onClick={closeWizard} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" />Back to Member Management
          </button>
          <h1 className="font-black tracking-tight text-white text-2xl mb-1">
            {editingTier ? 'Edit Membership Tier' : 'New Membership Tier'}
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            {editingTier ? 'Update the details of this tier.' : 'Set up a tier in three quick steps. Members assigned to it get these rates automatically at checkout.'}
          </p>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-8">
            {WIZARD_STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => { if (s.n < wizStep) setWizStep(s.n); }}
                  className={`flex items-center gap-2 w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    wizStep === s.n ? 'border-emerald-600 bg-emerald-600/10' :
                    wizStep > s.n ? 'border-white/10 bg-gray-900 cursor-pointer hover:border-white/20' :
                    'border-white/10 bg-gray-900 opacity-50'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    wizStep > s.n ? 'bg-emerald-600 text-white' :
                    wizStep === s.n ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-500'
                  }`}>
                    {wizStep > s.n ? <Check className="w-3 h-3" /> : s.n}
                  </span>
                  <span className={`text-xs font-bold uppercase tracking-widest ${wizStep >= s.n ? 'text-white' : 'text-gray-500'}`}>{s.label}</span>
                </button>
                {i < WIZARD_STEPS.length - 1 && <div className="w-4 h-px bg-white/10 shrink-0" />}
              </div>
            ))}
          </div>

          <div className="bg-gray-900 border border-white/10 rounded-lg p-6 space-y-5">

            {/* ── Step 1: Name & Color ── */}
            {wizStep === 1 && (
              <>
                <div>
                  <label className={lbl}>Tier name *</label>
                  <input autoFocus className={inp} value={tierForm.name ?? ''} onChange={e => setTF('name', e.target.value)} placeholder="e.g. Full Member, Senior, Junior" />
                  <p className="text-xs text-gray-500 mt-1.5">This is what staff and members will see on bookings.</p>
                </div>
                <div>
                  <label className={lbl}>Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {TIER_COLORS.map(c => (
                      <button key={c} onClick={() => setTF('color', c)} className={`w-8 h-8 rounded-full border-2 transition-all ${tierForm.color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ background: c }} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">Used to tag members of this tier across the tee sheet.</p>
                </div>
              </>
            )}

            {/* ── Step 2: Pricing ── */}
            {wizStep === 2 && (
              <>
                <div>
                  <label className={lbl}>Pricing type</label>
                  <div className="flex gap-2">
                    {(['flat', 'pct'] as PricingMode[]).map(m => (
                      <button key={m} onClick={() => setPricingMode(m)} className={`flex-1 py-2.5 rounded-md text-sm font-semibold border transition-colors ${pricingMode === m ? 'bg-emerald-600 text-white border-emerald-600' : 'border-white/10 text-gray-400 hover:border-white/30'}`}>
                        {m === 'flat' ? 'Flat rates' : '% discount'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
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
                        <label className={lbl}>{label}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input type="number" min="0" step="0.01" className={`${inp} pl-6`}
                            value={tierForm[key as keyof Tier] as number ?? ''}
                            onChange={e => setTF(key as keyof Tier, e.target.value === '' ? null : Number(e.target.value))}
                            placeholder="e.g. 45" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <label className={lbl}>Discount %</label>
                    <div className="relative">
                      <input type="number" min="0" max="100" step="1" className={`${inp} pr-8`}
                        value={tierForm.discountPct ?? ''}
                        onChange={e => setTF('discountPct', e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="e.g. 20" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Step 3: Benefits & Fees ── */}
            {wizStep === 3 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Advance booking (days)</label>
                    <input type="number" min="0" className={inp} value={tierForm.advanceBookingDays ?? 14} onChange={e => setTF('advanceBookingDays', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className={lbl}>Guest passes / year</label>
                    <input type="number" min="0" className={inp} value={tierForm.guestPassesPerYear ?? 0} onChange={e => setTF('guestPassesPerYear', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className={lbl}>Annual fee ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input type="number" min="0" step="0.01" className={`${inp} pl-6`} value={tierForm.annualFee ?? 0} onChange={e => setTF('annualFee', Number(e.target.value))} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Initiation fee ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input type="number" min="0" step="0.01" className={`${inp} pl-6`} value={tierForm.initiationFee ?? 0} onChange={e => setTF('initiationFee', Number(e.target.value))} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Term (months)</label>
                    <input type="number" min="1" className={inp} value={tierForm.termMonths ?? 12} onChange={e => setTF('termMonths', Number(e.target.value))} />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Notes (internal)</label>
                  <textarea rows={2} className={`${inp} resize-none`} value={tierForm.notes ?? ''} onChange={e => setTF('notes', e.target.value)} placeholder="Any extra details about this tier..." />
                </div>
              </>
            )}

            {tierError && <div className="flex gap-2 items-center text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-md px-4 py-2"><AlertCircle className="w-4 h-4 shrink-0" />{tierError}</div>}

            {/* Nav buttons */}
            <div className="flex gap-3 pt-2">
              {wizStep > 1 && (
                <button onClick={() => setWizStep(s => s - 1)} className={`${btnGhost} px-5 py-2.5 flex items-center gap-2`}>
                  <ArrowLeft className="w-4 h-4" />Back
                </button>
              )}
              {wizStep < 3 ? (
                <button onClick={() => setWizStep(s => s + 1)} disabled={!canContinue} className={`${btnPrimary} flex-1 py-2.5 flex items-center justify-center gap-2`}>
                  Continue<ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={saveTier} disabled={tierSaving || !tierForm.name?.trim()} className={`${btnPrimary} flex-1 py-2.5`}>
                  {tierSaving ? 'Saving...' : editingTier ? 'Save Changes' : 'Complete Setup'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );

  /* ══════════════════ COMPLETE VIEW ══════════════════ */
  if (view === 'complete' && createdTier) return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <OperatorSidebar active="members" courseName={courseName} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
          <h1 className="font-black tracking-tight text-white text-2xl mb-2">Tier Created</h1>
          <p className="text-sm text-gray-500 mb-8">
            <span className="font-semibold" style={{ color: createdTier.color }}>{createdTier.name}</span> is live. Anyone you add to it gets member rates automatically at checkout.
          </p>

          {/* Summary card */}
          <div className="bg-gray-900 border border-white/10 rounded-lg p-5 text-left mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: createdTier.color }} />
              <span className="font-bold text-white">{createdTier.name}</span>
            </div>
            {createdTier.discountPct != null ? (
              <div className="bg-emerald-600/10 border border-emerald-600/20 rounded-md px-4 py-2 text-sm text-emerald-400 font-semibold">
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
                  <div key={label} className="bg-gray-950 border border-white/5 rounded-md px-3 py-2">
                    <div className="text-gray-500">{label}</div>
                    <div className="font-bold text-gray-200 mt-0.5">{val}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
              <span>Book {createdTier.advanceBookingDays}d ahead</span>
              {createdTier.guestPassesPerYear > 0 && <span>{createdTier.guestPassesPerYear} guest passes/yr</span>}
              {createdTier.annualFee > 0 && <span>${createdTier.annualFee}/yr</span>}
              {createdTier.initiationFee > 0 && <span>${createdTier.initiationFee} initiation</span>}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button onClick={() => startAddMember(createdTier.id)} className={`${btnPrimary} py-3 flex items-center justify-center gap-2`}>
              <UserPlus className="w-4 h-4" />Add Your First Member
            </button>
            <button onClick={() => { setView('list'); setPanel('tiers'); }} className={`${btnGhost} py-3`}>
              Back to Tiers
            </button>
          </div>
        </div>
      </main>
    </div>
  );

  /* ══════════════════ LIST VIEW ══════════════════ */
  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <OperatorSidebar active="members" courseName={courseName} />
      <main className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="bg-gray-950/95 backdrop-blur border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-500" />
            <h1 className="font-black tracking-tight text-white text-lg">Member Management</h1>
          </div>
          <div className="ml-auto flex gap-1 bg-gray-900 border border-white/10 rounded-md p-1">
            {(['tiers', 'members'] as const).map(p => (
              <button key={p} onClick={() => setPanel(p)} className={`px-4 py-1.5 rounded-md text-sm font-semibold capitalize transition-colors ${panel === p ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {p === 'tiers' ? `Tiers (${tiers.length})` : `Members (${members.filter(m => m.status === 'active').length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ══════════════════ TIERS PANEL ══════════════════ */}
        {panel === 'tiers' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Your Tiers</h2>
              <button onClick={() => openWizard()} className={`${btnPrimary} ml-auto flex items-center gap-2 px-4 py-2`}>
                <Plus className="w-4 h-4" />New Membership Tier
              </button>
            </div>

            {tiers.length === 0 && (
              <div className="bg-gray-900 rounded-lg border border-dashed border-white/10 p-12 text-center">
                <Users className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                <div className="font-bold text-white mb-1">No membership tiers yet</div>
                <p className="text-sm text-gray-500 mb-5">Create your first tier and we&apos;ll walk you through pricing, benefits, and adding members.</p>
                <button onClick={() => openWizard()} className={`${btnPrimary} px-5 py-2.5 inline-flex items-center gap-2`}>
                  <Plus className="w-4 h-4" />Set Up Your First Tier
                </button>
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-4">
              {tiers.map(t => (
                <div key={t.id} className="bg-gray-900 rounded-lg border border-white/10 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }} />
                      <div>
                        <div className="font-bold text-white">{t.name}</div>
                        <div className="text-xs text-gray-500">{t._count?.memberships ?? 0} active member{(t._count?.memberships ?? 0) !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openWizard(t)} className="p-1.5 text-gray-500 hover:text-emerald-400 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteTier(t.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  {t.discountPct != null ? (
                    <div className="bg-emerald-600/10 border border-emerald-600/20 rounded-md px-4 py-2 text-sm text-emerald-400 font-semibold">
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
                        <div key={label} className="bg-gray-950 border border-white/5 rounded-md px-3 py-2">
                          <div className="text-gray-500">{label}</div>
                          <div className="font-bold text-gray-200 mt-0.5">{val}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>Book {t.advanceBookingDays}d ahead</span>
                    {t.guestPassesPerYear > 0 && <span>{t.guestPassesPerYear} guest pass{t.guestPassesPerYear !== 1 ? 'es' : ''}/yr</span>}
                    {t.annualFee > 0 && <span>${t.annualFee}/yr</span>}
                    {t.notes && <span className="text-gray-600 italic">{t.notes}</span>}
                  </div>

                  <button onClick={() => startAddMember(t.id)} className="mt-4 w-full border border-white/10 text-gray-300 hover:bg-white/5 rounded-md text-xs font-bold py-2 flex items-center justify-center gap-1.5 transition-colors">
                    <UserPlus className="w-3.5 h-3.5" />Add Member to {t.name}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════ MEMBERS PANEL ══════════════════ */}
        {panel === 'members' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className="bg-gray-900 border border-white/10 rounded-md px-3 py-2 text-sm text-gray-300 outline-none focus:ring-2 focus:ring-emerald-600">
                <option value="all">All tiers</option>
                {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-gray-900 border border-white/10 rounded-md px-3 py-2 text-sm text-gray-300 outline-none focus:ring-2 focus:ring-emerald-600">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All statuses</option>
              </select>
              <span className="text-sm text-gray-500">{filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}</span>
              <button onClick={() => startAddMember()} disabled={tiers.length === 0} className={`${btnPrimary} ml-auto flex items-center gap-2 px-4 py-2`}>
                <Plus className="w-4 h-4" />Create New Member
              </button>
            </div>

            {/* Add member form */}
            {addOpen && (
              <div className="bg-gray-900 rounded-lg border border-emerald-600/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black tracking-tight text-white">Create New Member</h3>
                  <button onClick={() => { setAddOpen(false); setMemberError(''); }} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className={lbl}>Email *</label>
                    <input className={inp} value={memberForm.email} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} placeholder="member@email.com" type="email" />
                    <p className="text-xs text-gray-500 mt-1">If they already have a GreenReserve account, rates apply automatically at checkout.</p>
                  </div>
                  <div>
                    <label className={lbl}>Full name</label>
                    <input className={inp} value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" />
                  </div>
                  <div>
                    <label className={lbl}>Phone</label>
                    <input className={inp} value={memberForm.phone} onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))} placeholder="(201) 555-0100" />
                  </div>
                  <div>
                    <label className={lbl}>Tier *</label>
                    <select className={inp} value={memberForm.tierId} onChange={e => setMemberForm(f => ({ ...f, tierId: e.target.value }))}>
                      <option value="">Select tier...</option>
                      {tiers.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Expires (optional)</label>
                    <input type="date" className={inp} value={memberForm.expiresAt} onChange={e => setMemberForm(f => ({ ...f, expiresAt: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>Internal notes</label>
                    <input className={inp} value={memberForm.notes} onChange={e => setMemberForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
                  </div>
                </div>
                {memberError && <div className="flex gap-2 items-center text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-md px-4 py-2 mt-3"><AlertCircle className="w-4 h-4 shrink-0" />{memberError}</div>}
                <div className="flex gap-3 mt-4">
                  <button onClick={() => { setAddOpen(false); setMemberError(''); }} className={`${btnGhost} flex-1 py-2.5`}>Cancel</button>
                  <button onClick={addMember} disabled={memberSaving || !memberForm.email || !memberForm.tierId} className={`${btnPrimary} flex-1 py-2.5`}>
                    {memberSaving ? 'Adding...' : 'Add Member'}
                  </button>
                </div>
              </div>
            )}

            {/* No tiers warning */}
            {tiers.length === 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-5 flex gap-3 items-center text-sm text-yellow-500">
                <AlertCircle className="w-5 h-5 shrink-0" />
                You need at least one tier before adding members. <button onClick={() => openWizard()} className="underline font-semibold ml-1">Set up a tier</button>
              </div>
            )}

            {/* Member list */}
            {filteredMembers.length === 0 && tiers.length > 0 && (
              <div className="bg-gray-900 rounded-lg border border-dashed border-white/10 p-10 text-center text-gray-500 text-sm">
                No members match this filter.
              </div>
            )}

            <div className="space-y-2">
              {filteredMembers.map(m => (
                <div key={m.id} className={`bg-gray-900 rounded-lg border border-white/10 px-5 py-4 flex items-center gap-4 ${m.status !== 'active' ? 'opacity-60' : ''}`}>
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0" style={{ background: m.tierColor }}>
                    {m.name?.[0]?.toUpperCase() ?? '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm">{m.name || '—'}</span>
                      {!m.linked && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">No account yet</span>
                      )}
                      {m.status !== 'active' && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-gray-800 text-gray-500">Inactive</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{m.email}{m.phone ? ` · ${m.phone}` : ''}</div>
                    {m.expiresAt && <div className="text-xs text-orange-400 mt-0.5">Expires {fmtDate(m.expiresAt)}</div>}
                    {m.notes && <div className="text-xs text-gray-600 italic mt-0.5">{m.notes}</div>}
                  </div>

                  {/* Tier badge / editor */}
                  <div className="shrink-0">
                    {editMemberId === m.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editMemberTierId}
                          onChange={e => setEditMemberTierId(e.target.value)}
                          className="bg-gray-950 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-300 outline-none focus:ring-2 focus:ring-emerald-600"
                        >
                          {tiers.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <button onClick={() => updateMemberTier(m.id, editMemberTierId)} className="text-emerald-500 hover:text-emerald-400"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditMemberId(null)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditMemberId(m.id); setEditMemberTierId(m.tierId ?? ''); }} className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 px-2.5 py-1.5 rounded-md border border-white/10 hover:border-white/30 transition-colors">
                        <span className="w-2 h-2 rounded-full" style={{ background: m.tierColor }} />
                        {m.tierName}
                        <ChevronDown className="w-3 h-3 text-gray-500" />
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleMemberStatus(m)} title={m.status === 'active' ? 'Deactivate' : 'Activate'} className={`p-1.5 rounded-md transition-colors ${m.status === 'active' ? 'text-emerald-500 hover:bg-red-500/10 hover:text-red-400' : 'text-gray-500 hover:bg-emerald-500/10 hover:text-emerald-500'}`}>
                      {m.status === 'active' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                    </button>
                    <button onClick={() => removeMember(m.id, m.name)} className="p-1.5 text-gray-500 hover:text-red-400 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
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
