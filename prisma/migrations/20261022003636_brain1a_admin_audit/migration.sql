-- AlterTable
ALTER TABLE "AdminAuditLog" ADD COLUMN     "actorName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB,
ADD COLUMN     "courseId" TEXT,
ADD COLUMN     "reason" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "AdminAuditLog_courseId_createdAt_idx" ON "AdminAuditLog"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");
