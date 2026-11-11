'use client';
import { SUPPORT_PLUS, MANAGER_PLUS, VIEWER_PLUS, OWNER_ONLY } from '@/lib/admin-roles';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import g from '@/app/admin/admin-glass.module.css';
import { setAdminTheme, currentAdminTheme, type AdminTheme } from '@/components/admin/admin-theme';
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
      })
      // The badges are hints, not the work: a failed fetch leaves them at 0 and every page still loads its own data.
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

  // ADMIN-REDO (Cam 2026-11-11, ADMIN_REDO_SPEC.md "Navigation"): Workspace ·
  // Financials · Management. Pages that don't exist yet show as "Soon" — never a
  // dead link. Every page that existed keeps a door (Goals, Team, Audit,
  // Security, Systems and Company docs sit under Settings). `minRole` + `area`
  // mirror each page's API gate (MP-2c, AW-11); the routes are the control.
  type NavItem = { key: AdminNavKey | null; label: string; href?: string; minRole?: string[]; sub?: boolean; area?: AdminArea };
  type NavGroup = { label: string; items: NavItem[] };

  const allGroups: NavGroup[] = [
    { label: 'Workspace', items: [
      { key: 'overview', label: 'Overview', href: '/admin' },
      { key: 'courses', label: 'Golf courses', href: '/admin/courses', minRole: VIEWER_PLUS, area: 'courses' },
      { key: 'groups', label: 'Course groups', href: '/admin/groups', minRole: SUPPORT_PLUS, sub: true, area: 'courses' },
      { key: 'inquiries', label: 'Onboarding', href: '/admin/inquiries', minRole: VIEWER_PLUS, area: 'pipeline' },
      { key: null, label: 'Bookings' },
      { key: 'golfers', label: 'Users & golfers', href: '/admin/golfers', minRole: SUPPORT_PLUS, area: 'golfers' },
    ] },
    { label: 'Financials', items: [
      { key: 'revenue', label: 'Revenue & payments', href: '/admin/revenue', minRole: SUPPORT_PLUS, area: 'money' },
      { key: null, label: 'Expenses' },
      { key: null, label: 'Financial analytics' },
    ] },
    { label: 'Management', items: [
      { key: null, label: 'Business analytics' },
      { key: 'problems', label: 'Support & issues', href: '/admin/problems', minRole: SUPPORT_PLUS, area: 'problems' },
      { key: 'messages', label: 'Messages', href: '/admin/messages', minRole: SUPPORT_PLUS, sub: true, area: 'messages' },
      { key: 'announcements', label: 'Announcements', href: '/admin/announcements', minRole: SUPPORT_PLUS, sub: true, area: 'messages' },
      { key: 'system', label: 'Platform activity', href: '/admin/system', minRole: MANAGER_PLUS, area: 'company' },
      // My profile is open to every login, so it sits outside the gate tables' pattern (admin-nav-test).
      { label: 'Settings', key: 'profile', href: '/admin/profile' },
      { key: 'employees', label: 'Team', href: '/admin/employees', minRole: MANAGER_PLUS, sub: true, area: 'company' },
      { key: 'goals', label: 'Goals', href: '/admin/goals', minRole: SUPPORT_PLUS, sub: true, area: 'company' },
      { key: 'audit', label: 'Audit', href: '/admin/audit', minRole: OWNER_ONLY, sub: true },
      { key: 'security', label: 'Security', href: '/admin/security', minRole: OWNER_ONLY, sub: true },
      { key: 'company', label: 'Company docs', href: '/admin/company-documents', minRole: OWNER_ONLY, sub: true },
    ] },
  ];

  // AW-11: the role says how much; the person's areas say where. Both must allow it (the routes check both too).
  const canSee = (minRole?: string[], area?: AdminArea) => (!minRole || minRole.includes(role)) && (!area || areas.includes(area));
  const groups = allGroups.map(grp => ({ ...grp, items: grp.items.filter(i => !i.href || canSee(i.minRole, i.area)) }))
    .filter(grp => grp.items.some(i => i.href));

  const count = (n: number, bad: boolean, title: string) => n > 0 ? (
    <span className={`${g.count} ${bad ? g.countBad : ''}`} title={title}>{n > 99 ? '99+' : n}</span>
  ) : undefined;
  const badges: Partial<Record<AdminNavKey, React.ReactNode>> = {
    problems: count(problems, true, `${problems} open problem${problems === 1 ? '' : 's'}`),
    inquiries: count(pending, false, `${pending} new inquir${pending === 1 ? 'y' : 'ies'}`),
    // MP-6a: failed charges and open chargebacks — money that should exist and does not.
    revenue: count(moneyProblems, true, `${moneyProblems} money problem${moneyProblems === 1 ? '' : 's'} — failed charges and open chargebacks`),
    messages: count(unread, false, `${unread} unread`),
  };

  // Phone: the rail slides in from the Menu button and closes on navigation.
  const [railOpen, setRailOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setRailOpen(false); }, [pathname]);

  const [theme, setTheme] = useState<AdminTheme>('light');
  useEffect(() => { setTheme(currentAdminTheme()); }, []);
  const pickTheme = (t: AdminTheme) => { setAdminTheme(t); setTheme(t); };

  // Cam 2026-11-11: no Quick actions button and no systems line — broken systems are rows in the Overview's Needs attention.
  const seesProblems = canSee(SUPPORT_PLUS, 'problems');

  return (
    <>
    <CommandPalette/>
    <aside className={`${g.rail} ${railOpen ? g.railOpen : ''}`} aria-label="Admin menu">
      <Link href="/admin" className={g.brand} aria-label="GreenReserve admin overview">
        {/* LOGO-2: the short mark (the golfer, cream on a pine square), never a drawn stand-in. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark.svg" alt="" width={34} height={34} className={g.mark} />
        <span><b>GreenReserve</b><small>Headquarters</small></span>
      </Link>

      <nav aria-label="Admin" className={g.nav}>
        {groups.map(grp => (
          <div key={grp.label} className={g.grp}>
            <div className={g.grpLabel}>{grp.label}</div>
            {grp.items.map(item => item.href && item.key ? (
              // MP-8a: a real link — middle-click opens a tab and the nav works before hydration.
              <Link key={item.key} href={item.href} aria-current={active === item.key ? 'page' : undefined}
                className={`${g.item} ${item.sub ? g.sub : ''} ${active === item.key ? g.on : ''}`}>
                <span>{item.label}</span>{badges[item.key]}
              </Link>
            ) : (
              <span key={item.label} className={g.soon} title="This page isn't built yet">{item.label}<em>Soon</em></span>
            ))}
          </div>
        ))}
      </nav>

      <div className={g.foot}>
        <div className={g.who}>{name || 'Signed in'} · {role}</div>
        <div className={g.footRow}>
          <div className={g.seg} role="group" aria-label="Theme">
            <button type="button" aria-pressed={theme === 'light'} onClick={() => pickTheme('light')}>Light</button>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => pickTheme('dark')}>Dark</button>
          </div>
          <button type="button" onClick={signOut} disabled={signingOut} className={g.btn}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        {signOutError && (
          <p role="alert" className={g.err}>Sign-out failed — you are still signed in. Check your connection and try again.</p>
        )}
      </div>
    </aside>

    <div className={g.top}>
      <button type="button" className={`${g.ibtn} ${g.glass} ${g.menuBtn}`} aria-label="Menu" aria-expanded={railOpen} onClick={() => setRailOpen(o => !o)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <button type="button" onClick={openPalette} className={`${g.search} ${g.glass}`} aria-label="Search or ask anything">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <span>Search courses, golfers, payments</span>
        <kbd>Ctrl K</kbd>
      </button>
      <span className={g.status} aria-hidden="true" />
      {seesProblems && (
        <Link href="/admin/problems" className={`${g.ibtn} ${g.glass}`} aria-label={problems > 0 ? `Alerts: ${problems} open` : 'Alerts: none open'}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" /></svg>
          {problems > 0 && <b aria-hidden="true">{problems > 99 ? '99+' : problems}</b>}
        </Link>
      )}
    </div>
    </>
  );
}
