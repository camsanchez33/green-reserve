'use client';
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

export default function TournamentsPage() {
  const [courseName, setCourseName] = useState('');

  useEffect(() => {
    fetch('/api/operator/courses').then(r => r.json()).then(c => { if (c?.name) setCourseName(c.name); });
  }, []);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <OperatorSidebar active="tournaments" courseName={courseName} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#1b4332] flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-3">Tournaments — Coming Soon</h1>
          <p className="text-gray-500 leading-relaxed mb-8">
            We're building tools to run shotgun-start and tee-time-block tournaments directly on your tee sheet —
            group registration, flighting, and payment collection from one entry fee per player.
          </p>
          <a href="mailto:hello@greenreserve.app?subject=Tournament tools interest"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-bold text-white text-sm bg-[#1b4332] hover:bg-[#2d6a4f]">
            Tell us what you need →
          </a>
        </div>
      </main>
    </div>
  );
}
