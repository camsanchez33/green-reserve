// Inquiries: the word lists the course page shows (from lib/outreach, which is client-safe) and how a touch reads.
export { OWNER_TYPES, BOOKING_METHODS, FIT_TAGS, CONTACT_ROLES } from '@/lib/outreach';

/** OutreachTouch.channel → the word on the page (TOUCH_CHANNELS in lib/inquiry-status). */
export const TOUCH_LABEL: Record<string, string> = { call: 'Call', email: 'Email', text: 'Text', in_person: 'Visit' };
