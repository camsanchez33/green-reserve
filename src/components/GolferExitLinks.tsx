import Link from 'next/link';

// Rule: no golfer screen is a dead end — every terminal state (cancellation
// confirmed, check-in complete, modification saved, etc.) offers a way back to
// the course's own page. Cam 2026-11-18: no golfer accounts, so no "View my
// bookings" portal link; a booking is managed from its emailed link.
export function GolferExitLinks({ courseSlug, courseName }: {
  courseSlug: string; courseName: string; accent?: string;
}) {
  return (
    <div className="space-y-3">
      <Link href={`/courses/${courseSlug}`} className="block text-center text-sm text-ink-soft hover:text-ink transition-colors">
        Back to {courseName}
      </Link>
    </div>
  );
}
