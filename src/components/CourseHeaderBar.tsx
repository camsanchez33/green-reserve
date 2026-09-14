// White-label rule: every golfer terminal screen (confirmation, cancellation,
// modification, check-in) headlines with the COURSE's own name on its own
// brandColor, never a generic icon — the golfer should never forget which
// course they're dealing with.
// `right` is for a quiet document label (e.g. "Receipt") on the far side of
// the bar — never a second brand.
export function CourseHeaderBar({ courseName, accent, right }: {
  courseName: string; accent?: string; right?: React.ReactNode;
}) {
  return (
    <div className="h-14 flex items-center justify-between gap-4 px-6" style={{ backgroundColor: accent || '#24513B' }}>
      <span className="text-white font-serif font-medium text-lg leading-none tracking-tight truncate">{courseName}</span>
      {right && <span className="text-white/70 text-sm shrink-0">{right}</span>}
    </div>
  );
}
