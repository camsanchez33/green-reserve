'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Calendar, BarChart2, Clock, Users, Settings, LogOut, XCircle,
  Trophy, PartyPopper, DollarSign, MessageSquare,
} from 'lucide-react';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import BirdieWidget from '@/components/birdie/BirdieWidget';
import { confirmLeave } from '@/lib/unsaved-guard';
import AgreementNotice from '@/components/dashboard/AgreementNotice';
import { recordTabVisit } from '@/lib/dashboard-visits';
import { Toaster, toast } from '@/components/dashboard/Toast';

export type OperatorNavKey =
  | 'teesheet' | 'analytics' | 'money' | 'tournaments' | 'outings'
  | 'schedule' | 'members' | 'settings' | 'messages';

interface CourseIdentity {
  id?: string; name: string; type: string; brandColor: string; establishedYear?: number | null;
  slug?: string; logoUrl?: string;
}
interface MyCourse { id: string; name: string; slug: string; active: boolean; liveStatus: string; }


export default function OperatorSidebar({ active, onAlertClick }: {
  active: OperatorNavKey;
  onAlertClick?: () => void;
}) {
  const router = useRouter();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [identity, setIdentity] = useState<CourseIdentity>({ name: '', type: 'public', brandColor: '#173B2A', establishedYear: null });
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
        setIdentity({ id: c.id, name: c.name || '', type: c.type || 'public', brandColor: c.brandColor || '#173B2A', establishedYear: c.establishedYear ?? null, slug: c.slug || '', logoUrl: c.logoUrl || '' });
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
      window.location.href = '/dashboard';
    } catch {
      toast('Network error — could not switch course.'); setSwitchingCourse(false);
    }
  }

  async function logout() {
    try {
      const r = await fetch('/api/auth/logout', { method: 'POST' });
      if (!r.ok) { toast('Sign-out did not go through — try again.'); return; }
      window.location.assign('/dashboard/login');
    } catch { toast('Network error — you are still signed in.'); }
  }

  const { brandColor, name, type, establishedYear, slug, logoUrl } = identity;
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
    settings: access.can('settings.edit'),
  } as Record<string, boolean>)[k] !== false;

  // SD-2: what fits in a thumb row.
  const mobileKeys: OperatorNavKey[] = (['teesheet', 'money', 'schedule', 'messages', 'settings'] as OperatorNavKey[]).filter(visible);
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
      <div className="flex items-end gap-8 px-6 lg:px-8 h-16 text-white">
        <div className="self-center flex items-center gap-3 min-w-0 shrink-0">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="w-9 h-9 rounded-md bg-white object-contain p-0.5" />
          )}
          <span className="font-serif text-[24px] leading-none truncate max-w-[260px]" title={meta}>{name || 'Your course'}</span>
        </div>
        <nav aria-label="Dashboard" className="flex items-end gap-1 min-w-0 overflow-x-auto">
          {navItems.filter(n => !n.soon && visible(n.key)).map(item => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => { if (confirmLeave()) router.push(item.href); }}
                aria-current={isActive ? 'page' : undefined}
                className={'shrink-0 px-3 pb-[13px] pt-2 text-[14px] font-semibold border-b-[3px] transition-opacity whitespace-nowrap ' + (isActive ? 'border-fairway opacity-100' : 'border-transparent opacity-80 hover:opacity-100')}
              >
                {item.label}
                {item.key === 'messages' && unreadMessages > 0 && (
                  <span className="ml-1.5 text-[12px] font-medium">({unreadMessages > 99 ? '99+' : unreadMessages})</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto self-center flex items-center gap-4 text-[13px] shrink-0">
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
