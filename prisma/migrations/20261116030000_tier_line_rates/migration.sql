-- Memberships item 3: member rates per price-list line, and the public booking window option. Additive; no backfill.
ALTER TABLE "MembershipTier" ADD COLUMN "lineRates" JSONB;
ALTER TABLE "MembershipTier" ADD COLUMN "windowPublic" BOOLEAN NOT NULL DEFAULT false;
