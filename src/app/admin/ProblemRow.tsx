'use client';

import { useState } from 'react';
import Link from 'next/link';
import { canOpenAdminHref, whoCanOpen } from '@/components/admin/admin-href';
import g from './admin-glass.module.css';

const TZ = 'America/New_York';

/** A problem from the hourly check (it lives here, not on its own page): course, when it opened, what it says, where to fix it. */
export type ProblemInfo = { course: string | null; courseId: string | null; openedAt: string; detail: string; goTo: string };
/** "now", "3h", "2d": how long a problem has been open. */
const openFor = (iso: string, now = Date.now()) => {
  const m = Math.floor((now - new Date(iso).getTime()) / 60_000);
  return m < 60 ? `${Math.max(0, m)}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};

/** One problem in Needs attention: tap to open it in place, then Go to it (or the course, or who can). */
export default function ProblemRow({ text, p, role, areas }: { text: string; p: ProblemInfo; role: string; areas: readonly string[] }) {
  const [open, setOpen] = useState(false);
  // AW-11, as the Problems page did: Go to it only when this login can open the page; else the course; else who can.
  const go = canOpenAdminHref(p.goTo, role, areas) ? { href: p.goTo, label: 'Go to it' }
    : p.courseId && canOpenAdminHref(`/admin/courses/${p.courseId}`, role, areas) ? { href: `/admin/courses/${p.courseId}`, label: 'Open course' } : null;
  return (
    <div className={g.prob}>
      <button type="button" className={g.li} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className={`${g.d} ${g.dbad}`} />
        <span className={g.lt}>{text}{p.course && <span className={g.lsub}>{p.course}</span>}</span>
        <span className={g.lw} title={`Open since ${new Date(p.openedAt).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}>{openFor(p.openedAt)}</span>
      </button>
      {open && (
        <div className={g.pdet}>
          {p.detail && <p>{p.detail}</p>}
          {go ? <Link href={go.href} className={g.act}>{go.label}</Link> : <span className={g.lw}>{whoCanOpen(p.goTo)}</span>}
        </div>
      )}
    </div>
  );
}
