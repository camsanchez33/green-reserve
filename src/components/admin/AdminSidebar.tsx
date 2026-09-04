'use client';
import { useRouter } from 'next/navigation';
import { SUPPORT_PLUS, MANAGER_PLUS } from '@/lib/admin-roles';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { BarChart2, AlertCircle, Building2, Hammer, Users, Activity, MessageSquare, UserCircle, ChevronLeft, ChevronRight, DollarSign, Search, UserSearch, Wrench, LogOut } from 'lucide-react';
import CommandPalette from '@/components/admin/CommandPalette';

export type AdminNavKey = 'overview' | 'inquiries' | 'courses' | 'create' | 'employees' | 'broadcasts' | 'activity' | 'messages' | 'profile' | 'revenue' | 'golfers' | 'system';

const LS_KEY = 'admin-sidebar-collapsed';

export default function AdminSidebar({ active, pendingInquiries = 0, unreadMessages = 0 }: {
  active: AdminNavKey;
  pendingInquiries?: number;
  unreadMessages?: number;
}) {
  const router = useRouter();
  const [unread, setUnread] = useState(unreadMessages);
  // MP-6a: failed charges, all-time. Red because it is money that should
  // exist and does not, and because the Revenue page is the only place to fix it.
  const [moneyProblems, setMoneyProblems] = useState(0);
  // MP-8a: the inquiries badge self-fetches. It used to render only when the
  // Overview passed the prop, so leaving the Overview made pending inquiries
  // vanish from the nav.
  const [pending, setPending] = useState(pendingInquiries);
  useEffect(() => { setPending(pendingInquiries); }, [pendingInquiries]);
  const [role, setRole] = useState<string | null>(null);        // null = not yet known
  const [roleFailed, setRoleFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LS_KEY) === 'true';
  });

  useEffect(() => { setUnread(unreadMessages); }, [unreadMessages]);

  // MP-2e: both failure notices render only when expanded, and `collapsed` is
  // persisted in localStorage — so for anyone whose last session left the rail
  // collapsed, these states could not reach a JSX site at all. That is the
  // third time this run series shipped state that cannot render. Rather than
  // build a second collapsed-only treatment, uncollapse when there is something
  // the user must actually read.
  useEffect(() => {
    if (roleFailed || signOutError) setCollapsed(false);
  }, [roleFailed, signOutError]);

  // One session read for the whole shell. ADMIN_V4 LAW rule 2 wants role
  // resolved once server-side in the layout (Phase V4-7); until that lands this
  // is one fetch per page rather than one per nav item.
  // MP-2d B3: this had an empty catch — verbatim what the no-silent-failures
  // rule forbids — and `role` started as ''. "Not known yet", "lookup failed"
  // and "you are a viewer" all rendered as a two-item nav, permanently, with no
  // retry: an owner during a DB blip saw a sidebar asserting they had lost
  // access to everything. Three states now, and an unknown role shows the full
  // nav rather than a false one. The API gates are the real boundary; this
  // filter only decides which doors to offer.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/session')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { if (!cancelled) { setRole(String(d?.role ?? '')); setRoleFailed(false); } })
      .catch(() => { if (!cancelled) setRoleFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // MP-8a: ONE fetch for all three badges (was two, and none for inquiries).
  // A page that passes a live prop (Messages passes unread; Overview passes
  // pending) keeps its fresher number — the fetch only fills what was 0.
  useEffect(() => {
    if (role !== null && !SUPPORT_PLUS.includes(role)) return; // would be zeros anyway
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

  // Apply CSS class and persist
  useEffect(() => {
    if (collapsed) {
      document.documentElement.classList.add('sidebar-collapsed');
    } else {
      document.documentElement.classList.remove('sidebar-collapsed');
    }
    localStorage.setItem(LS_KEY, collapsed ? 'true' : 'false');
  }, [collapsed]);

  // Keyboard shortcut [
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '[' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        setCollapsed(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggle = useCallback(() => setCollapsed(v => !v), []);
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
      router.push('/admin/login');
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  // MP-2c: the nav is a map of the company, and it was showing every role a
  // door it could not open. MP-2's gates made Employees, Messages, Courses,
  // Broadcasts, Revenue and Golfers 403 for lower roles, and the pages then
  // rendered that denial as "no data" — a class of bug three reviews kept
  // finding. Not offering the link is the root fix; the pages still handle 403
  // for anyone who types the URL.
  //
  // `minRole` mirrors the API gate on each surface. Overview and My profile are
  // deliberately open to every role.
  type NavItem = { key: AdminNavKey; label: string; href: string; icon: React.ReactNode; minRole?: string[] };

  const allMainNav: NavItem[] = [
    { key: 'overview',   label: 'Overview',   href: '/admin',            icon: <BarChart2 className="w-[18px] h-[18px]"/> },
    { key: 'inquiries',  label: 'Inquiries',  href: '/admin/inquiries',  icon: <AlertCircle className="w-[18px] h-[18px]"/>, minRole: SUPPORT_PLUS },
    { key: 'courses',    label: 'Courses',    href: '/admin/courses',    icon: <Building2 className="w-[18px] h-[18px]"/>, minRole: SUPPORT_PLUS },
    { key: 'messages',   label: 'Messages',   href: '/admin/messages',   icon: <MessageSquare className="w-[18px] h-[18px]"/>, minRole: SUPPORT_PLUS },
    { key: 'revenue',    label: 'Revenue',    href: '/admin/revenue',    icon: <DollarSign className="w-[18px] h-[18px]"/>, minRole: SUPPORT_PLUS },
    { key: 'golfers',    label: 'Golfers',    href: '/admin/golfers',    icon: <UserSearch className="w-[18px] h-[18px]"/>, minRole: SUPPORT_PLUS },
    { key: 'employees',  label: 'Employees',  href: '/admin/employees',  icon: <Users className="w-[18px] h-[18px]"/>, minRole: MANAGER_PLUS },
    { key: 'activity',   label: 'Activity',   href: '/admin/activity',   icon: <Activity className="w-[18px] h-[18px]"/>, minRole: SUPPORT_PLUS },
  ];

  const allBottomNav: NavItem[] = [
    { key: 'create',  label: 'Manual build', href: '/admin/create',   icon: <Hammer className="w-[18px] h-[18px]"/>, minRole: MANAGER_PLUS },
    { key: 'system',  label: 'System',       href: '/admin/system',  icon: <Wrench className="w-[18px] h-[18px]"/>, minRole: MANAGER_PLUS },
    { key: 'profile', label: 'My profile',   href: '/admin/profile',  icon: <UserCircle className="w-[18px] h-[18px]"/> },
  ];

  // Unknown role (still loading, or the lookup failed) shows everything: a nav
  // that silently removes ten links is a worse lie than one that offers a door
  // the API will refuse. Filtering starts only once the role is actually known.
  const canSee = (item: NavItem) => !item.minRole || role === null || item.minRole.includes(role);
  const mainNav = allMainNav.filter(canSee);
  const bottomNav = allBottomNav.filter(canSee);

  const w = collapsed ? 'w-14' : 'w-56';

  function NavItem({ item, badge }: { item: typeof mainNav[0]; badge?: React.ReactNode }) {
    const isActive = active === item.key;
    const cls = `w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 text-[13px] font-medium transition-colors text-left relative group ${
      isActive ? 'bg-white/10 text-paper rounded-md' : 'text-[#A9BFAF] hover:text-paper hover:bg-white/10 rounded-md'
    }`;
    return (
      // MP-8a: a real link — middle-click and cmd-click open a tab, the
      // browser shows the destination, and the nav works before hydration.
      <Link href={item.href} className={cls} title={collapsed ? item.label : undefined}>
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
        {!collapsed && badge}
        {collapsed && badge && (
          <span className="absolute top-1 right-1">{badge}</span>
        )}
        {collapsed && (
          <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 bg-ink text-paper text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
            {item.label}
          </span>
        )}
      </Link>
    );
  }

  const inquiriesBadge = pending > 0 ? (
    <span className="bg-warn text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none shrink-0">
      {pending > 99 ? '99+' : pending}
    </span>
  ) : undefined;

  const revenueBadge = moneyProblems > 0 ? (
    <span className="bg-bad text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none shrink-0" title={`${moneyProblems} failed charge${moneyProblems === 1 ? '' : 's'} to collect`}>
      {moneyProblems > 99 ? '99+' : moneyProblems}
    </span>
  ) : undefined;

  const messagesBadge = unread > 0 ? (
    <span className="bg-ok text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none shrink-0">
      {unread > 99 ? '99+' : unread}
    </span>
  ) : undefined;

  return (
    <>
    <CommandPalette/>
    <div className={`fixed left-0 top-0 h-full ${w} bg-pine flex flex-col z-10 transition-[width] duration-200 ease-in-out`}>
      {/* Wordmark / logo mark */}
      <div className={`${collapsed ? 'px-0 flex items-center justify-center' : 'px-5'} py-5 border-b border-white/10`}>
        {collapsed ? (
          <button onClick={openPalette} title="Search (Ctrl+K)" className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
            <Search className="w-4 h-4 text-paper"/>
          </button>
        ) : (
          <>
            <div className="flex justify-end mb-2">
              <button onClick={openPalette} title="Search (Ctrl+K)" className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                <Search className="w-3.5 h-3.5 text-[#A9BFAF]"/>
              </button>
            </div>
            <div className="text-center">
              <Image src="/brand/logo-lockup-cream-900.png" alt="GreenReserve" width={190} height={36} priority className="w-full h-auto" />
              <div className="text-[10px] text-[#A9BFAF] font-medium uppercase tracking-wider mt-1.5">Admin</div>
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {/* MP-2d B3: the nav is showing everything because it could not confirm
            the role. Say so rather than letting it look authoritative. */}
        {roleFailed && !collapsed && (
          <div className="mx-1 mb-2 rounded-md bg-white/10 px-2.5 py-2">
            <p className="text-[11px] text-[#A9BFAF] leading-snug">Couldn&rsquo;t confirm your access level.</p>
            <button
              onClick={() => { setRoleFailed(false); setRole(null); fetch('/api/admin/session').then(r => (r.ok ? r.json() : Promise.reject(new Error()))).then(d => setRole(String(d?.role ?? ''))).catch(() => setRoleFailed(true)); }}
              className="text-[11px] font-medium text-paper hover:underline mt-0.5"
            >
              Retry
            </button>
          </div>
        )}
        {mainNav.map(item => (
          <NavItem
            key={item.key}
            item={item}
            badge={item.key === 'inquiries' ? inquiriesBadge : item.key === 'messages' ? messagesBadge : item.key === 'revenue' ? revenueBadge : undefined}
          />
        ))}
      </nav>

      {/* Bottom cluster */}
      <div className="p-2 border-t border-white/10 space-y-0.5">
        {bottomNav.map(item => <NavItem key={item.key} item={item} />)}
        <button
          onClick={signOut}
          disabled={signingOut}
          className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2 text-[13px] text-[#A9BFAF] hover:text-paper hover:bg-white/10 rounded-md transition-colors disabled:opacity-50`}
          title={collapsed ? 'Sign out' : undefined}
        >
          {collapsed ? (
            <LogOut className="w-[18px] h-[18px]" />
          ) : (
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          )}
        </button>
        {signOutError && !collapsed && (
          <p className="px-3 pb-1 text-[11px] text-[#F0B6A6] leading-snug">
            Sign-out failed — you are still signed in. Check your connection and try again.
          </p>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        title={`${collapsed ? 'Expand' : 'Collapse'} sidebar ([)`}
        className="absolute -right-3 top-[72px] w-6 h-6 rounded-full bg-pine border border-white/20 flex items-center justify-center text-[#A9BFAF] hover:text-paper transition-colors z-20"
      >
        {collapsed ? <ChevronRight className="w-3 h-3"/> : <ChevronLeft className="w-3 h-3"/>}
      </button>
    </div>
    </>
  );
}
