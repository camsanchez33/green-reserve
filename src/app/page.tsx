import type { Metadata } from 'next';
import HomeContent from './HomeContent';

export const metadata: Metadata = {
  title: 'GreenReserve — Free Online Tee Sheet for Golf Courses',
  description: 'Free online booking platform for golf courses. Set up your tee sheet in minutes. Golfers book direct — you keep 100% of green fees. $0/month, no commission.',
};

export default function HomePage() {
  return <HomeContent />;
}
