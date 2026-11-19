// Team (Cam 2026-11-17): the welcome email's words, in one place, so the Invite
// popup's preview and the email itself can never say different things. The
// mockup's wording ("We'll go over this wording before launch"). Client-safe.
import { ADMIN_EMAIL } from './contact';
import { AREAS, areaLevels } from './team-access';

/** How long an invite's set-your-password link works. */
export const INVITE_LINK_HOURS = 48;
export const INVITE_LINK_TTL = '48h' as const;

export interface WelcomeInput {
  personName: string;
  ownerName: string;
  courseName: string;
  roleName: string;
  /** What the role can do, in words (canSentence). */
  roleCan: string;
}

export interface WelcomeParts {
  subject: string;
  preheader: string;
  /** The headline (emails redo, mockup "Staff invite"). */
  line: string;
  intro: string;
  rows: { label: string; value: string }[];
  button: string;
  footer: string;
}

const first = (full: string) => (full || '').trim().split(/\s+/)[0] || 'there';

export function welcomeParts(w: WelcomeInput): WelcomeParts {
  const hasOwner = !!w.ownerName.trim();
  const owner = hasOwner ? w.ownerName.trim() : 'The course owner';
  const ownerFirst = hasOwner ? first(w.ownerName) : 'the course owner';
  const can = w.roleCan.trim().replace(/\.$/, '');
  return {
    subject: `${hasOwner ? ownerFirst : 'The course owner'} added you to ${w.courseName} on GreenReserve`,
    preheader: 'Set your password to get started.',
    line: 'You’ve been added to the team.',
    intro: `${owner} added you to ${w.courseName} as ${w.roleName}. Set your password to sign in to the dashboard.`
      + `${can ? ` You can ${can.charAt(0).toLowerCase()}${can.slice(1)}.` : ''} Your manager can change this any time.`,
    rows: [
      { label: 'Course', value: w.courseName },
      { label: 'Role', value: w.roleName },
      { label: 'Added by', value: owner },
      { label: 'Link works for', value: `${INVITE_LINK_HOURS} hours` },
    ],
    button: 'Set your password',
    footer: `Questions about your shifts or the course? Ask ${ownerFirst}. Trouble signing in? Reply to this email or write to ${ADMIN_EMAIL}.`,
  };
}

/** "see the tee sheet; use Payments & refunds fully; view Reports" — from the role's area levels (Cam removed role descriptions). */
export function canSentence(keys: readonly string[]): string {
  const lv = areaLevels(keys);
  const parts = AREAS.map(a => {
    const l = lv[a.key];
    if (l === 'none') return '';
    const name = a.label.toLowerCase();
    if (l === 'full') return `use ${name}`;
    if (l === 'view') return `see ${name}`;
    return `use some of ${name}`;
  }).filter(Boolean);
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
