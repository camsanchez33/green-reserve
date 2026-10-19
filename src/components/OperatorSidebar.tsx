'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  Calendar, BarChart2, Clock, Users, Settings, LogOut, XCircle,
  Trophy, PartyPopper, DollarSign, MessageSquare, ShoppingBag,
} from 'lucide-react';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import BirdieWidget from '@/components/birdie/BirdieWidget';
import { openBirdie, useBirdieReady } from '@/lib/birdie/ask';
import { confirmLeave } from '@/lib/unsaved-guard';
import AgreementNotice from '@/components/dashboard/AgreementNotice';
import { recordTabVisit } from '@/lib/dashboard-visits';
import { Toaster, toast } from '@/components/dashboard/Toast';

export type OperatorNavKey =
  | 'teesheet' | 'analytics' | 'money' | 'tournaments' | 'outings'
  | 'schedule' | 'members' | 'settings' | 'messages' | 'shop';

interface CourseIdentity {
  id?: string; name: string; type: string; brandColor: string; establishedYear?: number | null;
  slug?: string; logoUrl?: string;
}
interface MyCourse { id: string; name: string; slug: string; active: boolean; liveStatus: string; }


// Cam 2026-10-19: switching tabs flashed the bar pine for a moment — every page
// mounts its own sidebar, which started on the default colour until the course
// loaded. The last identity is kept for the tab's lifetime (module) and across a
// reload (sessionStorage), and is cleared when the course is switched.
const IDENTITY_KEY = 'gr:op-identity';
let cachedIdentity: CourseIdentity | null = null;
function readIdentity(): CourseIdentity | null {
  if (cachedIdentity) return cachedIdentity;
  try { const raw = sessionStorage.getItem(IDENTITY_KEY); if (raw) cachedIdentity = JSON.parse(raw) as CourseIdentity; } catch { /* storage unavailable */ }
  return cachedIdentity;
}
function saveIdentity(i: CourseIdentity | null) {
  cachedIdentity = i;
  try { if (i) sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(i)); else sessionStorage.removeItem(IDENTITY_KEY); } catch { /* storage unavailable */ }
}

