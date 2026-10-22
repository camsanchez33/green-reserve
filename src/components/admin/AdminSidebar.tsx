'use client';
import { SUPPORT_PLUS, MANAGER_PLUS, VIEWER_PLUS, OWNER_ONLY } from '@/lib/admin-roles';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import CommandPalette from '@/components/admin/CommandPalette';
import { useAdminSession } from '@/lib/admin-session-context';

export type AdminNavKey = 'overview' | 'goals' | 'inquiries' | 'courses' | 'groups' | 'create' | 'employees' | 'broadcasts' | 'activity' | 'messages' | 'profile' | 'revenue' | 'golfers' | 'system' | 'company' | 'audit';

export default function AdminSidebar({ active, pendingInquiries = 0, unreadMessages = 0 }: {
  active: AdminNavKey;
  pendingInquiries?: number;
  unreadMessages?: number;
}) {
  const [unread, setUnread] = useState(unreadMessages);
  // MP-6a: failed charges, all-time. Red because it is money that should
  // exist and does not, and because the Revenue page is the only place to fix it.
  const [moneyProblems, setMoneyProblems] = useState(0);
  // MP-8a: the inquiries badge self-fetches. It used to render only when the
  // Overview passed the prop, so leaving the Overview made pending inquiries
  // vanish from the nav.
  const [pending, setPending] = useState(pendingInquiries);
  useEffect(() => { setPending(pendingInquiries); }, [pendingInquiries]);
  // MP-11a: role comes from the layout's one session read. The rail used to
  // fetch it again, with a 'could not confirm your access level' state for when
  // that second fetch failed. There is no second fetch to fail now.
  const { role, name } = useAdminSession();
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
  // gate on each surface. Today and My profile are open to every role.
  //
  // AW-3 (Cam 2026-10-21, option A): grouped by the job, not by the table.
  // Leads, Expenses and Marketing join their groups when they are built — a
  // link to a page that doesn't exist yet is a dead end. Activity and Manual
  // build sit under System until AW-12 / AW-13 decide what they become. No
  // icons beside the labels (TYPE-3), so the rail no longer collapses to them.
  type NavItem = { key: AdminNavKey; label: string; href: string; minRole?: string[] };
  type NavGroup = { label: string | null; items: NavItem[] };

  const allGroups: NavGroup[] = [
    { label: null, items: [
      { key: 'overview', label: 'Today', href: '/admin' },
      { key: 'goals',    label: 'Goals', href: '/admin/goals', minRole: SUPPORT_PLUS },
    ] },
    { label: 'Courses', items: [
      { key: 'inquiries', label: 'Inquiries',     href: '/admin/inquiries', minRole: VIEWER_PLUS },
      { key: 'courses',   label: 'Courses',       href: '/admin/courses',   minRole: VIEWER_PLUS },
      { key: 'groups',    label: 'Course groups', href: '/admin/groups',    minRole: SUPPORT_PLUS },
      { key: 'messages',  label: 'Messages',      href: '/admin/messages',  minRole: SUPPORT_PLUS },
    ] },
    { label: 'Money', items: [
      { key: 'revenue', label: 'Revenue', href: '/admin/revenue', minRole: SUPPORT_PLUS },
    ] },
    { label: 'People', items: [
      { key: 'employees', label: 'Employees',     href: '/admin/employees', minRole: MANAGER_PLUS },
      { key: 'golfers',   label: 'Golfer lookup', href: '/admin/golfers',   minRole: SUPPORT_PLUS },
    ] },
    { label: 'System', items: [
      { key: 'system',   label: 'Health',       href: '/admin/system',   minRole: MANAGER_PLUS },
      // BRAIN-1a: every admin action, who did it and why — owner only.
      { key: 'audit',    label: 'Audit',        href: '/admin/audit',    minRole: OWNER_ONLY },
      { key: 'activity', label: 'Activity',     href: '/admin/activity', minRole: SUPPORT_PLUS },
      { key: 'create',   label: 'Manual build', href: '/admin/create',   minRole: MANAGER_PLUS },
      // CO-DOCS: the company's own paperwork (LLC filing, EIN, bank) — owner only.
      { key: 'company',  label: 'Company docs', href: '/admin/company-documents', minRole: OWNER_ONLY },
    ] },
  ];

  const canSee = (item: NavItem) => !item.minRole || item.minRole.includes(role);
  const groups = allGroups.map(g => ({ ...g, items: g.items.filter(canSee) })).filter(g => g.items.length > 0);

  const chip = (n: number, tone: string, title?: string) => n > 0 ? (
    <span className={`${tone} text-white text-[10px] px-1.5 py-0.5 font-semibold leading-none shrink-0 rounded-md`} title={title}>
      {n > 99 ? '99+' : n}
    </span>
  ) : undefined;
  const badges: Partial<Record<AdminNavKey, React.ReactNode>> = {
    inquiries: chip(pending, 'bg-warn'),
    // MP-6a: failed charges — money that should exist and does not.
    revenue: chip(moneyProblems, 'bg-bad', `${moneyProblems} money problem${moneyProblems === 1 ? '' : 's'} — failed charges and open chargebacks`),
    messages: chip(unread, 'bg-ok'),
  };

  function NavLink({ item }: { item: NavItem }) {
    const isActive = active === item.key;
    return (
      // MP-8a: a real link — middle-click and cmd-click open a tab, the
      // browser shows the destination, and the nav works before hydration.
      <Link
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[13.5px] rounded-md transition-colors ${
          isActive ? 'bg-pine/[0.07] text-pine font-semibold' : 'text-ink-soft hover:text-ink hover:bg-paper'
        }`}
      >
        <span className="flex-1">{item.label}</span>
        {badges[item.key]}
      </Link>
    );
  }

  const profile: NavItem = { key: 'profile', label: 'My profile', href: '/admin/profile' };

  return (
    <>
    <CommandPalette/>
    <div className="fixed left-0 top-0 h-full w-56 bg-white border-r border-line flex flex-col z-10">
      <div className="px-4 pt-4 pb-3 space-y-3">
        {/* FLOW-1: a light rail with the real lockup, as on the homepage. */}
        <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={150} height={28} className="w-[150px] h-auto ml-1" />
        {/* AW-3: search sits on top of the rail (Cam: "find anything"). */}
        <button
          type="button"
          onClick={openPalette}
          className="w-full flex items-center gap-2 text-left bg-paper border border-line rounded-md px-2.5 py-2 text-[13px] text-ink-muted hover:border-line-strong transition-colors"
        >
          <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">Search anything</span>
          <kbd className="text-[11px] text-ink-faint">Ctrl K</kbd>
        </button>
      </div>

      <nav aria-label="Admin" className="flex-1 px-2 pb-2 space-y-3 overflow-y-auto">
        {groups.map(g => (
          <div key={g.label ?? 'top'} className="space-y-0.5">
            {g.label && <div className="px-3 pb-1 text-[12px] font-semibold text-ink-muted">{g.label}</div>}
            {g.items.map(item => <NavLink key={item.key} item={item} />)}
          </div>
        ))}
      </nav>

      <div className="px-2 py-2 border-t border-line">
        <div className="px-3 pt-1 text-[12.5px] text-ink-muted truncate">{name || 'Signed in'} · {role}</div>
        <div className="flex items-center gap-1">
          <Link href={profile.href} aria-current={active === 'profile' ? 'page' : undefined} className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${active === 'profile' ? 'bg-pine/[0.07] text-pine font-semibold' : 'text-ink-soft hover:text-ink hover:bg-paper'}`}>{profile.label}</Link>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink hover:bg-paper rounded-md transition-colors disabled:opacity-50"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        {signOutError && (
          <p role="alert" className="px-3 pb-1 text-[11px] text-bad leading-snug">
            Sign-out failed — you are still signed in. Check your connection and try again.
          </p>
        )}
      </div>
    </div>
    </>
  );
}
