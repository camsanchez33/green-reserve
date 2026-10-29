-- Cam 2026-10-29: a member's own spot on a booking whose guests pay the public rate, so a party-size change or partial check-in keeps the split. Additive, nullable.
ALTER TABLE "Booking" ADD COLUMN "memberRateCents" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "memberCartCents" INTEGER;
