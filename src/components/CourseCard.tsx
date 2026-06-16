import Link from 'next/link';
import { MapPin, Star } from 'lucide-react';
import type { Course } from '@/lib/courses-data';

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  public:       { label: 'Public',         className: 'bg-emerald-100 text-emerald-800' },
  'semi-private': { label: 'Semi-Private', className: 'bg-amber-100 text-amber-800' },
  member:       { label: 'Member / Guest', className: 'bg-violet-100 text-violet-800' },
  resident:     { label: 'Resident',       className: 'bg-blue-100 text-blue-800' },
  resort:       { label: 'Resort',         className: 'bg-pink-100 text-pink-800' },
  municipal:    { label: 'Municipal',      className: 'bg-gray-100 text-gray-700' },
};

export default function CourseCard({ course }: { course: Course }) {
  const badge = TYPE_BADGES[course.type] ?? TYPE_BADGES.public;

  return (
    <Link href={`/courses/${course.slug}`} className="block group">
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:border-emerald-100">
        {/* Header image */}
        <div
          className="h-32 relative flex items-end p-4"
          style={{ background: course.image_gradient }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 0,transparent 50%)',
              backgroundSize: '14px 14px',
            }}
          />
          <span className={`relative text-xs font-semibold px-2.5 py-1 rounded-full ${badge.className}`}>
            {badge.label}
          </span>
          <span className="absolute top-4 right-4 text-white/40 text-xs">
            {course.holes} holes · Par {course.par}
          </span>
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
                  size={13}
                  className={i <= Math.round(course.rating) ? 'fill-[#c9a84c] text-[#c9a84c]' : 'fill-gray-200 text-gray-200'}
                />
              ))}
            </div>
            <span className="text-gray-700 text-sm font-semibold">{course.rating.toFixed(1)}</span>
            <span className="text-gray-400 text-xs">({course.review_count.toLocaleString()})</span>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            {course.type === 'member' ? (
              <span className="text-[#1b4332] font-bold text-sm">Member Rates</span>
            ) : course.base_green_fee > 0 ? (
              <span className="text-[#1b4332] font-bold text-sm">
                From ${course.base_green_fee} <span className="text-gray-400 font-normal text-xs">/ player</span>
              </span>
            ) : (
              <span className="text-[#1b4332] font-bold text-sm">See Rates</span>
            )}
            <span className="text-xs font-semibold text-[#1b4332] bg-[#f0fdf4] px-3 py-1.5 rounded-lg group-hover:bg-[#1b4332] group-hover:text-white transition-colors">
              {course.type === 'member' ? 'View Details →' : 'See Tee Times →'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
