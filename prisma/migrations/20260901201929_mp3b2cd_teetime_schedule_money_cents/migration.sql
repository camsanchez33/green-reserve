-- MP-3 runs B2c+B2d — TeeTime and TeeTimeSchedule money: dollars -> integer cents.
--
-- These two convert TOGETHER, in one migration, because tee-sheet-engine.ts
-- copies schedule rates directly onto the tee times it generates. Converting
-- one alone would require a x100 in the middle of that copy — exactly the stray
-- multiplication this work exists to remove.
--
-- Renamed, not retyped: Float and Int are both `number` to TypeScript, so
-- retyping in place lets a missed caller compile and price a round at 100x.
-- This is the golfer-facing booking path, so that guarantee matters most here.
--
-- greenFeeWeekdayCents now exists on BOTH TeeTimeSchedule and MembershipTier
-- (B2a). Both are cents, so confusing them is a semantic error, not a silent
-- unit error.

-- TeeTime
ALTER TABLE "TeeTime" ADD COLUMN "greenFeeCents"     INTEGER;
ALTER TABLE "TeeTime" ADD COLUMN "memberRateCents"   INTEGER;
ALTER TABLE "TeeTime" ADD COLUMN "residentRateCents" INTEGER;
ALTER TABLE "TeeTime" ADD COLUMN "cartFeeCents"      INTEGER NOT NULL DEFAULT 0;

UPDATE "TeeTime" SET
  "greenFeeCents"     = ROUND("greenFee"     * 100)::integer,
  "memberRateCents"   = ROUND("memberRate"   * 100)::integer,
  "residentRateCents" = ROUND("residentRate" * 100)::integer,
  "cartFeeCents"      = ROUND("cartFee"      * 100)::integer;

-- greenFee was NOT NULL; make its replacement so too, now that it is populated.
ALTER TABLE "TeeTime" ALTER COLUMN "greenFeeCents" SET NOT NULL;

ALTER TABLE "TeeTime" DROP COLUMN "greenFee";
ALTER TABLE "TeeTime" DROP COLUMN "memberRate";
ALTER TABLE "TeeTime" DROP COLUMN "residentRate";
ALTER TABLE "TeeTime" DROP COLUMN "cartFee";

-- TeeTimeSchedule
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "greenFeeWeekdayCents"     INTEGER;
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "greenFeeWeekendCents"     INTEGER;
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "memberRateWeekdayCents"   INTEGER;
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "memberRateWeekendCents"   INTEGER;
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "residentRateWeekdayCents" INTEGER;
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "residentRateWeekendCents" INTEGER;
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "cartFeeCents"             INTEGER NOT NULL DEFAULT 0;

UPDATE "TeeTimeSchedule" SET
  "greenFeeWeekdayCents"     = ROUND("greenFeeWeekday"     * 100)::integer,
  "greenFeeWeekendCents"     = ROUND("greenFeeWeekend"     * 100)::integer,
  "memberRateWeekdayCents"   = ROUND("memberRateWeekday"   * 100)::integer,
  "memberRateWeekendCents"   = ROUND("memberRateWeekend"   * 100)::integer,
  "residentRateWeekdayCents" = ROUND("residentRateWeekday" * 100)::integer,
  "residentRateWeekendCents" = ROUND("residentRateWeekend" * 100)::integer,
  "cartFeeCents"             = ROUND("cartFee"             * 100)::integer;

ALTER TABLE "TeeTimeSchedule" ALTER COLUMN "greenFeeWeekdayCents" SET NOT NULL;
ALTER TABLE "TeeTimeSchedule" ALTER COLUMN "greenFeeWeekendCents" SET NOT NULL;

ALTER TABLE "TeeTimeSchedule" DROP COLUMN "greenFeeWeekday";
ALTER TABLE "TeeTimeSchedule" DROP COLUMN "greenFeeWeekend";
ALTER TABLE "TeeTimeSchedule" DROP COLUMN "memberRateWeekday";
ALTER TABLE "TeeTimeSchedule" DROP COLUMN "memberRateWeekend";
ALTER TABLE "TeeTimeSchedule" DROP COLUMN "residentRateWeekday";
ALTER TABLE "TeeTimeSchedule" DROP COLUMN "residentRateWeekend";
ALTER TABLE "TeeTimeSchedule" DROP COLUMN "cartFee";
