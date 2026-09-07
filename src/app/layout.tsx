import type { Metadata } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import MainOffset from '@/components/MainOffset';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-sans',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-serif',
  display: 'swap',
});

// SD-7: metadataBase makes every relative OG/canonical URL absolute (without
// it Next warns and social crawlers get a bare path); the template gives
// child pages "Page — GreenReserve" for free; openGraph/twitter defaults mean
// a shared link renders a card (src/app/opengraph-image.tsx) instead of a URL.
const SITE_URL = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
const DESCRIPTION = 'Free online booking platform for golf courses. Set up your tee sheet in minutes. Golfers book direct — you keep 100% of green fees.';

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
  alternates: { canonical: '/' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans bg-paper text-ink antialiased">
        <Nav />
        <MainOffset>{children}</MainOffset>
        <Footer />
      </body>
    </html>
  );
}
