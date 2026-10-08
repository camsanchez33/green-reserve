import { Suspense } from 'react';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import CourseDetailPage from './CourseBookingClient';
import { loadPublicCourse } from '@/lib/public-course';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const course = await prisma.course.findUnique({
    where: { slug },
    select: { name: true, city: true, state: true, type: true },
  });
  const isDemo = DEMO_COURSE_SLUGS.includes(slug);
  const robots = isDemo ? { index: false, follow: false } : undefined;
  if (!course) return { title: 'Book Tee Times' };
  // PWA-1: "Add to Home Screen" saves the course as its own app (lib/course-app.ts).
  // Both routes 404 for a course golfers can't see, so a draft gets nothing.
  const app: Metadata = {
    manifest: `/courses/${encodeURIComponent(slug)}/manifest.webmanifest`,
    icons: { apple: `/courses/${encodeURIComponent(slug)}/app-icon/180` },
    appleWebApp: { capable: true, title: course.name, statusBarStyle: 'default' },
  };
  if (course.type === 'private') {
    return {
      title: `${course.name} — Member Portal`,
      description: `${course.name} is a private club on GreenReserve. Members sign in to book tee times.`,
      robots,
      ...app,
    };
  }
  return {
    title: `${course.name} — Book Tee Times`,
    description: `Book tee times at ${course.name} in ${course.city}, ${course.state}. Online reservations powered by GreenReserve — direct booking, no middleman.`,
    robots,
    ...app,
  };
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  // PERF-1: the course is in the first HTML. It used to be fetched after
  // hydration, behind a skeleton that then swapped out — that swap was the
  // page's layout shift, and waiting for it was most of its LCP.
  const { slug } = await params;
  const initialCourse = await loadPublicCourse(slug);
  return (
    <Suspense>
      <CourseDetailPage params={params} initialCourse={initialCourse} />
    </Suspense>
  );
}
