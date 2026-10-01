import type { Metadata } from 'next';
import { faqJsonLd } from '@/lib/faq';
import HomeContent from './HomeContent';

export const metadata: Metadata = {
  // absolute title: the root template would append " | GreenReserve" twice
  title: { absolute: 'GreenReserve — Free Online Tee Sheet for Golf Courses' },
  // §0.6: the fee claim is frozen behind LQ-2 — it left the page in H-1 and leaves the metadata here.
  description: 'Free online tee sheet for golf courses. Golfers book on a page with your course’s name and colors; your staff run the day from one tee sheet.',
};

export default function HomePage() {
  // SD-7: FAQPage structured data from the same array the FAQ section renders.
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />
      <HomeContent />
    </>
  );
}
