'use client';
import { useEffect, useState } from 'react';
import { PartyPopper } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

export default function OutingsPage() {
  const [courseName, setCourseName] = useState('');

  useEffect(() => {
    fetch('/api/operator/courses').then(r => r.json()).then(c => { if (c?.name) setCourseName(c.name); });
  }, []);

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <OperatorSidebar active="outings" courseName={courseName} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <div className="w-16 h-16 rounded-lg bg-emerald-600 flex items-center justify-center mx-auto mb-6">
            <PartyPopper className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white mb-3">Outings — Coming Soon</h1>
          <p className="text-gray-400 leading-relaxed mb-8">
            For corporate outings, charity events, and large group bookings — block multiple consecutive tee times
            at once, take a single group payment, and manage the whole party from one reservation.
          </p>
          <a href="mailto:hello@greenreserve.app?subject=Outing tools interest"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-bold text-white text-sm bg-emerald-600 hover:bg-emerald-500">
            Tell us what you need →
          </a>
        </div>
      </main>
    </div>
  );
}
