-- Cam 2026-10-27: courses made by hand (Admin -> Create course, no inquiry). Additive, defaults false.
ALTER TABLE "Course" ADD COLUMN "builtByHand" BOOLEAN NOT NULL DEFAULT false;
