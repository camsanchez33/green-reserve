'use client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  Calendar, BarChart2, Clock, Users, Settings, LogOut, XCircle,
  Trophy, PartyPopper, DollarSign, AlertTriangle, MessageSquare,
} from 'lucide-react';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import { recordTabVisit } from '@/lib/dashboard-visits';
import { Toaster, toast } from '@/components/dashboard/Toast';

export type OperatorNavKey =
  | 'teesheet' | 'analytics' | 'cancellations' | 'tournaments' | 'outings'
  | 'schedule' | 'members' | 'payments' | 'settings' | 'messages';

interface CourseIdentity {
  id?: string; name: string; type: string; brandColor: string; establishedYear?: number | null;
}
interface MyCourse { id: string; name: string; slug: string; active: boolean; liveStatus: string; }

function accentActive(color: string) {
  return { borderLeft: `2px solid ${color}`, backgroundColor: color + '14', color };
}

export default function OperatorSidebar({ active, onAlertClick }: {
  active: OperatorNavKey;
  onAlertClick?: () => void;
}) {
  const router = useRouter();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [identity, setIdentity] = useState<CourseIdentity>({ name: '', type: 'public', brandColor: '#24513B', establishedYear: null });
  const [myCourses, setMyCourses] = useState<MyCourse[]>([]);
  const [switchingCourse, setSwitchingCourse] = useState(false);
  // SD-1: staff run the tee sheet; the configuration tabs are not theirs.
  const [isStaff, setIsStaff] = useState(false);

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
        setIdentity({ id: c.id, name: c.name || '', type: c.type || 'public', brandColor: c.brandColor || '#24513B', establishedYear: c.establishedYear ?? null });
      })
      .catch(() => {});
    // Only ever returns >1 row for multi-course operators — staff and
    // single-course operators get back a one-item (or empty) list and the
    // switcher stays hidden, same as today.
    fetch('/api/operator/my-courses')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.courses) setMyCourses(d.courses); setIsStaff(!!d?.isStaff); })
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

  const { brandColor, name, type, establishedYear } = identity;
  const typeLabel = type === 'semi-private' ? 'Semi-Private' : type === 'municipal' ? 'Municipal' : type === 'resort' ? 'Resort' : 'Public Course';
  const meta = [establishedYear ? `Est. ${establishedYear}` : null, typeLabel].filter(Boolean).join(' · ').toUpperCase();

  const navItems: { key: OperatorNavKey; label: string; href: string; icon: React.ReactNode; soon?: boolean }[] = [
    { key: 'teesheet',      label: 'Tee Sheet',    href: '/dashboard',               icon: <Calendar className="w-4 h-4"/> },
    { key: 'analytics',     label: 'Analytics',    href: '/dashboard?tab=analytics', icon: <BarChart2 className="w-4 h-4"/> },
    { key: 'cancellations', label: 'Cancellations',href: '/dashboard/cancellations', icon: <XCircle className="w-4 h-4"/> },
    { key: 'tournaments',   label: 'Tournaments',  href: '/dashboard/tournaments',   icon: <Trophy className="w-4 h-4"/>,    soon: true },
    { key: 'outings',       label: 'Outings',      href: '/dashboard/outings',       icon: <PartyPopper className="w-4 h-4"/>, soon: true },
    { key: 'schedule',      label: 'Schedule',     href: '/dashboard/schedules',     icon: <Clock className="w-4 h-4"/> },
    { key: 'members',       label: 'Members',      href: '/dashboard/members',       icon: <Users className="w-4 h-4"/> },
    { key: 'payments',      label: 'Payments',     href: '/dashboard/payments',      icon: <DollarSign className="w-4 h-4"/> },
    { key: 'messages',      label: 'Messages',     href: '/dashboard/messages',      icon: <MessageSquare className="w-4 h-4"/> },
    { key: 'settings',      label: 'Settings',     href: '/dashboard/settings',      icon: <Settings className="w-4 h-4"/> },
  ];

  const STAFF_HIDDEN: OperatorNavKey[] = ['schedule', 'members', 'payments', 'settings'];
  const groups = [
    { label: 'Dashboard', keys: ['teesheet', 'analytics'] as OperatorNavKey[] },
    { label: 'Bookings',  keys: ['cancellations', 'tournaments', 'outings'] as OperatorNavKey[] },
    { label: 'Manage',    keys: (['schedule', 'members', 'payments', 'messages', 'settings'] as OperatorNavKey[]).filter(k => !isStaff || !STAFF_HIDDEN.includes(k)) },
  ];

  // SD-2: what fits in a thumb row. Staff never see the configuration tabs
  // (SD-1), so their row ends at Messages.
  const mobileKeys: OperatorNavKey[] = isStaff
    ? ['teesheet', 'cancellations', 'analytics', 'messages']
    : ['teesheet', 'cancellations', 'schedule', 'messages', 'settings'];
  const mobileItems = navItems.filter(n => mobileKeys.includes(n.key) && !n.soon);

  return (
    <>
    <AnnouncementBanner />
    <Toaster />

    {/* SD-2: below md the 224px rail is gone. A slim strip carries identity,
        the course switcher and sign-out; the tabs live in a bottom bar. */}
    <header className="md:hidden bg-white border-b border-line px-4 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-serif text-[14px] text-ink leading-snug truncate">{name || 'GreenReserve'}</div>
        {name && <div className="text-[10px] text-ink-muted uppercase tracking-[0.05em] truncate">{meta}</div>}
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
            onClick={() => router.push(item.href)}
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

    <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-line flex-col h-full overflow-y-auto">
      <div className="px-4 py-4 border-b border-line">
        <div className="text-center mb-3">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={190} height={36} priority className="w-full h-auto" />
          <div className="text-[10px] text-ink-muted font-medium uppercase tracking-wider mt-1.5">Operator</div>
        </div>
        {name && (
          <div className="pl-0.5">
            <div className="font-serif text-[14.5px] text-ink leading-snug truncate">{name}</div>
            <div className="text-[10.5px] text-ink-muted uppercase tracking-[0.05em] mt-0.5 truncate">{meta}</div>
          </div>
        )}
        {myCourses.length > 1 && (
          <select
            value={identity.id || ''}
            onChange={e => switchCourse(e.target.value)}
            disabled={switchingCourse}
            className="mt-2 w-full bg-paper border border-line rounded-md px-2 py-1.5 text-[11.5px] text-ink-soft disabled:opacity-50"
          >
            {myCourses.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.active && c.liveStatus === 'live' ? '' : ' (draft)'}</option>
            ))}
          </select>
        )}
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        {groups.map(g => (
          <div key={g.label} className="mb-1">
            <div className="text-[10px] font-medium text-ink-faint uppercase tracking-[0.08em] px-4 py-1.5">{g.label}</div>
            {navItems.filter(n => g.keys.includes(n.key)).map(item => {
              const isActive = active === item.key;
              const base = 'w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors text-left border-l-2';
              if (item.soon) return (
                <div key={item.key} className={base + ' border-transparent text-ink-faint cursor-default'}>
                  {item.icon}<span className="flex-1">{item.label}</span>
                  <span className="text-[9px] font-medium uppercase tracking-wide text-ink-faint">Soon</span>
                </div>
              );
              if (isActive) return (
                <button key={item.key} onClick={() => router.push(item.href)} className={base} style={accentActive(brandColor)}>
                  {item.icon}<span className="flex-1">{item.label}</span>
                  {item.key === 'messages' && unreadMessages > 0 && (
                    <span className="text-[10px] font-medium leading-none" style={{ color: brandColor }}>{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                  )}
                </button>
              );
              return (
                <button key={item.key} onClick={() => router.push(item.href)} className={base + ' border-transparent text-ink-soft hover:text-ink hover:bg-line-soft/60'}>
                  {item.icon}<span className="flex-1">{item.label}</span>
                  {item.key === 'messages' && unreadMessages > 0 && (
                    <span className="text-[10px] font-medium text-ok leading-none">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        <div className="px-4 pt-1">
          <button onClick={onAlertClick || (() => router.push('/dashboard'))}
            className="w-full flex items-center gap-2.5 py-2 text-[12px] text-warn hover:text-ink transition-colors text-left">
            <AlertTriangle className="w-3.5 h-3.5"/><span>Course alert</span>
          </button>
        </div>
      </nav>

      <div className="p-3 border-t border-line">
        <button onClick={logout} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-ink-soft hover:text-bad transition-colors text-left">
          <LogOut className="w-4 h-4"/>Sign Out
        </button>
      </div>
    </aside>
    </>
  );
}
