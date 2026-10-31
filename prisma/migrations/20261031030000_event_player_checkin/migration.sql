-- Event day (Cam 2026-10-31): when an event player was checked in on the day. Additive, nullable.
ALTER TABLE "CourseEventPlayer" ADD COLUMN "checkedInAt" TIMESTAMP(3);
