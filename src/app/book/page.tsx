import type { Metadata } from 'next';
import BookClient, { type BookInitial, type CourseInfo, type LiveTeeTime } from './BookClient';
import { loadPublicCourse } from '@/lib/public-course';
import { loadPublicTeeTimes } from '@/lib/public-tee-times';

export const metadata: Metadata = { title: 'Confirm your tee time', robots: { index: false, follow: false } };

// PERF-1 (strict speed check): the course and the tee time are loaded HERE, on
// the server, and ride in the first HTML. The page used to be client-only: an
// empty shell, then its JS, then two fetches, then the content — the booking
// page's LCP was the whole of that chain. Same data and error messages as the
// client path (BookClient), which is still used when this is skipped.
export default async function BookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const slug = one('course_slug'), teeTimeId = one('tee_time_id'), date = one('date');

  let initial: BookInitial;
  if (!slug || !teeTimeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    initial = { course: null, teeTime: null, error: 'Missing booking details.' };
  } else {
    const [course, times] = await Promise.all([loadPublicCourse(slug), loadPublicTeeTimes(slug, date)]);
    if (!course) initial = { course: null, teeTime: null, error: 'Course not found.' };
    else {
      const match = times.ok ? times.teeTimes.find(t => String(t.id) === teeTimeId) : undefined;
      initial = match
        ? { course: course as CourseInfo, teeTime: match as unknown as LiveTeeTime, error: '' }
        : { course: course as CourseInfo, teeTime: null, error: 'This tee time is no longer available. Please pick another.' };
    }
  }
  return <BookClient initial={initial} />;
}
