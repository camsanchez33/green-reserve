'use client';
// SCHEDULE-3 (Cam 2026-11-16, "that real nice just fix the one comment i made and then ur good"; lanes/dashboard.md
// item 4, mockup lanes/dashboard/schedule-mockup.html): the Schedule page in sliding tabs, in the order a course sets
// up — Bookable rounds, Hours and prices, Promotions, Demand pricing, Closed days.
// Before it: W2-6 (Cam 2026-10-21, "keep what it can do, make it more efficient and simple") made the page edit one
// CoursePlan (lib/course-plan.ts) that saving writes as the course's TeeTimeSchedule rows in one go
// (PUT /api/operator/schedule with coursePlan), after a preview of what it changes on the tee sheet. That stays:
// Bookable rounds (when each round is sold) and Hours and prices both edit the plan, and one slim pill (Undo, Review
// and save) saves it. Booked rounds keep their price.
// Hours and prices are Weekdays and Weekends only: a plan stored as one every-day set is shown split into the two
// (same hours and prices, so nothing changes on the tee sheet until the course edits one).
// Booking rules: no tab. The course's own rules are in Settings; a round's own rules (fewest and most players, days
// ahead) are in that round's edit pop-up on Bookable rounds (Cam 2026-11-16, "when editing it it all is together").
import React, { useState, useEffect, useCallback, useRef } from 'react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { Card } from '@/components/ui/Card';
import { SlidingTabs } from '@/components/dashboard/SlidingTabs';
import { LastMinuteDeals } from '@/components/dashboard/LastMinuteDeals';
import { BookableRounds, type NineRow, type PageRound, type Rules, type CourseRules } from '@/components/dashboard/schedule/BookableRounds';
import { HoursPrices, isWeekendSet } from '@/components/dashboard/schedule/HoursPrices';
import { Promotions } from '@/components/dashboard/schedule/Promotions';
import { DemandLocked } from '@/components/dashboard/schedule/DemandLocked';
import { ClosedDays, type Blackout } from '@/components/dashboard/schedule/ClosedDays';
import { Popup, PopupFoot, LINK, PRIMARY } from '@/components/dashboard/schedule/ui';
import { readPlan, checkPlan, daysOf, emptyCell, setRoundSale, type CoursePlan, type PriceCell, type RoundSale } from '@/lib/course-plan';

type Row = {
  id: string; tierName: string; daysOfWeek: number[]; startTime: string; endTime: string; productId: string | null;
  intervalMinutes: number; holes: number; greenFeeWeekday: number; greenFeeWeekend: number;
  memberRateWeekday: number | null; memberRateWeekend: number | null;
  residentRateWeekday: number | null; residentRateWeekend: number | null;
  seniorRateWeekday?: number | null; juniorRateWeekday?: number | null;
  cartFee: number; walkingAllowed: boolean; active: boolean;
};
type ProductOpt = { id: string; label: string; holes: number; nineIds: string[]; active: boolean } & Rules;
type Preview = { days: number; added: number; removed: number; repriced: number; bookedKept: number; refusal?: string | null; warnings?: string[] };
type Pending = { preview: Preview | null; error: string };

/** "Adds 24 tee times, changes the price on 40 …" — what a save does to the next days. */
function previewLines(p: Preview): string[] {
  const out: string[] = [];
  if (p.added) out.push(`Adds ${p.added} tee time${p.added === 1 ? '' : 's'} golfers can book.`);
  if (p.repriced) out.push(`New price on ${p.repriced} open tee time${p.repriced === 1 ? '' : 's'}.`);
  if (p.removed) out.push(`Takes ${p.removed} open tee time${p.removed === 1 ? '' : 's'} off the sheet.`);
  if (p.bookedKept) out.push(`Keeps ${p.bookedKept} booked or blocked time${p.bookedKept === 1 ? '' : 's'} the schedule no longer has.`);
  if (out.length === 0) out.push('No change soon; later days follow.');
  return out;
}

