-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "bookedByCourse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gcalEventId" TEXT;

-- AlterTable
ALTER TABLE "CourseInquiry" ADD COLUMN     "callInviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "callInviteSentAt" TIMESTAMP(3),
ADD COLUMN     "callInviteToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CourseInquiry_callInviteToken_key" ON "CourseInquiry"("callInviteToken");

