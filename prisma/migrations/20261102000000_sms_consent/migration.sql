-- SMS-1 (Cam 2026-11-02): text-message consent record (Twilio A2P 10DLC opt-in).
-- Additive: a new table only.
CREATE TABLE "SmsConsent" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "wording" TEXT NOT NULL,
    "courseId" TEXT,
    "bookingId" TEXT,
    "recordedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsConsent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmsConsent_phone_createdAt_idx" ON "SmsConsent"("phone", "createdAt");
