import Link from 'next/link';
import type { ReactNode } from 'react';
import { describePolicy, policyFrom, type CancelPolicy } from '@/lib/cancel-policy';

// GOLFER-REDO (Cam 2026-11-11): the header and footer a course's page wears on
// BOTH tabs (Tee times, Course info). No hooks and no 'use client', so the Course
// info page renders it on the server and Google reads it.

export const TYPE_LABELS: Record<string, string> = {
  public: 'Public',
  private: 'Private Club',
  'semi-private': 'Semi-Private',
  member: 'Member / Guest',
  resident: 'Resident',
  resort: 'Resort',
  municipal: 'Municipal',
};

export type FrameCourse = {
  name: string;
  slug: string;
  type: string;
  city?: string;
  state?: string;
  holes?: number;
  par?: number;
  address?: string;
  phone?: string;
  website?: string;
  logo_url?: string;
  hero_image_url?: string;
  review_count?: number;
  rating?: number;
  cancellation_hours?: number;
  late_cancellation_fee?: number;
  cancel_policy?: CancelPolicy;
};

function initials(name: string) {
  return name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/** Only http(s) links render as links (a course's website is typed by the course). */
function safeUrl(u?: string) {
  return u && /^https?:\/\//i.test(u) ? u : '';
}

export function CourseHeader({
  course, accent, active, right, showTabs = true, tabsBase,
}: {
  course: FrameCourse;
  accent: string;
  active: 'times' | 'info';
  /** top-right of the banner: the member / sign-in link on the booking tab */
  right?: ReactNode;
  showTabs?: boolean;
  tabsBase?: string;
}) {
  const base = tabsBase ?? `/courses/${course.slug}`;
  const details = [
    TYPE_LABELS[course.type] ?? 'Public',
    [course.city, course.state].filter(Boolean).join(', '),
    course.holes ? `${course.holes} holes` : '',
    course.par ? `Par ${course.par}` : '',
  ].filter(Boolean);
  const hasPhoto = !!course.hero_image_url;
  return (
    <header>
      <div
        className={`relative overflow-hidden ${hasPhoto ? 'h-48 sm:h-72' : 'h-24 sm:h-28'}`}
        style={hasPhoto ? { backgroundImage: `url(${course.hero_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundColor: accent }}
      >
        {hasPhoto && <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/30" aria-hidden="true" />}
        {right}
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative -mt-12 sm:-mt-14 flex flex-wrap items-start gap-x-5 gap-y-3">
          {course.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={course.logo_url} alt={`${course.name} logo`} width={112} height={112}
              className="h-24 w-24 sm:h-28 sm:w-28 rounded-lg bg-white object-contain p-2 shadow-card ring-4 ring-paper shrink-0" />
          ) : (
            <span className="h-24 w-24 sm:h-28 sm:w-28 rounded-lg bg-white shadow-card ring-4 ring-paper shrink-0 flex items-center justify-center" aria-hidden="true">
              <span className="h-[72px] w-[72px] sm:h-[88px] sm:w-[88px] rounded-full flex items-center justify-center text-white font-serif font-semibold text-[28px] sm:text-[34px]" style={{ backgroundColor: accent }}>{initials(course.name)}</span>
            </span>
          )}
          <div className="flex-1 min-w-[240px] pt-0 sm:pt-16">
            <h1 className="font-serif font-semibold text-ink text-[32px] sm:text-[44px] leading-[1.05] text-balance">{course.name}</h1>
            <p className="mt-2 text-sm text-ink-muted flex flex-wrap gap-x-3 gap-y-1">
              {details.map((d, i) => <span key={i}>{d}</span>)}
              {(course.review_count ?? 0) > 0 && <span>{(course.rating ?? 0).toFixed(1)} ★ ({course.review_count!.toLocaleString()})</span>}
            </p>
          </div>
          <div className="sm:pt-[68px]">
            <a href={active === 'times' ? '#times' : base}
              className="inline-flex items-center rounded-lg px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}>
              Find a tee time
            </a>
          </div>
        </div>
        {showTabs && (
          <nav className="mt-6 flex gap-5 border-b border-line" aria-label={`${course.name} sections`}>
            {([['times', 'Tee times', base], ['info', 'Course info', `${base}/info`]] as const).map(([key, label, href]) => (
              <Link key={key} href={href} aria-current={active === key ? 'page' : undefined}
                className={`-mb-px border-b-2 px-1 py-2.5 text-[15px] font-semibold transition-colors ${active === key ? 'text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
                style={active === key ? { borderColor: accent } : undefined}>
                {label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}

export function CourseFooter({ course, accent }: { course: FrameCourse; accent: string }) {
  const directionsUrl = course.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(course.address)}` : '';
  const site = safeUrl(course.website);
  // The policy wording is describePolicy()'s alone; this only picks the course's own policy to describe.
  const policy = course.cancel_policy ?? policyFrom({
    cancellationHours: course.cancellation_hours ?? 24,
    lateCancellationFeeCents: Math.round((course.late_cancellation_fee ?? 0) * 100),
  });
  const { headline } = describePolicy(policy);
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid gap-6 sm:grid-cols-3 text-sm">
        <div className="space-y-1.5">
          <div className="font-serif font-semibold text-ink text-lg leading-none mb-2">{course.name}</div>
          {course.address && <div className="text-ink-soft">{course.address}</div>}
          {course.phone && <a href={`tel:${course.phone}`} className="block text-ink-soft hover:text-ink">{course.phone}</a>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" style={{ color: accent }}>Get directions</a>}
            {site && <a href={site} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" style={{ color: accent }}>Course website</a>}
          </div>
        </div>
        <div>
          <div className="font-semibold text-ink mb-1.5">Cancellation policy</div>
          <p className="text-ink-soft leading-relaxed">{headline}</p>
        </div>
        <div className="space-y-1.5">
          <div className="font-semibold text-ink mb-1.5">Legal</div>
          <Link href="/privacy" className="block text-ink-soft hover:text-ink">Privacy</Link>
          <Link href="/terms" className="block text-ink-soft hover:text-ink">Terms</Link>
        </div>
      </div>
      <div className="border-t border-line-soft py-3 text-center text-[11px] text-ink-faint">Booking powered by GreenReserve</div>
    </footer>
  );
}
