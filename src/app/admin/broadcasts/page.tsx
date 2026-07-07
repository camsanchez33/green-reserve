'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Radio } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

export default function BroadcastsPage() {
  const router = useRouter();

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) router.push('/admin/login');
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar active="broadcasts" />
      <div className="ml-56 flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <Radio className="w-6 h-6 text-gray-600"/>
          </div>
          <div className="text-lg font-black text-gray-500">Broadcasts</div>
          <div className="text-sm text-gray-700 mt-1">Coming soon</div>
        </div>
      </div>
    </div>
  );
}
