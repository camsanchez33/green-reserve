'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Broadcasts became Announcements (MP-7a), which has its own page since
// AW-8a. Kept as a redirect so old links still land.
export default function BroadcastsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/announcements'); }, [router]);
  return null;
}
