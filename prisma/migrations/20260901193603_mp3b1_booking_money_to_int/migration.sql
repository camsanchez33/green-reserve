-- MP-3 run B1 — Booking money: Float -> Int.
--
-- These six columns ALREADY held integer cents; the Float was the bug. That
-- combination ("cents in a Float") is what let a caller assume dollars and
-- produce the x100 resend email (MP-1 #1). Making the column Int puts the unit
-- in the type.
--
-- This changes NO DATA. Verified on the mp3-cents branch before writing this:
-- all 72 values (12 bookings x 6 columns) are integral, so ROUND is a no-op.
-- ROUND is written explicitly rather than relying on Postgres's implicit
-- float->int assignment cast, so the intent is legible and the statement stays
-- correct if a fractional value ever exists.
--
-- Dollar-denominated money (TeeTime, TeeTimeSchedule, Course, MembershipTier)
-- is deliberately NOT touched here. Those are a different unit and a 64-file
-- render sweep; mixing them into this migration is how every price ends up
-- wrong by 100x.

ALTER TABLE "Booking"
  ALTER COLUMN "greenFeeTotal"        SET DATA TYPE INTEGER USING ROUND("greenFeeTotal")::integer,
  ALTER COLUMN "cartFeeTotal"         SET DATA TYPE INTEGER USING ROUND("cartFeeTotal")::integer,
  ALTER COLUMN "cartFeeTotal"         SET DEFAULT 0,
  ALTER COLUMN "rangeBallsTotal"      SET DATA TYPE INTEGER USING ROUND("rangeBallsTotal")::integer,
  ALTER COLUMN "rangeBallsTotal"      SET DEFAULT 0,
  ALTER COLUMN "accessFeeTotal"       SET DATA TYPE INTEGER USING ROUND("accessFeeTotal")::integer,
  ALTER COLUMN "totalAmount"          SET DATA TYPE INTEGER USING ROUND("totalAmount")::integer,
  ALTER COLUMN "cancellationFeeTotal" SET DATA TYPE INTEGER USING ROUND("cancellationFeeTotal")::integer,
  ALTER COLUMN "cancellationFeeTotal" SET DEFAULT 0;
