'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// MP-7a: Broadcasts live inside Messages now — a broadcast is a message
// inserted into every course's thread, so this page was a second door to the
// same room. Kept as a redirect so old links and muscle memory still land.
export default function BroadcastsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/messages?view=announcements'); }, [router]);
  return null;
}
