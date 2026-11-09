'use client';
// DRAWER-1 follow-up (no-silent-failures audit, 2026-11-09): a cash, reader or register payment refused because the
// register isn't open used to show only a passing toast. This stays on screen until dismissed and says how to fix it:
// the server's own sentence and a link to the Pro shop, where the register is opened. Pages that ARE the register
// pass onRefused instead of a link, so they can bring their Open card back.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { REGISTER_CLOSED_EVENT } from '@/lib/dashboard-fetch';

export function RegisterClosedNotice({ onRefused }: { onRefused?: () => void }) {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const on = (e: Event) => { setMsg((e as CustomEvent<string>).detail || 'Open the register before taking payments.'); onRefused?.(); };
    window.addEventListener(REGISTER_CLOSED_EVENT, on);
    return () => window.removeEventListener(REGISTER_CLOSED_EVENT, on);
  }, [onRefused]);
  if (!msg) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-warn/5 border border-warn/20 rounded-md px-4 py-3 text-[13.5px] text-ink">
      <span>{msg}</span>
      <span className="flex items-center gap-4">
        {!onRefused && <Link href="/dashboard/shop" className="font-medium text-pine hover:underline underline-offset-4">Open the register</Link>}
        <button type="button" onClick={() => setMsg('')} className="text-[13px] text-ink-soft hover:text-ink">Dismiss</button>
      </span>
    </div>
  );
}
