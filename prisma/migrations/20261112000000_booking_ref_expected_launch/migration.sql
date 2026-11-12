-- BOOKING-REF (Cam 2026-11-12): courses are numbered GR1, GR2, …; bookings within their
-- course, GR1-1, GR1-2, … Additive only, no backfill: existing courses and bookings keep a
-- null number (test data the launch wipe clears).

-- The course number: a sequence, attached AFTER the column exists so existing rows stay null.
CREATE SEQUENCE "Course_number_seq" AS INTEGER;
ALTER TABLE "Course" ADD COLUMN "number" INTEGER;
ALTER TABLE "Course" ALTER COLUMN "number" SET DEFAULT nextval('"Course_number_seq"');
ALTER SEQUENCE "Course_number_seq" OWNED BY "Course"."number";
CREATE UNIQUE INDEX "Course_number_key" ON "Course"("number");

-- The course's booking counter: the last booking number it gave.
ALTER TABLE "Course" ADD COLUMN "bookingRefSeq" INTEGER NOT NULL DEFAULT 0;

-- The booking's number within its course.
ALTER TABLE "Booking" ADD COLUMN "ref" INTEGER;
CREATE UNIQUE INDEX "Booking_courseId_ref_key" ON "Booking"("courseId", "ref");

-- Every insert, whatever the path (online, counter, admin, walk-in, a split or late-arrival
-- part, an event), takes the next number from its course in the same statement. The UPDATE
-- locks the course row until the inserting transaction ends, so two bookings at one course
-- can never get the same number, and a rolled-back insert gives its number back. A value a
-- caller sends is ignored: the counter is the only source. Not in schema.prisma (Prisma does
-- not model triggers), so `migrate diff` never sees it.
CREATE FUNCTION "booking_ref_assign"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Course" SET "bookingRefSeq" = "bookingRefSeq" + 1
    WHERE "id" = NEW."courseId"
    RETURNING "bookingRefSeq" INTO NEW."ref";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Booking_ref_assign" BEFORE INSERT ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION "booking_ref_assign"();

-- Onboarding's Launch column: when the course expects to go live.
ALTER TABLE "CourseInquiry" ADD COLUMN "expectedLaunchAt" TIMESTAMP(3);
