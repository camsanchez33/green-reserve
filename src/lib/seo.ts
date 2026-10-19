// Link previews (Walk 1, 2026-10-19). A page that sets its own `openGraph`
// REPLACES the root layout's wholesale in Next's metadata merge, so every page
// that names its own preview spreads OG_BASE to keep the site name and the
// default card image (src/app/opengraph-image.tsx).
import type { Metadata } from 'next';

export const OG_BASE: { type: 'website'; siteName: string; locale: string; images: { url: string; width?: number; height?: number; alt: string }[] } = {
  type: 'website',
  siteName: 'GreenReserve',
  locale: 'en_US',
  images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'GreenReserve — The tee sheet your course deserves.' }],
};

/** openGraph + twitter for a page's own title and description, with the default card. */
export function previewFor(title: string, description: string): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: { ...OG_BASE, title, description },
    twitter: { card: 'summary_large_image', title, description },
  };
}
