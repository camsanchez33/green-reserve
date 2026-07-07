'use client';
import { Trophy } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

export default function TournamentsPage() {
  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="tournaments"/>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-lg bg-pine/10 flex items-center justify-center mx-auto mb-5">
            <Trophy className="w-6 h-6 text-pine"/>
          </div>
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-3">Tournaments — Coming Soon</h1>
          <p className="text-sm text-ink-soft leading-relaxed mb-8">
            We&apos;re building tools to run shotgun-start and tee-time-block tournaments directly on your tee sheet —
            group registration, flighting, and payment collection from one entry fee per player.
          </p>
          <a href="mailto:hello@greenreserve.app?subject=Tournament tools interest"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md font-medium text-white text-[12.5px] bg-pine hover:bg-pine-hover transition-colors">
            Tell us what you need →
          </a>
        </div>
      </main>
    </div>
  );
}
