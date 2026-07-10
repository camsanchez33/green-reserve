import { Suspense } from 'react';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { verifyPreviewToken } from '@/lib/preview-token';
import CourseDetailPage from '@/app/courses/[slug]/CourseBookingClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { courseId } = await params;
  const { token } = await searchParams;

  if (!token) {
    return <PreviewError message="No preview token provided." />;
  }

  const tokenCourseId = await verifyPreviewToken(token);
  if (!tokenCourseId || tokenCourseId !== courseId) {
    return <PreviewError message="This preview link is invalid or has expired." />;
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { slug: true, name: true },
  });
  if (!course) {
    return <PreviewError message="Course not found." />;
  }

  const resolvedParams = Promise.resolve({ slug: course.slug });
  const previewMode = { courseId, token };

  return (
    <Suspense>
      <CourseDetailPage params={resolvedParams} previewMode={previewMode} />
    </Suspense>
  );
}

function PreviewError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-8">
      <div className="max-w-sm w-full text-center">
        <div className="text-ink font-medium mb-2">Preview unavailable</div>
        <div className="text-ink-soft text-sm">{message}</div>
      </div>
    </div>
  );
}
