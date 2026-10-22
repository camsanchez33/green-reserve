-- AlterTable
ALTER TABLE "AdminAlert" ADD COLUMN     "courseId" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "ownerName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "snoozeReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "snoozedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminAlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorName" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAlertEvent_alertId_createdAt_idx" ON "AdminAlertEvent"("alertId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAlert_courseId_idx" ON "AdminAlert"("courseId");

-- AddForeignKey
ALTER TABLE "AdminAlertEvent" ADD CONSTRAINT "AdminAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "AdminAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
