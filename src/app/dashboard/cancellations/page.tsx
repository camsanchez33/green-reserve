// SD-8 — Cancellations merged into /dashboard/money. This path stays alive for
// bookmarks and for staff, whose sidebar still names this surface.
import { redirect } from 'next/navigation';

export default async function CancellationsRedirect({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') q.set(k, v);
    else if (Array.isArray(v) && v[0]) q.set(k, v[0]);
  }
  q.set('tab', 'cancellations');
  redirect(`/dashboard/money?${q.toString()}`);
}
