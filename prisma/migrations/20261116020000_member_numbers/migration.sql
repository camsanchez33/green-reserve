-- Memberships item 2: member numbers (per-membership prefix and sequence) and a member photo. Additive; no backfill.
ALTER TABLE "MembershipTier" ADD COLUMN "numberPrefix" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MembershipTier" ADD COLUMN "numberLast" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CourseMembership" ADD COLUMN "memberNumber" TEXT;
ALTER TABLE "CourseMembership" ADD COLUMN "photoUrl" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "CourseMembership_courseId_memberNumber_key" ON "CourseMembership"("courseId", "memberNumber");
