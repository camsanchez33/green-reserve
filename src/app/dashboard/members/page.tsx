'use client';
// Memberships (was Members) — Cam 2026-11-16 "that page is good to go"; the spec is lanes/dashboard/members-mockup.html
// and lanes/dashboard.md "Next" 2. The list page: three numbers, Your memberships (colour, name, price, how many,
// most first, a bare plus), Dues this year by membership, and Residents until the post-launch switch. A row opens
// that membership's page (?m=<id>): three numbers, every member, Details, and there the joining-online requests,
// import and reminders. A member opens their card; the plus adds a member; Edit opens the setup.
// Data: /api/operator/tiers and /api/operator/members. Season passes, dues collected, member numbers, photos and
// paying when added come from the Memberships data PRs; each shows only once a response carries it.
import { UnpaidMembers } from '@/components/dashboard/MemberJoin';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorSidebar from '@/components/OperatorSidebar';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { Card } from '@/components/ui/Card';
import { ImportMembers } from '@/components/dashboard/members/ImportMembers';
import { ResidentsCard } from '@/components/dashboard/members/ResidentsCard';
import { PricingCard } from '@/components/dashboard/members/PricingCard';
import { MembershipSetup } from '@/components/dashboard/members/MembershipSetup';
import { MemberCard } from '@/components/dashboard/members/MemberCard';
import { AddMember } from '@/components/dashboard/members/AddMember';
import {
  type Tier, type Member, type Dues, type DuesThisYear, CardHead, Tile, KV, SubHead, ChevronIcon, Dot, LINK,
  priceLine, notPaidYet, monthYear, shortDate, sinceYear, usd0, dollars, DuesText,
} from '@/components/dashboard/members/shared';

// The setup's colours on the tee sheet (the mockup's eight; they read on both looks).
const COLORS = ['#2E8F5E', '#C9A24A', '#4F7FB8', '#B85C4F', '#7A6BB8', '#8A8F87', '#3F9C9C', '#B87A3F'];
const SHOWN = 25;

/** What they'd owe now — the same sum the dues pay link and the Remind button use. */
const owedOf = (m: Member) => (m.annualFee ?? 0) + ((m.lastPaidAt || m.initiationWaived) ? 0 : (m.initiationFee ?? 0));

/** One plain dues status per member (CourseMembership.paymentStatus + expiresAt — the same
 *  "overdue" the Remind button uses: unpaid, or past expiry and not comped). */
function duesOf(m: Member, now: Date): Dues {
  if (m.status !== 'active') return { kind: 'inactive', label: 'Not active', tone: 'neutral' };
  // A free membership owes nothing, whatever paymentStatus still says (it defaults to 'unpaid').
  const owed = (m.annualFee ?? 0) + ((m.lastPaidAt || m.initiationWaived) ? 0 : (m.initiationFee ?? 0));
  if (m.paymentStatus === 'comped' || owed <= 0) return { kind: 'comped', label: 'No dues', tone: 'ok' };
  if (m.paymentStatus === 'unpaid') return { kind: 'unpaid', label: `Owes ${dollars(owed)}`, tone: 'bad' };
  // The "runs until" date is a member day all day (lib/member-rates).
  if (m.expiresAt && m.expiresAt.slice(0, 10) < now.toLocaleDateString('en-CA')) return { kind: 'expired', label: `Expired ${shortDate(m.expiresAt)} · not renewed`, tone: 'bad' };
  if (m.expiresAt && new Date(m.expiresAt).getTime() - now.getTime() < 30 * 86400000) return { kind: 'renewing', label: `Renews ${shortDate(m.expiresAt)}`, tone: 'warn' };
  return { kind: 'paid', label: m.expiresAt ? `Paid to ${monthYear(m.expiresAt)}` : 'Paid', tone: 'ok' };
}
const overdue = (d: Dues) => d.kind === 'unpaid' || d.kind === 'expired';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="members" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <StaffNotice what="memberships" view="members.view" edit="members.edit" />
        <div className="px-4 sm:px-6 py-5 flex flex-col gap-4 max-w-[1320px]">{children}</div>
      </main>
    </div>
  );
}

