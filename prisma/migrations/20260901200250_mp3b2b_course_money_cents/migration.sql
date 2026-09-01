-- MP-3 run B2b — Course money: dollars in a Float -> integer cents.
--
-- Renamed, not retyped, for the same reason as B2a: Float and Int are both
-- `number` to TypeScript, so retyping in place lets a missed caller compile and
-- price at 100x. The rename makes every stale reader a compile error.
--
-- lateCancellationFee is the notable one: it held DOLLARS (10, 20) while
-- Booking.cancellationFeeTotal held CENTS (1000, 2000) — the same fee in two
-- units in one schema. Both are cents after this.
--
-- Course.rating and Course.courseRating are ratings, not money. Untouched.
--
-- The new default is 1000 cents, preserving the old 10-dollar default.

ALTER TABLE "Course" ADD COLUMN "lateCancellationFeeCents"   INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "Course" ADD COLUMN "caddieLooperRateCents"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Course" ADD COLUMN "caddieForeRateCents"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Course" ADD COLUMN "rangeBallsSmallPriceCents"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Course" ADD COLUMN "rangeBallsMediumPriceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Course" ADD COLUMN "rangeBallsLargePriceCents"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Course" ADD COLUMN "clubRentalRateCents"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Course" ADD COLUMN "pushCartRateCents"          INTEGER NOT NULL DEFAULT 0;

UPDATE "Course" SET
  "lateCancellationFeeCents"   = ROUND("lateCancellationFee"   * 100)::integer,
  "caddieLooperRateCents"      = ROUND("caddieLooperRate"      * 100)::integer,
  "caddieForeRateCents"        = ROUND("caddieForeRate"        * 100)::integer,
  "rangeBallsSmallPriceCents"  = ROUND("rangeBallsSmallPrice"  * 100)::integer,
  "rangeBallsMediumPriceCents" = ROUND("rangeBallsMediumPrice" * 100)::integer,
  "rangeBallsLargePriceCents"  = ROUND("rangeBallsLargePrice"  * 100)::integer,
  "clubRentalRateCents"        = ROUND("clubRentalRate"        * 100)::integer,
  "pushCartRateCents"          = ROUND("pushCartRate"          * 100)::integer;

ALTER TABLE "Course" DROP COLUMN "lateCancellationFee";
ALTER TABLE "Course" DROP COLUMN "caddieLooperRate";
ALTER TABLE "Course" DROP COLUMN "caddieForeRate";
ALTER TABLE "Course" DROP COLUMN "rangeBallsSmallPrice";
ALTER TABLE "Course" DROP COLUMN "rangeBallsMediumPrice";
ALTER TABLE "Course" DROP COLUMN "rangeBallsLargePrice";
ALTER TABLE "Course" DROP COLUMN "clubRentalRate";
ALTER TABLE "Course" DROP COLUMN "pushCartRate";
