import { Suspense } from 'react';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import CourseDetailPage from './CourseBookingClient';

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
  if (!course) return { title: 'Book Tee Times — GreenReserve' };
  if (course.type === 'private') {
    return {
      title: `${course.name} — Member Portal | GreenReserve`,
      description: `${course.name} is a private club on GreenReserve. Members sign in to book tee times.`,
      robots,
    };
  }
  return {
    title: `${course.name} — Book Tee Times | GreenReserve`,
    description: `Book tee times at ${course.name} in ${course.city}, ${course.state}. Online reservations powered by GreenReserve — direct booking, no middleman.`,
    robots,
  };
}

export default function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense>
      <CourseDetailPage params={params} />
    </Suspense>
  );
}
