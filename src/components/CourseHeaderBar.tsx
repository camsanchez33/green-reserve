// White-label rule: every golfer terminal screen (confirmation, cancellation,
// modification, check-in) headlines with the COURSE's own name on its own
// brandColor, never a generic icon — the golfer should never forget which
// course they're dealing with.
// `right` is for a quiet document label (e.g. "Receipt") on the far side of
// the bar — never a second brand.
// PERS-1 (Cam 2026-10-05): the course's own photo and logo travel with it.
// With a photo the bar becomes a short photo band (a scrim darkens the bottom
// so the white name reads — the gradient-ban exemption for scrims); without
// one it stays the flat accent bar. Nothing new for the course to set up:
// these are the same uploads its course page already uses.
export function CourseHeaderBar({ courseName, accent, right, photoUrl, logoUrl }: {
  courseName: string; accent?: string; right?: React.ReactNode;
  photoUrl?: string | null; logoUrl?: string | null;
}) {
  const bg = accent || '#173B2A';
  const logo = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" className="w-9 h-9 rounded-md bg-white object-contain p-0.5 shrink-0" />
  ) : null;
  if (photoUrl) {
    return (
      <div className="relative h-32 sm:h-36 flex items-end" style={{ backgroundColor: bg, backgroundImage: `url(${JSON.stringify(photoUrl).slice(1, -1)})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(10,12,10,0.05), rgba(10,12,10,0.6))' }} aria-hidden="true" />
        <div className="relative w-full flex items-end justify-between gap-4 px-6 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            {logo}
            <span className="text-white font-serif text-[26px] leading-none truncate">{courseName}</span>
          </div>
          {right && <span className="text-white/80 text-sm shrink-0">{right}</span>}
        </div>
        <div className="absolute bottom-0 inset-x-0 h-1" style={{ backgroundColor: bg }} aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="h-14 flex items-center justify-between gap-4 px-6" style={{ backgroundColor: bg }}>
      <div className="flex items-center gap-3 min-w-0">
        {logo && <span className="[&>img]:w-8 [&>img]:h-8">{logo}</span>}
        <span className="text-white font-serif font-semibold text-lg leading-none tracking-tight truncate">{courseName}</span>
      </div>
      {right && <span className="text-white/70 text-sm shrink-0">{right}</span>}
    </div>
  );
}
