'use client';
import Image from 'next/image';
import Link from 'next/link';
import OperatorSidebar from '@/components/OperatorSidebar';

export default function TournamentsPage() {
  const prefill = encodeURIComponent("I'd like to use Tournament tools for my course — here's what I need: ");
  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="tournaments"/>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-4">Tournaments</div>
          <Image src="/brand/birdie-sitting.png" alt="" width={96} height={135} className="mx-auto mb-5" />
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-3">Birdie&apos;s working on this one.</h1>
          <p className="text-sm text-ink-soft leading-relaxed mb-8">
            Shotgun-start and tee-time-block tournaments, with group registration, flighting, and one entry fee per player.
          </p>
          <Link href={`/dashboard/messages?prefill=${prefill}`}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md font-medium text-white text-[12.5px] bg-pine hover:bg-pine-hover transition-colors">
            Tell us what your course needs →
          </Link>
        </div>
      </main>
    </div>
  );
}
