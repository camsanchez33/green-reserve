-- Settings data (Cam 2026-11-17): the course's own parts of the confirmation email. Additive: nullable columns.
ALTER TABLE "Course" ADD COLUMN "confirmationArrival" TEXT;
ALTER TABLE "Course" ADD COLUMN "confirmationParking" TEXT;
ALTER TABLE "Course" ADD COLUMN "confirmationContact" TEXT;
