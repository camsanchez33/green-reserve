import { redirect } from 'next/navigation';

// Cam 2026-11-18: the member set-password invite is retired. A member signs in to their course with the emailed
// member link instead, so an old invite link lands on the course's member sign-in.
export default async function AcceptInvitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/courses/${encodeURIComponent(slug)}/member`);
}
