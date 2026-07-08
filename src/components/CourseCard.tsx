import Link from 'next/link';
import { MapPin, Star } from 'lucide-react';
import type { Course } from '@/lib/courses-data';

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  public:         { label: 'Public',         className: 'bg-emerald-100 text-emerald-800' },
  private:        { label: 'Private',        className: 'bg-gray-100 text-gray-700' },
  'semi-private': { label: 'Semi-Private',   className: 'bg-amber-100 text-amber-800' },
  member:         { label: 'Member / Guest', className: 'bg-violet-100 text-violet-800' },
  resident:       { label: 'Resident',       className: 'bg-blue-100 text-blue-800' },
  resort:         { label: 'Resort',         className: 'bg-pink-100 text-pink-800' },
  municipal:      { label: 'Municipal',      className: 'bg-gray-100 text-gray-700' },
};

function getSpecialBadge(course: Course): string | null {
  if (course.rating >= 4.8 && course.review_count >= 200) return 'Top Rated';
  if (course.base_green_fee > 0 && course.base_green_fee <= 35) return 'Best Value';
  if (course.rating >= 4.5 && course.review_count < 150) return 'Hidden Gem';
  if (course.type === 'resort') return 'Premium';
  return null;
}

export default function CourseCard({ course }: { course: Course }) {
  const badge = TYPE_BADGES[course.type] ?? TYPE_BADGES.public;
  const specialBadge = getSpecialBadge(course);

  return (
    <Link href={`/courses/${course.slug}`} className="block group">
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-xl group-hover:border-emerald-100">

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
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#c9a84c] text-white shadow-sm">
                {specialBadge}
              </span>
            ) : <span />}
            <span className="text-white/50 text-xs font-medium bg-black/20 px-2 py-0.5 rounded-full">
              {course.holes}H · Par {course.par}
            </span>
          </div>

          {/* Bottom row: type badge */}
          <div className="relative">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          <h3 className="font-bold text-gray-900 text-base mb-1 group-hover:text-[#1b4332] transition-colors line-clamp-1">
            {course.name}
          </h3>
          <p className="text-gray-400 text-sm mb-3 flex items-center gap-1">
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
                  className={i <= Math.round(course.rating) ? 'fill-[#c9a84c] text-[#c9a84c]' : 'fill-gray-200 text-gray-200'}
                />
              ))}
            </div>
            <span className="text-gray-800 text-sm font-bold">{course.rating.toFixed(1)}</span>
            <span className="text-gray-400 text-xs">({course.review_count.toLocaleString()} reviews)</span>
          </div>

          {/* Price + CTA */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-50">
            {(course.type === 'member' || course.type === 'private') ? (
              <div>
                <span className="text-xs text-gray-400">Access</span>
                <div className="font-bold text-gray-700 text-sm">Members only</div>
              </div>
            ) : course.base_green_fee > 0 ? (
              <div>
                <span className="text-xs text-gray-400">From</span>
                <div className="font-black text-[#1b4332] text-lg leading-tight">
                  ${course.base_green_fee}
                  <span className="text-gray-400 font-normal text-xs ml-1">/ player</span>
                </div>
              </div>
            ) : (
              <div>
                <span className="text-xs text-gray-400">Rates</span>
                <div className="font-bold text-gray-700 text-sm">On request</div>
              </div>
            )}
            <span className="text-xs font-bold text-white px-4 py-2 rounded-xl transition-all group-hover:shadow-md group-hover:-translate-y-0.5"
              style={{ background: '#1b4332' }}>
              {(course.type === 'member' || course.type === 'private') ? 'Members →' : 'Tee Times →'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
