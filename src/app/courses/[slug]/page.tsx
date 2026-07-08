import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import CourseDetailPage from './CourseBookingClient';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const course = await prisma.course.findUnique({
    where: { slug },
    select: { name: true, city: true, state: true, type: true },
  });
  if (!course) return { title: 'Book Tee Times — GreenReserve' };
  if (course.type === 'private') {
    return {
      title: `${course.name} — Member Portal | GreenReserve`,
      description: `${course.name} is a private club on GreenReserve. Members sign in to book tee times.`,
    };
  }
  return {
    title: `${course.name} — Book Tee Times | GreenReserve`,
    description: `Book tee times at ${course.name} in ${course.city}, ${course.state}. Online reservations powered by GreenReserve — direct booking, no middleman.`,
  };
}

export default function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  return <CourseDetailPage params={params} />;
}
