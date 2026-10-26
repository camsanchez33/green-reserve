import type { Metadata } from 'next';
import { previewFor } from '@/lib/seo';
import ForCoursesContent from './ForCoursesContent';
import { calcomBookingUrl } from '@/lib/calcom';

export const metadata: Metadata = {
  title: 'List Your Course Free',
  description: 'Get your golf course on GreenReserve for free. No setup fee, no monthly fee, no commission on your green fees. We build your online booking page.',
  // Link previews carry this page's own title, not the homepage's.
  ...previewFor('List Your Course Free | GreenReserve', 'Get your golf course on GreenReserve for free. No setup fee, no monthly fee, no commission on your green fees. We build your online booking page.'),
};

export default function ForCoursesPage() {
  // The public Cal.com event link — the same for every visitor, so the thanks
  // page's 'Pick a call time' reveals nothing about any inquiry (FB-1 review).
  return <ForCoursesContent calBookingUrl={calcomBookingUrl()} />;
}
