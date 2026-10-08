// PWA-1: the web-app manifest for one course's booking page, so "Add to Home
// Screen" saves it as the course's own app. See lib/course-app.ts.
import { NextResponse } from 'next/server';
import { loadCourseApp, APP_ICON_SIZES } from '@/lib/course-app';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await loadCourseApp(slug);
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const base = `/courses/${encodeURIComponent(course.slug)}`;
  return NextResponse.json({
    id: base,
    name: course.name,
    short_name: course.name,
    description: course.isPrivate ? `Members of ${course.name} book tee times here.` : `Book tee times at ${course.name}.`,
    start_url: base,
    // The whole site, so booking, check-in and the golfer's account stay inside
    // the saved app instead of bouncing out to the browser.
    scope: '/',
    display: 'standalone',
    background_color: '#FAFAF7',
    theme_color: course.color,
    icons: APP_ICON_SIZES.filter(s => s !== 180).map(s => ({ src: `${base}/app-icon/${s}`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' })),
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } });
}
