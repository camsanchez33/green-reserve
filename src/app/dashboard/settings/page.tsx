'use client';
// SETTINGS-6 (Cam 2026-11-17, "fix settings messages and then good to go"; approved mockup
// lanes/dashboard/settings-mockup.html and all its comment threads; lanes/dashboard.md "Next" 6).
// The home lists four areas as cards with no icons: Your course, Booking, Payments, Your account. Search sits in the
// header as a small icon. Each area has a one-line intro, and its sections run down the side on a wide screen (a bar
// across the top on a phone). Every editable row opens its own small popup; read-only rows don't look clickable.
// Staff moved to Team (TEAM-1): old ?area=staff and ?section=Staff links, and the search's staff entry, go there.
// Per-round rules are on Schedule. What needs Build's new data (the confirmation email's own parts and test
// send, sales tax from the address, reader test and last seen, Alerts) is hidden until it exists, never faked.
// Kept from before: the Stripe return redirect, old ?section=…&focus=… links (Money, Home, Finish setting up), the
// assistant's description card, saves that send only that row's fields, and owner-only rows.
import { useCallback, useEffect, useMemo, useRef, useState, Suspense, type RefObject } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { LoadError } from '@/components/dashboard/LoadError';
import { Card } from '@/components/ui/Card';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { showSetupField } from '@/lib/setup-missing';
import { APPLIED_EVENT } from '@/lib/birdie/ask';
import { type Ctx, type Course, Chevron, saveSettings } from '@/components/dashboard/settings/ui';
import { CourseArea } from '@/components/dashboard/settings/CourseArea';
import { BookingArea } from '@/components/dashboard/settings/BookingArea';
import { PaymentsArea } from '@/components/dashboard/settings/PaymentsArea';
import { AccountArea } from '@/components/dashboard/settings/AccountArea';
import { AssistantArea } from '@/components/dashboard/settings/AssistantArea';

