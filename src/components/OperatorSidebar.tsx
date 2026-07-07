'use client';
import { useRouter } from 'next/navigation';
import {
  Calendar, BarChart2, Clock, Users, Settings, LogOut, XCircle,
  Trophy, PartyPopper, DollarSign, AlertTriangle,
} from 'lucide-react';
import AnnouncementBanner from '@/components/AnnouncementBanner';

export type OperatorNavKey =
  | 'teesheet' | 'analytics' | 'cancellations' | 'tournaments' | 'outings'
  | 'schedule' | 'members' | 'payments' | 'settings';

function NavItem({ icon, label, active, onClick, danger, badge }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; danger?: boolean; badge?: string;
}) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
      danger   ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' :
      active   ? 'bg-white/15 text-white' :
                 'text-white/60 hover:bg-white/10 hover:text-white'
    }`}>
      <span className="w-4 h-4 shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge && <span className="text-[9px] font-bold uppercase tracking-wide bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full">{badge}</span>}
    </button>
  );
}

export default function OperatorSidebar({ active, courseName, onAlertClick }: {
  active: OperatorNavKey;
  courseName?: string;
  /** If provided (only the main /dashboard page does), opens the conditions modal in place. Otherwise navigates to /dashboard. */
  onAlertClick?: () => void;
}) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/dashboard/login');
  }

  return (
    <>
    <AnnouncementBanner />
    <aside className="w-56 shrink-0 bg-[#0f2218] flex flex-col h-full overflow-y-auto">
      <div className="px-4 py-5 border-b border-white/10">
        <div className="font-black text-lg text-white leading-none">
          Green<span className="text-green-400">Reserve</span>
        </div>
        {courseName && <div className="text-xs text-white/40 mt-1 truncate">{courseName}</div>}
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        <div className="text-xs font-semibold text-white/25 uppercase tracking-widest px-3 py-2">Dashboard</div>
        <NavItem icon={<Calendar className="w-4 h-4"/>} label="Tee Sheet"  active={active==='teesheet'}  onClick={() => router.push('/dashboard')} />
        <NavItem icon={<BarChart2 className="w-4 h-4"/>} label="Analytics" active={active==='analytics'} onClick={() => router.push('/dashboard?tab=analytics')} />

        <div className="text-xs font-semibold text-white/25 uppercase tracking-widest px-3 py-2 mt-3">Bookings</div>
        <NavItem icon={<XCircle className="w-4 h-4"/>}      label="Cancellations" active={active==='cancellations'} onClick={() => router.push('/dashboard/cancellations')} />
        <NavItem icon={<Trophy className="w-4 h-4"/>}       label="Tournaments"   active={active==='tournaments'}   onClick={() => router.push('/dashboard/tournaments')} badge="Soon" />
        <NavItem icon={<PartyPopper className="w-4 h-4"/>}  label="Outings"       active={active==='outings'}       onClick={() => router.push('/dashboard/outings')} badge="Soon" />

        <div className="text-xs font-semibold text-white/25 uppercase tracking-widest px-3 py-2 mt-3">Manage</div>
        <NavItem icon={<Clock className="w-4 h-4"/>}      label="Schedule" active={active==='schedule'} onClick={() => router.push('/dashboard/schedules')} />
        <NavItem icon={<Users className="w-4 h-4"/>}      label="Members"  active={active==='members'}  onClick={() => router.push('/dashboard/members')} />
        <NavItem icon={<DollarSign className="w-4 h-4"/>} label="Payments" active={active==='payments'} onClick={() => router.push('/dashboard/payments')} />
        <NavItem icon={<Settings className="w-4 h-4"/>}   label="Settings" active={active==='settings'} onClick={() => router.push('/dashboard/settings')} />

        <div className="pt-2">
          <NavItem icon={<AlertTriangle className="w-4 h-4"/>} label="Course Alert" onClick={onAlertClick || (() => router.push('/dashboard'))} />
        </div>
      </nav>

      <div className="p-3 border-t border-white/10">
        <NavItem icon={<LogOut className="w-4 h-4"/>} label="Sign Out" onClick={logout} danger />
      </div>
    </aside>
    </>
  );
}
