// White-label rule: every golfer terminal screen (confirmation, cancellation,
// modification, check-in) headlines with the COURSE's own name on its own
// brandColor, never a generic icon — the golfer should never forget which
// course they're dealing with.
export function CourseHeaderBar({ courseName, accent }: { courseName: string; accent?: string }) {
  return (
    <div className="h-14 flex items-center px-6" style={{ backgroundColor: accent || '#24513B' }}>
      <span className="text-white font-medium">{courseName}</span>
    </div>
  );
}
