-- Cam 2026-10-29: the tee times a day closure blocked, so reopening unblocks only those. Additive, with a default.
ALTER TABLE "Blackout" ADD COLUMN "blockedTeeTimeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
