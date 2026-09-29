'use client';

// MP-12 (ADMIN_V4 V4-9): split out of admin/courses/[id]/page.tsx, which had
// grown to 2,700 lines and 52 useState in one component. Moved verbatim; state
// and handlers come from useCourseDetail() via useCourse(). The page renders the tabs only once the course has loaded, so detail and c are non-null here.
import { createContext, useContext } from 'react';
import type { CourseDetailState } from './useCourseDetail';
import type { CourseDetail } from './shared';

export type CourseCtx = Omit<CourseDetailState, 'detail' | 'c'> & { detail: CourseDetail; c: CourseDetail['course'] };

export const CourseDetailContext = createContext<CourseCtx | null>(null);

export function useCourse(): CourseCtx {
  const v = useContext(CourseDetailContext);
  if (!v) throw new Error('useCourse() used outside <CourseDetailContext.Provider>');
  return v;
}
