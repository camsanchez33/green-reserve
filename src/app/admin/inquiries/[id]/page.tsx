'use client';
// /admin/inquiries/[id] — one inquiry. While the course is in outreach (Target to Call booked) it is the outreach
// course page (Cam approved the mockup 2026-11-17). Once it said yes (or for any inquiry that came in through the form),
// the same address stays the full inquiry record that Onboarding, Golf courses, Messages, the checks and the emails link
// to (InquiryRecord, unchanged), so no link breaks. Courses closed as Not now open on the record too, where Restore is.
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import g from '../../admin-glass.module.css';
import iq from '../inquiries.module.css';
import InquiryRecord from './InquiryRecord';
import { OutreachCourse, type Course } from './OutreachCourse';
import { api, LoadError, type Res } from '../shared';

function Pick() {
  const { id } = useParams() as { id: string };
  const [r, setR] = useState<Res<Course> | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setR(await api<Course>(`/api/admin/outreach/${encodeURIComponent(id)}`));
    setBusy(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Not in outreach (or not found here): the record page decides, with its own loading and errors.
  if (r && ((r.ok && !r.data.inOutreach) || (!r.ok && r.status === 404))) return <InquiryRecord />;
  return (
    <>
      <AdminSidebar active="outreach" />
      <main className={g.main}>
        <div className={iq.col}>
          {!r && <div className={`${g.glass} ${iq.skel}`} aria-busy="true" aria-label="Loading the course" />}
          {r && !r.ok && <LoadError error={r.error} status={r.status} retry={load} busy={busy} />}
          {r && r.ok && <OutreachCourse course={r.data} reload={load} />}
        </div>
      </main>
    </>
  );
}

export default function InquiryPage() {
  return (
    <Suspense fallback={null}>
      <Pick />
    </Suspense>
  );
}
