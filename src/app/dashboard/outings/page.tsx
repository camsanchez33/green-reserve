import { redirect } from 'next/navigation';

// W2-9 (Cam 2026-10-22): the Tournaments and Outings placeholders became one Events tab.
export default function Page() { redirect('/dashboard/events'); }
