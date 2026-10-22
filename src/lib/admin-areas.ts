// AW-11 (Cam 2026-10-22: "per-person access" — "workers are going to have their
// own log in and are going to only see certain portals"). Which parts of the
// admin an employee can open, decided per person by the owner on Team. ONE
// catalog: the API routes gate with requireArea(), the menu, Home, search and
// the Team screen all read it, so a label never describes a different rule
// than the one enforced.
//
// Two separate questions, both checked: the ROLE (viewer · support · manager)
// says how much a person may do; the AREAS say where. The owner has every area.
// An employee whose areas were never set (areasSetAt null) keeps every area
// their role already reached — nobody loses access the day this ships.
// Client-safe: no Node or Prisma imports.

export type AdminArea = 'pipeline' | 'courses' | 'golfers' | 'money' | 'messages' | 'problems' | 'company';

export const ADMIN_AREAS: { key: AdminArea; label: string; help: string }[] = [
  { key: 'pipeline', label: 'Pipeline', help: 'Leads, inquiries, discovery calls and building a course.' },
  { key: 'courses', label: 'Courses', help: 'Every course page: setup, tee sheet, schedule, staff, documents, the course timeline.' },
  { key: 'golfers', label: 'Golfers', help: 'Look a golfer up; resend, cancel and refund their bookings.' },
  { key: 'money', label: 'Money', help: 'GreenReserve’s money: fees, cards that failed, disputes, exports.' },
  { key: 'messages', label: 'Messages', help: 'Conversations with courses and announcements.' },
  { key: 'problems', label: 'Problems', help: 'The hourly check’s work list: take, note and hand off problems.' },
  { key: 'company', label: 'Company', help: 'Goals, Systems and company documents.' },
];

export const ALL_AREAS: AdminArea[] = ADMIN_AREAS.map(a => a.key);

export function isAdminArea(v: unknown): v is AdminArea {
  return typeof v === 'string' && (ALL_AREAS as string[]).includes(v);
}

/**
 * The areas a session may open. `areas` null means "never set" — every area.
 * The owner always has every area.
 */
export function effectiveAreas(role: string, areas: string[] | null): AdminArea[] {
  if (role === 'owner' || areas === null) return ALL_AREAS;
  return areas.filter(isAdminArea);
}

export function hasArea(session: { role: string; areas?: string[] | null }, area: AdminArea): boolean {
  return effectiveAreas(session.role, session.areas ?? null).includes(area);
}
