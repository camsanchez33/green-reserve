-- Cam 2026-10-27: the owner's booking-page decision for courses built without an inquiry. Additive, nullable.
ALTER TABLE "Course" ADD COLUMN "pageDecision" TEXT;
ALTER TABLE "Course" ADD COLUMN "pageDecidedAt" TIMESTAMP(3);
