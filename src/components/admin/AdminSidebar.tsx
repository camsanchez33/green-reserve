'use client';
import { useRouter } from 'next/navigation';
import { Layers, BarChart2, AlertCircle, Building2, Plus, Users, Radio, Activity } from 'lucide-react';

export type AdminNavKey = 'overview' | 'inquiries' | 'courses' | 'create' | 'employees' | 'broadcasts' | 'activity';

export default function AdminSidebar({ active, pendingInquiries = 0 }: {
  active: AdminNavKey;
  pendingInquiries?: number;
}) {
  const router = useRouter();

  async function signOut() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  const nav: { key: AdminNavKey; label: string; href: string; icon: React.ReactNode; soon?: boolean }[] = [
    { key: 'overview',   label: 'Overview',   href: '/admin',            icon: <BarChart2 className="w-4 h-4"/> },
    { key: 'inquiries',  label: 'Inquiries',  href: '/admin/inquiries',  icon: <AlertCircle className="w-4 h-4"/> },
    { key: 'courses',    label: 'Courses',    href: '/admin/courses',    icon: <Building2 className="w-4 h-4"/> },
    { key: 'create',     label: 'Add Course', href: '/admin/create',     icon: <Plus className="w-4 h-4"/> },
    { key: 'employees',  label: 'Employees',  href: '/admin/employees',  icon: <Users className="w-4 h-4"/> },
    { key: 'broadcasts', label: 'Broadcasts', href: '/admin/broadcasts', icon: <Radio className="w-4 h-4"/> },
    { key: 'activity',   label: 'Activity',   href: '/admin/activity',   icon: <Activity className="w-4 h-4"/>, soon: true },
  ];

  return (
    <div className="fixed left-0 top-0 h-full w-56 bg-gray-900 border-r border-gray-800 flex flex-col z-10">
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Layers className="w-4 h-4 text-emerald-400"/>
          </div>
          <div>
            <div className="font-black text-sm text-white leading-tight">GreenReserve</div>
            <div className="text-[10px] text-gray-600 font-medium uppercase tracking-wider">Admin</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map(item => {
          const isActive = active === item.key;
          const cls = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
            isActive
              ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/20'
              : item.soon
                ? 'text-gray-700 border-transparent cursor-default'
                : 'text-gray-500 hover:text-white hover:bg-gray-800 border-transparent'
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
                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                  {pendingInquiries}
                </span>
              )}
              {item.soon && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-gray-700 px-1.5 py-0.5 bg-gray-800 rounded-full">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-800">
        <div className="text-[10px] text-gray-700 uppercase tracking-wider px-3 mb-1">Admin</div>
        <button
          onClick={signOut}
          className="w-full text-left text-xs text-gray-500 hover:text-gray-300 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
