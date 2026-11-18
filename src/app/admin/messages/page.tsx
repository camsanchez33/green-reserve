import { redirect } from 'next/navigation';

// The old Messages screen is retired (Cam 2026-11-18): Course support is the messages tab. Old links and emails still
// land: ?id= (a support chat) and ?courseId= (that course's chats) carry over; ?view=announcements went to Announcements.
export default async function MessagesRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  if (one(sp.view) === 'announcements') redirect('/admin/announcements');
  const id = one(sp.id), courseId = one(sp.courseId);
  redirect(id ? `/admin/support?id=${encodeURIComponent(id)}` : courseId ? `/admin/support?courseId=${encodeURIComponent(courseId)}` : '/admin/support');
}
