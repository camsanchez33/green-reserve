// PWA-1: the home-screen icon for one course — its logo on white, or its
// initials on its brand colour when there is no logo we can draw. Opaque on
// purpose: iOS paints a transparent icon black. See lib/course-app.ts.
import { ImageResponse } from 'next/og';
import { loadCourseApp, logoDataUrl, initials, APP_ICON_SIZES } from '@/lib/course-app';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; size: string }> }) {
  const { slug, size: raw } = await params;
  const size = Number(raw);
  if (!(APP_ICON_SIZES as readonly number[]).includes(size)) return new Response('Not found', { status: 404 });
  const course = await loadCourseApp(slug);
  if (!course) return new Response('Not found', { status: 404 });
  const logo = course.logoUrl ? await logoDataUrl(course.logoUrl) : null;
  const pad = Math.round(size * 0.14);
  return new ImageResponse(
    logo ? (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', padding: pad }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    ) : (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: course.color, color: '#FFFFFF', fontSize: Math.round(size * 0.42), letterSpacing: Math.round(size * -0.01) }}>
        {initials(course.name)}
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
