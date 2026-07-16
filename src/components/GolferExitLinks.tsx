import Link from 'next/link';

// Rule: no golfer screen is a dead end — every terminal state (cancellation
// confirmed, check-in complete, modification saved, etc.) offers both the
// per-course portal and a way back to the course's own page.
export function GolferExitLinks({ courseSlug, courseName, accent }: {
  courseSlug: string; courseName: string; accent?: string;
}) {
  return (
    <div className="space-y-3">
      <Link
        href={`/courses/${courseSlug}/account`}
        className="block w-full py-3 rounded-md font-medium text-white text-sm text-center transition-colors"
        style={{ backgroundColor: accent || '#24513B' }}
      >
        View My Bookings
      </Link>
      <Link href={`/courses/${courseSlug}`} className="block text-center text-sm text-ink-muted hover:text-ink-soft transition-colors">
        Back to {courseName}
      </Link>
    </div>
  );
}
