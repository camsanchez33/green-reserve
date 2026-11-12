import { redirect } from 'next/navigation';

// The hourly check's problem list moved to Overview's Needs attention (Cam 2026-11-12, with Course support): each
// problem is one line there with its course and age, and opens in place with Go to it. This address keeps working.
export default function ProblemsPage() {
  redirect('/admin');
}
