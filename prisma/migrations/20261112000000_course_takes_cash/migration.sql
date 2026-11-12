-- HOME-3 (Cam 2026-11-12): "We take cash" (Settings → Pro shop). Additive, default off, no backfill (Build 2026-11-12:
-- prelaunch test data, wiped before launch). Display only: Home shows "Open the register" only when it is on.
ALTER TABLE "Course" ADD COLUMN "takesCash" BOOLEAN NOT NULL DEFAULT false;
