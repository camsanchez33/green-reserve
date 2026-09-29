import type { Metadata } from 'next';
import ForCoursesContent from './ForCoursesContent';
import { calcomBookingUrl } from '@/lib/calcom';

export const metadata: Metadata = {
  title: 'List Your Course Free',
  description: 'Get your golf course on GreenReserve for free. No monthly fees, no commission on green fees. We build your online booking page — golfers pay $1.50/player on top of your price.',
};

export default function ForCoursesPage() {
  // The public Cal.com event link — the same for every visitor, so the thanks
  // page's 'Pick a call time' reveals nothing about any inquiry (FB-1 review).
  return <ForCoursesContent calBookingUrl={calcomBookingUrl()} />;
}
