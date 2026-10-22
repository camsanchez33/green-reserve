'use client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  Calendar, BarChart2, Clock, Users, Settings, LogOut, XCircle,
  Flag, DollarSign, MessageSquare, ShoppingBag,
} from 'lucide-react';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import BirdieWidget from '@/components/birdie/BirdieWidget';
import { confirmLeave } from '@/lib/unsaved-guard';
import AgreementNotice from '@/components/dashboard/AgreementNotice';
import { recordTabVisit } from '@/lib/dashboard-visits';
import { Toaster, toast } from '@/components/dashboard/Toast';

export type OperatorNavKey =
  | 'teesheet' | 'analytics' | 'money' | 'events'
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

/** Up to two letters for a course with no logo: "Pine Hollow Golf Club" → "PH". */
function initials(name: string): string {
  const words = name.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w) && !/^(the|golf|club|course|country|cc|gc|of|and|&)$/i.test(w));
  return (words.slice(0, 2).map(w => w[0]).join('') || name.slice(0, 2) || 'GR').toUpperCase();
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
    // W2-9 (Cam 2026-10-22): the Tournaments and Outings placeholders became one Events tab.
    { key: 'events',        label: 'Events',       href: '/dashboard/events',        icon: <Flag className="w-4 h-4"/> },
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
    events: access.can('events.manage'),
    schedule: access.can('schedule.view'),
    members: access.can('members.view'),
    money: access.can('money.cancellations') || access.can('money.payments') || access.can('money.payouts'),
    messages: access.can('messages.use'),
    shop: access.can('shop.sell'),
    settings: access.can('settings.edit'),
  } as Record<string, boolean>)[k] !== false;

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
        <div className="flex items-center gap-1.5 text-[11.5px] text-ink-muted mt-1 whitespace-nowrap">Powered by <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={80} height={15} className="h-[14px] w-auto" /></div>
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

    {/* DASH-C (Cam 2026-10-22, "very nice" on the course dashboard mockups,
        replacing CLUB-3's colour bar): on desktop a white 232px menu down the
        left, like the admin's ADMIN-C rail — the course's logo and name on top,
        the tabs, then the course switcher, Course alert, the booking page and
        sign-out at the foot. The course's colour marks the active tab. Pages
        keep their own wrappers; .op-look in globals.css makes room for the
        rail. Below md the strip and bottom bar above are unchanged. */}
    <aside className="op-rail hidden md:flex fixed inset-y-0 left-0 z-30 w-[var(--op-rail-w)] flex-col gap-5 bg-white border-r border-line px-3.5 py-[18px] overflow-y-auto">
      <div className="flex items-center gap-2.5 px-1.5 min-w-0" title={meta}>
        {identity.logoUrl ? (
          <Image src={identity.logoUrl} unoptimized alt="" width={34} height={34} className="w-[34px] h-[34px] rounded-md object-contain shrink-0" />
        ) : (
          <span aria-hidden="true" className="w-[34px] h-[34px] rounded-md shrink-0 flex items-center justify-center text-white text-[13px] font-bold" style={{ backgroundColor: brandColor }}>{initials(name)}</span>
        )}
        <div className="min-w-0 leading-tight">
          <div className="text-[14px] font-semibold text-ink truncate">{name || 'Your course'}</div>
          <div className="text-[12px] text-ink-muted truncate">{meta}</div>
        </div>
      </div>
      <nav aria-label="Dashboard" className="flex flex-col gap-px text-[14px]">
        {navItems.filter(n => !n.soon && visible(n.key)).map(item => {
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => { if (confirmLeave()) router.push(item.href); }}
              aria-current={isActive ? 'page' : undefined}
              className={'flex items-center text-left px-2.5 py-2 rounded-md transition-colors ' + (isActive ? 'font-semibold' : 'text-ink-soft hover:bg-paper hover:text-ink')}
              style={isActive ? { color: brandColor, backgroundColor: brandColor + '14' } : undefined}
            >
              <span className="flex-1">{item.label}</span>
              {item.key === 'messages' && unreadMessages > 0 && (
                <span className="text-[12px] font-medium text-bad" aria-label={`${unreadMessages} unread`}>{unreadMessages > 99 ? '99+' : unreadMessages}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-px border-t border-line pt-3 text-[13.5px]">
        {myCourses.length > 1 && (
          <select
            value={identity.id || ''}
            onChange={e => switchCourse(e.target.value)}
            disabled={switchingCourse}
            aria-label="Switch course"
            className="mb-2 w-full bg-paper border border-line rounded-md px-2 py-1.5 text-[12.5px] text-ink-soft disabled:opacity-50"
          >
            {myCourses.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.active && c.liveStatus === 'live' ? '' : ' (draft)'}</option>
            ))}
          </select>
        )}
        {/* SD-8b: Settings passes no onAlertClick, so this navigates (guarded). */}
        <button onClick={() => { if (onAlertClick) { onAlertClick(); return; } if (confirmLeave()) router.push('/dashboard'); }}
          className="text-left px-2.5 py-2 rounded-md text-ink-soft hover:bg-paper hover:text-ink transition-colors">Course alert</button>
        {slug && (
          <a href={'/courses/' + slug} target="_blank" rel="noopener" className="px-2.5 py-2 rounded-md text-ink-soft hover:bg-paper hover:text-ink transition-colors">Your booking page ↗</a>
        )}
        <button onClick={logout} className="text-left px-2.5 py-2 rounded-md text-ink-soft hover:bg-paper hover:text-bad transition-colors">Sign out</button>
        {/* LOGO-2 (Cam 2026-10-20): "Powered by" and the GreenReserve lockup stay with the course's name. */}
        <span className="flex items-center gap-1.5 px-2.5 pt-2 text-[11.5px] text-ink-muted whitespace-nowrap">Powered by <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={80} height={15} className="h-[14px] w-auto" /></span>
      </div>
    </aside>
    </>
  );
}
