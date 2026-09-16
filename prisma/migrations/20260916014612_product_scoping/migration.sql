-- AlterTable
ALTER TABLE "TeeTime" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "TeeTimeSchedule" ADD COLUMN     "productId" TEXT;

-- CreateIndex
CREATE INDEX "TeeTime_productId_idx" ON "TeeTime"("productId");

-- CreateIndex
CREATE INDEX "TeeTimeSchedule_productId_idx" ON "TeeTimeSchedule"("productId");

-- AddForeignKey
ALTER TABLE "TeeTime" ADD CONSTRAINT "TeeTime_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CourseProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeeTimeSchedule" ADD CONSTRAINT "TeeTimeSchedule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CourseProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

