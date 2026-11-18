-- AlterTable
ALTER TABLE "CourseStaff" ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "grantKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "passwordSetAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "revokeKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "roleId" TEXT,
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CourseRole" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "suggestedKey" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamChange" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "before" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "after" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affected" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseRole_courseId_idx" ON "CourseRole"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRole_courseId_name_key" ON "CourseRole"("courseId", "name");

-- CreateIndex
CREATE INDEX "TeamChange_courseId_createdAt_idx" ON "TeamChange"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamChange_targetId_idx" ON "TeamChange"("targetId");

-- CreateIndex
CREATE INDEX "CourseStaff_roleId_idx" ON "CourseStaff"("roleId");

-- AddForeignKey
ALTER TABLE "CourseStaff" ADD CONSTRAINT "CourseStaff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CourseRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRole" ADD CONSTRAINT "CourseRole_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
