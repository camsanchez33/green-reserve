import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import MainOffset from '@/components/MainOffset';

// UI-B (Cam 2026-09-30, "I like B"): one variable family for the whole PUBLIC
// look — Figtree, heavy for headlines, regular for body. It replaced Fraunces +
// Inter (two files → one). --font-serif points at the same family in
// globals.css, so existing `font-serif` headings render in Figtree; the staff
// look re-points both variables to its own fonts and is unaffected.
const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// SD-7: metadataBase makes every relative OG/canonical URL absolute (without
// it Next warns and social crawlers get a bare path); the template gives
// child pages "Page — GreenReserve" for free; openGraph/twitter defaults mean
// a shared link renders a card (src/app/opengraph-image.tsx) instead of a URL.
const SITE_URL = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
// Fee copy per legal/LQ-2_FEE_COPY.md — no "keep 100%" claim, in metadata either.
const DESCRIPTION = 'Free online tee sheet for golf courses. Golfers book on a page that looks like your course; you run the sheet, check-ins and payments.';

// env(safe-area-inset-*) only resolves with viewport-fit=cover — the dashboard's
// bottom nav and toasts pad for the home indicator.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'GreenReserve — Online Tee Sheet for Golf Courses', template: '%s | GreenReserve' },
  description: DESCRIPTION,
  applicationName: 'GreenReserve',
  openGraph: {
    type: 'website', siteName: 'GreenReserve', locale: 'en_US', url: SITE_URL,
    title: 'GreenReserve — Online Tee Sheet for Golf Courses', description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: 'GreenReserve — Online Tee Sheet for Golf Courses', description: DESCRIPTION },
  // './' resolves per path; '/' would have told search engines every page IS the homepage.
  alternates: { canonical: './' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="font-sans bg-paper text-ink antialiased">
        <Nav />
        <MainOffset>{children}</MainOffset>
        <Footer />
      </body>
    </html>
  );
}
