import type { Metadata } from 'next';
import HomeContent from './HomeContent';

export const metadata: Metadata = {
  // absolute title: the root template would append " | GreenReserve" twice
  title: { absolute: 'GreenReserve — Free Online Tee Sheet for Golf Courses' },
  description: 'Free online tee sheet for golf courses. Golfers book on a page with your course’s name and colors; your staff run the day from one tee sheet.',
};

// HOME-2: the FAQ (and its FAQPage JSON-LD) moved to /teesheet with the rest
// of the detail — structured data has to describe questions the page shows.
export default function HomePage() {
  return <HomeContent />;
}
