-- BOOKING-REF (Cam 2026-11-12): a short booking number, shown as GR-<ref>.
-- Additive only. The column is added WITHOUT a default first, so existing bookings
-- stay null (no backfill: they are test data the launch wipe clears); only then does
-- the default start numbering new bookings from the sequence.
CREATE SEQUENCE "Booking_ref_seq" AS INTEGER;
ALTER TABLE "Booking" ADD COLUMN "ref" INTEGER;
ALTER TABLE "Booking" ALTER COLUMN "ref" SET DEFAULT nextval('"Booking_ref_seq"');
ALTER SEQUENCE "Booking_ref_seq" OWNED BY "Booking"."ref";
CREATE UNIQUE INDEX "Booking_ref_key" ON "Booking"("ref");

-- Onboarding's Launch column: when the course expects to go live.
ALTER TABLE "CourseInquiry" ADD COLUMN "expectedLaunchAt" TIMESTAMP(3);
