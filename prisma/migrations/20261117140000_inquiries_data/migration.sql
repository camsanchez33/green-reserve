-- Inquiries data (Cam 2026-11-17): course contacts, editable course facts, Cal.com call details and the
-- outreach result per call. Additive only: a new table and nullable or defaulted columns. No backfill.

-- CreateTable
CREATE TABLE "CourseContact" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "decisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "preferredChannel" TEXT NOT NULL DEFAULT '',
    "bestTime" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseContact_inquiryId_idx" ON "CourseContact"("inquiryId");
CREATE INDEX "CourseContact_email_idx" ON "CourseContact"("email");

-- AddForeignKey
ALTER TABLE "CourseContact" ADD CONSTRAINT "CourseContact_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CourseInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CourseInquiry" ADD COLUMN "ownerType" TEXT;
ALTER TABLE "CourseInquiry" ADD COLUMN "holes" INTEGER;
ALTER TABLE "CourseInquiry" ADD COLUMN "coursePhone" TEXT;
ALTER TABLE "CourseInquiry" ADD COLUMN "currentSoftware" TEXT;
ALTER TABLE "CourseInquiry" ADD COLUMN "softwareContractEnds" TEXT;
ALTER TABLE "CourseInquiry" ADD COLUMN "roundsPerYear" INTEGER;
ALTER TABLE "CourseInquiry" ADD COLUMN "hasProShop" BOOLEAN;
ALTER TABLE "CourseInquiry" ADD COLUMN "hasRange" BOOLEAN;
ALTER TABLE "CourseInquiry" ADD COLUMN "season" TEXT;
ALTER TABLE "CourseInquiry" ADD COLUMN "fitTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CourseInquiry" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "CourseInquiry" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "CourseInquiry" ADD COLUMN "osmRef" TEXT;

-- AlterTable
ALTER TABLE "Call" ADD COLUMN "attendeeName" TEXT;
ALTER TABLE "Call" ADD COLUMN "attendeeEmail" TEXT;
ALTER TABLE "Call" ADD COLUMN "meetingUrl" TEXT;
ALTER TABLE "Call" ADD COLUMN "result" TEXT;
ALTER TABLE "Call" ADD COLUMN "nextStep" TEXT;
