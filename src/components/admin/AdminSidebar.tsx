'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  Layers, BarChart2, AlertCircle, Building2, Hammer, Users,
  Radio, Activity, MessageSquare, UserCircle, ChevronLeft, ChevronRight,
  DollarSign, Search,
} from 'lucide-react';
import CommandPalette from '@/components/admin/CommandPalette';

export type AdminNavKey = 'overview' | 'inquiries' | 'courses' | 'create' | 'employees' | 'broadcasts' | 'activity' | 'messages' | 'profile' | 'revenue' | 'golfers';

const LS_KEY = 'admin-sidebar-collapsed';

export default function AdminSidebar({ active, pendingInquiries = 0, unreadMessages = 0 }: {
  active: AdminNavKey;
  pendingInquiries?: number;
  unreadMessages?: number;
}) {
  const router = useRouter();
  const [unread, setUnread] = useState(unreadMessages);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LS_KEY) === 'true';
  });

  useEffect(() => { setUnread(unreadMessages); }, [unreadMessages]);

  useEffect(() => {
    if (unreadMessages > 0) return;
    fetch('/api/admin/messages?unreadCount=1')
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(d => setUnread(d.count ?? 0))
      .catch(() => {});
  }, [unreadMessages]);

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

  async function signOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  const mainNav: { key: AdminNavKey; label: string; href: string; icon: React.ReactNode }[] = [
    { key: 'overview',   label: 'Overview',   href: '/admin',            icon: <BarChart2 className="w-[18px] h-[18px]"/> },
    { key: 'inquiries',  label: 'Inquiries',  href: '/admin/inquiries',  icon: <AlertCircle className="w-[18px] h-[18px]"/> },
    { key: 'courses',    label: 'Courses',    href: '/admin/courses',    icon: <Building2 className="w-[18px] h-[18px]"/> },
    { key: 'messages',   label: 'Messages',   href: '/admin/messages',   icon: <MessageSquare className="w-[18px] h-[18px]"/> },
    { key: 'revenue',    label: 'Revenue',    href: '/admin/revenue',    icon: <DollarSign className="w-[18px] h-[18px]"/> },
    { key: 'golfers',    label: 'Golfers',    href: '/admin/golfers',    icon: <Search className="w-[18px] h-[18px]"/> },
    { key: 'employees',  label: 'Employees',  href: '/admin/employees',  icon: <Users className="w-[18px] h-[18px]"/> },
    { key: 'broadcasts', label: 'Broadcasts', href: '/admin/broadcasts', icon: <Radio className="w-[18px] h-[18px]"/> },
    { key: 'activity',   label: 'Activity',   href: '/admin/activity',   icon: <Activity className="w-[18px] h-[18px]"/> },
  ];

  const bottomNav: { key: AdminNavKey; label: string; href: string; icon: React.ReactNode }[] = [
    { key: 'create',  label: 'Manual build', href: '/admin/create',   icon: <Hammer className="w-[18px] h-[18px]"/> },
    { key: 'profile', label: 'My profile',   href: '/admin/profile',  icon: <UserCircle className="w-[18px] h-[18px]"/> },
  ];

  const w = collapsed ? 'w-14' : 'w-56';

  function NavItem({ item, badge }: { item: typeof mainNav[0]; badge?: React.ReactNode }) {
    const isActive = active === item.key;
    const cls = `w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 text-[13px] font-medium transition-colors text-left relative group ${
      isActive ? 'bg-white/10 text-paper rounded-md' : 'text-[#A9BFAF] hover:text-paper hover:bg-white/10 rounded-md'
    }`;
    return (
      <button key={item.key} onClick={() => router.push(item.href)} className={cls} title={collapsed ? item.label : undefined}>
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
      </button>
    );
  }

  const inquiriesBadge = pendingInquiries > 0 ? (
    <span className="bg-warn text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none shrink-0">
      {pendingInquiries}
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
      <div className={`${collapsed ? 'px-0 justify-center' : 'px-5'} py-5 border-b border-white/10 flex items-center`}>
        {collapsed ? (
          <button onClick={openPalette} title="Search (Ctrl+K)" className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
            <Search className="w-4 h-4 text-paper"/>
          </button>
        ) : (
          <div className="flex items-center gap-2.5 w-full">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-paper"/>
            </div>
            <div className="flex-1">
              <div className="font-serif text-[15.5px] text-paper leading-tight">GreenReserve</div>
              <div className="text-[10px] text-[#A9BFAF] font-medium uppercase tracking-wider">Admin</div>
            </div>
            <button onClick={openPalette} title="Search (Ctrl+K)" className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors shrink-0">
              <Search className="w-3.5 h-3.5 text-[#A9BFAF]"/>
            </button>
          </div>
        )}
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {mainNav.map(item => (
          <NavItem
            key={item.key}
            item={item}
            badge={item.key === 'inquiries' ? inquiriesBadge : item.key === 'messages' ? messagesBadge : undefined}
          />
        ))}
      </nav>

      {/* Bottom cluster */}
      <div className="p-2 border-t border-white/10 space-y-0.5">
        {bottomNav.map(item => <NavItem key={item.key} item={item} />)}
        <button
          onClick={signOut}
          className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2 text-[13px] text-[#A9BFAF] hover:text-paper hover:bg-white/10 rounded-md transition-colors`}
          title={collapsed ? 'Sign out' : undefined}
        >
          {collapsed ? (
            <span className="text-[11px] font-medium">↪</span>
          ) : (
            <span>Sign out</span>
          )}
        </button>
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
