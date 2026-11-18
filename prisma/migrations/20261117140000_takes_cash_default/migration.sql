-- Takes cash (Cam 2026-11-17): OFF now means no cash anywhere (lib/takes-cash). Until now the switch was display
-- only and defaulted to off, so "off" was nobody's choice. New courses default to on, and every existing course
-- is set to on so that no course loses cash the moment this ships; owners turn it off on purpose.
-- The UPDATE is a one-time backfill, approved by Cam 2026-11-17 (option 1, via Build).
ALTER TABLE "Course" ALTER COLUMN "takesCash" SET DEFAULT true;
UPDATE "Course" SET "takesCash" = true WHERE "takesCash" = false;
