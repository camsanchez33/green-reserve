-- MP-3 run B2a — MembershipTier money: dollars in a Float -> integer cents.
--
-- RENAMED, not just retyped. Float and Int are both `number` to TypeScript, so
-- retyping in place would let a missed caller compile cleanly and price a
-- membership at 100x. Renaming makes every stale reader a compile error.
-- Convention follows Expense.amountCents, already in this schema.
--
-- greenFeeWeekday / greenFeeWeekend also exist on TeeTimeSchedule, which is
-- STILL DOLLARS until run B2d. The rename is what keeps the two apart.
--
-- discountPct is a percentage, not money. It is deliberately untouched and must
-- never be multiplied by 100.
--
-- ROUND before the cast: a stored 49.99 becomes 4999, not 4998 via truncation.
-- Nulls are preserved (null means "no flat override", not "free").

ALTER TABLE "MembershipTier" ADD COLUMN "greenFeeWeekdayCents" INTEGER;
ALTER TABLE "MembershipTier" ADD COLUMN "greenFeeWeekendCents" INTEGER;
ALTER TABLE "MembershipTier" ADD COLUMN "cartFeeWeekdayCents"  INTEGER;
ALTER TABLE "MembershipTier" ADD COLUMN "cartFeeWeekendCents"  INTEGER;
ALTER TABLE "MembershipTier" ADD COLUMN "annualFeeCents"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MembershipTier" ADD COLUMN "initiationFeeCents" INTEGER NOT NULL DEFAULT 0;

UPDATE "MembershipTier" SET
  "greenFeeWeekdayCents" = ROUND("greenFeeWeekday" * 100)::integer,
  "greenFeeWeekendCents" = ROUND("greenFeeWeekend" * 100)::integer,
  "cartFeeWeekdayCents"  = ROUND("cartFeeWeekday"  * 100)::integer,
  "cartFeeWeekendCents"  = ROUND("cartFeeWeekend"  * 100)::integer,
  "annualFeeCents"       = ROUND("annualFee"       * 100)::integer,
  "initiationFeeCents"   = ROUND("initiationFee"   * 100)::integer;

ALTER TABLE "MembershipTier" DROP COLUMN "greenFeeWeekday";
ALTER TABLE "MembershipTier" DROP COLUMN "greenFeeWeekend";
ALTER TABLE "MembershipTier" DROP COLUMN "cartFeeWeekday";
ALTER TABLE "MembershipTier" DROP COLUMN "cartFeeWeekend";
ALTER TABLE "MembershipTier" DROP COLUMN "annualFee";
ALTER TABLE "MembershipTier" DROP COLUMN "initiationFee";
