import { Suspense } from 'react';
import { OG_BASE } from '@/lib/seo';
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
    select: { name: true, city: true, state: true, type: true, isTest: true, heroPhotoUrl: true, logoUrl: true, photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } } },
  });
  const isDemo = DEMO_COURSE_SLUGS.includes(slug);
  if (!course) return { title: 'Book Tee Times' };
  // TEST-2: a test course's page works by link (screenshots, trying things) but is never indexed.
  const robots = isDemo || course.isTest ? { index: false, follow: false } : undefined;
  if (course.type === 'private') {
    return {
      title: `${course.name} — Member Portal`,
      description: `${course.name} is a private club on GreenReserve. Members sign in to book tee times.`,
      robots,
    };
  }
  const title = `${course.name} — Book Tee Times`;
  const description = `Book tee times at ${course.name} in ${course.city}, ${course.state}. Online reservations powered by GreenReserve — direct booking, no middleman.`;
  // A shared link previews as the course: its name and its own photo (or logo).
  const image = course.heroPhotoUrl || course.photos[0]?.url || course.logoUrl;
  return {
    title, description, robots,
    openGraph: { ...OG_BASE, title, description, url: `/courses/${slug}`, ...(image ? { images: [{ url: image, alt: course.name }] } : {}) },
    twitter: { card: 'summary_large_image', title, description, ...(image ? { images: [image] } : {}) },
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
