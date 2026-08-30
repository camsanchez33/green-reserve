/**
 * Role lists, client-safe.
 *
 * These live apart from admin-session.ts because that module imports `prisma`
 * and `next/headers` and is therefore server-only — a client component that
 * needs to know "can this role see this nav item" cannot import from it without
 * dragging the Prisma client into the browser bundle. admin-session re-exports
 * these so server code has one import site as before.
 */
export const OWNER_ONLY = ['owner'];
export const MANAGER_PLUS = ['owner', 'manager'];
export const SUPPORT_PLUS = ['owner', 'manager', 'support'];
