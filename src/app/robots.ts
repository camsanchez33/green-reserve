import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/dashboard', '/checkin', '/api'],
    },
    sitemap: 'https://greenreserve.app/sitemap.xml',
  };
}
