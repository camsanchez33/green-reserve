-- AlterTable
ALTER TABLE "CourseEventPayment" ADD COLUMN     "playerId" TEXT;

-- CreateIndex
CREATE INDEX "CourseEventPayment_playerId_idx" ON "CourseEventPayment"("playerId");

-- AddForeignKey
ALTER TABLE "CourseEventPayment" ADD CONSTRAINT "CourseEventPayment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "CourseEventPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
