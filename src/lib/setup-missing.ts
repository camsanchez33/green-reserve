// What is still missing from a course's booking page, each with the Settings
// section that fixes it. ONE list read by Settings ("Finish setting up"), the
// dashboard Home card and the onboarding page review (Cam 2026-10-27: skipped
// photos "should be pointed to finish setting up in settings on their homepage").
// Client-safe: no Prisma or Node imports. A null count means "not loaded" and
// never reports the item missing.

export type MissingKey = 'logo' | 'hero' | 'description' | 'phone' | 'gallery' | 'teesets' | 'holes' | 'payments';
/** href: where the fix lives when it isn't a Settings section. */
export type MissingItem = { key: MissingKey; title: string; why: string; action: string; section: string; href?: string };

const ITEMS: Record<MissingKey, Omit<MissingItem, 'key'>> = {
  logo: { title: 'Add your logo', why: 'It sits beside your name on your booking page and every email.', action: 'Add logo', section: 'Your course' },
  hero: { title: 'Add a course photo', why: 'The wide banner at the top of your booking page.', action: 'Add photo', section: 'Your course' },
  description: { title: 'Describe your course', why: 'A few sentences golfers read before they book.', action: 'Write it', section: 'Your course' },
  phone: { title: 'Add your phone number', why: 'Golfers call it with questions about their booking.', action: 'Add phone', section: 'Your course' },
  gallery: { title: 'Add gallery photos', why: 'Up to 8 photos in the Photos section of your booking page.', action: 'Add photos', section: 'Your course' },
  teesets: { title: 'Add your tees', why: 'Golfers see each tee’s yardage, rating and slope on your booking page.', action: 'Add tees', section: 'Course layout' },
  holes: { title: 'Say how many holes and the par', why: 'Shown at the top of your booking page.', action: 'Set it', section: 'Course layout' },
  // Launch walk (Cam 2026-10-31): the one thing that blocks going live, never on the booking-page list itself.
  payments: { title: 'Connect payments', why: 'Your course can’t go live until card payments reach your bank.', action: 'Connect', section: 'Payouts', href: '/dashboard/money?tab=payouts' },
};

/** The tee sheet's not-live banner, once the page is approved but payments aren't connected. */
export const PAYMENTS_BLOCK_LIVE = 'You approved your page. Connect payments in Money → Payouts to go live.';

/** Home's checklist: payments first when Stripe isn't connected, then the booking-page items. */
export const paymentsMissing = (stripeActive: boolean): MissingItem[] => stripeActive ? [] : [{ key: 'payments', ...ITEMS.payments }];

export type SetupFacts = {
  logoUrl?: unknown; heroImageUrl?: unknown; description?: unknown; phone?: unknown;
  holes?: unknown; par?: unknown; galleryCount: number | null; teeSetCount: number | null;
};

const blank = (v: unknown) => !String(v ?? '').trim();

export function missingSetup(f: SetupFacts): MissingItem[] {
  const keys: MissingKey[] = [];
  if (blank(f.logoUrl)) keys.push('logo');
  if (blank(f.heroImageUrl)) keys.push('hero');
  if (blank(f.description)) keys.push('description');
  if (blank(f.phone)) keys.push('phone');
  if (f.galleryCount === 0) keys.push('gallery');
  if (f.teeSetCount === 0) keys.push('teesets');
  if (!f.holes || !f.par) keys.push('holes');
  return keys.map(key => ({ key, ...ITEMS[key] }));
}

/** The Settings link that fixes an item, for pages outside Settings. */
export const settingsHref = (section: string) => `/dashboard/settings?section=${encodeURIComponent(section)}`;
