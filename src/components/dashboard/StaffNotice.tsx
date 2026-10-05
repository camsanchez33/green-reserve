'use client';
// SD-11 / SP-A. Staff can reach any dashboard page by URL. A page that would
// refuse what this login tries says so up front, naming the permission —
// instead of rendering an editable form whose Save then 403s.

import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { labelFor, type PermissionKey } from '@/lib/staff-permissions';

export function StaffNotice({ what = 'these settings', view, edit }: {
  what?: string;
  /** Needed to see the page at all. */
  view?: PermissionKey;
  /** Needed to change anything on it. */
  edit?: PermissionKey;
}) {
  const access = useDashboardAccess();
  if (!access.loaded || !access.isStaff) return null;
  const missing = view && !access.can(view) ? view : edit && !access.can(edit) ? edit : null;
  if (!missing) return null;
  const text = missing === view
    ? <>Your login doesn&apos;t include {what}. Ask the course owner to turn on &ldquo;{labelFor(missing)}&rdquo; for you in Settings &rarr; Staff &amp; permissions.</>
    : <>You can look at {what}, but changing it isn&apos;t part of your login &mdash; any save here will be refused. The course owner can turn on &ldquo;{labelFor(missing)}&rdquo; for you.</>;
  return (
    <div role="status" className="mx-6 mt-6 bg-paper border border-line rounded-lg px-4 py-3 text-sm text-ink-soft flex items-start gap-2.5">
      
      <span>{text}</span>
    </div>
  );
}
