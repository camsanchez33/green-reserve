'use client';
// SP-A: what the signed-in dashboard login may do, read once per page load from
// /api/operator/my-courses and shared by every component that asks. The routes
// are the gate (requirePermission); this only decides what to show.
//
// Until it loads, `loaded` is false and `can()` answers false — so a slow or
// failed load hides staff-only doors rather than flashing them (the same rule
// the Money page used for its Payments tab).
import { useEffect, useState } from 'react';
import type { PermissionKey } from './staff-permissions';

export interface DashboardAccess {
  loaded: boolean;
  /** The load failed — show the limited view and say so. */
  failed: boolean;
  isStaff: boolean;
  permissions: PermissionKey[];
  can: (key: PermissionKey) => boolean;
}

type Raw = { isStaff: boolean; permissions: PermissionKey[] };
let pending: Promise<Raw | null> | null = null;

function load(): Promise<Raw | null> {
  if (!pending) {
    pending = fetch('/api/operator/my-courses')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => ({ isStaff: !!d?.isStaff, permissions: Array.isArray(d?.permissions) ? d.permissions : [] }))
      .catch(() => { pending = null; return null; });
  }
  return pending;
}

export function useDashboardAccess(): DashboardAccess {
  const [raw, setRaw] = useState<Raw | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    load().then(r => { if (!live) return; if (r) setRaw(r); else setFailed(true); });
    return () => { live = false; };
  }, []);
  const permissions = raw?.permissions ?? [];
  return {
    loaded: !!raw,
    failed,
    isStaff: raw ? raw.isStaff : true,
    permissions,
    can: (key) => !!raw && (!raw.isStaff || permissions.includes(key)),
  };
}