type Area = 'course' | 'booking' | 'payments' | 'assistant' | 'account';
type View = 'home' | Area | 'staff';
const AREAS: { key: Area; title: string; sub: string; intro: string; sections: [string, string][] }[] = [
  { key: 'course', title: 'Your course', sub: 'Name and location, your booking page, facilities',
    intro: 'Who you are and what golfers see about your course. Changes show on your booking page, receipts and emails right away.',
    sections: [['identity', 'Name and location'], ['page', 'Booking Page'], ['facilities', 'Facilities']] },
  { key: 'booking', title: 'Booking', sub: 'Booking rules, carts, the confirmation email',
    intro: 'How far ahead golfers can book, group sizes, carts, and the email they get after booking. Changes apply right away.',
    sections: [['rules', 'Booking rules'], ['carts', 'Carts'], ['email', 'Confirmation email']] },
  { key: 'payments', title: 'Payments', sub: 'Cancellations, sales tax, the register and card readers',
    intro: 'What golfers are charged when plans change, and how you take payment at the counter. New policies apply to new bookings only.',
    sections: [['cancel', 'Cancellations'], ['tax', 'Sales tax'], ['register', 'Register']] },
  // ASSIST-1 (Cam 2026-11-24): the course's assistant, for staff and for golfers.
  { key: 'assistant', title: 'Assistant', sub: 'Your staff’s assistant, golfer questions, your notes',
    intro: 'What your assistant answers, for your staff and for golfers on your booking page. It only ever uses your own course’s information.',
    sections: [['staff', 'For your staff'], ['golfers', 'Golfer questions'], ['notes', 'Your notes'], ['knows', 'What it knows']] },
  { key: 'account', title: 'Your account', sub: 'Your sign-in and two-step sign-in',
    intro: 'Only you see this. How you sign in to this dashboard.',
    sections: [['signin', 'Your sign-in']] },
];
// Old ?section= names (Money's Change link, Home's reader link, Finish setting up) land in the area that holds them.
const SECTION_TO_AREA: Record<string, { area: View; target?: string }> = {
  'Your course': { area: 'course' }, 'Course layout': { area: 'course', target: 'g-facilities' }, 'Facilities': { area: 'course', target: 'g-facilities' },
  'Booking rules': { area: 'booking' }, 'Prices & fees': { area: 'payments' }, 'Pricing & cancellation': { area: 'payments' },
  'Pro shop': { area: 'payments', target: 'g-register' }, 'Staff': { area: 'staff' }, 'Staff & account': { area: 'staff' }, 'Your account': { area: 'account' },
};
// Every setting, for search: [its name, the area, the row or group it opens at, other words people might type].
const INDEX: [string, Area | 'staff', string, string?][] = [
  ['Name', 'course', 'r-identity-name'], ['Address', 'course', 'r-identity-address', 'location'], ['Status', 'course', 'r-identity-status', 'live'],
  ['Time zone', 'course', 'r-identity-tz', 'clock'], ['Phone', 'course', 'r-identity-phone'], ['Logo and colour', 'course', 'r-page-look', 'color brand'],
  ['Booking page look', 'course', 'r-page-booking-look', 'light dark theme accent color colour'],
  ['Banner photo', 'course', 'r-page-hero', 'hero image'], ['Photos', 'course', 'r-page-photos', 'gallery pictures'], ['Description', 'course', 'r-page-desc'],
  ['Course type', 'course', 'r-page-type', 'public private'], ['Year opened', 'course', 'r-page-year', 'established'], ['Website', 'course', 'r-page-web'],
  ['Gift cards', 'course', 'r-page-gift'], ['Dress code', 'course', 'r-page-dress'], ['Holes and nines', 'course', 'r-fac-nines', 'par layout'],
  ['Tees', 'course', 'r-fac-tees', 'yardage rating slope'], ['Amenities', 'course', 'r-fac-amen', 'range food caddies rentals facilities'],
  ['How far ahead', 'booking', 'r-rules-ahead', 'days advance'], ['Group size', 'booking', 'r-rules-size', 'players'],
  ['Walking and carts note', 'booking', 'r-carts-walk'], ['How carts are charged', 'booking', 'r-carts-charge', 'per cart rider'], ['Cart numbers', 'booking', 'r-carts-num'],
  ['Starter’s sheet', 'booking', 'r-carts-starter', 'starter columns'], ['Confirmation email', 'booking', 'g-email', 'note arrival'],
  ['Card at booking', 'payments', 'r-cancel-card'], ['Free cancellation', 'payments', 'g-cancel', 'cancel policy'], ['Late cancellation', 'payments', 'g-cancel', 'fee'],
  ['No-show', 'payments', 'g-cancel', 'fee'], ['Mark no-shows automatically', 'payments', 'r-cancel-auto'], ['Repeat no-shows', 'payments', 'r-cancel-repeat', 'phone only block'],
  ['Check-in reminder', 'payments', 'r-cancel-checkin', 'pay link'], ['Rain checks', 'payments', 'r-cancel-rain', 'weather'], ['Sales tax', 'payments', 'g-tax'],
  ['Takes cash', 'payments', 'r-register-cash', 'register drawer'], ['Card readers', 'payments', 'r-register-readers', 'terminal'],
  ['Assistant for your staff', 'assistant', 'r-assistant-staff', 'ai chat birdie'], ['Golfer questions', 'assistant', 'r-assistant-golfer', 'ai chat bot booking page'],
  ['Assistant tone', 'assistant', 'r-assistant-tone', 'friendly brief formal'], ['When the assistant doesn’t know', 'assistant', 'r-assistant-unknown', 'pro shop phone'],
  ['Assistant notes', 'assistant', 'g-notes', 'faq questions answers'], ['What the assistant knows', 'assistant', 'g-knows', 'refresh'],
  ['Email', 'account', 'r-signin-email'], ['Password', 'account', 'r-signin-pw'], ['Two-step sign-in', 'account', 'r-signin-2fa', 'code 2fa'],
  ['Team: staff, roles and permissions', 'staff', '', 'team logins invite'],
];
const AREA_NAME: Record<Area | 'staff', string> = { course: 'Your course', booking: 'Booking', payments: 'Payments', assistant: 'Assistant', account: 'Your account', staff: 'Team' };

