-- Cam 2026-10-24: who pays the course for an event — organizer | players; '' = made before the question.
ALTER TABLE "CourseEvent" ADD COLUMN "payer" TEXT NOT NULL DEFAULT '';
