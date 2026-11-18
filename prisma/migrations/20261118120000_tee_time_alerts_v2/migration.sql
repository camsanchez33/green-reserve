-- ALERTS-2 (Cam 2026-11-18): tee time alerts with several dates, parts of the day, a guest
-- confirm step, a stop link, and alert texts with their own consent. Additive only.
ALTER TABLE "TeeTimeAlert" ADD COLUMN "dates" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TeeTimeAlert" ADD COLUMN "parts" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TeeTimeAlert" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "TeeTimeAlert" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "TeeTimeAlert" ADD COLUMN "stoppedAt" TIMESTAMP(3);
ALTER TABLE "TeeTimeAlert" ADD COLUMN "endsAt" TIMESTAMP(3);
ALTER TABLE "TeeTimeAlert" ADD COLUMN "membershipId" TEXT;
ALTER TABLE "TeeTimeAlert" ADD COLUMN "notifiedDates" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TeeTimeAlert" ADD COLUMN "phone" TEXT;
ALTER TABLE "TeeTimeAlert" ADD COLUMN "textConsentAt" TIMESTAMP(3);
ALTER TABLE "TeeTimeAlert" ADD COLUMN "textConsentWording" TEXT;
CREATE INDEX "TeeTimeAlert_status_endsAt_idx" ON "TeeTimeAlert"("status", "endsAt");

ALTER TABLE "SmsConsent" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'bookings';

ALTER TABLE "Course" ADD COLUMN "teeTimeAlertsOn" BOOLEAN NOT NULL DEFAULT true;
