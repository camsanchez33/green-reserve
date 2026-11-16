-- Memberships item 4: season passes. Additive; no backfill (every existing tier is a membership by the default).
ALTER TABLE "MembershipTier" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'membership';
ALTER TABLE "MembershipTier" ADD COLUMN "passStartsOn" TEXT;
ALTER TABLE "MembershipTier" ADD COLUMN "passEndsOn" TEXT;
ALTER TABLE "MembershipTier" ADD COLUMN "sellAtCourse" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CourseMembership" ADD COLUMN "passStartsOn" TEXT;
