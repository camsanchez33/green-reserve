-- AlterTable
ALTER TABLE "CourseStaff" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "permissionsSetAt" TIMESTAMP(3),
ADD COLUMN     "preset" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "StaffPermissionChange" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "before" TEXT[],
    "after" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPermissionChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffPermissionChange_courseId_createdAt_idx" ON "StaffPermissionChange"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffPermissionChange_staffId_idx" ON "StaffPermissionChange"("staffId");
