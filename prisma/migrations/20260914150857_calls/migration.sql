-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "nextCheckInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CourseInquiry" ADD COLUMN     "callSkippedReason" TEXT;

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "inquiryId" TEXT,
    "courseId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "direction" TEXT NOT NULL DEFAULT 'we_call',
    "phone" TEXT NOT NULL DEFAULT '',
    "agendaJson" TEXT NOT NULL DEFAULT '[]',
    "agendaExtra" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT 'scheduled',
    "answersJson" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "followUpAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Call_inquiryId_scheduledAt_idx" ON "Call"("inquiryId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Call_courseId_scheduledAt_idx" ON "Call"("courseId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CourseInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