/** Weekdays and Weekends, never an every-day set over them: a plan with no weekend set gets one, copied from the usual
 *  week (the same hours and prices, so the tee sheet doesn't change). A plan where another set already holds a
 *  weekend day is left as it is stored, so nothing the course sells is hidden. */
function splitWeek(p: CoursePlan): CoursePlan {
  if (p.different.some(isWeekendSet)) return p;
  const taken = new Set(p.different.flatMap(d => d.days));
  if (taken.has(0) || taken.has(6)) return p;
  return { ...p, different: [...p.different, { ...JSON.parse(JSON.stringify(p.usual)), days: [6, 0] }] };
}

type Tab = 'rounds' | 'hours' | 'promos' | 'demand' | 'closed';

export default function SchedulesPage() {
  const pageAccess = useDashboardAccess();
  const canEdit = pageAccess.can('schedule.edit');
  // The rounds themselves (name, holes) are the course's; the route refuses staff.
  const canEditRounds = canEdit && !pageAccess.isStaff;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [hasMember, setHasMember] = useState(false);
  // CART-2: the course's cart rule (Settings) — the cart cell is a price per rider or per cart.
  const [perCart, setPerCart] = useState(false);
  const [hasResident, setHasResident] = useState(false);
  const [courseHoles, setCourseHoles] = useState(18);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [productsError, setProductsError] = useState('');
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [nines, setNines] = useState<NineRow[]>([]);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [blackoutError, setBlackoutError] = useState('');
  const [publicAdvanceDays, setPublicAdvanceDays] = useState<number | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [courseRules, setCourseRules] = useState<CourseRules | null>(null);
  const [tab, setTab] = useState<Tab>('rounds');
  // Home's demand-pricing link (#demand-pricing) opens its tab.
  useEffect(() => { if (window.location.hash === '#demand-pricing') setTab('demand'); }, []);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    const r = await dfetch<Row[]>('/api/operator/schedule');
    if (r.ok) { setRows(Array.isArray(r.data) ? r.data : []); setLoadError(''); }
    else { setRows([]); setLoadError(r.error); }
    setLoading(false);
  }, []);
  const loadSettings = useCallback(async () => {
    const r = await dfetch<{ holes?: number; hasMemberPricing?: boolean; hasResidentPricing?: boolean; publicAdvanceDays?: number; minPlayers?: number; maxPlayers?: number; cartPricing?: string }>('/api/operator/settings');
    if (!r.ok || !r.data) { setSettingsError(r.ok ? 'Settings came back empty — refresh.' : r.error); return; }
    const c = r.data;
    setHasMember(!!c.hasMemberPricing); setHasResident(!!c.hasResidentPricing); setPerCart(c.cartPricing === 'per_cart');
    if (typeof c.holes === 'number') setCourseHoles(c.holes);
    setPublicAdvanceDays(typeof c.publicAdvanceDays === 'number' ? c.publicAdvanceDays : null);
    setCourseRules({ minPlayers: c.minPlayers ?? 1, maxPlayers: c.maxPlayers ?? 4, publicAdvanceDays: c.publicAdvanceDays ?? 7 });
    setSettingsError('');
  }, []);
  const loadProducts = useCallback(async () => {
    const [r, n] = await Promise.all([dfetch<ProductOpt[]>('/api/operator/course-products'), dfetch<NineRow[]>('/api/operator/nines')]);
    if (r.ok && Array.isArray(r.data)) { setProducts(r.data); setProductsError(''); }
    else if (!r.ok) setProductsError(r.error);
    // Without the nines the holes show as a count ("9 holes"), never a guessed 1–9 or 10–18.
    if (n.ok && Array.isArray(n.data)) setNines([...n.data].sort((a, b) => a.sortOrder - b.sortOrder));
    setProductsLoaded(true);
  }, []);
  const loadBlackouts = useCallback(async () => {
    const r = await dfetch<Blackout[]>('/api/operator/blackouts');
    if (r.ok && Array.isArray(r.data)) { setBlackouts(r.data); setBlackoutError(''); }
    else if (!r.ok) setBlackoutError(r.error);
  }, []);
  useEffect(() => { loadSchedules(); loadProducts(); loadSettings(); loadBlackouts(); }, [loadProducts, loadSchedules, loadBlackouts, loadSettings]);

  const activeProducts = products.filter(p => p.active);
  // What golfers can book: the course's live rounds, or the course as a whole when it has none (the server's planRounds).
  const rounds: PageRound[] = activeProducts.length
    ? activeProducts.map(p => ({ key: p.id, label: p.label, holes: p.holes, nineIds: p.nineIds ?? [], minPlayers: p.minPlayers ?? null, maxPlayers: p.maxPlayers ?? null, publicAdvanceDays: p.publicAdvanceDays ?? null }))
    : [{ key: '', label: 'Tee times', holes: courseHoles, nineIds: [], minPlayers: null, maxPlayers: null, publicAdvanceDays: null }];
  const defaultCell = (key: string): PriceCell => {
    const holes = rounds.find(r => r.key === key)?.holes ?? 18;
    return { ...emptyCell(), weekday: holes <= 9 ? 30 : 55, weekend: holes <= 9 ? 35 : 65, cart: holes <= 9 ? 12 : 20, cartWeekend: holes <= 9 ? 12 : 20 };
  };

  // A round just added on Bookable rounds: switched on once the plan is read again with it.
  const turnOn = useRef<{ key: string; from: string | null; to: string | null } | null>(null);
  // Read the stored rows into a plan once rows and rounds are both in.
  const roundsKey = rounds.map(r => r.key).join(',');
  useEffect(() => {
    if (loading || !productsLoaded || loadError) return;
    const p = splitWeek(readPlan(rows, rounds));
    // Nothing saved yet: the suggested plan counts as unsaved, so the save pill shows.
    setSaved(rows.length ? JSON.stringify(p) : '');
    const on = turnOn.current;
    turnOn.current = null;
    setPlan(on && rounds.some(r => r.key === on.key) ? setRoundSale(p, on.key, { on: true, from: on.from, to: on.to }, defaultCell) : p);
  }, [rows, loading, productsLoaded, loadError, roundsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!plan && JSON.stringify(plan) !== saved;
  const showMember = hasMember || rows.some(s => s.memberRateWeekday != null);
  const showResident = hasResident || rows.some(s => s.residentRateWeekday != null);
  // Revamp 3 dead end 20: senior and junior prices (picked at the counter) once the course adds them.
  const [addAges, setAddAges] = useState(false);
  const showAges = addAges || rows.some(s => s.seniorRateWeekday != null || s.juniorRateWeekday != null);

  const edit = (f: (p: CoursePlan) => CoursePlan) => setPlan(p => (p ? f(p) : p));
  const setRound = (key: string, patch: Partial<RoundSale>) => edit(p => setRoundSale(p, key, patch, defaultCell));

  async function saveRound(key: string, patch: { label?: string; holes?: number; nineIds?: string[] }): Promise<string | null> {
    const r = await dfetch<ProductOpt>('/api/operator/course-products', { method: 'PATCH', body: JSON.stringify({ id: key, ...patch }) });
    if (!r.ok) return r.error;
    setProducts(ps => ps.map(p => (p.id === key ? { ...p, ...r.data } : p)));
    return null;
  }
  /** A round's own booking rules (blank = the course's). Owner only, saved straight away (lib/booking-rules checks them). */
  async function saveRules(key: string, r: { minPlayers: string; maxPlayers: string; publicAdvanceDays: string }): Promise<string | null> {
    const res = await dfetch<Rules>('/api/operator/round-rules', { method: 'PUT', body: JSON.stringify({ productId: key, ...r }) });
    if (!res.ok) return res.error;
    setProducts(ps => ps.map(p => (p.id === key ? { ...p, minPlayers: res.data.minPlayers ?? null, maxPlayers: res.data.maxPlayers ?? null, publicAdvanceDays: res.data.publicAdvanceDays ?? null } : p)));
    return null;
  }
  async function addRound(a: { label: string; holes: number; nineIds: string[]; from: string | null; to: string | null; existing: string | null }): Promise<string | null> {
    if (a.existing) { setRound(a.existing, { on: true, from: a.from, to: a.to }); return null; }
    // A new round reads the plan again (its rows don't exist yet), which would drop unsaved edits.
    if (dirty) return 'Review and save (or undo) your changes first, then add the round.';
    const r = await dfetch<ProductOpt>('/api/operator/course-products', { method: 'POST', body: JSON.stringify({ label: a.label, holes: a.holes, nineIds: a.nineIds }) });
    if (!r.ok) return r.error;
    turnOn.current = { key: r.data.id, from: a.from, to: a.to };
    setProducts(ps => [...ps, r.data]);
    toast('Round added. Set its prices, then review and save.', 'ok');
    return null;
  }

  // ── Saving ─────────────────────────────────────────────────────────────────
  async function review() {
    if (!plan) return;
    const why = checkPlan(plan, rounds);
    if (why) return toast(why, 'warn');
    setPending({ preview: null, error: '' });
    const r = await dfetch<Preview>('/api/operator/schedule/preview', { method: 'POST', body: JSON.stringify({ op: 'course', plan }) });
    setPending({ preview: r.ok ? r.data : null, error: r.ok ? '' : r.error });
  }
  async function save() {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await dfetch<Row[]>('/api/operator/schedule', { method: 'PUT', body: JSON.stringify({ coursePlan: plan }) });
      if (!r.ok || !Array.isArray(r.data)) { toast(r.ok ? 'Came back empty — refresh.' : r.error); return; }
      setRows(r.data);
      setPending(null);
      toast('Saved.', 'ok');
    } finally { setBusy(false); }
  }

  if (pageAccess.loaded && !pageAccess.can('schedule.view')) return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="schedule" />
      <main className="flex-1 md:overflow-y-auto"><StaffNotice what="the schedule" view="schedule.view" /></main>
    </div>
  );

  // The days of the week the SAVED schedule sells (Closed days shows those inside the booking window as bookable):
  // unsaved edits never make a day look bookable before golfers can really book it.
  const savedPlan: CoursePlan | null = saved ? JSON.parse(saved) : null;
  const openDows = savedPlan ? [savedPlan.usual, ...savedPlan.different].filter(d => !d.closed).flatMap(d => daysOf(savedPlan, d)) : [];
  const planTab = tab === 'rounds' || tab === 'hours';

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="schedule" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <StaffNotice what="the schedule" view="schedule.view" edit="schedule.edit" />
        <div className="px-4 sm:px-10 py-7 flex flex-col gap-4 min-w-0">
          <h1 className="font-serif text-[34px] leading-none text-ink">Schedule</h1>
          <SlidingTabs<Tab> value={tab} onChange={setTab} label="Schedule" look="pill" className="self-start"
            tabs={[['rounds', 'Bookable rounds'], ['hours', 'Hours and prices'], ['promos', 'Promotions'], ['demand', 'Demand pricing'], ['closed', 'Closed days']]} />

          {planTab && loadError && <LoadError message={loadError} onRetry={loadSchedules} />}
          {planTab && productsError && <LoadError message={`Couldn't load your rounds — ${productsError}`} onRetry={loadProducts} />}
          {planTab && settingsError && <LoadError message={`Couldn't load your settings — ${settingsError}`} onRetry={loadSettings} />}
          {planTab && !plan && !loadError && <Card className="p-5 text-[14px] text-ink-muted">Loading your schedule…</Card>}
          {planTab && plan && !loading && rows.length === 0 && !loadError && (
            <p className="bg-warn/5 border border-warn/20 rounded-md px-4 py-3 text-[13.5px] text-ink">No tee times yet. Review and save to put these on your tee sheet.</p>
          )}

          {tab === 'rounds' && plan && (
            <BookableRounds plan={plan} rounds={rounds} nines={nines} canEdit={canEdit} canEditRounds={canEditRounds}
              setRound={setRound} saveRound={saveRound} addRound={addRound} course={courseRules} saveRules={saveRules} />
          )}
          {tab === 'hours' && plan && (
            <HoursPrices plan={plan} edit={edit} rounds={rounds} canEdit={canEdit} perCart={perCart}
              showMember={showMember} showResident={showResident} showAges={showAges} onAddAges={() => setAddAges(true)} />
          )}
          {tab === 'promos' && <>
            <Promotions canEdit={canEdit} />
            <LastMinuteDeals canEdit={canEdit} onlyIfOn />
          </>}
          {tab === 'demand' && <DemandLocked canEdit={canEdit} />}
          {tab === 'closed' && (
            <ClosedDays blackouts={blackouts} error={blackoutError} reload={loadBlackouts} canEdit={canEdit}
              publicAdvanceDays={publicAdvanceDays} openDows={openDows} />
          )}
          {/* Unsaved changes: a slim pill, one save for the whole plan, with a preview first. */}
          {dirty && canEdit && planTab && (
            <div className="sticky bottom-20 md:bottom-3.5 z-30 self-center w-full max-w-[520px] flex items-center gap-3.5 pl-4 pr-2 py-2 rounded-full bg-white shadow-card border border-line text-[13.5px] text-ink">
              <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0" aria-hidden="true" />
              <span>You have unsaved changes</span>
              <span className="flex-1" />
              <button type="button" onClick={() => setPlan(saved ? JSON.parse(saved) : plan)} disabled={!saved} className={LINK}>Undo</button>
              <button type="button" onClick={review} className={PRIMARY + ' rounded-full'}>Review and save</button>
            </div>
          )}
        </div>
      </main>

      {/* What a save will do — shown before anything is written */}
      {pending && (
        <Popup title="Save your schedule?" onClose={() => !busy && setPending(null)}>
          {pending.error ? <p className="text-[13.5px] text-bad" role="alert">This can&apos;t be saved yet: {pending.error}</p>
            : !pending.preview ? <p className="text-[13.5px] text-ink-muted">Checking what this changes on your tee sheet…</p>
            : (<>
              {!pending.preview.refusal && (
                <div className="border border-line rounded-[12px] px-3.5 py-3 text-[13px]">
                  <b className="block mb-1 font-semibold text-ink">What changes on your tee sheet over the next {pending.preview.days} days</b>
                  <ul className="list-disc pl-[18px] flex flex-col gap-1 text-ink-soft">
                    {previewLines(pending.preview).map(l => <li key={l}>{l}</li>)}
                    <li>Booked rounds keep their price.</li>
                  </ul>
                </div>
              )}
              {pending.preview.refusal && (
                <p className="bg-bad/5 border border-bad/20 rounded-[12px] px-3 py-2.5 text-[13.5px] text-ink" role="alert">This can&apos;t be saved: {pending.preview.refusal}</p>
              )}
              {!pending.preview.refusal && !!pending.preview.warnings?.length && (
                <div className="bg-warn/10 border border-warn/45 rounded-[12px] px-3 py-2.5 flex flex-col gap-1.5">
                  <p className="text-[13.5px] font-semibold text-ink">Worth a look before you save</p>
                  {pending.preview.warnings.map(w => <p key={w} className="text-[13.5px] text-ink">{w}</p>)}
                </div>
              )}
            </>)}
          <PopupFoot onCancel={() => setPending(null)} cancel="Go back">
            <button type="button" onClick={save} disabled={busy || !pending.preview || !!pending.preview.refusal} className={PRIMARY}>{busy ? 'Saving…' : 'Save'}</button>
          </PopupFoot>
        </Popup>
      )}
    </div>
  );
}
