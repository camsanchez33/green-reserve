// Tracks which operator dashboard tabs a device has visited — used to derive
// "Look around your dashboard" / "Check your tee sheet schedule" in the
// Getting Started checklist (V13). Per-device (localStorage) is fine; this
// is a nudge, not a record of truth.
import type { OperatorNavKey } from '@/components/OperatorSidebar';

const VISITED_KEY = 'gr_operator_visited_tabs';
const INTRO_SEEN_PREFIX = 'gr_operator_intro_seen_';

// The tabs "Look around your dashboard" counts toward — excludes "Soon"
// placeholders (Tournaments/Outings) since operators can't actually visit them.
export const CORE_TABS: OperatorNavKey[] = [
  'teesheet', 'analytics', 'schedule', 'members', 'payments', 'cancellations', 'messages', 'settings',
];
export const LOOK_AROUND_THRESHOLD = 3;

export function recordTabVisit(key: string) {
  if (typeof window === 'undefined') return;
  try {
    const set = getVisitedTabs();
    set.add(key);
    localStorage.setItem(VISITED_KEY, JSON.stringify(Array.from(set)));
  } catch { /* localStorage unavailable — checklist just won't credit this visit */ }
}

export function getVisitedTabs(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

export function isIntroSeen(tabKey: string): boolean {
  if (typeof window === 'undefined') return true;
  try { return localStorage.getItem(INTRO_SEEN_PREFIX + tabKey) === '1'; } catch { return true; }
}

export function markIntroSeen(tabKey: string) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(INTRO_SEEN_PREFIX + tabKey, '1'); } catch { /* best-effort */ }
}
