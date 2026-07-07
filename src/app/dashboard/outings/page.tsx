'use client';
import { PartyPopper } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

export default function OutingsPage() {
  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="outings"/>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-lg bg-pine/10 flex items-center justify-center mx-auto mb-5">
            <PartyPopper className="w-6 h-6 text-pine"/>
          </div>
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-3">Outings — Coming Soon</h1>
          <p className="text-sm text-ink-soft leading-relaxed mb-8">
            For corporate outings, charity events, and large group bookings — block multiple consecutive tee times
            at once, take a single group payment, and manage the whole party from one reservation.
          </p>
          <a href="mailto:hello@greenreserve.app?subject=Outing tools interest"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md font-medium text-white text-[12.5px] bg-pine hover:bg-pine-hover transition-colors">
            Tell us what you need →
          </a>
        </div>
      </main>
    </div>
  );
}