/* ─── Main ────────────────────────────────────────────────────────────────── */
function MembershipsPageInner() {
  const access = useDashboardAccess();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openId = searchParams.get('m');
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [dues, setDues] = useState<DuesThisYear>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [setup, setSetup] = useState<{ tier: Tier | null } | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [reminding, setReminding] = useState(false);
  // DASH-C search: a member found from the dashboard search opens Memberships at ?q= — their card opens.
  const [search, setSearch] = useState('');
  useEffect(() => { const q = searchParams.get('q'); if (q) setSearch(q.slice(0, 80)); }, [searchParams]);
  const canEdit = access.can('members.edit');

  const loadAll = useCallback(async () => {
    const [tr, mb] = await Promise.all([dfetch<Tier[]>('/api/operator/tiers'), dfetch<{ members: Member[]; duesThisYear?: DuesThisYear }>('/api/operator/members')]);
    // SD-10: a 403/500 here used to render "No membership tiers yet".
    setTiers(tr.ok && Array.isArray(tr.data) ? tr.data : []);
    setMembers(mb.ok && Array.isArray(mb.data?.members) ? mb.data.members : []);
    // Dues this year shows only once the response carries it (Build's data PR) and this login sees money.
    setDues(mb.ok && mb.data?.duesThisYear && Array.isArray(mb.data.duesThisYear.byTier) ? mb.data.duesThisYear : null);
    setLoadError(!tr.ok ? tr.error : !mb.ok ? mb.error : '');
    setLoading(false);
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  // ?q= → the first active member it names: their membership's page with their card open.
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q || loading) return;
    const hit = members.find(m => m.status === 'active' && m.tierId && [m.name, m.email].some(v => (v ?? '').toLowerCase().includes(q)));
    if (hit) { router.replace(`/dashboard/members?m=${hit.tierId}`, { scroll: false }); setCard(hit.id); setSearch(''); }
  }, [search, loading, members, router]);

  const go = (id: string | null) => { setShowAll(false); setImportOpen(false); router.push(id ? `/dashboard/members?m=${id}` : '/dashboard/members'); };

  // B-10: one click reminds every overdue member; the result is a sentence.
  const remindOverdue = async () => {
    if (reminding) return;
    setReminding(true);
    const r = await dfetch<{ overdue: number; sent: number; skippedRecent: number; skippedFree: number; skippedNoEmail: number; failed: string[] }>('/api/operator/members/remind-overdue', { method: 'POST' });
    setReminding(false);
    if (!r.ok) { toast(r.error); return; }
    const d = r.data;
    if (!d || d.overdue === 0) { toast('Nobody is overdue — every active member is paid up.', 'ok'); return; }
    const parts = [`Reminded ${d.sent} member${d.sent === 1 ? '' : 's'}`];
    if (d.skippedRecent) parts.push(`${d.skippedRecent} already reminded this week`);
    if (d.skippedFree) parts.push(`${d.skippedFree} on a free membership (nothing owed)`);
    if (d.skippedNoEmail) parts.push(`${d.skippedNoEmail} with no email on file`);
    if (d.failed.length) parts.push(`${d.failed.length} FAILED (${d.failed.join(', ')})`);
    toast(parts.join(' · ') + '.', d.failed.length ? 'warn' : 'ok');
  };
  const deleteTier = async (t: Tier) => {
    const r = await dfetch(`/api/operator/tiers?id=${t.id}`, { method: 'DELETE' });
    if (!r.ok) { toast(r.error); return false; }
    await loadAll(); go(null); toast(`${t.name} deleted.`, 'ok');
    return true;
  };

  // SP-A: a login without "members.view" sees only why — never a working page whose every action is refused.
  if (access.loaded && !access.can('members.view')) return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="members" />
      <main className="flex-1 md:overflow-y-auto"><StaffNotice what="memberships" view="members.view" /></main>
    </div>
  );
  if (loading) return <Shell><h1 className="font-serif text-[30px] sm:text-[34px] leading-none text-ink mt-1">Memberships</h1><p className="text-[13px] text-ink-muted">Loading…</p></Shell>;

  const now = new Date();
  const listed = members.filter(m => !notPaidYet(m));
  const allOverdue = listed.filter(m => overdue(duesOf(m, now))).length;
  const live = tiers.filter(t => t.active);
  const count = (t: Tier) => t._count?.memberships ?? 0;
  const unpaid = (t: Tier) => members.filter(m => notPaidYet(m) && m.tierId === t.id).length;
  const hasDues = !!dues && tiers.length > 0;
  const duesTotal = dues?.totalCents ?? 0;
  const duesOfTier = (t: Tier) => dues?.byTier.find(x => x.tierId === t.id)?.cents ?? 0;
  const cardMember = card ? members.find(m => m.id === card) : undefined;
  const pops = <>
    {setup && <MembershipSetup tier={setup.tier} colors={COLORS} onClose={() => setSetup(null)} onDelete={setup.tier ? () => deleteTier(setup.tier!) : undefined}
      onSaved={async (t, created) => { setSetup(null); await loadAll(); toast(created ? `${t.name} added.` : 'Saved.', 'ok'); if (created) go(t.id); }} />}
    {cardMember && <MemberCard m={cardMember} tier={tiers.find(t => t.id === cardMember.tierId)} tiers={tiers} dues={duesOf(cardMember, now)} owed={owedOf(cardMember)}
      can={{ edit: canEdit, credit: access.can('money.refund'), move: access.can('sheet.counter_payment') }} onChanged={loadAll} onClose={() => setCard(null)} />}
  </>;

  /* ── A membership's own page ── */
  const open = openId ? tiers.find(t => t.id === openId) : undefined;
  if (open) {
    const ppl = listed.filter(m => m.tierId === open.id)
      .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || (a.name || a.email).localeCompare(b.name || b.email));
    const shown = showAll ? ppl : ppl.slice(0, SHOWN);
    const late = ppl.filter(m => overdue(duesOf(m, now))).length;
    const rates = open.discountPct != null
      ? [<KV key="pct" k="Every round and cart" v={`${open.discountPct}% off`} />]
      : ([['greenFeeWeekday', 'Green fee · weekday'], ['greenFeeWeekend', 'Green fee · weekend'], ['cartFeeWeekday', 'Cart · weekday'], ['cartFeeWeekend', 'Cart · weekend']] as const)
        .map(([k, l]) => <KV key={k} k={l} v={open[k] == null ? <span className="font-normal text-ink-muted">Public price</span> : open[k] === 0 ? 'Free' : dollars(open[k]!)} />);
    return (
      <Shell>
        <button type="button" onClick={() => go(null)} className="self-start text-[13px] text-ink-soft hover:text-ink">‹ Memberships</button>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <h1 className="mr-auto flex items-center gap-3 font-serif text-[30px] sm:text-[34px] leading-none text-ink"><Dot color={open.color} big />{open.name}</h1>
          {canEdit && allOverdue > 0 && <button type="button" className={LINK} disabled={reminding} onClick={remindOverdue}
            title="Emails every unpaid or expired member, in every membership, their dues link — at most once a week">{reminding ? 'Sending…' : `Remind all ${allOverdue} overdue`}</button>}
          {canEdit && <button type="button" className={LINK} onClick={() => setImportOpen(o => !o)}>Import a list</button>}
          {canEdit && <button type="button" className={LINK} onClick={() => setSetup({ tier: open })}>Edit</button>}
        </div>
        {loadError && <LoadError message={loadError} onRetry={loadAll} />}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Tile label="Members" value={String(ppl.filter(m => m.status === 'active').length)} />
          {hasDues && <Tile label="Dues this year" value={usd0(duesOfTier(open))} />}
          <Tile label="Overdue renewals" value={String(late)} title="Active members who haven't paid, or whose membership ran out and wasn't renewed" />
        </div>
        {importOpen && <ImportMembers tiers={[open, ...tiers.filter(t => t.id !== open.id)]} onClose={() => setImportOpen(false)} onImported={loadAll} />}
        {/* Added at the counter but not paid yet (Memberships item 1): Remove drops them. */}
        <UnpaidMembers members={members.filter(m => m.tierId === open.id)} canEdit={canEdit} onChanged={loadAll} />
        <div className="grid gap-4 lg:grid-cols-3 items-start">
          <Card className="lg:col-span-2 px-1.5 pt-1.5 pb-2 min-w-0">
            <CardHead title="Members" plus={canEdit && open.active ? { label: 'Add a member', onClick: () => setAdding(true) } : undefined} />
            {ppl.length === 0 ? <p className="px-3 py-8 text-center text-[13.5px] text-ink-soft">No members yet.{canEdit ? ' Add the first with the plus.' : ''}</p> : <>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_70px] gap-3 px-3 py-[9px] text-[12.5px] text-ink-muted">
                <span>Member</span><span>Dues</span><span className="hidden sm:block text-right">Rounds this year</span><span className="hidden sm:block text-right">Since</span>
              </div>
              {shown.map(m => {
                const d = duesOf(m, now);
                return (
                  <button key={m.id} type="button" onClick={() => setCard(m.id)}
                    className={'w-full text-left grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_70px] gap-3 items-center px-3 py-[9px] border-t border-line rounded-lg text-[13.5px] hover:bg-ink/5 ' + (m.status === 'active' ? 'text-ink' : 'text-ink-muted')}>
                    <span className="min-w-0"><b className="block font-semibold truncate">{m.name || m.email}</b>{m.name && <small className="block text-[12px] text-ink-muted truncate">{m.email}</small>}</span>
                    <span className="min-w-0"><DuesText d={d} /></span>
                    <span className="hidden sm:block text-right tabular-nums">{m.roundsThisYear ?? 0}</span>
                    <span className="hidden sm:block text-right tabular-nums">{sinceYear(m)}</span>
                  </button>
                );
              })}
              {!showAll && ppl.length > SHOWN && <button type="button" className={LINK + ' mx-3 my-2.5'} onClick={() => setShowAll(true)}>Show all {ppl.length}</button>}
            </>}
          </Card>
          <Card className="px-[18px] py-4 min-w-0">
            <h2 className="text-[15px] font-semibold text-ink mb-1.5">Details</h2>
            <KV first k="Price" v={priceLine(open)} />
            <KV k="Lasts" v={`${open.termMonths} months from joining`} />
            <KV k="Renews itself" v={open.autoRenew ? 'Yes' : 'No'} />
            <KV k="Books online" v={`${open.advanceBookingDays} days ahead`} />
            {open.guestsPayMemberRate && <KV k="Guests" v="Pay the member rate" />}
            {open.accountOn && <KV k="Member account" v={open.accountLimitCents != null ? `Up to ${usd0(open.accountLimitCents)}` : 'No limit'} />}
            {open.notes && <KV k="Notes" v={<span className="font-normal">{open.notes}</span>} />}
            <SubHead>What members pay</SubHead>
            {rates}
          </Card>
        </div>
        {adding && <AddMember tier={open} onClose={() => setAdding(false)} onAdded={loadAll} />}
        {pops}
      </Shell>
    );
  }

  /* ── The list ── */
  const ms = [...tiers].sort((a, b) => Number(b.active) - Number(a.active) || count(b) - count(a) || a.name.localeCompare(b.name));
  return (
    <Shell>
      <h1 className="font-serif text-[30px] sm:text-[34px] leading-none text-ink mt-1">Memberships</h1>
      {loadError && <LoadError message={loadError} onRetry={loadAll} />}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Tile label="Memberships offered" value={String(live.length)} />
        {hasDues && <Tile label="Dues collected this year" value={usd0(duesTotal)} />}
      </div>
      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <div className={'flex flex-col gap-4 min-w-0 ' + (hasDues ? 'lg:col-span-2' : 'lg:col-span-3')}>
          <Card className="px-1.5 pt-1.5 pb-2">
            <CardHead title="Your memberships" plus={canEdit ? { label: 'Add a membership', onClick: () => setSetup({ tier: null }) } : undefined} />
            {ms.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13.5px] text-ink-soft">No memberships set up yet.{canEdit ? ' Add one with the plus, then add your members to it.' : ''}</p>
            ) : ms.map(t => {
              const ask = unpaid(t);
              return (
                <button key={t.id} type="button" onClick={() => go(t.id)}
                  className="w-full text-left grid grid-cols-[10px_minmax(0,1fr)_auto_16px] sm:grid-cols-[10px_minmax(0,1fr)_auto_110px_16px] gap-3.5 items-center px-3 py-[13px] border-t border-line rounded-[10px] text-ink hover:bg-ink/5">
                  <Dot color={t.color} />
                  <span className="min-w-0"><b className="block font-semibold text-[14px] truncate">{t.name}</b>
                    {ask > 0 && <small className="block text-[12px] text-warn">{ask} not paid yet</small>}
                    {!t.active && <small className="block text-[12px] text-ink-muted">Not offered</small>}</span>
                  <span className="hidden sm:block text-[13px] text-ink-soft whitespace-nowrap">{priceLine(t)}</span>
                  <span className="text-[12.5px] text-ink-muted text-right whitespace-nowrap"><b className="text-[15px] font-semibold text-ink tabular-nums">{count(t)}</b> members</span>
                  <ChevronIcon />
                </button>
              );
            })}
          </Card>
        </div>
        {hasDues && (
          <Card className="px-[18px] py-4 min-w-0">
            <h2 className="text-[15px] font-semibold text-ink mb-1.5">Dues this year</h2>
            <SubHead>Memberships</SubHead>
            {ms.map(t => <KV key={t.id} k={<span className="inline-flex items-center gap-2"><Dot color={t.color} />{t.name}</span>} v={usd0(duesOfTier(t))} />)}
            <KV total k="Total" v={usd0(duesTotal)} />
            <p className="text-[12.5px] text-ink-soft mt-2.5">Shows in Revenue as Membership dues. Paid through GreenReserve, members pay a 1% fee on top.</p>
          </Card>
        )}
      </div>
      {!hasDues && tiers.length > 0 && <p className="text-[12.5px] text-ink-muted -mt-1">When members pay dues through GreenReserve, a 1% fee is added to what they pay.</p>}
      <ResidentsCard canEdit={canEdit} initialSearch={search} />
      <PricingCard />
      {pops}
    </Shell>
  );
}

// useSearchParams needs a Suspense boundary (DASH-C search opens Memberships at ?q=; a membership opens at ?m=).
export default function MembershipsPage() {
  return <Suspense fallback={<div className="min-h-screen bg-page" />}><MembershipsPageInner /></Suspense>;
}
