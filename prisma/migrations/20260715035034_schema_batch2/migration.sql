-- 1. Course.operatorId: drop the UNIQUE constraint (one course per operator
--    forever), keep a plain index so operator lookups stay fast. This makes
--    Course.operatorId a one-to-many relation from CourseOperator.
DROP INDEX "Course_operatorId_key";
CREATE INDEX "Course_operatorId_idx" ON "Course"("operatorId");

-- 2. Booking terms-of-service consent, recorded at booking time.
ALTER TABLE "Booking" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- 3. GolferAccount.phone: prep column for GOLFER_SPEC G5 (not wired up in
--    this run). Existing rows default to '' (not NULL) — normalize those to
--    NULL FIRST so the new unique index doesn't reject legitimate un-set
--    phones as duplicates (Postgres treats NULL as distinct, '' as a real
--    value everyone would collide on).
UPDATE "GolferAccount" SET "phone" = NULL WHERE "phone" = '';
ALTER TABLE "GolferAccount" ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "phone" DROP DEFAULT;
CREATE UNIQUE INDEX "GolferAccount_phone_key" ON "GolferAccount"("phone");
