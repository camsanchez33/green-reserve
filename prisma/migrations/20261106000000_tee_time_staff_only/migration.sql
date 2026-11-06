-- ADDTIME-1 (Cam 2026-11-06): a tee time staff added and kept for the counter — golfers never see or book it online.
ALTER TABLE "TeeTime" ADD COLUMN "staffOnly" BOOLEAN NOT NULL DEFAULT false;
