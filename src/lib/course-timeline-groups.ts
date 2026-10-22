// BRAIN-1b: the course timeline's four kinds of event and its row shape —
// client-safe (no database), shared by lib/course-timeline.ts and the course
// page's Timeline tab.
export type FeedGroup = 'bookings' | 'messages' | 'changes' | 'problems';
export const FEED_GROUPS: { key: FeedGroup; label: string }[] = [
  { key: 'bookings', label: 'Bookings & payments' },
  { key: 'messages', label: 'Messages & emails' },
  { key: 'changes', label: 'Admin & staff changes' },
  { key: 'problems', label: 'Problems & onboarding' },
];

export type FeedItem = {
  id: string; at: string; group: FeedGroup;
  title: string; detail?: string; who?: string; tone?: 'ok' | 'warn' | 'bad';
};
