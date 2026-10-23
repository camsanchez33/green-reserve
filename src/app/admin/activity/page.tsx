import { redirect } from 'next/navigation';

// AW-12 (Cam 2026-10-23, "Retire it"): the cross-course Activity feed repeated
// each course's Timeline and Bookings tabs, and what the team did is on Audit.
// Old bookmarks land on Audit.
export default function ActivityRetired() {
  redirect('/admin/audit');
}
