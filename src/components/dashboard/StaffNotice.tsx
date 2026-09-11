'use client';
// SD-11 (from the SD review). Staff run the tee sheet (SD-1); the sidebar hides
// the configuration tabs from them, but the pages are still reachable by URL
// and rendered a fully editable form whose Save then 403'd. Say it up front.
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';

export function StaffNotice({ what = 'these settings' }: { what?: string }) {
  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/operator/my-courses')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.isStaff) setIsStaff(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!isStaff) return null;
  return (
    <div role="status" className="mx-6 mt-6 bg-paper border border-line rounded-lg px-4 py-3 text-sm text-ink-soft flex items-start gap-2.5">
      <Lock className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
      <span>You are signed in as staff. You can look at {what}, but changing them needs the course operator&apos;s login — any save here will be refused.</span>
    </div>
  );
}