export default function OperatorSidebar({ active, onAlertClick }: {
  active: OperatorNavKey;
  onAlertClick?: () => void;
}) {
  const router = useRouter();
  const [unreadMessages, setUnreadMessages] = useState(0);
  // The module cache is empty on a full page load, so the server and the first
  // client render agree (no hydration mismatch); the layout effect then applies
  // the stored colour before the browser paints.
  const [identity, setIdentity] = useState<CourseIdentity>(() => cachedIdentity || { name: '', type: 'public', brandColor: '#173B2A', establishedYear: null });
  useLayoutEffect(() => { if (!cachedIdentity) { const i = readIdentity(); if (i) setIdentity(i); } }, []);
  const [myCourses, setMyCourses] = useState<MyCourse[]>([]);
  const birdieOn = useBirdieReady();
  const [switchingCourse, setSwitchingCourse] = useState(false);
  // SP-A: what this login may open — per person, set by the course owner.
  const access = useDashboardAccess();
  const isStaff = access.isStaff;

  // Every dashboard page renders this sidebar with its tab as `active` — the
  // one place we can credit a tab visit for the Getting Started checklist's
  // "look around your dashboard" step without touching every page.
  useEffect(() => { recordTabVisit(active); }, [active]);

  useEffect(() => {
    fetch('/api/operator/messages?unreadCount=1')
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(d => setUnreadMessages(d.count ?? 0))
      .catch(() => {});
    fetch('/api/operator/courses')
      .then(r => r.ok ? r.json() : null)
      .then(c => {
        if (!c) return;
        const next = { id: c.id, name: c.name || '', type: c.type || 'public', brandColor: c.brandColor || '#173B2A', establishedYear: c.establishedYear ?? null, slug: c.slug || '', logoUrl: c.logoUrl || '' };
        saveIdentity(next); setIdentity(next);
      })
      .catch(() => {});
    // Only ever returns >1 row for multi-course operators — staff and
    // single-course operators get back a one-item (or empty) list and the
    // switcher stays hidden, same as today.
    fetch('/api/operator/my-courses')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.courses) setMyCourses(d.courses); })
      .catch(() => {});
  }, []);

  async function switchCourse(courseId: string) {
    if (switchingCourse || courseId === identity.id) return;
    setSwitchingCourse(true);
    try {
      const r = await fetch('/api/operator/active-course', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId }),
      });
      // SD-10: this reloaded whether or not the switch happened — you landed
      // back on the same course with no explanation.
      if (!r.ok) { const d = await r.json().catch(() => ({})); toast(d.error || 'Could not switch course.'); setSwitchingCourse(false); return; }
      saveIdentity(null); // the next course has its own colour
      window.location.href = '/dashboard';
    } catch {
      toast('Network error — could not switch course.'); setSwitchingCourse(false);
    }
  }

  async function logout() {
    try {
      const r = await fetch('/api/auth/logout', { method: 'POST' });
      if (!r.ok) { toast('Sign-out did not go through — try again.'); return; }
      saveIdentity(null);
      window.location.assign('/dashboard/login');
    } catch { toast('Network error — you are still signed in.'); }
  }

  const { brandColor, name, type, establishedYear, slug } = identity;
  const moneyOnlyCancellations = isStaff && !access.can('money.payments') && !access.can('money.payouts');
  const typeLabel = type === 'semi-private' ? 'Semi-private' : type === 'municipal' ? 'Municipal' : type === 'resort' ? 'Resort' : 'Public course';
  const meta = [establishedYear ? `Est. ${establishedYear}` : null, typeLabel].filter(Boolean).join(' · ');

  const navItems: { key: OperatorNavKey; label: string; href: string; icon: React.ReactNode; soon?: boolean }[] = [
    { key: 'teesheet',      label: 'Tee sheet',    href: '/dashboard',               icon: <Calendar className="w-4 h-4"/> },
    { key: 'analytics',     label: 'Analytics',    href: '/dashboard/analytics', icon: <BarChart2 className="w-4 h-4"/> },
    { key: 'tournaments',   label: 'Tournaments',  href: '/dashboard/tournaments',   icon: <Trophy className="w-4 h-4"/>,    soon: true },
    { key: 'outings',       label: 'Outings',      href: '/dashboard/outings',       icon: <PartyPopper className="w-4 h-4"/>, soon: true },
    { key: 'schedule',      label: 'Schedule',     href: '/dashboard/schedules',     icon: <Clock className="w-4 h-4"/> },
    { key: 'members',       label: 'Members',      href: '/dashboard/members',       icon: <Users className="w-4 h-4"/> },
    // SD-8: Payments + Cancellations + Payouts are one page. A login that can
    // only see cancellations gets the item named for what it shows.
    { key: 'money',         label: moneyOnlyCancellations ? 'Cancellations' : 'Money',
      href: moneyOnlyCancellations ? '/dashboard/money?tab=cancellations' : '/dashboard/money',
      icon: moneyOnlyCancellations ? <XCircle className="w-4 h-4"/> : <DollarSign className="w-4 h-4"/> },
    // POS-2 (Cam 2026-10-19): ring up walk-up sales — cash or a pay link.
    { key: 'shop',          label: 'Pro shop',     href: '/dashboard/shop',          icon: <ShoppingBag className="w-4 h-4"/> },
    { key: 'messages',      label: 'Messages',     href: '/dashboard/messages',      icon: <MessageSquare className="w-4 h-4"/> },
    { key: 'settings',      label: 'Settings',     href: '/dashboard/settings',      icon: <Settings className="w-4 h-4"/> },
  ];

  // SP-A: each item shows when the login may open it (owners: always). The
  // routes refuse the rest; this keeps doors that would 403 off the rail.
  const visible = (k: OperatorNavKey) => !isStaff || ({
    teesheet: true,
    analytics: access.can('analytics.view'),
    tournaments: true,
    outings: true,
    schedule: access.can('schedule.view'),
    members: access.can('members.view'),
    money: access.can('money.cancellations') || access.can('money.payments') || access.can('money.payouts'),
    messages: access.can('messages.use'),
    shop: access.can('shop.sell'),
    settings: access.can('settings.edit'),
  } as Record<string, boolean>)[k] !== false;

  // The desktop bar's layout (literal class strings, so Tailwind sees them).
  const bar = myCourses.length > 1 ? {
    row: 'flex flex-wrap items-end gap-x-5 px-6 lg:px-8 text-white',
    side: 'self-center flex items-center gap-3 min-w-0 shrink-0 pt-3 pb-1',
    nav: 'order-last basis-full -mx-2 flex flex-wrap items-end gap-1 min-w-0',
  } : {
    row: 'flex flex-wrap 2xl:flex-nowrap items-end gap-x-5 2xl:gap-x-8 px-6 lg:px-8 2xl:h-16 text-white',
    side: 'self-center flex items-center gap-3 2xl:gap-4 min-w-0 shrink-0 pt-3 pb-1 2xl:p-0',
    nav: 'order-last 2xl:order-none basis-full 2xl:basis-auto -mx-2 2xl:mx-0 flex flex-wrap 2xl:flex-nowrap items-end gap-1 min-w-0',
  };

  // SD-2: what fits in a thumb row.
  const mobileKeys: OperatorNavKey[] = (['teesheet', 'shop', 'money', 'schedule', 'messages', 'settings'] as OperatorNavKey[]).filter(visible);
  const mobileItems = navItems.filter(n => mobileKeys.includes(n.key) && !n.soon);

  return (
    <>
    <AnnouncementBanner />
    {/* BIRDIE_AI_SPEC B1: renders nothing until /api/birdie/chat says it is on. */}
    <BirdieWidget />
    <AgreementNotice />
    <Toaster />

    {/* SD-2: below md the 224px rail is gone. A slim strip carries identity,
        the course switcher and sign-out; the tabs live in a bottom bar. */}
    <header className="md:hidden bg-white border-b border-line px-4 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-serif text-[14px] text-ink leading-snug truncate">{name || 'GreenReserve'}</div>
        {name && <div className="text-[11.5px] text-ink-muted truncate">{meta}</div>}
      </div>
      {myCourses.length > 1 && (
        <select
          value={identity.id || ''}
          onChange={e => switchCourse(e.target.value)}
          disabled={switchingCourse}
          aria-label="Switch course"
          className="max-w-[40%] bg-paper border border-line rounded-md px-2 py-2 text-[12px] text-ink-soft disabled:opacity-50"
        >
          {myCourses.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.active && c.liveStatus === 'live' ? '' : ' (draft)'}</option>
          ))}
        </select>
      )}
      <button onClick={logout} aria-label="Sign out" className="shrink-0 w-11 h-11 -mr-2 flex items-center justify-center rounded-md text-ink-soft hover:text-bad transition-colors">
        <LogOut className="w-4 h-4"/>
      </button>
    </header>

    <nav aria-label="Dashboard" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-line flex pb-[env(safe-area-inset-bottom)]">
      {mobileItems.map(item => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => { if (confirmLeave()) router.push(item.href); }}
            className={'flex-1 min-h-[56px] flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors relative ' + (isActive ? 'text-ink' : 'text-ink-muted')}
            style={isActive ? { color: brandColor } : undefined}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.icon}
            <span className="leading-none">{item.label}</span>
            {item.key === 'messages' && unreadMessages > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-18px)] w-2 h-2 rounded-full bg-ok" aria-label={`${unreadMessages} unread`} />
            )}
          </button>
        );
      })}
    </nav>

    {/* CLUB-3 (Cam 2026-10-05, after clubup.com): on desktop the 224px rail is
        gone — the course's name and the tabs run across the top in the course's
        own colour, the active tab underlined in fairway (decoration only; the
        white weight and aria-current carry the state). Below md the strip and
        bottom bar above are unchanged. Tournaments and Outings are "Soon"
        placeholders and stay off the bar until they exist. */}
    <header className="hidden md:block shrink-0" style={{ backgroundColor: brandColor }}>
      {/* Cam 2026-10-19: with Pro shop added the bar ran past 1280px and cut
          Settings off. Never a sideways scroll: the tabs take their own row
          under the name, and share one row with it only at 2xl (1536px+) on a
          single-course login — the course switcher doesn't fit beside them. */}
      <div className={bar.row}>
        <div className={bar.side}>
          {/* The course logo box that sat here did nothing (Cam 2026-10-19) — the name carries it. */}
          <span className="font-serif text-[22px] 2xl:text-[24px] leading-none truncate max-w-[70vw] 2xl:max-w-[260px]" title={meta}>{name || 'Your course'}</span>
        </div>
        <nav aria-label="Dashboard" className={bar.nav}>
          {navItems.filter(n => !n.soon && visible(n.key)).map(item => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => { if (confirmLeave()) router.push(item.href); }}
                aria-current={isActive ? 'page' : undefined}
                className={'shrink-0 px-2 2xl:px-3 pb-[13px] pt-2 text-[14px] font-semibold border-b-[3px] transition-opacity whitespace-nowrap ' + (isActive ? 'border-fairway opacity-100' : 'border-transparent opacity-80 hover:opacity-100')}
              >
                {item.label}
                {item.key === 'messages' && unreadMessages > 0 && (
                  <span className="ml-1.5 text-[12px] font-medium">({unreadMessages > 99 ? '99+' : unreadMessages})</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className={'ml-auto text-[13px] ' + bar.side}>
          {myCourses.length > 1 && (
            <select
              value={identity.id || ''}
              onChange={e => switchCourse(e.target.value)}
              disabled={switchingCourse}
              aria-label="Switch course"
              className="max-w-[180px] bg-white/10 border border-white/30 rounded-md px-2 py-1.5 text-[12.5px] text-white disabled:opacity-50 [&>option]:text-ink"
            >
              {myCourses.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.active && c.liveStatus === 'live' ? '' : ' (draft)'}</option>
              ))}
            </select>
          )}
          {/* Cam 2026-10-19: Birdie must be obvious, and never cover a page's buttons. */}
          {birdieOn && (
            <button type="button" onClick={openBirdie}
              className="px-3 py-1 rounded-md border border-white/40 hover:bg-white/10 font-semibold transition-colors">Ask Birdie</button>
          )}
          {/* SD-8b: Settings passes no onAlertClick, so this navigates (guarded). */}
          <button onClick={() => { if (onAlertClick) { onAlertClick(); return; } if (confirmLeave()) router.push('/dashboard'); }}
            className="opacity-85 hover:opacity-100 transition-opacity">Course alert</button>
          {slug && (
            <a href={'/courses/' + slug} target="_blank" rel="noopener" className="opacity-85 hover:opacity-100 transition-opacity">Your page ↗</a>
          )}
          <button onClick={logout} className="opacity-85 hover:opacity-100 transition-opacity">Sign out</button>
        </div>
      </div>
      <div className="h-1 bg-fairway" aria-hidden="true" />
    </header>
    </>
  );
}
