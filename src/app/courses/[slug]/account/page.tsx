import { redirect } from 'next/navigation';

// Cam 2026-11-18: no GreenReserve-wide golfer accounts yet. Sign-in is per course (members and other groups the
// course defines); everyone else books as a guest and manages a booking from its emailed link. Old links to the
// golfer portal land on the course's member sign-in.
export default async function AccountPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/courses/${encodeURIComponent(slug)}/member`);
}
