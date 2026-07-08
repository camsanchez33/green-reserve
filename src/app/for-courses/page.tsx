import type { Metadata } from 'next';
import { Suspense } from 'react';
import ForCoursesContent from './ForCoursesContent';

export const metadata: Metadata = {
  title: 'List Your Course Free — GreenReserve',
  description: 'Get your golf course on GreenReserve for free. No monthly fees, no commission on green fees. We build your online booking page — golfers pay $1.50/player, you keep 100%.',
};

export default function ForCoursesPage() {
  return (
    <Suspense>
      <ForCoursesContent />
    </Suspense>
  );
}
