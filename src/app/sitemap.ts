import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';

// SD-7: robots.txt has advertised /sitemap.xml since launch and it 404'd —
// there was no sitemap. Static public pages plus every course page a golfer
// can actually reach: live, not archived, not private (members-only portals
// carry noindex), not a demo.
const BASE = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const statics: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/for-courses`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/operator-agreement`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];

  let courses: { slug: string; updatedAt: Date }[] = [];
  try {
    courses = await prisma.course.findMany({
      where: {
        active: true, liveStatus: 'live', archivedAt: null,
        type: { not: 'private' },
        ...(DEMO_COURSE_SLUGS.length ? { slug: { notIn: DEMO_COURSE_SLUGS } } : {}),
      },
      select: { slug: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });
  } catch (err) {
    // A sitemap with only the static pages beats a 500 — crawlers retry.
    console.error('sitemap: course query failed', err);
  }

  return [
    ...statics,
    ...courses.map(c => ({ url: `${BASE}/courses/${c.slug}`, lastModified: c.updatedAt, changeFrequency: 'daily' as const, priority: 0.8 })),
  ];
}
