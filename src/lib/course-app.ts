// PWA-1 (PLATFORM_ROADMAP_SPEC §8): a course's booking page saved to a phone's
// home screen opens like the course's own app — its name, its colour, its logo.
// The manifest (/courses/[slug]/manifest.webmanifest) and the icon
// (/courses/[slug]/app-icon/[size]) read the course through here; only a course
// golfers can see (lib/public-course's rule) has either.
import { prisma } from '@/lib/prisma';

export const APP_ICON_SIZES = [180, 192, 512] as const;
const DEFAULT_COLOR = '#24513B'; // Course.brandColor's schema default

export async function loadCourseApp(slug: string) {
  const c = await prisma.course.findUnique({
    where: { slug },
    select: { name: true, slug: true, brandColor: true, logoUrl: true, active: true, liveStatus: true, archivedAt: true },
  });
  if (!c || !c.active || c.liveStatus !== 'live' || c.archivedAt) return null;
  return { name: c.name, slug: c.slug, color: safeHex(c.brandColor), logoUrl: c.logoUrl };
}

/** A #rgb/#rrggbb colour, or the default — the value lands in CSS and JSON. */
export function safeHex(v: string | null | undefined): string {
  return v && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) ? v.trim() : DEFAULT_COLOR;
}

/** "Pebble Creek Golf Club" → "PC": up to two initials, skipping filler words. */
export function initials(name: string): string {
  const skip = new Set(['the', 'of', 'at', 'and', '&', 'golf', 'club', 'course', 'country', 'cc', 'gc', 'links']);
  const words = name.split(/\s+/).filter(Boolean);
  const useful = words.filter(w => !skip.has(w.toLowerCase()));
  const pick = (useful.length ? useful : words).slice(0, 2);
  return pick.map(w => w[0]!.toUpperCase()).join('') || 'G';
}

/**
 * The course's uploaded logo as a data URL the icon renderer can draw, or null.
 * Only our own Blob store is fetched (the upload route is the only writer we
 * trust; this keeps the server from fetching an arbitrary URL), only PNG/JPEG
 * (the renderer can't draw WebP), at most 2 MB, within 3 seconds. Anything else
 * falls back to the initials.
 */
export async function logoDataUrl(logoUrl: string): Promise<string | null> {
  let u: URL;
  try { u = new URL(logoUrl); } catch { return null; }
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.public.blob.vercel-storage.com')) return null;
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!res.ok || (type !== 'image/png' && type !== 'image/jpeg')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2_000_000) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
