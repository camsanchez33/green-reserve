import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicCourse } from '@/lib/public-course';
import LoginClient, { type LoginCourse } from './LoginClient';

export const metadata: Metadata = { title: 'Log in', robots: { index: false, follow: false } };

// Log in (Cam 2026-11-18, lanes/golfer.md item 2): the one per-course log-in, a 6-digit code by email
// (POST /api/member/<slug>/send-code mode 'code', then verify-code). No GreenReserve golfer account exists.
export default async function LoginPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const course = await loadPublicCourse(slug);
  if (!course) notFound();
  const back = typeof sp.back === 'string' ? sp.back : '';
  // An old emailed log-in link that failed comes here from the member page (?link=failed).
  const linkFailed = sp.link === 'failed';
  return <LoginClient course={course as LoginCourse} back={back} linkFailed={linkFailed} />;
}
