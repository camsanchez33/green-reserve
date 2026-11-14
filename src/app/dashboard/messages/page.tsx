// SUPPORT-1 (Cam 2026-11-12): Messages is now Support (/dashboard/support). Old links — emails' "reply" buttons, the
// assistant's pointers, feature-request links with ?prefill= — keep working: they land on Support with their query.
import { redirect } from 'next/navigation';

export default async function OperatorMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, x);
  const qs = q.toString();
  redirect(`/dashboard/support${qs ? `?${qs}` : ''}`);
}
