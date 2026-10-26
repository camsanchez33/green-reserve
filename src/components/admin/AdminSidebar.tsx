'use client';
import { SUPPORT_PLUS, MANAGER_PLUS, VIEWER_PLUS, OWNER_ONLY } from '@/lib/admin-roles';
import Link from 'next/link';
import Image from 'next/image';
import { StatusDot } from '@/components/ui/StatusDot';
import { useEffect, useState, useCallback } from 'react';
import CommandPalette from '@/components/admin/CommandPalette';
import { useAdminSession } from '@/lib/admin-session-context';
import type { AdminArea } from '@/lib/admin-areas';

export type AdminNavKey = 'overview' | 'problems' | 'goals' | 'inquiries' | 'courses' | 'groups' | 'create' | 'employees' | 'announcements' | 'messages' | 'profile' | 'revenue' | 'golfers' | 'system' | 'company' | 'audit' | 'security';

export default function AdminSidebar({ active, pendingInquiries = 0, unreadMessages = 0 }: {
  active: AdminNavKey;
  pendingInquiries?: number;
  unreadMessages?: number;
}) {
  const [unread, setUnread] = useState(unreadMessages);
  // MP-6a: failed charges, all-time. Red because it is money that should
  // exist and does not, and because the Revenue page is the only place to fix it.
  const [moneyProblems, setMoneyProblems] = useState(0);
  // ADMIN-C: open problems (BRAIN-2a) and the one-line system status for the top bar.
  const [problems, setProblems] = useState(0);
  const [systemsOk, setSystemsOk] = useState<boolean | null>(null);
  // MP-8a: the inquiries badge self-fetches. It used to render only when the
  // Overview passed the prop, so leaving the Overview made pending inquiries
  // vanish from the nav.
  const [pending, setPending] = useState(pendingInquiries);
  useEffect(() => { setPending(pendingInquiries); }, [pendingInquiries]);
  // MP-11a: role comes from the layout's one session read. The rail used to
  // fetch it again, with a 'could not confirm your access level' state for when
  // that second fetch failed. There is no second fetch to fail now.
  const { role, name, areas } = useAdminSession();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  useEffect(() => { setUnread(unreadMessages); }, [unreadMessages]);

  // MP-8a: ONE fetch for all three badges (was two, and none for inquiries).
  // A page that passes a live prop (Messages passes unread; Overview passes
  // pending) keeps its fresher number — the fetch only fills what was 0.
  useEffect(() => {
    if (!SUPPORT_PLUS.includes(role)) return; // would be zeros anyway
    let cancelled = false;
    fetch('/api/admin/nav-badges')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        if (pendingInquiries === 0) setPending(Number(d.pendingInquiries) || 0);
        if (unreadMessages === 0) setUnread(Number(d.unreadMessages) || 0);
        setMoneyProblems(Number(d.moneyProblems) || 0);
        setProblems(Number(d.openProblems) || 0);
        if (typeof d.systemsOk === 'boolean') setSystemsOk(d.systemsOk);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [role, pendingInquiries, unreadMessages]);

  const openPalette = useCallback(() => window.dispatchEvent(new CustomEvent('open-cmd-palette')), []);

  // MP-2d B4: no try/catch and no res.ok check. If the request rejected, the
  // function threw before router.push and the user stayed on the page with no
  // error — clicking Sign out on a shared machine and reasonably believing it
  // worked. Navigate regardless once we know the outcome; only a thrown request
  // leaves them here, and then they are told.
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true); setSignOutError(false);
    try {
      // MP-2e: fetch does not reject on 5xx, so a proxy 502 fell through to the
      // redirect and the user landed on the login screen with a live session
      // cookie — the strongest possible "you are signed out" signal, while they
      // were not. Only navigate once the server confirms it cleared the cookie.
      const r = await fetch('/api/admin/logout', { method: 'POST' });
      if (!r.ok) { setSignOutError(true); return; }
      window.location.assign('/admin/login');
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  // MP-2c: the nav is a map of the company, and it was showing every role a
  // door it could not open. Not offering the link is the root fix; the pages
  // still handle 403 for anyone who types the URL. `minRole` mirrors the API
  // gate on each surface. Home and My profile are open to every role.
  //
  // ADMIN-C (Cam 2026-10-22, mockup C "Clean hub", Stripe as the reference):
  // a white left menu with one outline icon per section, the work first
  // (Home, Problems, Pipeline, Courses, Golfers, Money, Messages), the company
  // after. Course groups sit under Courses and Announcements under Messages.
  // Activity is retired from the menu (the course timelines replaced it) and
  // Manual build lives inside Pipeline.
  type NavItem = { key: AdminNavKey; label: string; href: string; minRole?: string[]; sub?: boolean; area?: AdminArea };
  type NavGroup = { label: string | null; items: NavItem[] };

  const allGroups: NavGroup[] = [
    { label: null, items: [
      { key: 'overview', label: 'Home', href: '/admin' },
      { key: 'problems', label: 'Problems', href: '/admin/problems', minRole: SUPPORT_PLUS, area: 'problems' },
      { key: 'inquiries', label: 'Pipeline', href: '/admin/inquiries', minRole: VIEWER_PLUS, area: 'pipeline' },
      { key: 'courses', label: 'Courses', href: '/admin/courses', minRole: VIEWER_PLUS, area: 'courses' },
      { key: 'groups', label: 'Course groups', href: '/admin/groups', minRole: SUPPORT_PLUS, sub: true, area: 'courses' },
      { key: 'golfers', label: 'Golfers', href: '/admin/golfers', minRole: SUPPORT_PLUS, area: 'golfers' },
      { key: 'revenue', label: 'Money', href: '/admin/revenue', minRole: SUPPORT_PLUS, area: 'money' },
      { key: 'messages', label: 'Messages', href: '/admin/messages', minRole: SUPPORT_PLUS, area: 'messages' },
      { key: 'announcements', label: 'Announcements', href: '/admin/announcements', minRole: SUPPORT_PLUS, sub: true, area: 'messages' },
    ] },
    { label: 'Company', items: [
      { key: 'goals', label: 'Goals', href: '/admin/goals', minRole: SUPPORT_PLUS, area: 'company' },
      { key: 'employees', label: 'Team', href: '/admin/employees', minRole: MANAGER_PLUS, area: 'company' },
      { key: 'audit', label: 'Audit', href: '/admin/audit', minRole: OWNER_ONLY },
      { key: 'security', label: 'Security', href: '/admin/security', minRole: OWNER_ONLY },
      { key: 'system', label: 'Systems', href: '/admin/system', minRole: MANAGER_PLUS, area: 'company' },
      { key: 'company', label: 'Company docs', href: '/admin/company-documents', minRole: OWNER_ONLY },
    ] },
  ];

  // AW-11: the role says how much; the person's areas say where. Both must allow it (the routes check both too).
  const canSee = (item: NavItem) => (!item.minRole || item.minRole.includes(role)) && (!item.area || areas.includes(item.area));
  const groups = allGroups.map(g => ({ ...g, items: g.items.filter(canSee) })).filter(g => g.items.length > 0);

  const count = (n: number, tone: string, title?: string) => n > 0 ? (
    <span className={`${tone} text-[12px] font-semibold tabular-nums shrink-0`} title={title}>{n > 99 ? '99+' : n}</span>
  ) : undefined;
  const badges: Partial<Record<AdminNavKey, React.ReactNode>> = {
    problems: count(problems, 'text-bad', `${problems} open problem${problems === 1 ? '' : 's'}`),
    inquiries: count(pending, 'text-warn', `${pending} new inquir${pending === 1 ? 'y' : 'ies'}`),
    // MP-6a: failed charges and open chargebacks — money that should exist and does not.
    revenue: count(moneyProblems, 'text-bad', `${moneyProblems} money problem${moneyProblems === 1 ? '' : 's'} — failed charges and open chargebacks`),
    messages: count(unread, 'text-ink-muted', `${unread} unread`),
  };

  function NavLink({ item }: { item: NavItem }) {
    const isActive = active === item.key;
    return (
      // MP-8a: a real link — middle-click and cmd-click open a tab, the
      // browser shows the destination, and the nav works before hydration.
      <Link
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full flex items-center gap-2.5 rounded-md transition-colors ${item.sub ? 'pl-9 pr-2.5 py-1.5 text-[13px]' : 'px-2.5 py-2 text-[14px]'} ${
          isActive ? 'bg-pine/[0.07] text-pine font-semibold' : 'text-ink-soft hover:text-ink hover:bg-paper'
        }`}
      >
        {!item.sub && <NavIcon k={item.key} />}
        <span className="flex-1 truncate">{item.label}</span>
        {badges[item.key]}
      </Link>
    );
  }

  const profile: NavItem = { key: 'profile', label: 'My profile', href: '/admin/profile' };

  return (
    <>
    <CommandPalette/>
    <div className="fixed left-0 top-0 h-full w-60 bg-white border-r border-line flex flex-col z-20">
      <Link href="/admin" className="flex items-center px-5 h-14 shrink-0" aria-label="GreenReserve admin home">
        {/* LOGO-1: the vector lockup, top-left, as on every page. */}
        <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={150} height={28} className="w-[150px] h-auto" />
      </Link>

      <nav aria-label="Admin" className="flex-1 px-3 pb-3 pt-2 space-y-5 overflow-y-auto">
        {groups.map(g => (
          <div key={g.label ?? 'top'} className="space-y-0.5">
            {g.label && <div className="px-2.5 pb-1.5 text-[12px] text-ink-muted">{g.label}</div>}
            {g.items.map(item => <NavLink key={item.key} item={item} />)}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-line">
        <div className="px-2.5 text-[12.5px] text-ink-muted truncate">{name || 'Signed in'} · {role}</div>
        <div className="flex items-center gap-1 mt-1">
          <Link href={profile.href} aria-current={active === 'profile' ? 'page' : undefined} className={`px-2.5 py-1.5 text-[13px] rounded-md transition-colors ${active === 'profile' ? 'bg-pine/[0.07] text-pine font-semibold' : 'text-ink-soft hover:text-ink hover:bg-paper'}`}>{profile.label}</Link>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="px-2.5 py-1.5 text-[13px] text-ink-muted hover:text-ink hover:bg-paper rounded-md transition-colors disabled:opacity-50"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        {signOutError && (
          <p role="alert" className="px-2.5 pb-1 text-[11px] text-bad leading-snug">
            Sign-out failed — you are still signed in. Check your connection and try again.
          </p>
        )}
      </div>
    </div>

    {/* ADMIN-C: the top bar — search (and "ask"), and one live line on the systems. */}
    <div className="fixed top-0 right-0 left-60 h-14 bg-white/95 backdrop-blur-sm border-b border-line z-10 flex items-center gap-4 px-10">
      <button
        type="button"
        onClick={openPalette}
        className="w-full max-w-[460px] flex items-center gap-2 text-left bg-paper rounded-md px-3 py-2 text-[14px] text-ink-muted hover:bg-line-soft transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <span className="flex-1">Search or ask anything</span>
        <kbd className="text-[11px] text-ink-faint">Ctrl K</kbd>
      </button>
      {systemsOk !== null && (
        <Link href="/admin/system" className={`ml-auto flex items-center gap-2 text-[13px] ${systemsOk ? 'text-ok' : 'text-bad font-medium'}`}>
          <StatusDot status={systemsOk ? 'ok' : 'bad'} />
          {systemsOk ? 'All systems running' : 'A system needs attention'}
        </Link>
      )}
    </div>
    </>
  );
}

/** ADMIN-C: one outline icon per section, decorative (the label names it). */
function NavIcon({ k }: { k: AdminNavKey }) {
  const paths: Partial<Record<AdminNavKey, React.ReactNode>> = {
    overview: <path d="M3 11l9-8 9 8v10H5V11" />,
    problems: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
    inquiries: <path d="M4 6h16M7 12h10M10 18h4" />,
    courses: <path d="M6 21V4l10 4-10 4" />,
    golfers: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
    revenue: <><path d="M4 15l5-5 4 4 7-7" /><path d="M14 7h6v6" /></>,
    messages: <path d="M4 5h16v11H8l-4 4z" />,
    goals: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
    employees: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 010 7M18.5 14.8c1.6.9 2.7 2.7 3 5.2" /></>,
    audit: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h5" /></>,
    security: <><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
    system: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></>,
    company: <><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-6h6v6" /></>,
  };
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-80">
      {paths[k] ?? <circle cx="12" cy="12" r="2" />}
    </svg>
  );
}
