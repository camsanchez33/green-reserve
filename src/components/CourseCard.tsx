import Link from 'next/link';
import { MapPin, Star } from 'lucide-react';
import type { Course } from '@/lib/courses-data';

const TYPE_LABELS: Record<string, string> = {
  public:         'Public',
  private:        'Private',
  'semi-private': 'Semi-Private',
  member:         'Member / Guest',
  resident:       'Resident',
  resort:         'Resort',
  municipal:      'Municipal',
};

function getSpecialBadge(course: Course): string | null {
  if (course.rating >= 4.8 && course.review_count >= 200) return 'Top Rated';
  if (course.base_green_fee > 0 && course.base_green_fee <= 35) return 'Best Value';
  if (course.rating >= 4.5 && course.review_count < 150) return 'Hidden Gem';
  if (course.type === 'resort') return 'Premium';
  return null;
}

export default function CourseCard({ course }: { course: Course }) {
  const typeLabel = TYPE_LABELS[course.type] ?? TYPE_LABELS.public;
  const specialBadge = getSpecialBadge(course);
  const membersOnly = course.type === 'member' || course.type === 'private';

  return (
    <Link href={`/courses/${course.slug}`} className="block group">
      <div className="bg-white rounded-lg border border-line overflow-hidden transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-line-strong">

        {/* Header image */}
        <div
          className="h-44 relative flex flex-col justify-between p-4"
          style={{ background: course.image_gradient }}
        >
          {/* Texture overlay */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.5) 0,rgba(255,255,255,.5) 1px,transparent 0,transparent 50%)',
              backgroundSize: '12px 12px',
            }}
          />

          {/* Top row: special badge + holes */}
          <div className="relative flex items-center justify-between">
            {specialBadge ? (
              <span className="text-[10px] font-medium uppercase tracking-[0.06em] px-2.5 py-1 rounded-full bg-white/90 text-ink">
                {specialBadge}
              </span>
            ) : <span />}
            <span className="text-white/70 text-xs font-medium bg-black/20 px-2 py-0.5 rounded-full">
              {course.holes}H · Par {course.par}
            </span>
          </div>

          {/* Bottom row: type label */}
          <div className="relative">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/80">
              {typeLabel}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          <h3 className="font-serif font-medium text-ink text-lg leading-tight mb-1 line-clamp-1">
            {course.name}
          </h3>
          <p className="text-ink-muted text-sm mb-3 flex items-center gap-1">
            <MapPin size={12} className="flex-shrink-0" />
            {course.city}, {course.state}
          </p>

          {/* Rating */}
          <div className="flex items-center gap-1.5 mb-4">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(i => (
                <Star
                  key={i}
                  size={12}
                  className={i <= Math.round(course.rating) ? 'fill-[#c9a84c] text-[#c9a84c]' : 'fill-line text-line'}
                />
              ))}
            </div>
            <span className="text-ink text-sm font-medium">{course.rating.toFixed(1)}</span>
            <span className="text-ink-faint text-xs">({course.review_count.toLocaleString()} reviews)</span>
          </div>

          {/* Price + CTA */}
          <div className="flex items-center justify-between pt-3 border-t border-line-soft">
            {membersOnly ? (
              <div>
                <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Access</span>
                <div className="font-medium text-ink-soft text-sm">Members only</div>
              </div>
            ) : course.base_green_fee > 0 ? (
              <div>
                <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">From</span>
                <div className="font-serif font-medium text-ink text-xl leading-tight">
                  ${course.base_green_fee}
                  <span className="text-ink-muted font-sans font-normal text-xs ml-1">/ player</span>
                </div>
              </div>
            ) : (
              <div>
                <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Rates</span>
                <div className="font-medium text-ink-soft text-sm">On request</div>
              </div>
            )}
            <span className="text-xs font-medium text-white px-4 py-2 rounded-md bg-pine transition-colors group-hover:bg-pine-hover">
              {membersOnly ? 'Members →' : 'Tee Times →'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
