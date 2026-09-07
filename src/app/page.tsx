import type { Metadata } from 'next';
import { faqJsonLd } from '@/lib/faq';
import HomeContent from './HomeContent';

export const metadata: Metadata = {
  // absolute title: the root template would append " | GreenReserve" twice
  title: { absolute: 'GreenReserve — Free Online Tee Sheet for Golf Courses' },
  description: 'Free online booking platform for golf courses. Set up your tee sheet in minutes. Golfers book direct — you keep 100% of green fees. $0/month, no commission.',
};

export default function HomePage() {
  // SD-7: FAQPage structured data from the same array the accordion renders.
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />
      <HomeContent />
    </>
  );
}