const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg>;
const BackIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>;

/** The title with the small search icon; the field opens beside it and searches every setting in every area. */
function Head({ title, onGo, owner, wide }: { title: string; onGo: (area: Area | 'staff', target: string) => void; owner: boolean; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    // A staff login has no sales tax, readers, password or two-step rows to land on.
    const hidden = owner ? [] : ['g-tax', 'r-register-readers', 'r-signin-pw', 'r-signin-2fa'];
    return t ? INDEX.filter(h => !hidden.includes(h[2]) && (owner || h[1] !== 'staff') && `${h[0]} ${h[3] ?? ''}`.toLowerCase().includes(t)).slice(0, 8) : [];
  }, [q, owner]);
  const shut = () => { setOpen(false); setQ(''); };
  return (
    <div className={'relative w-full flex items-center justify-between gap-3 ' + (wide ? 'max-w-[998px]' : 'max-w-[780px]')}>
      <h1 className="font-serif text-[30px] sm:text-[34px] font-semibold leading-none text-ink">{title}</h1>
      <div className="relative flex items-center gap-1">
        {open && <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') shut(); }} aria-label="Search settings" autoFocus
          className="text-[14px] text-ink bg-ink/5 border border-line rounded-[10px] px-3 py-2 w-[min(260px,52vw)] outline-none focus:border-ink-soft" />}
        <button type="button" onClick={() => (open ? shut() : setOpen(true))} aria-label="Search settings" title="Search" aria-expanded={open}
          className="w-10 h-10 grid place-items-center rounded-[8px] text-ink-soft hover:text-ink hover:bg-ink/5"><SearchIcon /></button>
        {open && q.trim() && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[min(360px,86vw)] p-1 rounded-[12px] border border-line shadow-card flex flex-col" style={{ backgroundColor: 'var(--op-panel-solid)' }}>
            {hits.length ? hits.map(h => (
              <button key={h[0]} type="button" onClick={() => { shut(); onGo(h[1], h[2]); }}
                className="flex justify-between items-center gap-3 px-3 py-2.5 min-h-[40px] rounded-[8px] text-left text-[13.5px] text-ink hover:bg-ink/5">
                <span>{h[0]}</span><small className="text-[12px] text-ink-soft flex-none">{AREA_NAME[h[1]]}</small>
              </button>
            )) : <p className="px-3 py-2.5 text-[13px] text-ink-soft">Nothing matches.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** The area's sections: down the side on a wide screen, a sticky bar across the top on a phone; the one you're reading
 *  is marked. */
function Sections({ items, main }: { items: [string, string][]; main: RefObject<HTMLElement | null> }) {
  const [cur, setCur] = useState(items[0]?.[0] ?? '');
  const hold = useRef<string | null>(null);
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const spy = () => {
      if (hold.current) { setCur(hold.current); return; }
      let c = items[0]?.[0] ?? '';
      for (const [id] of items) { const el = document.getElementById('g-' + id); if (el && el.getBoundingClientRect().top < 160) c = id; }
      const m = main.current;
      const atEnd = m && m.scrollHeight > m.clientHeight + 4 ? m.scrollTop + m.clientHeight >= m.scrollHeight - 4 : window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atEnd && items.length) c = items[items.length - 1][0];
      setCur(c);
    };
    spy();
    document.addEventListener('scroll', spy, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', spy, { capture: true });
  }, [items, main]);
  useEffect(() => {
    const b = bar.current, a = b?.querySelector<HTMLElement>(`[data-sec="${cur}"]`);
    if (b && a && b.scrollWidth > b.clientWidth) b.scrollLeft = Math.max(0, a.offsetLeft - 24);
  }, [cur]);
  const go = (id: string) => {
    hold.current = id; setCur(id);
    window.setTimeout(() => { hold.current = null; }, 900);
    document.getElementById('g-' + id)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return (
    <nav ref={bar} aria-label="Sections"
      className="sticky top-0 md:top-4 z-[5] flex md:flex-col gap-1 md:gap-0.5 overflow-x-auto md:overflow-visible [scrollbar-width:none] p-1 md:p-0 rounded-[12px] md:rounded-none border md:border-0 border-line max-md:bg-[var(--op-panel-solid)]">
      {items.map(([id, label]) => (
        <a key={id} href={'#g-' + id} data-sec={id} aria-current={cur === id ? 'true' : undefined} onClick={e => { e.preventDefault(); go(id); }}
          className={'flex-none inline-flex items-center min-h-[36px] md:min-h-[40px] px-3 py-2 text-[13px] rounded-[9px] md:rounded-l-none md:border-l-2 whitespace-nowrap '
            + (cur === id ? 'text-ink font-semibold bg-ink/5 md:border-ink' : 'text-ink-soft hover:text-ink md:border-transparent')}>{label}</a>
      ))}
    </nav>
  );
}

function SettingsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const access = useDashboardAccess();
  const mainRef = useRef<HTMLElement>(null);

  // SD-8: Stripe's return URL used to land here. Send it where Stripe lives now.
  const stripeParam = params.get('stripe');
  useEffect(() => { if (stripeParam) router.replace(`/dashboard/money?tab=payouts&stripe=${encodeURIComponent(stripeParam)}`); }, [stripeParam, router]);

  const legacy = SECTION_TO_AREA[params.get('section') ?? ''];
  const areaParam = params.get('area') ?? '';
  const view: View = (['course', 'booking', 'payments', 'assistant', 'account', 'staff'] as string[]).includes(areaParam) ? areaParam as View : legacy?.area ?? 'home';
  const [target, setTarget] = useState(() => params.get('focus') ? `focus:${params.get('focus')}` : legacy?.target ?? '');

  const [form, setForm] = useState<Course>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const load = useCallback(async () => {
    const r = await dfetch<Course>('/api/operator/settings');
    if (r.ok && r.data) { setForm(r.data); setLoaded(true); setLoadError(''); } else if (!r.ok) setLoadError(r.error);
  }, []);
  useEffect(() => {
    load();
    dfetch<{ email?: string }>('/api/operator/profile').then(r => { if (r.ok && r.data?.email) setEmail(r.data.email); });
    // Admin can flip live status or Stripe while this tab sits in the background: re-read on refocus. Nothing is
    // edited in place any more (every change is a popup that keeps its own draft), so a refresh can't wipe an edit.
    const onFocus = () => { load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);
  // The assistant's confirmed description card saves through the settings route; show what it saved.
  useEffect(() => {
    const onApplied = (e: Event) => {
      const paths = (e as CustomEvent<{ paths?: string[] }>).detail?.paths ?? [];
      if (paths.includes('/api/operator/settings')) load();
    };
    window.addEventListener(APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(APPLIED_EVENT, onApplied);
  }, [load]);

  const merge = useCallback((p: Course) => setForm(f => ({ ...f, ...p })), []);
  const save = useCallback(async (p: Course) => {
    const e = await saveSettings(p);
    if (!e) { merge(p); load(); }
    return e;
  }, [merge, load]);

  // Staff live on Team now; an old link to them lands there.
  useEffect(() => { if (view === 'staff') router.replace('/dashboard/team'); }, [view, router]);

  const goArea = useCallback((to: string, t?: string) => {
    if (to === 'staff') { router.push('/dashboard/team'); return; }
    setTarget(t ?? '');
    router.push(to === 'home' ? '/dashboard/settings' : `/dashboard/settings?area=${to}`);
    if (!t) { mainRef.current?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); }
  }, [router]);

  // Once the area is drawn, take a search pick or an old link to its setting and mark it for a moment.
  useEffect(() => {
    if (!target || !loaded || view === 'home') return;
    const id = window.setTimeout(() => {
      if (target.startsWith('focus:')) showSetupField(target.slice(6));
      else {
        const el = document.getElementById(target);
        if (el) {
          el.scrollIntoView({ block: target.startsWith('g-') ? 'start' : 'center' });
          el.classList.add('setup-flash');
          window.setTimeout(() => el.classList.remove('setup-flash'), 2600);
        }
      }
      setTarget('');
    }, 80);
    return () => window.clearTimeout(id);
  }, [target, loaded, view]);

  const owner = access.loaded && !access.isStaff;
  const ctx: Ctx = { form, merge, save, canEdit: access.can('settings.edit'), owner, accessLoaded: access.loaded, email, goArea };
  const area = AREAS.find(a => a.key === view);
  // Sales tax is the owner's: a staff login has no section for it.
  const sections = useMemo(() => (area ? area.sections.filter(([id]) => owner || id !== 'tax') : []), [area, owner]);

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="settings" />
      <main ref={mainRef} className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <StaffNotice what="these settings" edit="settings.edit" />
        <div className="px-4 sm:px-6 py-5 flex flex-col gap-4 min-w-0">
          {view !== 'home' && (
            <button type="button" onClick={() => goArea('home')} className="self-start inline-flex items-center gap-1 min-h-[40px] -mb-2 text-[13.5px] text-ink-soft hover:text-ink"><BackIcon />Settings</button>
          )}
          <Head title={view === 'home' || view === 'staff' ? 'Settings' : area!.title} wide={!!area} owner={owner} onGo={(a, t) => goArea(a, t || undefined)} />
          {loadError && <div className="max-w-[780px]"><LoadError message={`${loadError} Nothing here is your course’s real settings until this loads.`} onRetry={load} /></div>}

          {view === 'home' && (
            <>
              <Card className="max-w-[780px] w-full py-1">
                {AREAS.map((a, i) => (
                  <button key={a.key} type="button" onClick={() => goArea(a.key)}
                    className={'w-full grid grid-cols-[minmax(0,1fr)_20px] gap-3.5 items-center text-left px-4 py-4 min-h-[72px] hover:bg-ink/5 ' + (i ? 'border-t border-line' : '')}>
                    <span><b className="block text-[15px] font-semibold text-ink">{a.title}</b><small className="block mt-[3px] text-[13px] leading-snug text-ink-soft">{a.sub}</small></span>
                    <Chevron />
                  </button>
                ))}
              </Card>
            </>
          )}

          {area && (
            <>
              <p className="-mt-1.5 max-w-[640px] text-[13.5px] leading-normal text-ink-soft">{area.intro}</p>
              {!loaded ? (!loadError && <p className="py-16 text-center text-[13px] text-ink-muted">Loading…</p>) : (
                <div className="grid gap-4 md:gap-7 md:grid-cols-[190px_minmax(0,780px)] items-start">
                  <Sections key={view} items={sections} main={mainRef} />
                  <div className="flex flex-col gap-4 min-w-0">
                    {view === 'course' && <CourseArea ctx={ctx} />}
                    {view === 'booking' && <BookingArea ctx={ctx} />}
                    {view === 'payments' && <PaymentsArea ctx={ctx} />}
                    {view === 'assistant' && <AssistantArea ctx={ctx} />}
                    {view === 'account' && <AccountArea ctx={ctx} />}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return <Suspense fallback={<div className="min-h-screen bg-page" />}><SettingsInner /></Suspense>;
}
