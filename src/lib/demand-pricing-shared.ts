// Demand pricing: the numbers the dashboard's Settings card shows. Pure and client-safe: this
// file must never import prisma, Stripe or a secret (scripts/client-bundle-test.ts checks).
// lib/demand-pricing re-exports both.

export const WEEKS_LOOKED_AT = 8;
export const MAX_WEEKLY_STEP = 10;
