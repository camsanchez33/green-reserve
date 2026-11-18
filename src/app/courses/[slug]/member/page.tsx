import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicCourse } from '@/lib/public-course';
import type { LoginCourse } from '../login/LoginClient';
import YourCourseClient from './YourCourseClient';

export const metadata: Metadata = { title: 'Your course', robots: { index: false, follow: false } };

// Your <Course> (Cam 2026-11-18, lanes/golfer.md item 6): only the membership and the upcoming bookings, each opening
// its manage page. No statements, no dues, no booking here (members book on the course page with their rate).
export default async function YourCoursePage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const course = await loadPublicCourse(slug);
  if (!course) notFound();
  // An old emailed log-in link that failed lands here with ?error=…; the log-in page says so in one line.
  const linkFailed = typeof sp.error === 'string' && sp.error !== '';
  return <YourCourseClient course={course as LoginCourse} linkFailed={linkFailed} />;
}
