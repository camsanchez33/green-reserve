// SD-8 — Payments merged into /dashboard/money. This path stays alive because
// the tee sheet, the operator emails and every bookmark point at it; it keeps
// the query string so ?date= still lands on the right day.
import { redirect } from 'next/navigation';

export default async function PaymentsRedirect({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') q.set(k, v);
    else if (Array.isArray(v) && v[0]) q.set(k, v[0]);
  }
  q.set('tab', 'payments');
  redirect(`/dashboard/money?${q.toString()}`);
}
