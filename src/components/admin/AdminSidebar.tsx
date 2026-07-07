'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Layers, BarChart2, AlertCircle, Building2, Plus, Users, Radio, Activity, MessageSquare, UserCircle } from 'lucide-react';

export type AdminNavKey = 'overview' | 'inquiries' | 'courses' | 'create' | 'employees' | 'broadcasts' | 'activity' | 'messages' | 'profile';

export default function AdminSidebar({ active, pendingInquiries = 0, unreadMessages = 0 }: {
  active: AdminNavKey;
  pendingInquiries?: number;
  unreadMessages?: number;
}) {
  const router = useRouter();
  const [unread, setUnread] = useState(unreadMessages);

  useEffect(() => { setUnread(unreadMessages); }, [unreadMessages]);

  // Fetch unread count independently when not provided by caller
  useEffect(() => {
    if (unreadMessages > 0) return; // caller already has it
    fetch('/api/admin/messages?unreadCount=1')
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(d => setUnread(d.count ?? 0))
      .catch(() => {});
  }, [unreadMessages]);

  async function signOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  const nav: { key: AdminNavKey; label: string; href: string; icon: React.ReactNode; soon?: boolean }[] = [
    { key: 'overview',   label: 'Overview',   href: '/admin',            icon: <BarChart2 className="w-4 h-4"/> },
    { key: 'inquiries',  label: 'Inquiries',  href: '/admin/inquiries',  icon: <AlertCircle className="w-4 h-4"/> },
    { key: 'courses',    label: 'Courses',    href: '/admin/courses',    icon: <Building2 className="w-4 h-4"/> },
    { key: 'messages',   label: 'Messages',   href: '/admin/messages',   icon: <MessageSquare className="w-4 h-4"/> },
    { key: 'create',     label: 'Add Course', href: '/admin/create',     icon: <Plus className="w-4 h-4"/> },
    { key: 'employees',  label: 'Employees',  href: '/admin/employees',  icon: <Users className="w-4 h-4"/> },
    { key: 'broadcasts', label: 'Broadcasts', href: '/admin/broadcasts', icon: <Radio className="w-4 h-4"/> },
    { key: 'activity',   label: 'Activity',   href: '/admin/activity',   icon: <Activity className="w-4 h-4"/> },
    { key: 'profile',    label: 'My profile', href: '/admin/profile',    icon: <UserCircle className="w-4 h-4"/> },
  ];

  return (
    <div className="fixed left-0 top-0 h-full w-56 bg-pine flex flex-col z-10">
      {/* Wordmark */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-paper"/>
          </div>
          <div>
            <div className="font-serif text-[15.5px] text-paper leading-tight">GreenReserve</div>
            <div className="text-[10px] text-[#A9BFAF] font-medium uppercase tracking-wider">Admin</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map(item => {
          const isActive = active === item.key;
          const cls = `w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium transition-colors text-left ${
            isActive
              ? 'bg-white/10 text-paper'
              : item.soon
                ? 'text-[#A9BFAF]/40 cursor-default'
                : 'text-[#A9BFAF] hover:text-paper hover:bg-white/10'
          }`;
          return (
            <button
              key={item.key}
              onClick={() => !item.soon && router.push(item.href)}
              className={cls}
              disabled={item.soon}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.key === 'inquiries' && pendingInquiries > 0 && (
                <span className="bg-warn text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none">
                  {pendingInquiries}
                </span>
              )}
              {item.key === 'messages' && unread > 0 && (
                <span className="bg-ok text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
              {item.soon && (
                <span className="text-[9px] font-medium uppercase tracking-wide text-[#A9BFAF]/50">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <button
          onClick={signOut}
          className="w-full text-left text-[13px] text-[#A9BFAF] hover:text-paper px-3 py-2 hover:bg-white/10 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
